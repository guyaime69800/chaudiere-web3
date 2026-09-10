import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { generatedEquipmentRegistry } from "./lib/equipment-registry.generated.js";
import { requireVerifiedCompany } from "../server/lib/require-verified-company.js";
import {
  buildEquipmentProof,
  registerEquipmentProof,
} from "../server/lib/equipment-registry-v2.js";
import {
  createQrToken,
  isQrToken,
  qrTokenRedisKey,
  toPublicCarnetPass,
} from "./lib/carnetpass-access.js";

// POST : crée un carnet et remet son jeton QR une seule fois.
// GET ?token=... : lit la fiche technique à partir d'un nouveau QR.
// GET ?id=CP-... : conserve la lecture TECHNIQUE des anciens liens.
// La création exige une connexion et une entreprise validée.
// Les lectures techniques publiques restent accessibles par QR ou ancien ID.

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

const creationRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  prefix: "carnetpass:create",
  analytics: true,
});

const readingRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "carnetpass:read",
  analytics: true,
});

function getClientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];

  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  const realIp = req.headers?.["x-real-ip"];

  return typeof realIp === "string" ? realIp : "unknown";
}

function normalizeReference(value) {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

function validText(value, maxLength) {
  return typeof value === "string"
    && value.length <= maxLength
    && !/[\u0000-\u001f\u007f]/.test(value);
}

async function checkRateLimit(limiter, req, res) {
  const result = await limiter.limit(getClientIp(req));

  if (result.success) return true;

  const seconds = Number.isFinite(result.reset)
    ? Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))
    : 60;

  res.setHeader("Retry-After", String(seconds));

  res.status(429).json({
    ok: false,
    error: "Trop de demandes. Réessaie un peu plus tard.",
  });

  return false;
}

// Lua = langage exécuté ici directement par Redis.
// Les contrôles et les écritures s'effectuent sans qu'une autre
// création puisse s'intercaler : cela évite les doublons simultanés.
// KEYS : fiche, empreinte QR, index série, index modèle, index équipement.
// ARGV : fiche JSON, numéro CarnetPass, présence d'un numéro de série.

const CREATE_SCRIPT = `
  if redis.call("EXISTS", KEYS[1]) == 1
     or redis.call("EXISTS", KEYS[2]) == 1 then
    return "retry"
  end

  if ARGV[3] == "1" and redis.call("EXISTS", KEYS[3]) == 1 then
    return "duplicate_serial"
  end

  local manufacturerType = redis.call("TYPE", KEYS[4]).ok
  local equipmentType = redis.call("TYPE", KEYS[5]).ok

  if (manufacturerType ~= "none" and manufacturerType ~= "set")
     or (equipmentType ~= "none" and equipmentType ~= "set") then
    return "invalid_index"
  end

  redis.call("SET", KEYS[1], ARGV[1])
  redis.call("SET", KEYS[2], ARGV[2])

  if ARGV[3] == "1" then
    redis.call("SET", KEYS[3], ARGV[2])
  end

  redis.call("SADD", KEYS[4], ARGV[2])
  redis.call("SADD", KEYS[5], ARGV[2])

  return "created"
`;

// Une seule transaction à la fois peut utiliser le wallet serveur.
// Le jeton empêche une requête de libérer le verrou d'une autre requête.
const POLYGON_WRITER_LOCK_KEY = "carnetpass:polygon-writer-lock";
const POLYGON_WRITER_LOCK_SECONDS = 180;

const RELEASE_LOCK_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  end

  return 0
`;

// La fiche ne devient active qu'après confirmation de la transaction.
const UPDATE_PENDING_SCRIPT = `
  local current = redis.call("GET", KEYS[1])

  if not current then
    return "missing"
  end

  local decoded = cjson.decode(current)

  if decoded.carnetPassId ~= ARGV[2]
     or decoded.status ~= "blockchain_pending" then
    return "conflict"
  end

  redis.call("SET", KEYS[1], ARGV[1])

  return "updated"
`;

// Si aucune transaction n'a été envoyée, la réservation peut être retirée
// sans laisser un faux CarnetPass ni bloquer définitivement son numéro de série.
const ROLLBACK_PENDING_SCRIPT = `
  local current = redis.call("GET", KEYS[1])

  if not current then
    return "missing"
  end

  local decoded = cjson.decode(current)

  if decoded.carnetPassId ~= ARGV[1]
     or decoded.status ~= "blockchain_pending" then
    return "conflict"
  end

  if redis.call("GET", KEYS[2]) ~= ARGV[1]
     or redis.call("GET", KEYS[3]) ~= ARGV[1] then
    return "conflict"
  end

  redis.call("DEL", KEYS[1])
  redis.call("DEL", KEYS[2])
  redis.call("DEL", KEYS[3])
  redis.call("SREM", KEYS[4], ARGV[1])
  redis.call("SREM", KEYS[5], ARGV[1])

  return "rolled_back"
`;

async function updatePendingCarnetPass(carnetPassKey, carnetPass) {
  let lastError;

  // Une courte nouvelle tentative couvre une coupure Redis passagère après
  // l'envoi d'une transaction, sans jamais envoyer la transaction deux fois.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await redis.eval(
        UPDATE_PENDING_SCRIPT,
        [carnetPassKey],
        [JSON.stringify(carnetPass), carnetPass.carnetPassId]
      );

      if (result !== "updated") {
        throw new Error("État CarnetPass incompatible.");
      }

      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function createCarnetPass(req, res) {
  if (!(await checkRateLimit(creationRateLimit, req, res))) return;

  const creator = await requireVerifiedCompany(req, res);

  if (!creator) return;

  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      ok: false,
      error: "Données invalides.",
    });
  }

  if (!validText(body.manufacturerReference, 128)) {
    return res.status(400).json({
      ok: false,
      error: "Référence constructeur invalide : 128 caractères maximum.",
    });
  }

  const manufacturerReference = normalizeReference(
    body.manufacturerReference
  );

  if (!manufacturerReference) {
    return res.status(400).json({
      ok: false,
      error: "La référence constructeur est obligatoire.",
    });
  }

  const rawSerial = body.serialNumber ?? "";

  if (!validText(rawSerial, 128)) {
    return res.status(400).json({
      ok: false,
      error: "Numéro de série invalide : 128 caractères maximum.",
    });
  }

  const serialNumber = rawSerial
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (!serialNumber) {
    return res.status(400).json({
      ok: false,
      error: "Le numéro de série est obligatoire.",
    });
  }

  const entry = generatedEquipmentRegistry.find((item) =>
    normalizeReference(
      item?.equipmentData?.identity?.manufacturerReference
    ) === manufacturerReference
  );

  if (!entry) {
    return res.status(404).json({
      ok: false,
      error: "Cette référence constructeur n'est pas encore disponible dans CarnetPass.",
    });
  }

  const equipmentData = entry.equipmentData;
  const identity = equipmentData.identity ?? {};
  const equipmentId = equipmentData.equipmentId;

  if (typeof equipmentId !== "string" || !equipmentId) {
    throw new Error("Identifiant technique absent du registre.");
  }

  const writerLockToken = createQrToken();
  const lockAcquired = await redis.set(
    POLYGON_WRITER_LOCK_KEY,
    writerLockToken,
    { nx: true, ex: POLYGON_WRITER_LOCK_SECONDS }
  );

  if (!lockAcquired) {
    res.setHeader("Retry-After", "5");

    return res.status(503).json({
      ok: false,
      code: "POLYGON_WRITER_BUSY",
      error: "Une autre preuve Polygon est en cours. Patiente quelques secondes puis réessaie.",
    });
  }

  try {
    const year = new Date().getUTCFullYear();
    const counterKey = `carnetpass:counter:${year}`;

    // NX = créer seulement si cette entrée n'existe pas déjà.
    // Le compteur existant est conservé ; 1 et 2 restent réservés au prototype.
    await redis.set(counterKey, 2, { nx: true });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const sequence = Number(await redis.incr(counterKey));

      if (
        !Number.isSafeInteger(sequence)
        || sequence < 1
        || sequence > 999999
      ) {
        throw new Error("Compteur CarnetPass hors limites.");
      }

      const carnetPassId =
        `CP-${year}-${String(sequence).padStart(6, "0")}`;
      const qrToken = createQrToken();
      const now = new Date().toISOString();
      const equipmentIdentity = {
        brand: identity.brand ?? null,
        productType: identity.productType ?? null,
        range: identity.range ?? null,
        model: identity.model ?? null,
        variant: identity.variant ?? null,
      };

      const proof = buildEquipmentProof({
        carnetPassId,
        companyId: creator.companyId,
        serialNumber,
        data: {
          schema: "carnetpass.equipment.v1",
          carnetPassId,
          equipmentId,
          manufacturerReference,
          serialNumber,
          identity: equipmentIdentity,
          createdByCompanyId: creator.companyId,
          createdByUserId: creator.userId,
          createdAt: now,
        },
      });

      // Le jeton lisible n'est PAS ajouté à cet objet.
      // La fiche reste invisible tant que Polygon ne l'a pas confirmée.
      let carnetPass = {
        version: "1.3",
        createdByUserId: creator.userId,
        createdByCompanyId: creator.companyId,
        carnetPassId,
        equipmentId,
        manufacturerReference,
        serialNumber,
        identity: equipmentIdentity,
        access: {
          type: "public_technical",
          ownerAccountRequired: false,
        },
        status: "blockchain_pending",
        blockchain: {
          proofSchema: "carnetpass.equipment.v1",
          state: "reserved",
          equipmentKey: proof.equipmentKey,
          dataHash: proof.dataHash,
          serialHash: proof.serialHash,
        },
        createdAt: now,
        updatedAt: now,
      };

      const carnetPassKey = `carnetpass:${carnetPassId}`;
      const qrKey = qrTokenRedisKey(qrToken);
      const serialKey = `carnetpass:serial:${serialNumber}`;
      const manufacturerKey =
        `carnetpass:manufacturer:${manufacturerReference}`;
      const equipmentKey = `carnetpass:equipment:${equipmentId}`;

      const result = await redis.eval(
        CREATE_SCRIPT,
        [
          carnetPassKey,
          qrKey,
          serialKey,
          manufacturerKey,
          equipmentKey,
        ],
        [JSON.stringify(carnetPass), carnetPassId, "1"]
      );

      if (result === "retry") continue;

      if (result === "duplicate_serial") {
        // Un numéro de série ne donne pas droit au carnet ni à son jeton QR.
        return res.status(409).json({
          ok: false,
          error: "Un CarnetPass existe déjà pour ce numéro de série. Utilise le QR déjà associé à l'appareil.",
        });
      }

      if (result !== "created") {
        throw new Error("Enregistrement CarnetPass impossible.");
      }

      let submittedTransaction = null;
      let confirmedProof = null;

      try {
        confirmedProof = await registerEquipmentProof({
          ...proof,
          onTransactionSent: async (submitted) => {
            // Cette affectation précède l'écriture Redis : même si Redis
            // répond mal, on sait qu'il ne faut surtout pas renvoyer la preuve.
            submittedTransaction = submitted;
            const submittedAt = new Date().toISOString();

            carnetPass = {
              ...carnetPass,
              updatedAt: submittedAt,
              blockchain: {
                ...carnetPass.blockchain,
                ...submitted,
                state: "submitted",
                submittedAt,
              },
            };

            await updatePendingCarnetPass(carnetPassKey, carnetPass);
          },
        });

        const confirmedAt = new Date().toISOString();

        carnetPass = {
          ...carnetPass,
          status: "active",
          updatedAt: confirmedAt,
          blockchain: {
            ...carnetPass.blockchain,
            ...confirmedProof,
            state: "confirmed",
            confirmedAt,
          },
        };

        await updatePendingCarnetPass(carnetPassKey, carnetPass);

        return res.status(201).json({
          ok: true,
          carnetPassId,

          // Remis uniquement lors de cette création, jamais par une lecture d'ID.
          qrToken,

          // Chemin relatif : App.jsx choisira le domaine de test ou de production.
          qrPath: `/appareil/${qrToken}`,

          equipment: {
            equipmentId,
            manufacturerReference,
            brand: identity.brand ?? null,
            range: identity.range ?? null,
            model: identity.model ?? null,
            variant: identity.variant ?? null,
          },

          blockchain: {
            chainId: confirmedProof.chainId,
            contractAddress: confirmedProof.contractAddress,
            transactionHash: confirmedProof.transactionHash,
            blockNumber: confirmedProof.blockNumber,
          },
          createdAt: now,
        });
      } catch (error) {
        const diagnostic = typeof error?.code === "string"
          ? error.code
          : "UNKNOWN";
        const errorTransactionHash =
          typeof error?.transactionHash === "string"
            ? error.transactionHash
            : null;

        if (!submittedTransaction && errorTransactionHash) {
          submittedTransaction = {
            transactionHash: errorTransactionHash,
          };
        }

        const definitelyNotRegistered = !submittedTransaction
          || diagnostic === "TRANSACTION_REVERTED";

        console.error(
          "Échec de la preuve Polygon CarnetPass :",
          diagnostic
        );

        if (definitelyNotRegistered) {
          try {
            await redis.eval(
              ROLLBACK_PENDING_SCRIPT,
              [
                carnetPassKey,
                qrKey,
                serialKey,
                manufacturerKey,
                equipmentKey,
              ],
              [carnetPassId]
            );
          } catch {
            console.error("Nettoyage de la réservation CarnetPass impossible.");
          }

          if (
            diagnostic === "SERIAL_ALREADY_EXISTS"
            || diagnostic === "EQUIPMENT_ALREADY_EXISTS"
          ) {
            return res.status(409).json({
              ok: false,
              code: diagnostic,
              error: "Une preuve Polygon existe déjà pour cet équipement ou ce numéro de série.",
            });
          }

          return res.status(503).json({
            ok: false,
            code: "POLYGON_REGISTRATION_FAILED",
            error: "La preuve Polygon n'a pas été créée. Aucun CarnetPass actif n'a été publié. Réessaie plus tard.",
          });
        }

        // La transaction a été remise à Polygon. En cas de réponse incertaine,
        // conserver la réservation empêche une seconde transaction identique.
        const pendingAt = new Date().toISOString();
        const pendingState = confirmedProof
          ? "confirmed_storage_pending"
          : "confirmation_pending";

        carnetPass = {
          ...carnetPass,
          status: "blockchain_pending",
          updatedAt: pendingAt,
          blockchain: {
            ...carnetPass.blockchain,
            ...submittedTransaction,
            ...(confirmedProof ?? {}),
            state: pendingState,
          },
        };

        try {
          await updatePendingCarnetPass(carnetPassKey, carnetPass);
        } catch {
          console.error("État Polygon en attente non enregistré.");
        }

        return res.status(503).json({
          ok: false,
          code: "POLYGON_CONFIRMATION_PENDING",
          error: "La transaction Polygon a été envoyée mais sa confirmation est encore incertaine. Ne relance pas la création pour ce numéro de série.",
        });
      }
    }

    throw new Error("Impossible de générer un identifiant unique.");
  } finally {
    try {
      await redis.eval(
        RELEASE_LOCK_SCRIPT,
        [POLYGON_WRITER_LOCK_KEY],
        [writerLockToken]
      );
    } catch {
      // Le verrou possède aussi une expiration automatique de sécurité.
      console.error("Libération du verrou Polygon impossible.");
    }
  }
}

async function getCarnetPass(req, res) {
  if (!(await checkRateLimit(readingRateLimit, req, res))) return;

  const query = req.query ?? {};
  const hasToken = query.token !== undefined;
  const hasId = query.id !== undefined;

  // On refuse une demande ambiguë plutôt que d'utiliser l'autre paramètre.

  if (hasToken === hasId) {
    return res.status(400).json({
      ok: false,
      error: "Indique un jeton QR ou un numéro CarnetPass, un seul à la fois.",
    });
  }

  let carnetPassId;

  if (hasToken) {
    if (!isQrToken(query.token)) {
      return res.status(400).json({
        ok: false,
        error: "Format du jeton QR invalide.",
      });
    }

    carnetPassId = await redis.get(qrTokenRedisKey(query.token));
  } else {
    if (!validText(query.id, 32)) {
      return res.status(400).json({
        ok: false,
        error: "Numéro CarnetPass invalide.",
      });
    }

    carnetPassId = query.id.trim().toUpperCase();

    if (!/^CP-\d{4}-\d{6}$/.test(carnetPassId)) {
      return res.status(400).json({
        ok: false,
        error: "Numéro CarnetPass invalide.",
      });
    }
  }

  if (
    typeof carnetPassId !== "string"
    || !/^CP-\d{4}-\d{6}$/.test(carnetPassId)
  ) {
    return res.status(404).json({
      ok: false,
      error: "CarnetPass introuvable.",
    });
  }

  const carnetPass = await redis.get(`carnetpass:${carnetPassId}`);

  if (!carnetPass || carnetPass.status !== "active") {
    return res.status(404).json({
      ok: false,
      error: "CarnetPass introuvable.",
    });
  }

  // Les identifiants du créateur et de son entreprise restent privés.

  const publicInput = { ...carnetPass };

  delete publicInput.createdByUserId;
  delete publicInput.createdByCompanyId;

  return res.status(200).json({
    ok: true,
    carnetPass: toPublicCarnetPass(publicInput),
  });
}

export default async function handler(req, res) {
  // Les réponses, notamment celle contenant le nouveau jeton,
  // ne sont pas mises en cache.

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");

  try {
    if (req.method === "POST") {
      return await createCarnetPass(req, res);
    }

    if (req.method === "GET") {
      return await getCarnetPass(req, res);
    }

    res.setHeader("Allow", "GET, POST");

    return res.status(405).json({
      ok: false,
      error: "Méthode non autorisée.",
    });
  } catch {
    // Ne pas journaliser les requêtes, les jetons ou les erreurs Redis brutes.

    console.error("Erreur interne API CarnetPass.");

    return res.status(500).json({
      ok: false,
      error: "Erreur interne CarnetPass.",
    });
  }
}
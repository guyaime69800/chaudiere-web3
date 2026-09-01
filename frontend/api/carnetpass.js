import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

import { generatedEquipmentRegistry } from "./lib/equipment-registry.generated.js";

// ---------------------------------------------------------
// CARNETPASS - API DE CRÉATION DES CARNETS
// ---------------------------------------------------------
//
// Cette API permet :
//
// POST /api/carnetpass
// -> créer automatiquement un nouveau CarnetPass
//
// GET /api/carnetpass?id=CP-2026-000003
// -> retrouver un CarnetPass déjà créé
//
// Aucun nom, adresse ou donnée personnelle propriétaire
// n'est nécessaire.
//
// Le CarnetPass est rattaché à l'ÉQUIPEMENT.
// ---------------------------------------------------------

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

// ---------------------------------------------------------
// ANTI-ABUS
// ---------------------------------------------------------
//
// Un particulier peut créer plusieurs CarnetPass,
// mais on évite qu'un robot en crée des milliers.
//
// 10 créations maximum par heure et par IP.
// ---------------------------------------------------------

const creationRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  prefix: "carnetpass:create",
  analytics: true,
});

// ---------------------------------------------------------
// UTILITAIRES
// ---------------------------------------------------------

function normalizeManufacturerReference(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "");
}

function normalizeCarnetPassId(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function getClientIp(req) {
  const forwarded =
    req.headers["x-forwarded-for"];

  if (typeof forwarded === "string") {
    return (
      forwarded
        .split(",")[0]
        ?.trim() || "unknown"
    );
  }

  return (
    req.headers["x-real-ip"] ||
    "unknown"
  );
}

// ---------------------------------------------------------
// RECHERCHE DU MODÈLE TECHNIQUE
// ---------------------------------------------------------
//
// On cherche l'équipement grâce à sa référence
// constructeur.
//
// Exemple :
//
// 0010017417
// -> Saunier Duval
// -> ThemaFast Condens 30-A
// ---------------------------------------------------------

function findEquipmentByManufacturerReference(
  manufacturerReference
) {
  const wantedReference =
    normalizeManufacturerReference(
      manufacturerReference
    );

  if (!wantedReference) {
    return null;
  }

  return (
    generatedEquipmentRegistry.find(
      (entry) => {
        const equipmentReference =
          normalizeManufacturerReference(
            entry?.equipmentData?.identity
              ?.manufacturerReference
          );

        return (
          equipmentReference ===
          wantedReference
        );
      }
    ) ?? null
  );
}

// ---------------------------------------------------------
// FORMAT DU NUMÉRO CARNETPASS
// ---------------------------------------------------------

function formatCarnetPassId(
  year,
  sequence
) {
  return `CP-${year}-${String(
    sequence
  ).padStart(6, "0")}`;
}

// ---------------------------------------------------------
// INITIALISATION DU COMPTEUR
// ---------------------------------------------------------
//
// CP-2026-000001 et CP-2026-000002 existent déjà
// dans le prototype.
//
// Si Redis n'a encore jamais créé de compteur,
// on démarre donc à 2.
//
// Le premier nouveau numéro sera :
//
// CP-2026-000003
// ---------------------------------------------------------

async function initialiseCounterIfNeeded(
  year
) {
  const counterKey =
    `carnetpass:counter:${year}`;

  const current =
    await redis.get(counterKey);

  if (current === null) {
    await redis.set(
      counterKey,
      2,
      {
        nx: true,
      }
    );
  }

  return counterKey;
}

// ---------------------------------------------------------
// CRÉATION D'UN CARNETPASS
// ---------------------------------------------------------

async function createCarnetPass(
  req,
  res
) {
  // ---------------------------
  // Protection anti-abus
  // ---------------------------

  const ip = getClientIp(req);

  const rateLimitResult =
    await creationRateLimit.limit(ip);

  if (!rateLimitResult.success) {
    return res.status(429).json({
      ok: false,
      error:
        "Trop de créations CarnetPass. Réessaie un peu plus tard.",
    });
  }

  // ---------------------------
  // Référence constructeur
  // ---------------------------

  const manufacturerReference =
    normalizeManufacturerReference(
      req.body?.manufacturerReference
    );

  if (!manufacturerReference) {
    return res.status(400).json({
      ok: false,
      error:
        "La référence constructeur est obligatoire.",
    });
  }

  // ---------------------------
  // Recherche du modèle
  // ---------------------------

  const registryEntry =
    findEquipmentByManufacturerReference(
      manufacturerReference
    );

  if (!registryEntry) {
    return res.status(404).json({
      ok: false,
      error:
        "Cette référence constructeur n'est pas encore disponible dans CarnetPass.",
      manufacturerReference,
    });
  }

  const equipmentData =
    registryEntry.equipmentData;

  const identity =
    equipmentData.identity ?? {};

  // ---------------------------
  // Génération du numéro
  // ---------------------------

  const year =
    new Date().getUTCFullYear();

  const counterKey =
    await initialiseCounterIfNeeded(
      year
    );

  let carnetPassId = null;

  // Plusieurs essais protègent contre
  // un éventuel doublon ou une création simultanée.

  for (
    let attempt = 0;
    attempt < 20;
    attempt += 1
  ) {
    const sequence =
      await redis.incr(counterKey);

    const candidateId =
      formatCarnetPassId(
        year,
        sequence
      );

    const redisKey =
      `carnetpass:${candidateId}`;

    const alreadyExists =
      await redis.exists(redisKey);

    if (!alreadyExists) {
      carnetPassId =
        candidateId;

      break;
    }
  }

  if (!carnetPassId) {
    return res.status(500).json({
      ok: false,
      error:
        "Impossible de générer un identifiant CarnetPass unique.",
    });
  }

  // ---------------------------
  // Données du CarnetPass
  // ---------------------------

  const now =
    new Date().toISOString();

  const carnetPass = {
    version: "1.0",

    carnetPassId,

    equipmentId:
      equipmentData.equipmentId,

    manufacturerReference,

    identity: {
      brand:
        identity.brand ?? null,

      productType:
        identity.productType ?? null,

      range:
        identity.range ?? null,

      model:
        identity.model ?? null,

      variant:
        identity.variant ?? null,
    },

    access: {
      type: "public",
      ownerAccountRequired: false,
    },

    status: "active",

    createdAt: now,
    updatedAt: now,
  };

  // ---------------------------
  // Enregistrement Redis
  // ---------------------------

  const carnetPassKey =
    `carnetpass:${carnetPassId}`;

  await redis.set(
    carnetPassKey,
    carnetPass
  );

  // Index par référence constructeur.
  //
  // Cela permettra plus tard de savoir
  // quels CarnetPass utilisent un modèle.

  await redis.sadd(
    `carnetpass:manufacturer:${manufacturerReference}`,
    carnetPassId
  );

  // Index par équipement technique.

  if (equipmentData.equipmentId) {
    await redis.sadd(
      `carnetpass:equipment:${equipmentData.equipmentId}`,
      carnetPassId
    );
  }

  return res.status(201).json({
    ok: true,

    carnetPassId,

    equipment: {
      equipmentId:
        equipmentData.equipmentId,

      manufacturerReference,

      brand:
        identity.brand ?? null,

      range:
        identity.range ?? null,

      model:
        identity.model ?? null,

      variant:
        identity.variant ?? null,
    },

    createdAt: now,
  });
}

// ---------------------------------------------------------
// LECTURE D'UN CARNETPASS
// ---------------------------------------------------------

async function getCarnetPass(
  req,
  res
) {
  const carnetPassId =
    normalizeCarnetPassId(
      req.query?.id
    );

  if (!carnetPassId) {
    return res.status(400).json({
      ok: false,
      error:
        "Identifiant CarnetPass manquant.",
    });
  }

  const carnetPass =
    await redis.get(
      `carnetpass:${carnetPassId}`
    );

  if (!carnetPass) {
    return res.status(404).json({
      ok: false,
      error:
        "CarnetPass introuvable.",
    });
  }

  return res.status(200).json({
    ok: true,
    carnetPass,
  });
}

// ---------------------------------------------------------
// HANDLER VERCEL
// ---------------------------------------------------------

export default async function handler(
  req,
  res
) {
  try {
    if (req.method === "POST") {
      return await createCarnetPass(
        req,
        res
      );
    }

    if (req.method === "GET") {
      return await getCarnetPass(
        req,
        res
      );
    }

    res.setHeader(
      "Allow",
      "GET, POST"
    );

    return res.status(405).json({
      ok: false,
      error:
        "Méthode non autorisée.",
    });
  } catch (error) {
    console.error(
      "Erreur API CarnetPass :",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        "Erreur interne CarnetPass.",
    });
  }
}
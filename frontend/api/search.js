import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { generatedEquipmentRegistry } from "./lib/equipment-registry.generated.js";
import {
  isQrToken,
  qrTokenRedisKey,
  toPublicCarnetPass,
} from "./lib/carnetpass-access.js";

// RECHERCHE PUBLIQUE : GET /api/search?q=...
// Accepte un jeton QR, un numéro CarnetPass, une référence constructeur,
// un identifiant technique, un modèle, une gamme ou une marque.
// La recherche par numéro de série est réservée au futur accès Pro autorisé.
// Cette API ne crée aucun carnet et ne renvoie jamais une fiche privée.

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

const searchRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "carnetpass:search",
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

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompact(value) {
  return normalizeText(value).replace(/ /g, "");
}

function normalizeManufacturerReference(value) {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

function publicText(value) {
  return typeof value === "string" ? value : null;
}

// Sélection explicite des informations d'un modèle constructeur.
function formatEquipmentResult(entry) {
  const equipmentData = entry?.equipmentData ?? {};
  const identity = equipmentData.identity ?? {};

  return {
    resultType: "equipment",
    equipmentId: publicText(equipmentData.equipmentId),
    manufacturerReference: publicText(identity.manufacturerReference),
    brand: publicText(identity.brand),
    productType: publicText(identity.productType),
    range: publicText(identity.range),
    model: publicText(identity.model),
    variant: publicText(identity.variant),
  };
}

function findByManufacturerReference(query) {
  const wanted = normalizeManufacturerReference(query);
  if (!wanted) return null;

  return generatedEquipmentRegistry.find((entry) =>
    normalizeManufacturerReference(
      entry?.equipmentData?.identity?.manufacturerReference
    ) === wanted
  ) ?? null;
}

function findByEquipmentId(query) {
  const wanted = normalizeCompact(query);
  if (!wanted) return null;

  return generatedEquipmentRegistry.find((entry) =>
    normalizeCompact(entry?.equipmentData?.equipmentId) === wanted
  ) ?? null;
}

// Le classement existant des résultats est conservé.
function searchEquipmentCatalog(query) {
  const wanted = normalizeText(query);
  if (!wanted) return [];

  return generatedEquipmentRegistry
    .map((entry) => {
      const equipmentData = entry?.equipmentData ?? {};
      const identity = equipmentData.identity ?? {};
      const brand = normalizeText(identity.brand);
      const range = normalizeText(identity.range);
      const model = normalizeText(identity.model);
      const variant = normalizeText(identity.variant);
      const manufacturerReference = normalizeText(identity.manufacturerReference);
      const equipmentId = normalizeText(equipmentData.equipmentId);

      const searchableText = [
        brand, range, model, variant, manufacturerReference, equipmentId,
      ].filter(Boolean).join(" ");

      let score = 0;
      if (model === wanted) score += 100;
      if (range === wanted) score += 90;
      if (model.startsWith(wanted)) score += 70;
      if (range.startsWith(wanted)) score += 60;
      if (searchableText.includes(wanted)) score += 40;

      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ entry }) => formatEquipmentResult(entry));
}

// Cette fonction retourne seulement la partie publique d'un carnet actif.
async function findPublicCarnetPass(carnetPassId) {
  if (typeof carnetPassId !== "string"
      || !/^CP-\d{4}-\d{6}$/.test(carnetPassId)) {
    return null;
  }

  const carnetPass = await redis.get(`carnetpass:${carnetPassId}`);
  if (!carnetPass || carnetPass.status !== "active") return null;

  const publicCarnetPass = toPublicCarnetPass(carnetPass);
  if (!publicCarnetPass) return null;

  return {
    resultType: "carnetpass",
    carnetPassId: publicCarnetPass.carnetPassId,
    equipmentId: publicCarnetPass.equipmentId,
    manufacturerReference: publicCarnetPass.manufacturerReference,
    identity: publicCarnetPass.identity,
  };
}

function sendResults(res, searchType, results) {
  // On ne recopie pas la recherche saisie : elle peut contenir un jeton.
  return res.status(200).json({ ok: true, searchType, results });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");

  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({
        ok: false,
        error: "Méthode non autorisée.",
      });
    }

    const limit = await searchRateLimit.limit(getClientIp(req));
    if (!limit.success) {
      const seconds = Number.isFinite(limit.reset)
        ? Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000))
        : 60;
      res.setHeader("Retry-After", String(seconds));
      return res.status(429).json({
        ok: false,
        error: "Trop de recherches. Réessaie un peu plus tard.",
      });
    }

    const rawQuery = req.query?.q;
    if (typeof rawQuery !== "string" || rawQuery.length > 160
        || /[\u0000-\u001f\u007f]/.test(rawQuery)) {
      return res.status(400).json({
        ok: false,
        error: "Recherche invalide : 160 caractères maximum.",
      });
    }

    const query = rawQuery.trim();
    if (!query) {
      return res.status(400).json({ ok: false, error: "Recherche manquante." });
    }

    // 1. Nouveau jeton QR : conserver exactement les majuscules/minuscules.
    if (/^cp_qr_/i.test(query)) {
      if (!isQrToken(query)) {
        return res.status(400).json({
          ok: false,
          error: "Format du jeton QR invalide.",
        });
      }
      const carnetPassId = await redis.get(qrTokenRedisKey(query));
      const carnetPass = await findPublicCarnetPass(carnetPassId);
      return sendResults(res, "qr_token", carnetPass ? [carnetPass] : []);
    }

    // 2. Numéro métier : compatibilité avec les anciennes fiches publiques.
    if (/^CP-\d{4}-\d{6}$/i.test(query)) {
      const carnetPass = await findPublicCarnetPass(query.toUpperCase());
      return sendResults(res, "carnetpass", carnetPass ? [carnetPass] : []);
    }

    // 3. Référence constructeur exacte.
    const referenceMatch = findByManufacturerReference(query);
    if (referenceMatch) {
      return sendResults(res, "manufacturer_reference", [
        formatEquipmentResult(referenceMatch),
      ]);
    }

    // 4. Identifiant technique exact du modèle.
    const equipmentIdMatch = findByEquipmentId(query);
    if (equipmentIdMatch) {
      return sendResults(res, "equipment_id", [
        formatEquipmentResult(equipmentIdMatch),
      ]);
    }

    // 5. Modèle, gamme ou marque.
    const equipmentResults = searchEquipmentCatalog(query);
    if (equipmentResults.length > 0) {
      return sendResults(res, "equipment_catalog", equipmentResults);
    }

    // Aucun accès à l'index privé carnetpass:serial:... ici.
    // Une recherche par série nécessitera les autorisations Pro côté serveur.
    return sendResults(res, "unknown", []);
  } catch {
    // Ne pas journaliser la recherche, les jetons ou les erreurs Redis brutes.
    console.error("Erreur interne recherche CarnetPass.");
    return res.status(500).json({
      ok: false,
      error: "Erreur interne pendant la recherche.",
    });
  }
}
import { Redis } from "@upstash/redis";

import { generatedEquipmentRegistry } from "./lib/equipment-registry.generated.js";

// ---------------------------------------------------------
// CARNETPASS - RECHERCHE UNIVERSELLE
// ---------------------------------------------------------
//
// GET /api/search?q=...
//
// La recherche peut reconnaître :
//
// - CarnetPass ID
//   CP-2026-000003
//
// - Référence constructeur
//   0010017417
//
// - Modèle / gamme
//   ThemaFast
//   ThemaFast Condens 30-A
//
// - Numéro de série
//   lorsqu'un index numéro de série existera dans Redis.
//
// IMPORTANT :
// Une recherche d'équipement générique ne crée JAMAIS
// automatiquement un CarnetPass.
// ---------------------------------------------------------

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

// ---------------------------------------------------------
// NORMALISATION
// ---------------------------------------------------------

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
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

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

function normalizeSerialNumber(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

// ---------------------------------------------------------
// DÉTECTION CARNETPASS
// ---------------------------------------------------------

function looksLikeCarnetPassId(value) {
  return /^CP-\d{4}-\d{6}$/i.test(
    String(value ?? "").trim()
  );
}

// ---------------------------------------------------------
// FORMAT D'UN ÉQUIPEMENT GÉNÉRIQUE
// ---------------------------------------------------------

function formatEquipmentResult(entry) {
  const equipmentData =
    entry?.equipmentData ?? {};

  const identity =
    equipmentData.identity ?? {};

  return {
    resultType: "equipment",

    equipmentId:
      equipmentData.equipmentId ?? null,

    manufacturerReference:
      identity.manufacturerReference ?? null,

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
  };
}

// ---------------------------------------------------------
// RECHERCHE PAR RÉFÉRENCE CONSTRUCTEUR
// ---------------------------------------------------------

function findByManufacturerReference(query) {
  const wanted =
    normalizeManufacturerReference(query);

  if (!wanted) {
    return null;
  }

  return (
    generatedEquipmentRegistry.find(
      (entry) => {
        const reference =
          normalizeManufacturerReference(
            entry?.equipmentData?.identity
              ?.manufacturerReference
          );

        return reference === wanted;
      }
    ) ?? null
  );
}

// ---------------------------------------------------------
// RECHERCHE PAR EQUIPMENT ID
// ---------------------------------------------------------

function findByEquipmentId(query) {
  const wanted =
    normalizeCompact(query);

  if (!wanted) {
    return null;
  }

  return (
    generatedEquipmentRegistry.find(
      (entry) => {
        const equipmentId =
          normalizeCompact(
            entry?.equipmentData?.equipmentId
          );

        return equipmentId === wanted;
      }
    ) ?? null
  );
}

// ---------------------------------------------------------
// RECHERCHE PAR MODÈLE / GAMME / MARQUE
// ---------------------------------------------------------

function searchEquipmentCatalog(query) {
  const wanted =
    normalizeText(query);

  if (!wanted) {
    return [];
  }

  const results =
    generatedEquipmentRegistry
      .map((entry) => {
        const equipmentData =
          entry?.equipmentData ?? {};

        const identity =
          equipmentData.identity ?? {};

        const brand =
          normalizeText(identity.brand);

        const range =
          normalizeText(identity.range);

        const model =
          normalizeText(identity.model);

        const variant =
          normalizeText(identity.variant);

        const manufacturerReference =
          normalizeText(
            identity.manufacturerReference
          );

        const equipmentId =
          normalizeText(
            equipmentData.equipmentId
          );

        const searchableText = [
          brand,
          range,
          model,
          variant,
          manufacturerReference,
          equipmentId,
        ]
          .filter(Boolean)
          .join(" ");

        let score = 0;

        // Correspondance exacte avec le modèle.
        if (model === wanted) {
          score += 100;
        }

        // Correspondance exacte avec la gamme.
        if (range === wanted) {
          score += 90;
        }

        // Le modèle commence par la recherche.
        if (model.startsWith(wanted)) {
          score += 70;
        }

        // La gamme commence par la recherche.
        if (range.startsWith(wanted)) {
          score += 60;
        }

        // Correspondance partielle générale.
        if (searchableText.includes(wanted)) {
          score += 40;
        }

        return {
          entry,
          score,
        };
      })
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(0, 10);

  return results.map(
    ({ entry }) =>
      formatEquipmentResult(entry)
  );
}

// ---------------------------------------------------------
// RECHERCHE PAR NUMÉRO DE SÉRIE
// ---------------------------------------------------------
//
// Cette fonction est déjà prête pour la prochaine étape.
//
// Plus tard, lors de :
//
// "C'est mon appareil"
//       ↓
// saisie numéro de série
//       ↓
// création CarnetPass
//
// nous créerons dans Redis :
//
// carnetpass:serial:NUMERO
// -> CP-2026-xxxxxx
//
// Pour le moment les CarnetPass existants ne possèdent
// pas encore cet index.
// ---------------------------------------------------------

async function findCarnetPassBySerialNumber(
  query
) {
  const serialNumber =
    normalizeSerialNumber(query);

  if (!serialNumber) {
    return null;
  }

  const carnetPassId =
    await redis.get(
      `carnetpass:serial:${serialNumber}`
    );

  if (!carnetPassId) {
    return null;
  }

  const carnetPass =
    await redis.get(
      `carnetpass:${normalizeCarnetPassId(
        carnetPassId
      )}`
    );

  return carnetPass ?? null;
}

// ---------------------------------------------------------
// HANDLER
// ---------------------------------------------------------

export default async function handler(
  req,
  res
) {
  try {
    // Cette API est uniquement destinée à la lecture.
    if (req.method !== "GET") {
      res.setHeader(
        "Allow",
        "GET"
      );

      return res.status(405).json({
        ok: false,
        error:
          "Méthode non autorisée.",
      });
    }

    const query =
      String(req.query?.q ?? "").trim();

    if (!query) {
      return res.status(400).json({
        ok: false,
        error:
          "Recherche manquante.",
      });
    }

    // ---------------------------------------------------
    // 1. CARNETPASS ID
    // ---------------------------------------------------

    if (
      looksLikeCarnetPassId(query)
    ) {
      const carnetPassId =
        normalizeCarnetPassId(query);

      const carnetPass =
        await redis.get(
          `carnetpass:${carnetPassId}`
        );

      if (carnetPass) {
        return res.status(200).json({
          ok: true,
          query,
          searchType:
            "carnetpass",

          results: [
            {
              resultType:
                "carnetpass",

              ...carnetPass,
            },
          ],
        });
      }

      return res.status(200).json({
        ok: true,
        query,
        searchType:
          "carnetpass",
        results: [],
      });
    }

    // ---------------------------------------------------
    // 2. RÉFÉRENCE CONSTRUCTEUR EXACTE
    // ---------------------------------------------------

    const referenceMatch =
      findByManufacturerReference(
        query
      );

    if (referenceMatch) {
      return res.status(200).json({
        ok: true,
        query,
        searchType:
          "manufacturer_reference",

        results: [
          formatEquipmentResult(
            referenceMatch
          ),
        ],
      });
    }

    // ---------------------------------------------------
    // 3. EQUIPMENT ID TECHNIQUE EXACT
    // ---------------------------------------------------

    const equipmentIdMatch =
      findByEquipmentId(query);

    if (equipmentIdMatch) {
      return res.status(200).json({
        ok: true,
        query,
        searchType:
          "equipment_id",

        results: [
          formatEquipmentResult(
            equipmentIdMatch
          ),
        ],
      });
    }

    // ---------------------------------------------------
    // 4. MODÈLE / GAMME / MARQUE
    // ---------------------------------------------------

    const equipmentResults =
      searchEquipmentCatalog(query);

    if (equipmentResults.length > 0) {
      return res.status(200).json({
        ok: true,
        query,
        searchType:
          "equipment_catalog",

        results:
          equipmentResults,
      });
    }

    // ---------------------------------------------------
    // 5. NUMÉRO DE SÉRIE
    // ---------------------------------------------------

    const carnetPassBySerial =
      await findCarnetPassBySerialNumber(
        query
      );

    if (carnetPassBySerial) {
      return res.status(200).json({
        ok: true,
        query,
        searchType:
          "serial_number",

        results: [
          {
            resultType:
              "carnetpass",

            ...carnetPassBySerial,
          },
        ],
      });
    }

    // ---------------------------------------------------
    // AUCUN RÉSULTAT
    // ---------------------------------------------------

    return res.status(200).json({
      ok: true,
      query,
      searchType:
        "unknown",
      results: [],
    });
  } catch (error) {
    console.error(
      "Erreur recherche universelle CarnetPass :",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        "Erreur interne pendant la recherche.",
    });
  }
}
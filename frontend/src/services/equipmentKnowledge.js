import equipmentIndex from "../data/equipment-index.json";

// Catalogue des fichiers techniques disponibles.
// Vite connaît tous les fichiers, mais CarnetPass ne charge
// que celui correspondant à l'équipement recherché.
const equipmentDataFiles = import.meta.glob("../data/equipment/*.json", {
  import: "default",
});

function normalizeLookupValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeEquipmentName(value) {
  return normalizeLookupValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getEquipmentLookupValues(input) {
  if (!input || typeof input !== "object") {
    return [normalizeLookupValue(input)].filter(Boolean);
  }

  return [
    input.product_reference,
    input.productReference,
    input.manufacturerReference,
    input.carnet_pass_id,
    input.carnetPassId,
    input.equipmentId,
  ]
    .map(normalizeLookupValue)
    .filter(Boolean);
}

// Recherche un équipement dans l'index CarnetPass.
// On accepte l'ID CarnetPass, l'ID technique, la référence constructeur
// ou l'objet équipement complet provenant de Supabase.
export function findEquipmentInIndex(input) {
  const lookupValues = getEquipmentLookupValues(input);
  const hasEquipmentObject = Boolean(input && typeof input === "object");

  if (lookupValues.length === 0 && !hasEquipmentObject) {
    return null;
  }

  const exactMatch =
    lookupValues.length > 0
      ? equipmentIndex.equipments.find((equipment) => {
          const indexedValues = [
            equipment.carnetPassId,
            equipment.equipmentId,
            equipment.manufacturerReference,
          ]
            .map(normalizeLookupValue)
            .filter(Boolean);

          return indexedValues.some((value) => lookupValues.includes(value));
        })
      : null;

  if (exactMatch || !hasEquipmentObject) {
    return exactMatch ?? null;
  }

  const inputBrand = normalizeEquipmentName(input.brand);
  const inputModel = normalizeEquipmentName(input.model);

  if (!inputBrand || !inputModel) {
    return null;
  }

  return (
    equipmentIndex.equipments.find((equipment) => {
      const indexedBrand = normalizeEquipmentName(equipment.brand);
      const indexedModel = normalizeEquipmentName(
        [equipment.model, equipment.variant].filter(Boolean).join(" "),
      );

      return (
        indexedBrand === inputBrand &&
        (indexedModel.includes(inputModel) || inputModel.includes(indexedModel))
      );
    }) ?? null
  );
}

// Charge uniquement les données techniques
// correspondant à l'équipement recherché.
export async function loadEquipmentKnowledge(input) {
  const equipment = findEquipmentInIndex(input);

  if (!equipment) {
    return null;
  }

  const filePath = `../data/${equipment.dataFile}`;
  const loader = equipmentDataFiles[filePath];

  if (!loader) {
    console.error("Fichier documentaire introuvable :", filePath);
    return null;
  }

  const data = await loader();

  return {
    equipment,
    data,
  };
}

// Transforme différentes écritures en un format unique.
// Exemples : F28, f28, F.28 ou "défaut F28" deviennent "F.28".
function normalizeErrorCode(input) {
  const text = String(input ?? "").trim().toUpperCase();

  const match = text.match(/F\s*\.?\s*(\d{1,3})/);

  if (!match) {
    return null;
  }

  return `F.${match[1]}`;
}

// Recherche un code défaut dans les données techniques
// de l'équipement qui vient d'être chargé.
export function findErrorCode(input, equipmentKnowledge) {
  const normalizedCode = normalizeErrorCode(input);

  if (!normalizedCode || !Array.isArray(equipmentKnowledge?.errorCodes)) {
    return null;
  }

  return (
    equipmentKnowledge.errorCodes.find(
      (error) => error.code.toUpperCase() === normalizedCode,
    ) ?? null
  );
}

// Donne accès aux données documentaires d'un équipement.
// Le chargement reste dynamique.
export async function getEquipmentKnowledge(input) {
  const knowledge = await loadEquipmentKnowledge(input);

  return knowledge?.data ?? null;
}

// Retourne une bibliothèque documentaire prête à afficher dans le dossier
// de l'équipement, sans exposer le reste des données de diagnostic.
export async function getEquipmentDocumentLibrary(input) {
  const knowledge = await loadEquipmentKnowledge(input);

  if (!knowledge) {
    return {
      catalogueEquipment: null,
      identity: null,
      support: null,
      documents: [],
    };
  }

  const documents = Array.isArray(knowledge.data?.documents)
    ? knowledge.data.documents.filter(
        (document) =>
          document?.documentId && document?.title && document?.documentUrl,
      )
    : [];

  return {
    catalogueEquipment: knowledge.equipment,
    identity: knowledge.data?.identity ?? null,
    support: knowledge.data?.support ?? null,
    documents,
  };
}

// Recherche un code défaut uniquement
// dans la documentation du bon équipement.
export async function findErrorCodeForEquipment(
  equipmentInput,
  errorInput,
) {
  const knowledge = await loadEquipmentKnowledge(equipmentInput);

  if (!knowledge) {
    return null;
  }

  const error = findErrorCode(errorInput, knowledge.data);

  if (!error) {
    return null;
  }

  return {
    equipment: knowledge.equipment,
    data: knowledge.data,
    error,
  };
}

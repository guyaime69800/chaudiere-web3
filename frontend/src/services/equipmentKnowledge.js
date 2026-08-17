import equipmentIndex from "../data/equipment-index.json";

// Catalogue des fichiers techniques disponibles.
// Vite connaît tous les fichiers, mais CarnetPass ne charge
// que celui correspondant à l'équipement recherché.
const equipmentDataFiles = import.meta.glob("../data/equipment/*.json", {
  import: "default",
});

// Recherche un équipement dans l'index CarnetPass.
// On accepte l'ID CarnetPass, l'ID technique ou la référence constructeur.
export function findEquipmentInIndex(input) {
  const value = String(input ?? "").trim().toLowerCase();

  if (!value) {
    return null;
  }

  return (
    equipmentIndex.equipments.find((equipment) => {
      return (
        equipment.carnetPassId?.toLowerCase() === value ||
        equipment.equipmentId?.toLowerCase() === value ||
        equipment.manufacturerReference?.toLowerCase() === value
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

  if (
    !normalizedCode ||
    !Array.isArray(equipmentKnowledge?.errorCodes)
  ) {
    return null;
  }

  return (
    equipmentKnowledge.errorCodes.find(
      (error) => error.code.toUpperCase() === normalizedCode
    ) ?? null
  );
}

// Donne accès aux données documentaires d'un équipement.
// Le chargement reste dynamique.
export async function getEquipmentKnowledge(input) {
  const knowledge = await loadEquipmentKnowledge(input);

  return knowledge?.data ?? null;
}

// Recherche un code défaut uniquement
// dans la documentation du bon équipement.
export async function findErrorCodeForEquipment(
  equipmentInput,
  errorInput
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
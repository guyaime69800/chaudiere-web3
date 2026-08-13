import equipmentData from "../data/equipment/saunier-duval-0010017388.json";

// Transforme différentes écritures en un format unique.
// Exemples : F28, f28, F.28, "défaut F28" deviennent "F.28".
function normalizeErrorCode(input) {
  const text = String(input ?? "").trim().toUpperCase();

  const match = text.match(/F\s*\.?\s*(\d{1,3})/);

  if (!match) {
    return null;
  }

  return `F.${match[1]}`;
}

// Recherche un code défaut dans les données techniques de l'équipement.
export function findErrorCode(input) {
  const normalizedCode = normalizeErrorCode(input);

  if (!normalizedCode) {
    return null;
  }

  return (
    equipmentData.errorCodes.find(
      (error) => error.code.toUpperCase() === normalizedCode
    ) ?? null
  );
}

// Permettra plus tard d'accéder à toute la base documentaire de cet équipement.
export function getEquipmentKnowledge() {
  return equipmentData;
}
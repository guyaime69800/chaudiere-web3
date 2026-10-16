import { generatedEquipmentRegistry } from "./equipment-registry.generated.js";

// Registre central des équipements connus de CarnetPass.
//
// Ce registre est maintenant généré automatiquement
// à partir des fichiers équipements et de leurs embeddings RAG.
const equipmentRegistry = generatedEquipmentRegistry;

// Vérifie si un identifiant correspond à un équipement.
//
// CarnetPass peut reconnaître :
// - CP-2026-000001
// - l'identifiant interne de l'équipement
// - la référence constructeur
function matchesEquipment(equipmentData, equipmentId) {
  const normalizedId = String(equipmentId ?? "").trim();

  return (
    equipmentData.carnetPass?.linkedIds?.includes(normalizedId) ||
    equipmentData.equipmentId === normalizedId ||
    equipmentData.identity?.manufacturerReference === normalizedId
  );
}

// Retrouve automatiquement la bonne configuration
// à partir de l'identifiant transmis par CarnetPass.
export function getEquipmentConfig(equipmentId) {
  return (
    equipmentRegistry.find(({ equipmentData }) =>
      matchesEquipment(equipmentData, equipmentId)
    ) ?? null
  );
}
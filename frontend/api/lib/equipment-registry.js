import saunierDuvalThemaPlus from "../../src/data/equipment/saunier-duval-0010017388.json" with {
  type: "json",
};

import saunierDuvalThemaPlusEmbeddings from "../../src/data/rag/saunier-duval-0020238207-08.embeddings.json" with {
  type: "json",
};

// Registre central des équipements connus de CarnetPass.
//
// À l'avenir, chaque nouveau modèle de chaudière
// sera ajouté ici avec :
// - ses données techniques
// - ses documents
// - ses embeddings RAG
const equipmentRegistry = [
  {
    equipmentData: saunierDuvalThemaPlus,
    ragEmbeddingData: saunierDuvalThemaPlusEmbeddings,
  },
];

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
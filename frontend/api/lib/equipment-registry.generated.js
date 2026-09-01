// ---------------------------------------------------------
// CARNETPASS - REGISTRE RAG
// ---------------------------------------------------------
//
// FICHIER GÉNÉRÉ AUTOMATIQUEMENT.
//
// NE PAS MODIFIER MANUELLEMENT.
//
// Plusieurs documents peuvent être associés
// au même équipement.
// ---------------------------------------------------------

import equipment0 from "../../src/data/equipment/saunier-duval-0010017388.json" with {
  type: "json",
};

import rag0_0 from "../../src/data/rag/saunier-duval-0020238207-08.full.embeddings.json" with {
  type: "json",
};

import rag0_1 from "../../src/data/rag/saunier-duval-sd-themaplus-condens-30-a-exploded-view-0010017388.full.embeddings.json" with {
  type: "json",
};

import equipment1 from "../../src/data/equipment/vaillant-8000044523.json" with {
  type: "json",
};

import rag1_0 from "../../src/data/rag/vaillant-0020279448-11.full.embeddings.json" with {
  type: "json",
};


export const generatedEquipmentRegistry = [
  {
    equipmentData: equipment0,
    ragDocuments: [
      {
        documentId: "sd-themaplus-condens-installation-maintenance-0020238207-08",
        documentType: "installation_maintenance",
        title: "Notice d'installation et de maintenance - ThemaPlus Condens",
        ragEmbeddingData: rag0_0,
      },
      {
        documentId: "sd-themaplus-condens-30-a-exploded-view-0010017388",
        documentType: "exploded_view",
        title: "Vue éclatée - ThemaPlus Condens 30-A (H-FR)",
        ragEmbeddingData: rag0_1,
      },
    ],
    ragEmbeddingData: {
      model: rag0_0.model ?? "text-embedding-3-small",
      items: [
        ...(rag0_0.items ?? []),
        ...(rag0_1.items ?? []),
      ],
    },
  },
  {
    equipmentData: equipment1,
    ragDocuments: [
      {
        documentId: "vaillant-ecotec-plus-vuw-installation-maintenance-0020279448-11",
        documentType: "installation_maintenance",
        title: "Notice d'installation et de maintenance - ecoTEC plus VU/VUW",
        ragEmbeddingData: rag1_0,
      },
    ],
    ragEmbeddingData: {
      model: rag1_0.model ?? "text-embedding-3-small",
      items: [
        ...(rag1_0.items ?? []),
      ],
    },
  },
];

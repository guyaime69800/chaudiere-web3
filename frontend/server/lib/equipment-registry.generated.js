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

import equipment0 from "../../src/data/equipment/atlantic-021272.json" with {
  type: "json",
};

import rag0_0 from "../../src/data/rag/atlantic-u0619432-1904-fr-15.full.embeddings.json" with {
  type: "json",
};

import rag0_1 from "../../src/data/rag/atlantic-u0619432-reglages-extrait.full.embeddings.json" with {
  type: "json",
};

import rag0_2 from "../../src/data/rag/atlantic-naia-naema-v1-v2-sav.full.embeddings.json" with {
  type: "json",
};

import rag0_3 from "../../src/data/rag/atlantic-021272-nomenclature-2018.full.embeddings.json" with {
  type: "json",
};

import equipment1 from "../../src/data/equipment/de-dietrich-7841749.json" with {
  type: "json",
};

import rag1_0 from "../../src/data/rag/de-dietrich-7838865-04.full.embeddings.json" with {
  type: "json",
};

import rag1_1 from "../../src/data/rag/de-dietrich-de-dietrich-mcr-2-24-exploded-view-2024-03-21.full.embeddings.json" with {
  type: "json",
};

import rag1_2 from "../../src/data/rag/de-dietrich-7838860-04.full.embeddings.json" with {
  type: "json",
};

import equipment2 from "../../src/data/equipment/saunier-duval-0010017388.json" with {
  type: "json",
};

import rag2_0 from "../../src/data/rag/saunier-duval-0020238207-08.full.embeddings.json" with {
  type: "json",
};

import rag2_1 from "../../src/data/rag/saunier-duval-sd-themaplus-condens-30-a-exploded-view-0010017388.full.embeddings.json" with {
  type: "json",
};

import equipment3 from "../../src/data/equipment/saunier-duval-0010017417.json" with {
  type: "json",
};

import rag3_0 from "../../src/data/rag/saunier-duval-0020238209-04.full.embeddings.json" with {
  type: "json",
};

import rag3_1 from "../../src/data/rag/saunier-duval-sd-themafast-condens-30-a-exploded-view-0010017417.full.embeddings.json" with {
  type: "json",
};

import rag3_2 from "../../src/data/rag/saunier-duval-0020200493-01.full.embeddings.json" with {
  type: "json",
};

import equipment4 from "../../src/data/equipment/saunier-duval-0010021497.json" with {
  type: "json",
};

import rag4_0 from "../../src/data/rag/saunier-duval-sd-0010021497-installation.full.embeddings.json" with {
  type: "json",
};

import rag4_1 from "../../src/data/rag/saunier-duval-sd-0010021497-utilisation.full.embeddings.json" with {
  type: "json",
};

import rag4_2 from "../../src/data/rag/saunier-duval-sd-0010021497-vue-eclatee.full.embeddings.json" with {
  type: "json",
};

import equipment5 from "../../src/data/equipment/vaillant-8000044523.json" with {
  type: "json",
};

import rag5_0 from "../../src/data/rag/vaillant-0020279448-11.full.embeddings.json" with {
  type: "json",
};


export const generatedEquipmentRegistry = [
  {
    equipmentData: equipment0,
    ragDocuments: [
      {
        documentId: "atlantic-naia-2-micro-25-installation-u0619432-1904-fr-15",
        documentType: "installation_maintenance",
        title: "Notice d'installation - Naia 2 Micro 25",
        ragEmbeddingData: rag0_0,
      },
      {
        documentId: "atlantic-naia-2-micro-25-reglages-extrait-u0619432",
        documentType: "settings_extract",
        title: "Réglages et paramétrages - extrait de la notice Naia 2 Micro",
        ragEmbeddingData: rag0_1,
      },
      {
        documentId: "atlantic-naia-naema-v1-v2-livret-sav",
        documentType: "troubleshooting",
        title: "Livret SAV - Naia et Naema versions 1 et 2",
        ragEmbeddingData: rag0_2,
      },
      {
        documentId: "atlantic-naia-2-micro-25-nomenclature-2018-06-22",
        documentType: "exploded_view",
        title: "Vue éclatée et références de pièces - Naia 2 Micro 25",
        ragEmbeddingData: rag0_3,
      },
    ],
    ragEmbeddingData: {
      model: rag0_0.model ?? "text-embedding-3-small",
      items: [
        ...(rag0_0.items ?? []),
        ...(rag0_1.items ?? []),
        ...(rag0_2.items ?? []),
        ...(rag0_3.items ?? []),
      ],
    },
  },
  {
    equipmentData: equipment1,
    ragDocuments: [
      {
        documentId: "de-dietrich-mcr-2-24-installation-7838865-04",
        documentType: "installation_maintenance",
        title: "Notice d'installation et d'entretien - MCR 2 24 / 30 MI / 35 MI",
        ragEmbeddingData: rag1_0,
      },
      {
        documentId: "de-dietrich-mcr-2-24-exploded-view-2024-03-21",
        documentType: "exploded_view",
        title: "Vue éclatée et références des pièces - MCR 2 24 / 30-35 MI",
        ragEmbeddingData: rag1_1,
      },
      {
        documentId: "de-dietrich-mcr-2-24-user-manual-7838860-04",
        documentType: "user_manual",
        title: "Notice d'utilisation - MCR 2 24 / 30 MI / 35 MI",
        ragEmbeddingData: rag1_2,
      },
    ],
    ragEmbeddingData: {
      model: rag1_0.model ?? "text-embedding-3-small",
      items: [
        ...(rag1_0.items ?? []),
        ...(rag1_1.items ?? []),
        ...(rag1_2.items ?? []),
      ],
    },
  },
  {
    equipmentData: equipment2,
    ragDocuments: [
      {
        documentId: "sd-themaplus-condens-installation-maintenance-0020238207-08",
        documentType: "installation_maintenance",
        title: "Notice d'installation et de maintenance - ThemaPlus Condens",
        ragEmbeddingData: rag2_0,
      },
      {
        documentId: "sd-themaplus-condens-30-a-exploded-view-0010017388",
        documentType: "exploded_view",
        title: "Vue éclatée - ThemaPlus Condens 30-A (H-FR)",
        ragEmbeddingData: rag2_1,
      },
    ],
    ragEmbeddingData: {
      model: rag2_0.model ?? "text-embedding-3-small",
      items: [
        ...(rag2_0.items ?? []),
        ...(rag2_1.items ?? []),
      ],
    },
  },
  {
    equipmentData: equipment3,
    ragDocuments: [
      {
        documentId: "sd-themafast-condens-installation-maintenance-0020238209-04",
        documentType: "installation_maintenance",
        title: "Notice d'installation et de maintenance - ThemaFast Condens / Thema Condens",
        ragEmbeddingData: rag3_0,
      },
      {
        documentId: "sd-themafast-condens-30-a-exploded-view-0010017417",
        documentType: "exploded_view",
        title: "Vue éclatée - ThemaFast Condens 30-A (H-FR)",
        ragEmbeddingData: rag3_1,
      },
      {
        documentId: "sd-themafast-condens-user-manual-0020200493-01",
        documentType: "user_manual",
        title: "Notice d'utilisation - ThemaFast Condens / Thema Condens",
        ragEmbeddingData: rag3_2,
      },
    ],
    ragEmbeddingData: {
      model: rag3_0.model ?? "text-embedding-3-small",
      items: [
        ...(rag3_0.items ?? []),
        ...(rag3_1.items ?? []),
        ...(rag3_2.items ?? []),
      ],
    },
  },
  {
    equipmentData: equipment4,
    ragDocuments: [
      {
        documentId: "sd-0010021497-installation",
        documentType: "installation_maintenance",
        title: "Notice d'installation technique - ThemaPlus Condens 25-A",
        ragEmbeddingData: rag4_0,
      },
      {
        documentId: "sd-0010021497-utilisation",
        documentType: "user_manual",
        title: "Notice d'utilisation - ThemaPlus Condens 25-A",
        ragEmbeddingData: rag4_1,
      },
      {
        documentId: "sd-0010021497-vue-eclatee",
        documentType: "exploded_view",
        title: "Vue éclatée - ThemaPlus Condens 25-A",
        ragEmbeddingData: rag4_2,
      },
    ],
    ragEmbeddingData: {
      model: rag4_0.model ?? "text-embedding-3-small",
      items: [
        ...(rag4_0.items ?? []),
        ...(rag4_1.items ?? []),
        ...(rag4_2.items ?? []),
      ],
    },
  },
  {
    equipmentData: equipment5,
    ragDocuments: [
      {
        documentId: "vaillant-ecotec-plus-vuw-installation-maintenance-0020279448-11",
        documentType: "installation_maintenance",
        title: "Notice d'installation et de maintenance - ecoTEC plus VU/VUW",
        ragEmbeddingData: rag5_0,
      },
    ],
    ragEmbeddingData: {
      model: rag5_0.model ?? "text-embedding-3-small",
      items: [
        ...(rag5_0.items ?? []),
      ],
    },
  },
];

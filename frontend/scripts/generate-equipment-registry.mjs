import fs from "fs";
import path from "path";

// ---------------------------------------------------------
// CARNETPASS - REGISTRE RAG MULTI-DOCUMENTS
// ---------------------------------------------------------
//
// Ce script :
//
// 1. détecte tous les équipements ;
// 2. détecte tous les fichiers d'embeddings ;
// 3. associe chaque PDF à son équipement via documentId ;
// 4. autorise plusieurs documents par équipement ;
// 5. génère un registre unique utilisable par l'API IA.
//
// Exemple pour un équipement :
//
// Saunier Duval ThemaPlus Condens 30-A
//
// ├── Notice installation / maintenance
// │   └── embeddings
// │
// └── Vue éclatée
//     └── embeddings
//
// Les items RAG sont ensuite fusionnés afin que rag.js
// puisse chercher dans tous les documents simultanément.
// ---------------------------------------------------------

// ---------------------------------------------------------
// DOSSIERS
// ---------------------------------------------------------

const equipmentDir = path.resolve(
  "src/data/equipment"
);

const ragDir = path.resolve(
  "src/data/rag"
);

const outputPath = path.resolve(
  "api/lib/equipment-registry.generated.js"
);

const outputDir = path.dirname(
  outputPath
);

// ---------------------------------------------------------
// CHEMIN D'IMPORT JAVASCRIPT
// ---------------------------------------------------------
//
// Transforme notamment :
//
// ..\..\src\data\...
//
// en :
//
// ../../src/data/...
// ---------------------------------------------------------

function toImportPath(
  absolutePath
) {
  let relativePath = path
    .relative(
      outputDir,
      absolutePath
    )
    .replace(/\\/g, "/");

  if (
    !relativePath.startsWith(".")
  ) {
    relativePath =
      `./${relativePath}`;
  }

  return relativePath;
}

// ---------------------------------------------------------
// DÉBUT
// ---------------------------------------------------------

console.log("");

console.log(
  "CarnetPass - Génération du registre RAG multi-documents"
);

console.log(
  "--------------------------------------------------------"
);

// ---------------------------------------------------------
// 1. EMBEDDINGS DISPONIBLES
// ---------------------------------------------------------

if (
  !fs.existsSync(ragDir)
) {
  throw new Error(
    `Dossier RAG introuvable : ${ragDir}`
  );
}

const embeddingFiles = fs
  .readdirSync(ragDir)
  .filter(
    (fileName) =>
      fileName.endsWith(
        ".full.embeddings.json"
      )
  );

// documentId → informations embedding

const embeddingByDocumentId =
  new Map();

for (
  const fileName
  of embeddingFiles
) {
  const filePath =
    path.join(
      ragDir,
      fileName
    );

  let embeddingData;

  try {
    embeddingData =
      JSON.parse(
        fs.readFileSync(
          filePath,
          "utf8"
        )
      );
  } catch (error) {
    console.warn(
      `⚠️ Impossible de lire ${fileName}`
    );

    console.warn(
      error.message
    );

    continue;
  }

  const documentId =
    embeddingData.documentId ??
    embeddingData.items?.[0]
      ?.documentId;

  if (!documentId) {
    console.warn(
      `⚠️ Aucun documentId trouvé dans ${fileName}`
    );

    continue;
  }

  if (
    embeddingByDocumentId.has(
      documentId
    )
  ) {
    console.warn(
      `⚠️ Plusieurs fichiers embeddings détectés pour ${documentId}`
    );
  }

  embeddingByDocumentId.set(
    documentId,
    {
      fileName,
      filePath,
      documentId,
    }
  );
}

// ---------------------------------------------------------
// 2. ÉQUIPEMENTS DISPONIBLES
// ---------------------------------------------------------

if (
  !fs.existsSync(
    equipmentDir
  )
) {
  throw new Error(
    `Dossier équipements introuvable : ${equipmentDir}`
  );
}

const equipmentFiles = fs
  .readdirSync(
    equipmentDir
  )
  .filter(
    (fileName) =>
      fileName.endsWith(
        ".json"
      )
  );

// ---------------------------------------------------------
// STRUCTURE INTERMÉDIAIRE
// ---------------------------------------------------------

const registryEntries = [];

// ---------------------------------------------------------
// 3. ASSOCIATION ÉQUIPEMENT ↔ DOCUMENTS RAG
// ---------------------------------------------------------

for (
  const equipmentFile
  of equipmentFiles
) {
  const equipmentPath =
    path.join(
      equipmentDir,
      equipmentFile
    );

  let equipmentData;

  try {
    equipmentData =
      JSON.parse(
        fs.readFileSync(
          equipmentPath,
          "utf8"
        )
      );
  } catch (error) {
    console.warn(
      `⚠️ Impossible de lire ${equipmentFile}`
    );

    console.warn(
      error.message
    );

    continue;
  }

  const documents =
    Array.isArray(
      equipmentData.documents
    )
      ? equipmentData.documents
      : [];

  if (
    documents.length === 0
  ) {
    console.warn(
      `⚠️ Aucun document pour ${equipmentFile}`
    );

    continue;
  }

  // -------------------------------------------------------
  // DOCUMENTS AYANT RÉELLEMENT DES EMBEDDINGS
  // -------------------------------------------------------

  const ragDocuments = [];

  for (
    const documentData
    of documents
  ) {
    if (
      !documentData?.documentId
    ) {
      continue;
    }

    const embeddingInfo =
      embeddingByDocumentId.get(
        documentData.documentId
      );

    if (
      !embeddingInfo
    ) {
      console.log(
        `ℹ️ Pas encore d'embeddings : ${documentData.documentId}`
      );

      continue;
    }

    ragDocuments.push({
      documentData,

      embeddingFile:
        embeddingInfo.fileName,

      embeddingPath:
        embeddingInfo.filePath,
    });
  }

  // -------------------------------------------------------
  // AUCUN DOCUMENT RAG POUR CET ÉQUIPEMENT
  // -------------------------------------------------------

  if (
    ragDocuments.length === 0
  ) {
    console.warn(
      `⚠️ Aucun document RAG exploitable pour ${equipmentFile}`
    );

    continue;
  }

  registryEntries.push({
    equipmentFile,
    equipmentPath,
    equipmentData,
    ragDocuments,
  });
}

// ---------------------------------------------------------
// 4. GÉNÉRATION DES IMPORTS
// ---------------------------------------------------------

const imports = [];

registryEntries.forEach(
  (
    entry,
    equipmentIndex
  ) => {
    // -----------------------------------------------------
    // IMPORT DE LA FICHE ÉQUIPEMENT
    // -----------------------------------------------------

    imports.push(
      `import equipment${equipmentIndex} from "${toImportPath(
        entry.equipmentPath
      )}" with {`
    );

    imports.push(
      `  type: "json",`
    );

    imports.push(
      `};`
    );

    imports.push("");

    // -----------------------------------------------------
    // IMPORT DE TOUS LES EMBEDDINGS DE L'ÉQUIPEMENT
    // -----------------------------------------------------

    entry.ragDocuments.forEach(
      (
        ragDocument,
        documentIndex
      ) => {
        imports.push(
          `import rag${equipmentIndex}_${documentIndex} from "${toImportPath(
            ragDocument.embeddingPath
          )}" with {`
        );

        imports.push(
          `  type: "json",`
        );

        imports.push(
          `};`
        );

        imports.push("");
      }
    );
  }
);

// ---------------------------------------------------------
// 5. GÉNÉRATION DU REGISTRE
// ---------------------------------------------------------

const registryLines = [
  "// ---------------------------------------------------------",
  "// CARNETPASS - REGISTRE RAG",
  "// ---------------------------------------------------------",
  "//",
  "// FICHIER GÉNÉRÉ AUTOMATIQUEMENT.",
  "//",
  "// NE PAS MODIFIER MANUELLEMENT.",
  "//",
  "// Plusieurs documents peuvent être associés",
  "// au même équipement.",
  "// ---------------------------------------------------------",
  "",
  ...imports,
  "",
  "export const generatedEquipmentRegistry = [",
];

// ---------------------------------------------------------
// ENTRÉES DU REGISTRE
// ---------------------------------------------------------

registryEntries.forEach(
  (
    entry,
    equipmentIndex
  ) => {
    registryLines.push(
      "  {"
    );

    registryLines.push(
      `    equipmentData: equipment${equipmentIndex},`
    );

    // -----------------------------------------------------
    // LISTE DÉTAILLÉE DES DOCUMENTS RAG
    // -----------------------------------------------------

    registryLines.push(
      "    ragDocuments: ["
    );

    entry.ragDocuments.forEach(
      (
        ragDocument,
        documentIndex
      ) => {
        const documentId =
          JSON.stringify(
            ragDocument.documentData
              .documentId
          );

        const documentType =
          JSON.stringify(
            ragDocument.documentData
              .documentType ??
              null
          );

        const title =
          JSON.stringify(
            ragDocument.documentData
              .title ??
              null
          );

        registryLines.push(
          "      {"
        );

        registryLines.push(
          `        documentId: ${documentId},`
        );

        registryLines.push(
          `        documentType: ${documentType},`
        );

        registryLines.push(
          `        title: ${title},`
        );

        registryLines.push(
          `        ragEmbeddingData: rag${equipmentIndex}_${documentIndex},`
        );

        registryLines.push(
          "      },"
        );
      }
    );

    registryLines.push(
      "    ],"
    );

    // -----------------------------------------------------
    // COMPATIBILITÉ AVEC LE MOTEUR RAG ACTUEL
    // -----------------------------------------------------
    //
    // rag.js utilise actuellement :
    //
    // ragEmbeddingData.items
    //
    // On fusionne donc les items de tous les PDF.
    //
    // Ainsi rag.js peut déjà chercher dans :
    //
    // notice + vue éclatée + futurs documents.
    // -----------------------------------------------------

    registryLines.push(
      "    ragEmbeddingData: {"
    );

    registryLines.push(
      `      model: rag${equipmentIndex}_0.model ?? "text-embedding-3-small",`
    );

    registryLines.push(
      "      items: ["
    );

    entry.ragDocuments.forEach(
      (
        ragDocument,
        documentIndex
      ) => {
        registryLines.push(
          `        ...(rag${equipmentIndex}_${documentIndex}.items ?? []),`
        );
      }
    );

    registryLines.push(
      "      ],"
    );

    registryLines.push(
      "    },"
    );

    registryLines.push(
      "  },"
    );
  }
);

registryLines.push(
  "];"
);

registryLines.push("");

// ---------------------------------------------------------
// 6. ÉCRITURE DU FICHIER
// ---------------------------------------------------------

fs.writeFileSync(
  outputPath,
  registryLines.join(
    "\n"
  ),
  "utf8"
);

// ---------------------------------------------------------
// 7. RÉSULTAT
// ---------------------------------------------------------

console.log("");

console.log(
  "Équipements détectés :",
  equipmentFiles.length
);

console.log(
  "Fichiers embeddings détectés :",
  embeddingFiles.length
);

console.log(
  "Équipements RAG enregistrés :",
  registryEntries.length
);

console.log("");

// ---------------------------------------------------------
// AFFICHAGE DE CHAQUE ÉQUIPEMENT
// ---------------------------------------------------------

for (
  const entry
  of registryEntries
) {
  console.log(
    "✅",
    entry.equipmentData.identity
      ?.brand ??
      "Marque inconnue",
    "-",
    entry.equipmentData.identity
      ?.model ??
      "Modèle inconnu"
  );

  console.log(
    "   Documents RAG :",
    entry.ragDocuments.length
  );

  for (
    const ragDocument
    of entry.ragDocuments
  ) {
    console.log(
      "   ├─",
      ragDocument.documentData
        .documentType ??
        "type inconnu"
    );

    console.log(
      "   │  Document :",
      ragDocument.documentData
        .documentId
    );

    console.log(
      "   │  Embeddings :",
      ragDocument.embeddingFile
    );
  }

  console.log("");
}

// ---------------------------------------------------------
// TERMINÉ
// ---------------------------------------------------------

console.log(
  "Registre généré :",
  outputPath
);

console.log("");

console.log(
  "Registre RAG multi-documents prêt ✅"
);
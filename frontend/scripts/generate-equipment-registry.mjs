import fs from "fs";
import path from "path";

// Dossiers contenant les équipements et les embeddings RAG.
const equipmentDir = path.resolve(
  "src/data/equipment"
);

const ragDir = path.resolve(
  "src/data/rag"
);

// Fichier qui sera généré automatiquement.
const outputPath = path.resolve(
  "api/lib/equipment-registry.generated.js"
);

const outputDir = path.dirname(outputPath);

// Transforme un chemin Windows en chemin utilisable
// dans un import JavaScript.
function toImportPath(absolutePath) {
  let relativePath = path
    .relative(outputDir, absolutePath)
    .replace(/\\/g, "/");

  if (!relativePath.startsWith(".")) {
    relativePath = `./${relativePath}`;
  }

  return relativePath;
}

console.log("");
console.log("CarnetPass - Génération du registre RAG");
console.log("---------------------------------------");

// ----------------------------------------------------
// 1. Recherche de tous les fichiers d'embeddings.
// ----------------------------------------------------

const embeddingFiles = fs
  .readdirSync(ragDir)
  .filter((fileName) =>
    fileName.endsWith(".full.embeddings.json")
  );

// documentId → fichier embeddings
const embeddingByDocumentId = new Map();

for (const fileName of embeddingFiles) {
  const filePath = path.join(
    ragDir,
    fileName
  );

  const embeddingData = JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );

  // Pour nos fichiers actuels, le documentId
  // est disponible dans les éléments RAG.
  const documentId =
    embeddingData.documentId ??
    embeddingData.items?.[0]?.documentId;

  if (!documentId) {
    console.warn(
      `⚠️ Aucun documentId trouvé dans ${fileName}`
    );

    continue;
  }

  embeddingByDocumentId.set(
    documentId,
    fileName
  );
}

// ----------------------------------------------------
// 2. Recherche de tous les équipements.
// ----------------------------------------------------

const equipmentFiles = fs
  .readdirSync(equipmentDir)
  .filter((fileName) =>
    fileName.endsWith(".json")
  );

const registryEntries = [];

for (const equipmentFile of equipmentFiles) {
  const equipmentPath = path.join(
    equipmentDir,
    equipmentFile
  );

  const equipmentData = JSON.parse(
    fs.readFileSync(
      equipmentPath,
      "utf8"
    )
  );

  // Pour le moment, le RAG utilise principalement
  // la notice installation / maintenance.
  const documentData =
    equipmentData.documents?.find(
      (document) =>
        document.documentType ===
        "installation_maintenance"
    );

  if (!documentData?.documentId) {
    console.warn(
      `⚠️ Pas de notice RAG pour ${equipmentFile}`
    );

    continue;
  }

  const embeddingFile =
    embeddingByDocumentId.get(
      documentData.documentId
    );

  if (!embeddingFile) {
    console.warn(
      `⚠️ Embeddings introuvables pour ${equipmentFile}`
    );

    continue;
  }

  registryEntries.push({
    equipmentFile,
    equipmentPath,
    embeddingFile,
    embeddingPath: path.join(
      ragDir,
      embeddingFile
    ),
    equipmentData,
    documentData,
  });
}

// ----------------------------------------------------
// 3. Génération des imports JavaScript.
// ----------------------------------------------------

const imports = [];

registryEntries.forEach(
  (entry, index) => {
    imports.push(
      `import equipment${index} from "${toImportPath(
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

    imports.push(
      `import rag${index} from "${toImportPath(
        entry.embeddingPath
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

// ----------------------------------------------------
// 4. Génération du registre.
// ----------------------------------------------------

const registryLines = [
  "// FICHIER GÉNÉRÉ AUTOMATIQUEMENT.",
  "// Ne pas ajouter les équipements manuellement ici.",
  "",
  ...imports,
  "export const generatedEquipmentRegistry = [",
];

registryEntries.forEach(
  (entry, index) => {
    registryLines.push("  {");

    registryLines.push(
      `    equipmentData: equipment${index},`
    );

    registryLines.push(
      `    ragEmbeddingData: rag${index},`
    );

    registryLines.push("  },");
  }
);

registryLines.push("];");
registryLines.push("");

fs.writeFileSync(
  outputPath,
  registryLines.join("\n"),
  "utf8"
);

// ----------------------------------------------------
// Résultat.
// ----------------------------------------------------

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

for (const entry of registryEntries) {
  console.log(
    "✅",
    entry.equipmentData.identity?.brand,
    "-",
    entry.equipmentData.identity?.model
  );

  console.log(
    "   Document :",
    entry.documentData.documentId
  );

  console.log(
    "   Embeddings :",
    entry.embeddingFile
  );
}

console.log("");
console.log(
  "Registre généré :",
  outputPath
);
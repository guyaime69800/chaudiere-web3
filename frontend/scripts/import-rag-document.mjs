import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

// ---------------------------------------------------------
// CARNETPASS - IMPORT RAG AUTOMATIQUE
// ---------------------------------------------------------
//
// Ce script orchestre les 3 étapes :
//
// 1. Extraction du PDF
// 2. Découpage en chunks
// 3. Génération des embeddings
//
// Exemple :
//
// npx vercel env run -e preview -- node \
// scripts/import-rag-document.mjs \
// src/data/equipment/saunier-duval-0010017388.json \
// installation_maintenance \
// 1,2,42,44
// ---------------------------------------------------------

const scriptDirectory = path.dirname(
  fileURLToPath(import.meta.url)
);

// Racine du dossier frontend.
const frontendRoot = path.resolve(
  scriptDirectory,
  ".."
);

// ---------------------------------------------------------
// PARAMÈTRES
// ---------------------------------------------------------

const equipmentFileArg = process.argv[2];
const documentType = process.argv[3];
const ignoredPages = process.argv[4] ?? "";

if (!equipmentFileArg) {
  throw new Error(
    "Fichier équipement manquant."
  );
}

if (!documentType) {
  throw new Error(
    "Type de document manquant."
  );
}

// ---------------------------------------------------------
// SÉCURITÉ
// ---------------------------------------------------------
//
// La clé OpenAI doit rester dans les variables
// d'environnement.
//
// Elle ne doit jamais être écrite ici.
// ---------------------------------------------------------

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "OPENAI_API_KEY absente. Lance ce pipeline avec l'environnement Vercel."
  );
}

// ---------------------------------------------------------
// FICHIER ÉQUIPEMENT
// ---------------------------------------------------------

const equipmentPath = path.isAbsolute(
  equipmentFileArg
)
  ? equipmentFileArg
  : path.resolve(
      frontendRoot,
      equipmentFileArg
    );

if (!fs.existsSync(equipmentPath)) {
  throw new Error(
    `Fichier équipement introuvable : ${equipmentPath}`
  );
}

const equipmentData = JSON.parse(
  fs.readFileSync(
    equipmentPath,
    "utf8"
  )
);

// ---------------------------------------------------------
// DOCUMENT À IMPORTER
// ---------------------------------------------------------

const documentData =
  equipmentData.documents?.find(
    (document) =>
      document.documentType ===
      documentType
  );

if (!documentData) {
  throw new Error(
    `Aucun document de type "${documentType}" trouvé pour cet équipement.`
  );
}

// ---------------------------------------------------------
// NOM DES FICHIERS
// ---------------------------------------------------------
//
// slug = nom simplifié utilisable dans un fichier.
//
// Exemple :
//
// "Saunier Duval"
// devient
// "saunier-duval"
// ---------------------------------------------------------

function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );
}

const brandSlug = slugify(
  equipmentData.identity?.brand ??
    "document"
);

const documentReference =
  documentData.documentCode ??
  documentData.documentId ??
  documentData.title;

const documentSlug = slugify(
  documentReference
);

if (!documentSlug) {
  throw new Error(
    "Impossible de déterminer le nom du document RAG."
  );
}

const ragBaseName =
  `${brandSlug}-${documentSlug}`;

const ragDirectory = path.resolve(
  frontendRoot,
  "src/data/rag"
);

const pagesPath = path.join(
  ragDirectory,
  `${ragBaseName}.pages.json`
);

const chunksPath = path.join(
  ragDirectory,
  `${ragBaseName}.full.chunks.json`
);

const embeddingsPath = path.join(
  ragDirectory,
  `${ragBaseName}.full.embeddings.json`
);

// ---------------------------------------------------------
// FONCTION POUR LANCER UN SCRIPT
// ---------------------------------------------------------
//
// child process = processus enfant.
//
// Notre orchestrateur lance un autre programme Node,
// attend qu'il termine puis vérifie son résultat.
// ---------------------------------------------------------

function runScript(
  scriptName,
  args
) {
  console.log("");
  console.log(
    `▶ ${scriptName}`
  );

  const scriptPath = path.join(
    scriptDirectory,
    scriptName
  );

  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      ...args,
    ],
    {
      cwd: frontendRoot,

      stdio: "inherit",

      env: process.env,
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${scriptName} a échoué avec le code ${result.status}.`
    );
  }
}

// ---------------------------------------------------------
// DÉBUT DU PIPELINE
// ---------------------------------------------------------

console.log("");
console.log(
  "======================================"
);

console.log(
  "CarnetPass - Import RAG automatique"
);

console.log(
  "======================================"
);

console.log(
  "Équipement :",
  equipmentData.identity?.model ??
    "inconnu"
);

console.log(
  "Marque :",
  equipmentData.identity?.brand ??
    "inconnue"
);

console.log(
  "Document :",
  documentData.title ??
    "sans titre"
);

console.log(
  "Type :",
  documentType
);

if (ignoredPages) {
  console.log(
    "Pages ignorées :",
    ignoredPages
  );
}

// ---------------------------------------------------------
// ÉTAPE 1 : EXTRACTION
// ---------------------------------------------------------

console.log("");
console.log(
  "ÉTAPE 1/3 - Extraction du PDF"
);

runScript(
  "extract-rag-document.mjs",
  [
    equipmentPath,
    documentType,
  ]
);

if (!fs.existsSync(pagesPath)) {
  throw new Error(
    `Le fichier extrait n'a pas été créé : ${pagesPath}`
  );
}

console.log(
  "Extraction validée ✅"
);

// ---------------------------------------------------------
// ÉTAPE 2 : CHUNKING
// ---------------------------------------------------------

console.log("");
console.log(
  "ÉTAPE 2/3 - Découpage en chunks"
);

const chunkArguments = [
  pagesPath,
];

if (ignoredPages) {
  chunkArguments.push(
    ignoredPages
  );
}

runScript(
  "generate-full-rag-chunks.mjs",
  chunkArguments
);

if (!fs.existsSync(chunksPath)) {
  throw new Error(
    `Le fichier de chunks n'a pas été créé : ${chunksPath}`
  );
}

console.log(
  "Chunking validé ✅"
);

// ---------------------------------------------------------
// ÉTAPE 3 : EMBEDDINGS
// ---------------------------------------------------------

console.log("");
console.log(
  "ÉTAPE 3/3 - Génération des embeddings"
);

runScript(
  "generate-full-rag-embeddings.mjs",
  [
    chunksPath,
  ]
);

if (
  !fs.existsSync(
    embeddingsPath
  )
) {
  throw new Error(
    `Le fichier d'embeddings n'a pas été créé : ${embeddingsPath}`
  );
}

console.log(
  "Embeddings validés ✅"
);

// ---------------------------------------------------------
// TERMINÉ
// ---------------------------------------------------------

console.log("");
console.log(
  "======================================"
);

console.log(
  "IMPORT RAG TERMINÉ ✅"
);

console.log(
  "======================================"
);

console.log(
  "Pages :",
  pagesPath
);

console.log(
  "Chunks :",
  chunksPath
);

console.log(
  "Embeddings :",
  embeddingsPath
);

console.log("");
console.log(
  "Document prêt pour le RAG CarnetPass 🚀"
);
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

// ---------------------------------------------------------
// CARNETPASS - IMPORT RAG AUTOMATIQUE MULTI-DOCUMENTS
// ---------------------------------------------------------
//
// Ce script orchestre :
//
// Pour chaque document :
// 1. Extraction du PDF
// 2. Découpage en chunks
// 3. Génération des embeddings
//
// Puis une seule fois :
// 4. Génération du registre automatique des équipements
//
// ---------------------------------------------------------
//
// MODE 1 : un seul document
//
// npx vercel env run -e preview -- node \
// scripts/import-rag-document.mjs \
// src/data/equipment/saunier-duval-0010017388.json \
// installation_maintenance \
// 1,2,42,44
//
// ---------------------------------------------------------
//
// MODE 2 : tous les documents de l'équipement
//
// npx vercel env run -e preview -- node \
// scripts/import-rag-document.mjs \
// src/data/equipment/saunier-duval-0010017388.json \
// all
//
// ---------------------------------------------------------

const scriptDirectory = path.dirname(
  fileURLToPath(import.meta.url)
);

// Racine frontend.
const frontendRoot = path.resolve(
  scriptDirectory,
  ".."
);

// ---------------------------------------------------------
// PARAMÈTRES
// ---------------------------------------------------------

const equipmentFileArg = process.argv[2];

const requestedDocument =
  process.argv[3];

const commandLineIgnoredPages =
  process.argv[4] ?? "";

if (!equipmentFileArg) {
  throw new Error(
    "Fichier équipement manquant."
  );
}

if (!requestedDocument) {
  throw new Error(
    'Document manquant. Utilise un type de document ou "all".'
  );
}

// ---------------------------------------------------------
// SÉCURITÉ
// ---------------------------------------------------------
//
// La clé OpenAI doit rester exclusivement
// dans les variables d'environnement.
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
// VÉRIFICATION DE LA LISTE DES DOCUMENTS
// ---------------------------------------------------------

const equipmentDocuments =
  Array.isArray(
    equipmentData.documents
  )
    ? equipmentData.documents
    : [];

if (
  equipmentDocuments.length === 0
) {
  throw new Error(
    "Aucun document enregistré pour cet équipement."
  );
}

// ---------------------------------------------------------
// SLUG
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

// ---------------------------------------------------------
// MARQUE
// ---------------------------------------------------------

const brandSlug = slugify(
  equipmentData.identity?.brand ??
    "document"
);

// ---------------------------------------------------------
// DOSSIER RAG
// ---------------------------------------------------------

const ragDirectory =
  path.resolve(
    frontendRoot,
    "src/data/rag"
  );

if (
  !fs.existsSync(
    ragDirectory
  )
) {
  fs.mkdirSync(
    ragDirectory,
    {
      recursive: true,
    }
  );
}

// ---------------------------------------------------------
// REGISTRE GÉNÉRÉ
// ---------------------------------------------------------

const generatedRegistryPath =
  path.resolve(
    frontendRoot,
    "api/lib/equipment-registry.generated.js"
  );

// ---------------------------------------------------------
// LANCEMENT D'UN SCRIPT NODE
// ---------------------------------------------------------

function runScript(
  scriptName,
  args
) {
  console.log("");
  console.log(
    `▶ ${scriptName}`
  );

  const scriptPath =
    path.join(
      scriptDirectory,
      scriptName
    );

  const result =
    spawnSync(
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

  if (
    result.status !== 0
  ) {
    throw new Error(
      `${scriptName} a échoué avec le code ${result.status}.`
    );
  }
}

// ---------------------------------------------------------
// SÉLECTION DES DOCUMENTS
// ---------------------------------------------------------

const importAll =
  requestedDocument
    .trim()
    .toLowerCase() ===
  "all";

let documentsToImport = [];

if (importAll) {
  documentsToImport =
    equipmentDocuments.filter(
      (document) =>
        Boolean(
          document.documentUrl
        )
    );

  const skippedDocuments =
    equipmentDocuments.filter(
      (document) =>
        !document.documentUrl
    );

  if (
    skippedDocuments.length > 0
  ) {
    console.log("");
    console.log(
      "⚠️ Documents sans URL ignorés :"
    );

    for (
      const document
      of skippedDocuments
    ) {
      console.log(
        `- ${
          document.title ??
          document.documentId ??
          "document inconnu"
        }`
      );
    }
  }
} else {
  const documentData =
    equipmentDocuments.find(
      (document) =>
        document.documentType ===
          requestedDocument ||
        document.documentId ===
          requestedDocument
    );

  if (!documentData) {
    throw new Error(
      `Document "${requestedDocument}" introuvable pour cet équipement.`
    );
  }

  if (
    !documentData.documentUrl
  ) {
    throw new Error(
      `Le document "${requestedDocument}" ne possède pas de documentUrl.`
    );
  }

  documentsToImport = [
    documentData,
  ];
}

if (
  documentsToImport.length === 0
) {
  throw new Error(
    "Aucun document exploitable à importer."
  );
}

// ---------------------------------------------------------
// VÉRIFICATION DES TYPES EN DOUBLE
// ---------------------------------------------------------
//
// extract-rag-document.mjs sélectionne actuellement
// le document par documentType.
//
// Tant que ce script n'est pas encore adapté pour sélectionner
// directement un documentId, deux documents ayant exactement
// le même documentType pourraient être ambigus.
//
// On bloque donc proprement ce cas au lieu d'importer
// le mauvais PDF.
// ---------------------------------------------------------

const typeCounts = {};

for (
  const document
  of documentsToImport
) {
  const type =
    document.documentType ??
    "unknown";

  typeCounts[type] =
    (typeCounts[type] ?? 0) + 1;
}

const duplicatedTypes =
  Object.entries(typeCounts)
    .filter(
      ([, count]) =>
        count > 1
    )
    .map(
      ([type]) => type
    );

if (
  duplicatedTypes.length > 0
) {
  throw new Error(
    `Plusieurs documents utilisent le même documentType : ${duplicatedTypes.join(
      ", "
    )}. Il faudra les sélectionner par documentId.`
  );
}

// ---------------------------------------------------------
// CALCUL DES CHEMINS RAG D'UN DOCUMENT
// ---------------------------------------------------------

function getRagPaths(
  documentData
) {
  const documentReference =
    documentData.documentCode ??
    documentData.documentId ??
    documentData.title;

  const documentSlug =
    slugify(
      documentReference
    );

  if (!documentSlug) {
    throw new Error(
      `Impossible de déterminer le nom RAG du document : ${
        documentData.title ??
        "sans titre"
      }`
    );
  }

  const ragBaseName =
    `${brandSlug}-${documentSlug}`;

  return {
    ragBaseName,

    pagesPath:
      path.join(
        ragDirectory,
        `${ragBaseName}.pages.json`
      ),

    chunksPath:
      path.join(
        ragDirectory,
        `${ragBaseName}.full.chunks.json`
      ),

    embeddingsPath:
      path.join(
        ragDirectory,
        `${ragBaseName}.full.embeddings.json`
      ),
  };
}

// ---------------------------------------------------------
// PAGES À IGNORER
// ---------------------------------------------------------
//
// Pour l'ancien mode mono-document,
// on garde le quatrième argument.
//
// Pour le mode "all",
// il sera également possible plus tard
// d'ajouter dans le JSON :
//
// "rag": {
//   "ignoredPages": [1, 2, 44]
// }
//
// ou :
//
// "ignoredPages": [1, 2, 44]
//
// ---------------------------------------------------------

function getIgnoredPages(
  documentData
) {
  if (
    !importAll &&
    commandLineIgnoredPages
  ) {
    return commandLineIgnoredPages;
  }

  const configuredPages =
    documentData.rag
      ?.ignoredPages ??
    documentData.ignoredPages ??
    [];

  if (
    Array.isArray(
      configuredPages
    )
  ) {
    return configuredPages.join(
      ","
    );
  }

  return String(
    configuredPages ?? ""
  ).trim();
}

// ---------------------------------------------------------
// IMPORT D'UN DOCUMENT
// ---------------------------------------------------------

function importDocument(
  documentData,
  index,
  total
) {
  const documentType =
    documentData.documentType;

  if (!documentType) {
    throw new Error(
      `documentType absent pour "${
        documentData.title ??
        documentData.documentId
      }".`
    );
  }

  const {
    pagesPath,
    chunksPath,
    embeddingsPath,
  } = getRagPaths(
    documentData
  );

  const ignoredPages =
    getIgnoredPages(
      documentData
    );

  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    `DOCUMENT ${index}/${total}`
  );

  console.log(
    "======================================"
  );

  console.log(
    "Titre :",
    documentData.title ??
      "sans titre"
  );

  console.log(
    "Type :",
    documentType
  );

  console.log(
    "Référence :",
    documentData.documentCode ??
      documentData.documentId ??
      "inconnue"
  );

  console.log(
    "Pages :",
    documentData.pageCount ??
      "inconnu"
  );

  if (ignoredPages) {
    console.log(
      "Pages ignorées :",
      ignoredPages
    );
  }

  // -------------------------------------------------------
  // ÉTAPE 1 : EXTRACTION
  // -------------------------------------------------------

  console.log("");
  console.log(
    `[${index}/${total}] ÉTAPE 1/3 - Extraction du PDF`
  );

  runScript(
    "extract-rag-document.mjs",
    [
      equipmentPath,
      documentType,
    ]
  );

  if (
    !fs.existsSync(
      pagesPath
    )
  ) {
    throw new Error(
      `Le fichier extrait n'a pas été créé : ${pagesPath}`
    );
  }

  console.log(
    "Extraction validée ✅"
  );

  // -------------------------------------------------------
  // ÉTAPE 2 : CHUNKING
  // -------------------------------------------------------

  console.log("");
  console.log(
    `[${index}/${total}] ÉTAPE 2/3 - Découpage en chunks`
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

  if (
    !fs.existsSync(
      chunksPath
    )
  ) {
    throw new Error(
      `Le fichier de chunks n'a pas été créé : ${chunksPath}`
    );
  }

  console.log(
    "Chunking validé ✅"
  );

  // -------------------------------------------------------
  // ÉTAPE 3 : EMBEDDINGS
  // -------------------------------------------------------

  console.log("");
  console.log(
    `[${index}/${total}] ÉTAPE 3/3 - Génération des embeddings`
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

  return {
    title:
      documentData.title,

    documentType,

    pagesPath,

    chunksPath,

    embeddingsPath,
  };
}

// ---------------------------------------------------------
// DÉBUT DU PIPELINE
// ---------------------------------------------------------

console.log("");
console.log(
  "======================================"
);

console.log(
  "CarnetPass - Import RAG multi-documents"
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
  "Référence constructeur :",
  equipmentData.identity
    ?.manufacturerReference ??
    "inconnue"
);

console.log(
  "Documents à importer :",
  documentsToImport.length
);

console.log("");

documentsToImport.forEach(
  (
    document,
    index
  ) => {
    console.log(
      `${index + 1}. ${
        document.title ??
        document.documentId
      }`
    );
  }
);

// ---------------------------------------------------------
// IMPORT DE TOUS LES DOCUMENTS
// ---------------------------------------------------------

const importedDocuments = [];

for (
  let index = 0;
  index <
  documentsToImport.length;
  index++
) {
  const document =
    documentsToImport[index];

  const result =
    importDocument(
      document,
      index + 1,
      documentsToImport.length
    );

  importedDocuments.push(
    result
  );
}

// ---------------------------------------------------------
// REGISTRE AUTOMATIQUE
// ---------------------------------------------------------

console.log("");
console.log(
  "======================================"
);

console.log(
  "ÉTAPE FINALE - Génération du registre RAG"
);

console.log(
  "======================================"
);

runScript(
  "generate-equipment-registry.mjs",
  []
);

if (
  !fs.existsSync(
    generatedRegistryPath
  )
) {
  throw new Error(
    `Le registre automatique n'a pas été créé : ${generatedRegistryPath}`
  );
}

console.log(
  "Registre automatique validé ✅"
);

// ---------------------------------------------------------
// RÉSUMÉ
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
  "Équipement :",
  equipmentData.identity?.brand,
  equipmentData.identity?.model
);

console.log(
  "Documents importés :",
  importedDocuments.length
);

console.log("");

for (
  const document
  of importedDocuments
) {
  console.log(
    "--------------------------------------"
  );

  console.log(
    "Document :",
    document.title
  );

  console.log(
    "Type :",
    document.documentType
  );

  console.log(
    "Pages :",
    document.pagesPath
  );

  console.log(
    "Chunks :",
    document.chunksPath
  );

  console.log(
    "Embeddings :",
    document.embeddingsPath
  );
}

console.log(
  "--------------------------------------"
);

console.log(
  "Registre :",
  generatedRegistryPath
);

console.log("");
console.log(
  "Tous les documents sont prêts pour le RAG CarnetPass 🚀"
);
import fs from "fs";
import path from "path";

// ---------------------------------------------------------
// PARAMÈTRES
// ---------------------------------------------------------
//
// Exemple :
// node scripts/generate-full-rag-chunks.mjs \
// src/data/rag/saunier-duval-0020238207-08.pages.json \
// 1,2,42,44
//
// Premier argument : fichier .pages.json à traiter.
// Deuxième argument facultatif : pages à ignorer.
// ---------------------------------------------------------

const inputFileArg = process.argv[2];
const ignoredPagesArg = process.argv[3] || "";

if (!inputFileArg) {
  throw new Error(
    "Fichier .pages.json manquant. Exemple : node scripts/generate-full-rag-chunks.mjs src/data/rag/document.pages.json"
  );
}

const inputPath = path.resolve(inputFileArg);

if (!fs.existsSync(inputPath)) {
  throw new Error(
    `Fichier d'entrée introuvable : ${inputPath}`
  );
}

// Pages éventuellement exclues du RAG.
//
// Exemple :
// "1,2,42,44"
// devient :
// [1, 2, 42, 44]
const ignoredPages = ignoredPagesArg
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value));

// Le fichier de sortie est automatiquement créé
// à partir du nom du fichier d'entrée.
//
// exemple :
// document.pages.json
// devient :
// document.full.chunks.json
const outputPath = inputPath.replace(
  /\.pages\.json$/i,
  ".full.chunks.json"
);

if (outputPath === inputPath) {
  throw new Error(
    'Le fichier d’entrée doit se terminer par ".pages.json".'
  );
}

const documentData = JSON.parse(
  fs.readFileSync(inputPath, "utf8")
);

// Taille approximative maximale d'un chunk.
//
// chunk = petit morceau de texte
// utilisé par le moteur RAG.
const MAX_CHUNK_LENGTH = 1400;

// Petit chevauchement entre deux chunks.
//
// overlap = chevauchement.
//
// Cela permet de conserver un peu de contexte
// entre deux morceaux successifs.
const OVERLAP_LENGTH = 180;

function cleanText(text) {
  return String(text ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitPageIntoChunks(text) {
  const cleanedText = cleanText(text);

  if (!cleanedText) {
    return [];
  }

  // Une petite page reste dans un seul chunk.
  if (cleanedText.length <= MAX_CHUNK_LENGTH) {
    return [cleanedText];
  }

  const chunks = [];

  let start = 0;

  while (start < cleanedText.length) {
    let end = Math.min(
      start + MAX_CHUNK_LENGTH,
      cleanedText.length
    );

    // On essaie de couper proprement
    // à la fin d'un paragraphe,
    // d'une phrase ou d'une ligne.
    if (end < cleanedText.length) {
      const candidate = cleanedText.slice(
        start,
        end
      );

      const paragraphBreak =
        candidate.lastIndexOf("\n\n");

      const sentenceBreak =
        candidate.lastIndexOf(". ");

      const lineBreak =
        candidate.lastIndexOf("\n");

      const bestBreak = Math.max(
        paragraphBreak,
        sentenceBreak,
        lineBreak
      );

      // On évite une coupure beaucoup trop tôt.
      if (
        bestBreak >
        MAX_CHUNK_LENGTH * 0.55
      ) {
        end = start + bestBreak + 1;
      }
    }

    const chunkText = cleanedText
      .slice(start, end)
      .trim();

    if (chunkText.length > 0) {
      chunks.push(chunkText);
    }

    if (end >= cleanedText.length) {
      break;
    }

    // On reprend légèrement avant la coupure
    // afin de conserver du contexte.
    start = Math.max(
      end - OVERLAP_LENGTH,
      start + 1
    );
  }

  return chunks;
}

// ---------------------------------------------------------
// Création d'un identifiant propre
// ---------------------------------------------------------

function createSlug(value) {
  return String(value || "document")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// L'identifiant du document sert maintenant
// automatiquement de base aux chunkId.
const documentSlug = createSlug(
  documentData.documentCode ||
    documentData.documentId ||
    path.basename(
      inputPath,
      ".pages.json"
    )
);

const chunks = [];

for (
  const pageData of documentData.pages ?? []
) {
  const pageNumber = pageData.page;

  // On ignore seulement les pages indiquées
  // au lancement du script.
  //
  // Ainsi aucune page Saunier Duval
  // n'est codée en dur dans le programme.
  if (ignoredPages.includes(pageNumber)) {
    continue;
  }

  // Une page sans texte exploitable
  // ne génère simplement aucun chunk.
  const pageChunks = splitPageIntoChunks(
    pageData.text
  );

  pageChunks.forEach((text, index) => {
    chunks.push({
      chunkId:
        `${documentSlug}-page-${pageNumber}-chunk-${index + 1}`,

      documentId:
        documentData.documentId,

      documentType:
        documentData.documentType,

      page: pageNumber,

      section:
        `Document technique - page ${pageNumber}`,

      topic:
        `page-${pageNumber}`,

      text,
    });
  });
}

fs.mkdirSync(
  path.dirname(outputPath),
  { recursive: true }
);

fs.writeFileSync(
  outputPath,
  JSON.stringify(chunks, null, 2),
  "utf8"
);

// ---------------------------------------------------------
// CONTRÔLE
// ---------------------------------------------------------

console.log("");
console.log(
  "CarnetPass - Chunking documentaire"
);

console.log(
  "----------------------------------"
);

console.log(
  "Document :",
  documentData.documentTitle
);

console.log(
  "Pages disponibles :",
  documentData.pages?.length ?? 0
);

console.log(
  "Pages ignorées :",
  ignoredPages.length > 0
    ? ignoredPages.join(", ")
    : "aucune"
);

console.log(
  "Chunks générés :",
  chunks.length
);

console.log(
  "Fichier créé :",
  outputPath
);

console.log("");

if (chunks.length > 0) {
  console.log("Premier chunk :");
  console.log(chunks[0]);

  console.log("");

  console.log("Dernier chunk :");
  console.log(
    chunks[chunks.length - 1]
  );
} else {
  console.log(
    "⚠️ Aucun chunk généré."
  );
}
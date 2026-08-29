import fs from "fs";
import path from "path";

// Fichier contenant les 44 pages extraites de la notice.
const inputPath = path.resolve(
  "src/data/rag/saunier-duval-0020238207-08.pages.json"
);

// Nouveau fichier.
// On ne remplace PAS encore les anciens chunks validés.
const outputPath = path.resolve(
  "src/data/rag/saunier-duval-0020238207-08.full.chunks.json"
);

const documentData = JSON.parse(
  fs.readFileSync(inputPath, "utf8")
);

// Taille approximative maximale d'un chunk.
// Un chunk = morceau de texte envoyé au moteur RAG.
const MAX_CHUNK_LENGTH = 1400;

// Petit chevauchement entre deux chunks.
// Cela évite de couper brutalement une information importante.
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

  // Si la page est suffisamment petite,
  // elle reste dans un seul chunk.
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

    // On essaie de couper proprement à la fin
    // d'une phrase ou d'un paragraphe.
    if (end < cleanedText.length) {
      const candidate = cleanedText.slice(start, end);

      const paragraphBreak = candidate.lastIndexOf("\n\n");
      const sentenceBreak = candidate.lastIndexOf(". ");
      const lineBreak = candidate.lastIndexOf("\n");

      const bestBreak = Math.max(
        paragraphBreak,
        sentenceBreak,
        lineBreak
      );

      // On évite une coupure trop proche du début.
      if (bestBreak > MAX_CHUNK_LENGTH * 0.55) {
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
    // pour conserver un peu de contexte.
    start = Math.max(
      end - OVERLAP_LENGTH,
      start + 1
    );
  }

  return chunks;
}

const chunks = [];

for (const pageData of documentData.pages ?? []) {
  // Pages non techniques ignorées :
  // page 1 = couverture
  // page 2 = sommaire
  // page 42 = index
  // page 44 = informations éditeur / droits
  if ([1, 2, 42, 44].includes(pageData.page)) {
    continue;
  }

  const pageNumber = pageData.page;
  const pageChunks = splitPageIntoChunks(pageData.text);

  pageChunks.forEach((text, index) => {
    chunks.push({
      chunkId:
        `sd-0020238207-08-page-${pageNumber}-chunk-${index + 1}`,

      documentId: documentData.documentId,

      page: pageNumber,

      section: `Notice complète - page ${pageNumber}`,

      topic: `page-${pageNumber}`,

      text,
    });
  });
}

fs.writeFileSync(
  outputPath,
  JSON.stringify(chunks, null, 2),
  "utf8"
);

console.log("");
console.log("CarnetPass - Chunking notice complète");
console.log("------------------------------------");

console.log(
  "Document :",
  documentData.documentTitle
);

console.log(
  "Pages disponibles :",
  documentData.pages?.length ?? 0
);

console.log(
  "Chunks générés :",
  chunks.length
);

console.log(
  "Fichier créé :",
  outputPath
);

// Quelques exemples pour contrôle.
console.log("");
console.log("Premier chunk :");
console.log(chunks[0]);

console.log("");
console.log("Dernier chunk :");
console.log(chunks[chunks.length - 1]);
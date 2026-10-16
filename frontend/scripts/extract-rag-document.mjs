import fs from "fs";
import path from "path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { get } from "@vercel/blob";

// ---------------------------------------------------------
// PARAMÈTRES D'IMPORT
// ---------------------------------------------------------
//
// Exemple :
// node scripts/extract-rag-document.mjs \
// src/data/equipment/saunier-duval-0010017388.json \
// installation_maintenance
//
// Le premier argument indique l'équipement.
// Le deuxième indique le type de document.
// ---------------------------------------------------------

const equipmentFileArg = process.argv[2];

const documentTypeArg =
  process.argv[3] || "installation_maintenance";

// Une copie locale du PDF permet l'indexation lorsque le jeton Blob
// d'administration n'est pas disponible dans l'environnement de travail.
const localPdfArg = process.argv[4];

if (!equipmentFileArg) {
  throw new Error(
    "Fichier équipement manquant. Exemple : node scripts/extract-rag-document.mjs src/data/equipment/saunier-duval-0010017388.json"
  );
}

// Chemin vers le fichier décrivant l'équipement.
const equipmentPath = path.resolve(equipmentFileArg);

if (!fs.existsSync(equipmentPath)) {
  throw new Error(
    `Fichier équipement introuvable : ${equipmentPath}`
  );
}

// Lecture des informations de l'équipement.
const equipmentData = JSON.parse(
  fs.readFileSync(equipmentPath, "utf8")
);

// Recherche du document demandé.
const documentData = equipmentData.documents?.find(
  (document) =>
    document.documentType === documentTypeArg
);

if (!documentData?.documentUrl) {
  throw new Error(
    `Document "${documentTypeArg}" introuvable pour cet équipement.`
  );
}

console.log("");
console.log("CarnetPass - Extraction documentaire");
console.log("------------------------------------");
console.log("Équipement :", equipmentData.identity?.model);
console.log("Marque :", equipmentData.identity?.brand);
console.log("Document :", documentData.title);
console.log("Type :", documentData.documentType);
console.log("URL :", documentData.documentUrl);
console.log("");

// Téléchargement du PDF.
console.log("Téléchargement du document...");

let pdfBuffer;

if (localPdfArg) {
  const localPdfPath = path.resolve(localPdfArg);
  if (!fs.existsSync(localPdfPath) || path.extname(localPdfPath).toLowerCase() !== ".pdf") {
    throw new Error(`PDF local introuvable : ${localPdfPath}`);
  }
  pdfBuffer = fs.readFileSync(localPdfPath);
} else if (documentData.storage === "private") {
  const pathname = new URL(documentData.documentUrl).pathname.slice(1);
  const result = await get(pathname, { access: "private" });

  if (result?.statusCode !== 200 || !result.stream) {
    throw new Error(`Impossible de lire le PDF privé : ${pathname}`);
  }

  pdfBuffer = await new Response(result.stream).arrayBuffer();
} else {
  const pdfResponse = await fetch(documentData.documentUrl);

  if (!pdfResponse.ok) {
    throw new Error(`Impossible de télécharger le PDF : ${pdfResponse.status}`);
  }

  pdfBuffer = await pdfResponse.arrayBuffer();
}

console.log(
  "PDF téléchargé :",
  Math.round(pdfBuffer.byteLength / 1024),
  "Ko"
);

// Ouverture du PDF avec PDF.js.
const pdf = await getDocument({
  data: new Uint8Array(pdfBuffer),
}).promise;

let ocrWorker;
let createCanvas;
if (documentData.rag?.ocr) {
  const [{ createWorker }, canvasModule] = await Promise.all([
    import("tesseract.js"),
    import("@napi-rs/canvas"),
  ]);
  createCanvas = canvasModule.createCanvas;
  const cachePath = path.resolve("tmp/ocr-cache");
  fs.mkdirSync(cachePath, { recursive: true });
  ocrWorker = await createWorker("fra", 1, { cachePath });
}

console.log(
  "Nombre de pages détectées :",
  pdf.numPages
);

const pages = [];

// Extraction du texte page par page.
for (
  let pageNumber = 1;
  pageNumber <= pdf.numPages;
  pageNumber++
) {
  const page = await pdf.getPage(pageNumber);

  const textContent = await page.getTextContent();

  let text = "";

  for (const item of textContent.items) {
    if (!("str" in item)) {
      continue;
    }

    text += item.str;

    if (item.hasEOL) {
      text += "\n";
    } else {
      text += " ";
    }
  }

  // Nettoyage léger du texte.
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text && ocrWorker) {
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext("2d"), viewport, canvas }).promise;
    const recognized = await ocrWorker.recognize(canvas.toBuffer("image/png"));
    text = recognized.data.text.trim();
    if (!text) {
      throw new Error(`OCR vide pour la page ${pageNumber} de ${documentData.documentId}`);
    }
  }

  pages.push({
    page: pageNumber,
    text,
  });

  console.log(
    `Page ${pageNumber}/${pdf.numPages} extraite - ${text.length} caractères`
  );
}

if (ocrWorker) await ocrWorker.terminate();

// ---------------------------------------------------------
// Création automatique du nom de fichier
// ---------------------------------------------------------

function createSlug(value) {
  return String(value || "document")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const brandSlug = createSlug(
  equipmentData.identity?.brand
);

const documentSlug = createSlug(
  documentData.documentCode ||
  documentData.documentId ||
  documentData.title
);

const outputPath = path.resolve(
  "src/data/rag",
  `${brandSlug}-${documentSlug}.pages.json`
);

// Création du dossier si nécessaire.
fs.mkdirSync(
  path.dirname(outputPath),
  { recursive: true }
);

const outputData = {
  documentId: documentData.documentId,
  documentTitle: documentData.title,
  documentType: documentData.documentType,
  documentCode: documentData.documentCode,

  manufacturerReference:
    equipmentData.identity?.manufacturerReference,

  brand: equipmentData.identity?.brand,
  model: equipmentData.identity?.model,

  pageCount: pdf.numPages,

  extractedAt: new Date().toISOString(),

  pages,
};

fs.writeFileSync(
  outputPath,
  JSON.stringify(outputData, null, 2),
  "utf8"
);

console.log("");
console.log("Extraction terminée ✅");
console.log("Pages extraites :", pages.length);
console.log("Fichier créé :", outputPath);

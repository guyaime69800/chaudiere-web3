import fs from "fs";
import path from "path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// Fichier décrivant notre équipement Saunier Duval.
const equipmentPath = path.resolve(
  "src/data/equipment/saunier-duval-0010017388.json"
);

// Lecture des informations de l'équipement.
const equipmentData = JSON.parse(
  fs.readFileSync(equipmentPath, "utf8")
);

// Recherche de la notice d'installation / maintenance.
const documentData = equipmentData.documents?.find(
  (document) =>
    document.documentType === "installation_maintenance"
);

if (!documentData?.documentUrl) {
  throw new Error(
    "Notice d'installation / maintenance introuvable pour cet équipement."
  );
}

console.log("");
console.log("CarnetPass - Extraction documentaire");
console.log("------------------------------------");
console.log("Équipement :", equipmentData.identity?.model);
console.log("Document :", documentData.title);
console.log("URL :", documentData.documentUrl);
console.log("");

// Téléchargement du PDF.
console.log("Téléchargement de la notice...");

const pdfResponse = await fetch(documentData.documentUrl);

if (!pdfResponse.ok) {
  throw new Error(
    `Impossible de télécharger le PDF : ${pdfResponse.status}`
  );
}

const pdfBuffer = await pdfResponse.arrayBuffer();

console.log(
  "PDF téléchargé :",
  Math.round(pdfBuffer.byteLength / 1024),
  "Ko"
);

// Ouverture du PDF avec PDF.js.
const pdf = await getDocument({
  data: new Uint8Array(pdfBuffer),
}).promise;

console.log("Nombre de pages détectées :", pdf.numPages);

const pages = [];

// Extraction du texte page par page.
for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
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

  pages.push({
    page: pageNumber,
    text,
  });

  console.log(
    `Page ${pageNumber}/${pdf.numPages} extraite - ${text.length} caractères`
  );
}

// Fichier de sortie.
//
// IMPORTANT :
// ce fichier contient toute la notice extraite,
// avec le numéro de chaque page.
const outputPath = path.resolve(
  "src/data/rag/saunier-duval-0020238207-08.pages.json"
);

const outputData = {
  documentId: documentData.documentId,
  documentTitle: documentData.title,
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
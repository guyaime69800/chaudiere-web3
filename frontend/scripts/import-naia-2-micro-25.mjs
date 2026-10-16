import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { put } from "@vercel/blob";

// Depuis frontend/ :
// npx vercel env run -e preview -- node scripts/import-naia-2-micro-25.mjs <installation.pdf> <reglages.pdf> <sav.pdf> <vue-eclatee.pdf>
// Ajoute --check pour vérifier les quatre PDF sans accès Blob/OpenAI ni écriture.
const frontend = fileURLToPath(new URL("../", import.meta.url));
const indexPath = resolve(frontend, "src/data/equipment-index.json");
const equipmentPath = resolve(frontend, "src/data/equipment/atlantic-021272.json");
const reference = "021272";
const equipmentId = "atlantic-naia-2-micro-25-021272";
const specs = [
  {
    path: process.argv[2], sha256: "d8ea822e71baa37fd235fce4a4b751aa6debc570a9fe53f532c015f816b77c5e", pages: 72,
    cover: /Naia\s*2\s*micro\s*25/i,
    documentId: "atlantic-naia-2-micro-25-installation-u0619432-1904-fr-15",
    title: "Notice d'installation - Naia 2 Micro 25", documentType: "installation_maintenance",
    documentCode: "U0619432_1904_FR_15", revisionDate: "2020-02-27",
    pathname: "atlantic/021272/notice-installation-naia-2-micro-25.pdf",
    usefulPages: { identification: [1] },
    notes: "Notice commune aux Naia 2 Micro 25, 30 et 35. Vérifier la référence 021272 avant d'utiliser un réglage propre à une variante.",
  },
  {
    path: process.argv[3], sha256: "23ceaed2741a7e4ccc163c92f0454770665db24c06ddc0180409822abdb2d74f", pages: 13,
    cover: /Interface\s+r[eé]gulation/i,
    documentId: "atlantic-naia-2-micro-25-reglages-extrait-u0619432",
    title: "Réglages et paramétrages - extrait de la notice Naia 2 Micro", documentType: "settings_extract",
    documentCode: "U0619432-reglages-extrait", revisionDate: "2020-02-27",
    pathname: "atlantic/021272/reglages-extrait-naia-2-micro.pdf",
    usefulPages: { controls: [1] },
    notes: "Extrait de la notice d'installation commune aux Naia 2 Micro 25, 30 et 35 ; pages et informations reprises dans la notice complète.",
  },
  {
    path: process.argv[4], sha256: "84a29477bbbf2563bd1e62dc6aff5f364874ba2610a3f9eb7997f57d5c30771a", pages: 32,
    cover: /LIVRET\s+DE\s+DEPANNAGE\s+SAV/i,
    documentId: "atlantic-naia-naema-v1-v2-livret-sav",
    title: "Livret SAV - Naia et Naema versions 1 et 2", documentType: "troubleshooting",
    documentCode: "NAIA-NAEMA-V1-V2-SAV", revisionDate: null,
    pathname: "atlantic/021272/livret-sav-naia-naema-v1-v2.pdf",
    usefulPages: { modelValidity: [3], faultCodes: [10], hotline: [32] },
    notes: "Livret SAV commun à plusieurs modèles : vérifier que le code et la procédure s'appliquent à la référence 021272.",
  },
  {
    path: process.argv[5], sha256: "1ea316a3a7de84192959553c3b577da02ea9656c9a479871b3df6c64f6280828", pages: 15,
    cover: /021272\s+NAIA\s*2\s*MICRO\s*25/i,
    documentId: "atlantic-naia-2-micro-25-nomenclature-2018-06-22",
    title: "Vue éclatée et références de pièces - Naia 2 Micro 25", documentType: "exploded_view",
    documentCode: "021272-nomenclature-2018", revisionDate: "2018-06-22",
    pathname: "atlantic/021272/vue-eclatee-naia-2-micro-25.pdf",
    usefulPages: { modelValidity: [1], diagrams: [2, 4, 6, 8, 10, 12, 14], partsReferences: [3, 5, 7, 9, 11, 13, 15] },
    notes: "Nomenclature Atlantic obtenue via Pièces Express, édition 2018. Références et disponibilité des pièces à vérifier auprès du fournisseur ; ne pas déduire de prix actuel.",
  },
];

if (specs.some((spec) => !spec.path)) {
  throw new Error("Indique les PDF dans cet ordre : installation, réglages, SAV, vue éclatée.");
}

// Vérifier tous les fichiers avant toute écriture ou tout envoi privé.
for (const spec of specs) {
  const bytes = readFileSync(resolve(spec.path));
  if (createHash("sha256").update(bytes).digest("hex") !== spec.sha256) {
    throw new Error(`PDF différent du document vérifié : ${spec.path}`);
  }
  const pdf = await getDocument({ data: new Uint8Array(bytes) }).promise;
  const firstPage = await pdf.getPage(1);
  const cover = (await firstPage.getTextContent()).items.map((item) => item.str || "").join(" ");
  if (pdf.numPages !== spec.pages || !spec.cover.test(cover)) {
    throw new Error(`Couverture ou pagination inattendue : ${spec.path}`);
  }
  spec.bytes = bytes;
  console.log(`Vérifié : ${spec.title} (${pdf.numPages} pages)`);
}
if (process.argv.includes("--check")) {
  console.log("Quatre PDF vérifiés. Aucun fichier écrit ni PDF envoyé.");
  process.exit(0);
}
if (!process.env.BLOB_READ_WRITE_TOKEN || !process.env.OPENAI_API_KEY) {
  throw new Error("Variables Preview BLOB_READ_WRITE_TOKEN et OPENAI_API_KEY nécessaires pour l'envoi privé et l'indexation.");
}

const index = JSON.parse(readFileSync(indexPath, "utf8"));
const existing = index.equipments.find((item) => item.equipmentId === equipmentId || item.manufacturerReference === reference);
if (existing && existing.dataFile !== "equipment/atlantic-021272.json") {
  throw new Error("La référence 021272 est déjà associée à une autre fiche.");
}
let equipment;
if (existing) {
  equipment = JSON.parse(readFileSync(equipmentPath, "utf8"));
  if (specs.some((spec) => !equipment.documents?.some((doc) => doc.documentId === spec.documentId && doc.sha256 === spec.sha256 && doc.documentUrl))) {
    throw new Error("Fiche déjà présente mais incomplète : arrêt pour préserver les PDF existants.");
  }
  console.log("Fiche existante : reprise de l'indexation sans nouvel envoi Blob.");
} else {
  const documents = [];
  for (const spec of specs) {
    const blob = await put(spec.pathname, spec.bytes, {
      access: "private", addRandomSuffix: true, contentType: "application/pdf",
    });
    if (!/^https:\/\//.test(blob.url)) throw new Error(`Envoi privé non confirmé : ${spec.title}`);
    documents.push({
      documentId: spec.documentId, title: spec.title, documentType: spec.documentType,
      documentCode: spec.documentCode, documentUrl: blob.url, revisionDate: spec.revisionDate,
      pageCount: spec.pages, language: "fr",
      sourceType: spec.documentType === "exploded_view" ? "manufacturer_spare_parts_catalog" : "manufacturer_document",
      sourceName: "Atlantic", appliesTo: ["Naia 2 Micro 25"], manufacturerReference: reference,
      usefulPages: spec.usefulPages, verificationStatus: "verified_from_uploaded_pdf",
      storage: "private", sha256: spec.sha256, notes: spec.notes,
    });
    console.log(`PDF envoyé en privé : ${spec.title}`);
  }
  equipment = {
    version: "1.0", equipmentId,
    identity: { brand: "Atlantic", productType: "chaudiere_gaz_condensation", range: "Naia 2 Micro", model: "Naia 2 Micro 25", variant: "FR", manufacturerReference: reference },
    carnetPass: { linkedIds: [] },
    support: { manufacturer: "Atlantic", hotline: { label: "Hotline technique Atlantic", phone: "03 51 42 70 42", hours: null, source: "Livret SAV Naia/Naema, page 32 ; capture Pièces Express Naia 2 Micro 25", verifiedAt: "2026-09-25" } },
    documents, errorCodeIndex: null, errorCodes: [], diagnosticRules: [],
    metadata: { status: "pilot", verificationStatus: "verified_documents", lastVerifiedAt: "2026-09-25", notes: "Quatre PDF vérifiés : la fiche réglages reprend une partie de la notice complète ; le livret SAV couvre plusieurs variantes et la nomenclature date de 2018." },
  };
  writeFileSync(equipmentPath, `${JSON.stringify(equipment, null, 2)}\n`);
  index.equipments.push({ equipmentId, brand: "Atlantic", model: "Naia 2 Micro 25", variant: "FR", manufacturerReference: reference, dataFile: "equipment/atlantic-021272.json", status: "pilot" });
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  console.log("Fiche catalogue ajoutée, hotline comprise.");
}

const imported = spawnSync(process.execPath, ["scripts/import-rag-document.mjs", "src/data/equipment/atlantic-021272.json", "all"], { cwd: frontend, stdio: "inherit", env: process.env });
if (imported.error || imported.status !== 0) throw new Error("Indexation Shiba Bot interrompue : relance exactement la même commande.", { cause: imported.error });
const validated = spawnSync(process.execPath, ["scripts/validate-equipment-catalog.mjs"], { cwd: frontend, stdio: "inherit", env: process.env });
if (validated.error || validated.status !== 0) throw new Error("Validation catalogue échouée.", { cause: validated.error });
console.log("Naia 2 Micro 25 : quatre documents privés et indexation Shiba Bot prêts.");

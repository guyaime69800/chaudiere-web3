import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { put } from "@vercel/blob";

// Usage from frontend/ (PowerShell):
// npx vercel env run -e preview -- node scripts/import-mcr-2-24.mjs <installation.pdf> <vue-eclatee.pdf> <utilisation.pdf>
const frontend = fileURLToPath(new URL("../", import.meta.url));
const indexPath = resolve(frontend, "src/data/equipment-index.json");
const equipmentPath = resolve(frontend, "src/data/equipment/de-dietrich-7841749.json");
const reference = "7841749";
const equipmentId = "de-dietrich-mcr-2-24-7841749";
const specs = [
  {
    path: process.argv[2],
    sha256: "dd1430762747664a216803127ff48785e4694fd9f681abded6c925ac4e858d32",
    pages: 84,
    cover: /notice d.installation et d.entretien/i,
    documentId: "de-dietrich-mcr-2-24-installation-7838865-04",
    title: "Notice d'installation et d'entretien - MCR 2 24 / 30 MI / 35 MI",
    documentType: "installation_maintenance",
    documentCode: "7838865-04",
    revisionDate: "2023-12-15",
    pathname: "de-dietrich/7841749/notice-installation-mcr-2-24.pdf",
    usefulPages: { installation: [25], electricalDiagram: [13], safety: [5] },
  },
  {
    path: process.argv[3],
    sha256: "b5be827f2805766f4e11f29aa627bdd5b9b06a9f6bffdd4ee59eb9831d6ff026",
    pages: 3,
    cover: /pi[eè]ces d[eé]tach[eé]es/i,
    documentId: "de-dietrich-mcr-2-24-exploded-view-2024-03-21",
    title: "Vue éclatée et références des pièces - MCR 2 24 / 30-35 MI",
    documentType: "exploded_view",
    documentCode: null,
    revisionDate: "2024-03-21",
    pathname: "de-dietrich/7841749/vue-eclatee-mcr-2-24.pdf",
    usefulPages: { diagram: [1], partsReferences: [2, 3] },
  },
  {
    path: process.argv[4],
    sha256: "57dd5bc316202012a243b19af80c8a4be5a061525405156f203416edefccce9a",
    pages: 44,
    cover: /notice d.utilisation/i,
    documentId: "de-dietrich-mcr-2-24-user-manual-7838860-04",
    title: "Notice d'utilisation - MCR 2 24 / 30 MI / 35 MI",
    documentType: "user_manual",
    documentCode: "7838860-04",
    revisionDate: "2023-12-15",
    pathname: "de-dietrich/7841749/notice-utilisation-mcr-2-24.pdf",
    usefulPages: { safety: [5], operation: [15] },
  },
];

if (specs.some((spec) => !spec.path)) {
  throw new Error("Indique les trois PDF dans cet ordre : installation, vue éclatée, utilisation.");
}
if (!process.env.BLOB_READ_WRITE_TOKEN || !process.env.OPENAI_API_KEY) {
  throw new Error("BLOB_READ_WRITE_TOKEN et OPENAI_API_KEY doivent être disponibles dans l'environnement Preview.");
}

for (const spec of specs) {
  const bytes = readFileSync(resolve(spec.path));
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== spec.sha256) throw new Error(`PDF différent du fichier vérifié : ${spec.path}`);
  const pdf = await getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await pdf.getPage(1);
  const cover = (await page.getTextContent()).items.map((item) => item.str || "").join(" ");
  if (pdf.numPages !== spec.pages || !spec.cover.test(cover) || !/MCR\s*2/i.test(cover) || !/24/.test(cover)) {
    throw new Error(`Modèle, type de document ou nombre de pages incorrect : ${spec.path}`);
  }
  spec.bytes = bytes;
  console.log(`Vérifié : ${spec.title} (${spec.pages} pages)`);
}

const index = JSON.parse(readFileSync(indexPath, "utf8"));
const existing = index.equipments.find((entry) => entry.manufacturerReference === reference || entry.equipmentId === equipmentId);
if (existing && existing.dataFile !== "equipment/de-dietrich-7841749.json") {
  throw new Error("Cette référence existe déjà sous une autre fiche : vérifie le catalogue.");
}

let equipment;
if (existing) {
  equipment = JSON.parse(readFileSync(equipmentPath, "utf8"));
  if (equipment.documents?.length !== 3 || specs.some((spec) =>
    !equipment.documents.some((document) => document.documentId === spec.documentId && document.sha256 === spec.sha256 && document.documentUrl))) {
    throw new Error("Fiche existante différente : arrêt pour préserver le catalogue.");
  }
  console.log("Fiche déjà créée : reprise de l'indexation RAG sans nouvel envoi Blob.");
} else {
  const documents = [];
  for (const spec of specs) {
    // Garde les PDF hors de Git, comme les documents constructeur déjà présents dans CarnetPass.
    const blob = await put(spec.pathname, spec.bytes, {
      access: "private",
      addRandomSuffix: true,
      contentType: "application/pdf",
    });
    if (!/^https:\/\//.test(blob.url)) throw new Error(`Envoi Blob non confirmé : ${spec.title}`);
    documents.push({
      documentId: spec.documentId,
      title: spec.title,
      documentType: spec.documentType,
      documentCode: spec.documentCode,
      documentUrl: blob.url,
      revisionDate: spec.revisionDate,
      pageCount: spec.pages,
      language: "fr",
      sourceType: spec.documentType === "exploded_view" ? "manufacturer_spare_parts_catalog" : "manufacturer_document",
      sourceName: "De Dietrich",
      appliesTo: ["MCR 2 24"],
      manufacturerReference: reference,
      usefulPages: spec.usefulPages,
      verificationStatus: "verified_from_uploaded_pdf",
      storage: "private",
      sha256: spec.sha256,
    notes: spec.documentType === "exploded_view" ? "Document commun aux MCR 2 24, 30 MI et 35 MI. Prix affichés historiques, à ne pas utiliser comme prix actuels." : "Document commun aux MCR 2 24, 30 MI et 35 MI.",
    });
    console.log(`PDF accessible : ${spec.title}`);
  }
  equipment = {
    version: "1.0",
    equipmentId,
    identity: { brand: "De Dietrich", productType: "chaudiere_gaz_condensation", range: "MCR 2", model: "MCR 2 24", variant: "FR", manufacturerReference: reference },
    carnetPass: { linkedIds: [] },
    documents,
    errorCodeIndex: null,
    errorCodes: [],
    diagnosticRules: [],
    metadata: { status: "pilot", verificationStatus: "verified_documents", lastVerifiedAt: "2026-09-25", notes: "Notices et vue éclatée contrôlées sur les trois PDF transmis. MCR 2 24 est une chaudière chauffage seul ; 30 MI et 35 MI sont des variantes différentes." },
  };
  writeFileSync(equipmentPath, `${JSON.stringify(equipment, null, 2)}\n`);
  index.equipments.push({ equipmentId, brand: "De Dietrich", model: "MCR 2 24", variant: "FR", manufacturerReference: reference, dataFile: "equipment/de-dietrich-7841749.json", status: "pilot" });
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  console.log("Fiche et index du catalogue ajoutés.");
}

const imported = spawnSync(process.execPath, ["scripts/import-rag-document.mjs", "src/data/equipment/de-dietrich-7841749.json", "all"], { cwd: frontend, stdio: "inherit", env: process.env });
if (imported.error || imported.status !== 0) throw new Error("Import RAG interrompu. Relance exactement la même commande après correction.", { cause: imported.error });
const validated = spawnSync(process.execPath, ["scripts/validate-equipment-catalog.mjs"], { cwd: frontend, stdio: "inherit", env: process.env });
if (validated.error || validated.status !== 0) throw new Error("Validation du catalogue échouée.", { cause: validated.error });
console.log("MCR 2 24 : trois PDF ajoutés au catalogue et indexés pour Shiba Bot.");

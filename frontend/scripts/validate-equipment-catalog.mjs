import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dataUrl = new URL("../src/data/", import.meta.url);
const index = JSON.parse(readFileSync(new URL("equipment-index.json", dataUrl)));
const registry = readFileSync(
  new URL("../server/lib/equipment-registry.generated.js", import.meta.url),
  "utf8",
);
const ids = new Set();
const references = new Set();

if (!Array.isArray(index.equipments)) {
  throw new Error("Catalogue invalide : equipments doit être une liste.");
}

for (const item of index.equipments) {
  if (!/^equipment\/[a-z0-9-]+\.json$/.test(item.dataFile ?? "")) {
    throw new Error(`Chemin de fiche invalide : ${item.dataFile}`);
  }

  const fileUrl = new URL(item.dataFile, dataUrl);
  const data = JSON.parse(readFileSync(fileUrl, "utf8"));
  const label = fileURLToPath(fileUrl);

  if (!item.equipmentId || item.equipmentId !== data.equipmentId) {
    throw new Error(`Identifiant différent entre l'index et ${label}`);
  }

  if (
    !item.manufacturerReference ||
    item.manufacturerReference !== data.identity?.manufacturerReference
  ) {
    throw new Error(`Référence constructeur différente dans ${label}`);
  }

  for (const field of ["brand", "model", "variant"]) {
    if (item[field] !== data.identity?.[field]) {
      throw new Error(`${field} différent entre l'index et ${label}`);
    }
  }

  if (ids.has(item.equipmentId) || references.has(item.manufacturerReference)) {
    throw new Error(`Modèle ou référence en double : ${label}`);
  }

  ids.add(item.equipmentId);
  references.add(item.manufacturerReference);

  if (!registry.includes(`src/data/${item.dataFile}`)) {
    throw new Error(`Registre RAG absent pour ${label}`);
  }

  for (const document of data.documents ?? []) {
    const documentMarker = `documentId: ${JSON.stringify(document.documentId)},`;
    const documentStart = registry.indexOf(documentMarker);
    const documentEnd = registry.indexOf("ragEmbeddingData:", documentStart);
    const ragEntry = registry.slice(documentStart, documentEnd);
    if (
      !document.documentId ||
      documentStart < 0 || documentEnd < 0 ||
      !ragEntry.includes(`documentType: ${JSON.stringify(document.documentType)},`) ||
      !ragEntry.includes(`title: ${JSON.stringify(document.title)},`)
    ) {
      throw new Error(`Entrée RAG absente ou différente pour ${document.documentId} (${label})`);
    }
  }
}

console.log(`${ids.size} modèles et leurs documents RAG vérifiés.`);

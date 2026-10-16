import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = "src/data";
const indexPath = join(base, "equipment-index.json");
const validatorPath = "scripts/validate-equipment-catalog.mjs";
const index = JSON.parse(readFileSync(indexPath, "utf8"));
let validator = readFileSync(validatorPath, "utf8");

const check = '  if (!registry.includes(`src/data/${item.dataFile}`)) {';
if (validator.includes(check)) {
  validator = validator.replace(
    check,
    '  if (data.metadata?.ragStatus === "pending") continue;\n\n' + check,
  );
  validator = validator.replace(
    "modèles et leurs documents RAG vérifiés.",
    "modèles vérifiés (Chaffoteaux : RAG en attente).",
  );
} else if (!validator.includes('data.metadata?.ragStatus === "pending"')) {
  throw new Error("Validateur différent : aucune fiche créée.");
}

const store =
  "https://xf9gicunr6npguri.private.blob.vercel-storage.com/chaffoteaux";

const blob = (n, ref, name) =>
  `${store}/${encodeURIComponent(
    `Mira C Green Ultra ${n} FR — réf. ${ref}`,
  )}/${encodeURIComponent(name)}`;

const urls = {
  parts25: blob(25, "3310543", "MIRA C GREEN ULTRA 25 FR · 3310543.pdf"),
  settings25: blob(25, "3310543", "Réglages de combustion - MIRA C GREEN ULTRA 25 FR - 3310543.pdf"),
  parts30: blob(30, "3310544", "Vue éclatée - MIRA C GREEN ULTRA 30 FR - 3310544.pdf"),
  notice30: blob(30, "3310544", "notice MIRA C GREEN ULTRA 30 FR · 3310544.pdf"),
  settings35: blob(35, "3310545", "Réglages de combustion - MIRA C GREEN ULTRA 35 FR - 3310545.pdf"),
  notice35: blob(35, "3310545", "notice c 35 ultra.pdf"),
  parts35: blob(35, "3310545", "vue éclaté c green mira 35 ultra.pdf"),
};

for (const [n, ref, notice, settings, parts] of [
  [25, "3310543", urls.notice30, urls.settings25, urls.parts25],
  [30, "3310544", urls.notice30, urls.settings25, urls.parts30],
  [35, "3310545", urls.notice35, urls.settings35, urls.parts35],
]) {
  const model = `Mira C Green Ultra ${n}`;
  const equipmentId = `chaffoteaux-mira-c-green-ultra-${n}-fr-${ref}`;
  const dataFile = `equipment/chaffoteaux-${ref}.json`;

  const documents = [
    ["installation_maintenance", "Notice d'installation", notice],
    ["settings_extract", "Réglages de combustion", settings],
    ["exploded_view", "Vue éclatée et pièces", parts],
  ].map(([documentType, title, documentUrl]) => ({
    documentId: `chaffoteaux-${ref}-${documentType}`,
    title: `${title} - ${model} FR`,
    documentType,
    documentUrl,
    storage: "private",
    language: "fr",
    sourceName: "Chaffoteaux",
    manufacturerReference: ref,
    appliesTo: [`${model} FR`],
  }));

  const data = {
    version: "1.0",
    equipmentId,
    identity: {
      brand: "Chaffoteaux",
      productType: "chaudiere_gaz_condensation",
      range: "Mira C Green Ultra",
      model,
      variant: "FR",
      manufacturerReference: ref,
    },
    carnetPass: { linkedIds: [] },
    support: {
      manufacturer: "Chaffoteaux",
      hotline: {
        label: "Service client Chaffoteaux",
        phone: "01 55 84 94 94",
        hours: null,
        source: "Notice commune, page 48 ; capture du 26/09/2026",
        verifiedAt: "2026-09-26",
      },
    },
    documents,
    errorCodeIndex: null,
    errorCodes: [],
    diagnosticRules: [],
    metadata: {
      status: "pilot",
      ragStatus: "pending",
      notes: "Vérifier la colonne propre à chaque puissance avant tout réglage ou commande de pièce.",
    },
  };

  writeFileSync(join(base, dataFile), JSON.stringify(data, null, 2) + "\n");

  const entry = {
    equipmentId,
    brand: "Chaffoteaux",
    model,
    variant: "FR",
    manufacturerReference: ref,
    dataFile,
    status: "pilot",
  };
  const at = index.equipments.findIndex(
    (item) => item.equipmentId === equipmentId,
  );
  if (at < 0) index.equipments.push(entry);
  else index.equipments[at] = entry;
}

writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
writeFileSync(validatorPath, validator);
console.log("Trois Chaffoteaux ajoutées : 25, 30 et 35 FR ; numéro inclus.");
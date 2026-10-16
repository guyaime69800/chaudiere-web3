import { documentTypeFromTitle } from "../lib/document-types.js";
function normalizeReference(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}

function documentType(title) {
  return /vue\s*eclat|pi[eè]ces?\s+d[eé]tach|exploded|spare\s+parts/i.test(title.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    ? "exploded_view" : "technical_manual";
}

function matchesCatalogCategory(item, category) {
  return item.type === category ||
    (["heat_pump", "air_conditioning"].includes(item.type)
      && category === `${item.type}_${item.unitPosition}`);
}

export function catalogModelFamily(item) {
  if (item.modelFamily) return item.modelFamily;
  // Legacy static entries include capacity/version in the model label.
  if (item.equipmentId) return String(item.model || "").replace(/\s+\d+(?:[.,]\d+)?(?:\s*-\s*[a-z])?(?:\s.*)?$/i, "").trim();
  return "Modèles à préciser";
}

export function catalogModelFamilies(models) {
  const groups = new Map();
  for (const item of models) {
    const name = catalogModelFamily(item);
    const key = normalizeReference(name);
    if (!groups.has(key)) groups.set(key, { name, key, count: 0 });
    groups.get(key).count++;
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function catalogModelsWithPublishedDocuments(_catalog, documents) {
  // Only published administrative records belong in the live catalogue.
  // Static equipment metadata remains available for existing equipment records.
  const models = [];
  for (const document of Array.isArray(documents) ? documents : []) {
    if (!document?.id || !document.manufacturer || !document.model_reference || !document.catalog_category) continue;
    const existing = models.find((item) =>
      normalizeReference(item.brand) === normalizeReference(document.manufacturer)
      && normalizeReference(item.manufacturerReference || item.model) === normalizeReference(document.model_reference)
      && matchesCatalogCategory(item, document.catalog_category));
    const model = existing || {
      brand: document.manufacturer,
      model: document.model_name || document.model_reference,
      modelFamily: document.model_name || "",
      manufacturerReference: document.model_reference,
      type: document.catalog_category,
    };
    if (!existing) models.push(model);
    if (!model.modelFamily && document.model_name) {
      model.modelFamily = document.model_name;
      model.model = document.model_name;
    }
    model.publishedDocuments = [...(model.publishedDocuments || []), {
      sha256: document.sha256, sizeBytes: document.size_bytes,
      documentId: document.id,
      title: document.title,
      sourceName: document.manufacturer,
      storage: "platform-private",
      documentCode: document.model_reference,
      ragStatus: document.rag_status || "pending",
    }];
    model.searchAliases = [...new Set([...(model.searchAliases || []), ...(document.model_aliases || [])])];
    if (document.hotline_phone) model.hotlinePhone = document.hotline_phone;
  }
  return models;
}

export function publishedDocumentsForEquipment(entries, equipment) {
  const reference = normalizeReference(equipment?.product_reference);
  const brand = normalizeReference(equipment?.brand);
  if (!reference || !brand) return [];

  return (entries || []).filter((entry) => {
    if (normalizeReference(entry.manufacturer) !== brand) return false;
    const modelParts = String(entry.model_reference || "").split("·")
      .filter((part) => normalizeReference(part).length >= 5);
    return [entry.model_reference, ...modelParts, ...(entry.model_aliases || [])]
      .some((value) => normalizeReference(value) === reference);
  }).map((entry) => ({
    documentId: entry.id,
    title: entry.title,
    documentType: documentType(entry.title || ""),
    documentCode: entry.model_reference,
    sourceName: entry.manufacturer,
    storage: "platform-private",
    ragStatus: entry.rag_status || "pending",
  }));
}

export async function getPlatformDocumentsForEquipment(equipment, accessToken) {
  if (!accessToken) return [];
  const response = await fetch("/api/platform-catalog-documents", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(details?.error || "Les documents publiés sont momentanément indisponibles.");
  }
  const result = await response.json();
  const documents = publishedDocumentsForEquipment(result.documents, equipment);
  documents.managed = publishedDocumentsForEquipment((result.managedModels || []).map((entry) => ({ ...entry, title: "" })), equipment).length > 0;
  return documents;
}

export function sharedNoticeLabels(model, models) {
 const labels=[];
 for(const doc of model.publishedDocuments||[]){
  const kind=documentTypeFromTitle(doc.title||'');
  if(!['installation_manual','user_manual'].includes(kind)||!/^[a-f0-9]{64}$/.test(doc.sha256||'')||!Number.isInteger(doc.sizeBytes)||doc.sizeBytes<=0)continue;
  const others=models.filter(other=>other!==model&&normalizeReference(other.brand)===normalizeReference(model.brand)&&(other.publishedDocuments||[]).some(d=>d.sha256===doc.sha256&&d.sizeBytes===doc.sizeBytes&&documentTypeFromTitle(d.title||'')===kind));
  if(!others.length)continue;
  const names=[...new Set(others.map(other=>other.manufacturerReference||other.model))];
  const text=(kind==='user_manual'?"Notice d\u2019utilisation":"Notice d\u2019installation")+' commune avec : '+names.join(', ');
  if(!labels.includes(text))labels.push(text);
 }
 return labels;
}

export function sharedNoticeGroups(models) {
 const groups=new Map();
 for(const model of models)for(const document of model.publishedDocuments||[]){
  const kind=documentTypeFromTitle(document.title||'');
  if(!['installation_manual','user_manual'].includes(kind)||!/^[a-f0-9]{64}$/.test(document.sha256||'')||!Number.isInteger(document.sizeBytes)||document.sizeBytes<=0)continue;
  const key=[normalizeReference(model.brand),model.type,kind,document.sha256,document.sizeBytes].join(':');
  if(!groups.has(key))groups.set(key,{key,kind,document,models:[]});
  const group=groups.get(key);
  if(!group.models.includes(model))group.models.push(model);
 }
 return [...groups.values()].filter(group=>group.models.length>1).sort((a,b)=>a.kind.localeCompare(b.kind)||b.models.length-a.models.length);
}

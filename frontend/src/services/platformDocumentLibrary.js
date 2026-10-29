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
  const recent = completionModelLabels(item);
  if (recent) return recent.family;
  const alfea = atlanticExtensaLabels(item);
  if (alfea) return alfea.family;
  const initia = chappeeInitiaLabels(item);
  if (initia) return initia.family;
  if (normalizeReference(item.brand) === 'saunierduval') {
    const label = String(item.modelFamily || item.model || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const series = label.match(/^thema[\s-]*fast(?:\s+([hm])[\s-]*condens|\s+(condens))?(?=\s|$)/i);
    // Group only the series. Exact powers, revisions and PDF associations stay separate.
    if (series) return series[1] ? `ThemaFast ${series[1].toUpperCase()}-Condens` : series[2] ? 'ThemaFast Condens' : 'ThemaFast';
  }
  if (normalizeReference(item.brand) === 'vaillant') {
    const label = item.modelFamily || item.model || '';
    // The VU/VUW/VUI /5-5 series belongs to ecoTEC plus. R revisions
    // remain separate model entries; grouping never shares their PDFs.
    if (/^ecotec\s+plus(?:\s|$)/i.test(label)
      || /^(?:VU|VUW|VUI)\s+(?:FR\s+)?\d{3,4}\/5-5(?:\s|$)/i.test(label)) return 'ecoTEC plus';
  }
  if (item.modelFamily) return item.modelFamily;
  // Legacy static entries include capacity/version in the model label.
  if (item.equipmentId) return String(item.model || "").replace(/\s+\d+(?:[.,]\d+)?(?:\s*-\s*[a-z])?(?:\s.*)?$/i, "").trim();
  return "Modèles à préciser";
}

function completionModelLabels(item) {
  const brand = normalizeReference(item.brand);
  const label = String(item.modelFamily || item.model || '').trim();
  const ref = String(item.manufacturerReference || '');
  if (brand === 'dedietrich') {
    const neovo = [ref, label].map(value => value.match(/^neovo[\s-]+condens[\s-]+efu[\s-]+c[\s-]+(\d+)(?:[\s-]+(plus))?$/i)).find(Boolean);
    if (neovo) return { family: `NeOvo Condens EFU C${neovo[2] ? ' Plus' : ''}`,
      model: `NeOvo Condens EFU C ${neovo[1]}${neovo[2] ? ' PLUS' : ''}`,
      reference: `EFU C ${neovo[1]}${neovo[2] ? ' PLUS' : ''}`, power: Number(neovo[1]) };
  }
  if (brand === 'viessmann') {
    const series = [label, ref].map(value => value.match(/^vitodens[\s-]*200[\s-]*w[\s-]+(b2[a-z]{2})(?=[\s-]|$)/i)).find(Boolean);
    if (!series) return null;
    const readable = label && !label.includes('vitodens-200-w-')
      ? label.replace(/^vitodens\s+200-w/i, 'Vitodens 200-W').replace(/(\d)\s*kw\b/ig, '$1 kW')
      : ref.replace(/-\d{7}$/, '').replace(/^vitodens-200-w-/i, 'Vitodens 200-W · ').replaceAll('-', ' ');
    const power = readable.match(/(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?\s*kW/i);
    return { family: `Vitodens 200-W · ${series[1].toUpperCase()}`, model: readable,
      reference: ref.match(/(?:^|[-\s·])(\d{7})$/)?.[1] || ref,
      power: power ? Number((power[2] || power[1]).replace(',', '.')) : null };
  }
  if (brand === 'frisquet') {
    const match = label.match(/^gazliner\s+ventouse\s+(\d+)\s*kw(?:\s*@\s*(\d+)\s*->\s*(\d+))?$/i)
      || ref.match(/^gazliner-ventouse-(\d+)-kw(?:-(\d+)-(\d+))?$/i);
    if (match) return { family: 'Gazliner Ventouse', model: `Gazliner Ventouse · ${match[1]} kW${match[2] ? ` · série ${match[2]}–${match[3]}` : ''}`,
      reference: ref, power: Number(match[1]) };
  }
  return null;
}

function chappeeInitiaLabels(item) {
  if (normalizeReference(item.brand) !== 'chappee') return null;
  const match = String(item.manufacturerReference || '').toLowerCase().match(/^initia-(plus-)?(?:(compact-l|compact|duo|max)-)?(\d+)-(\d+)-hte-(\d+)$/);
  if (!match) return null;
  const series = match[1] ? 'INITIA PLUS' : 'INITIA +';
  const variant = match[2] ? ` ${match[2].replace('-', ' ').toUpperCase()}` : '';
  return { family: `${series}${variant} HTE`, model: `${series}${variant} ${match[3]}.${match[4]} HTE`, reference: match[5] };
}

function atlanticExtensaLabels(item) {
  if (normalizeReference(item.brand) !== 'atlantic') return null;
  const ref = String(item.manufacturerReference || '').toLowerCase();
  const label = String(item.modelFamily || item.model || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const nextSeries = ref.match(/^(?:mh-)?alfea-(extensa-a-i|excellia-a-i-mono)(?:-|$)/);
  if (nextSeries) {
    const r32 = /(?:^|-)r32(?:-|$)/.test(ref);
    const family = `Alféa ${nextSeries[1] === 'extensa-a-i' ? 'Extensa A.I.' : 'Excellia A.I. Mono'}${r32 ? ' R32' : ''}`;
    const indoor = ref.match(/-mh-(\d+)-(\d{6})$/) || ref.match(/^mh-alfea-extensa-a-i-(\d+)-r32-(\d{6})$/);
    const outdoor = ref.match(/(?:-a-i|-mono)-(\d+)-(?:r32-)?(wo[a-z0-9]+)-(\d{6})$/);
    return { family, model: indoor ? `${family} · MH ${indoor[1]}`
      : outdoor ? `${family} · ${outdoor[1]} · ${outdoor[2].toUpperCase()}` : item.model || family,
      reference: indoor?.[2] || outdoor?.[3] || item.manufacturerReference || '' };
  }
  const legacy = [label, ref].map(value => value.match(/^alfea[\s-]+duo[\s·-]+mh[\s-]*d(\d+)(?:[\s·-]+(\d{6}))?$/i)).find(Boolean);
  if (legacy) return { family: 'Alféa Duo', model: `Alféa Duo · MH-D${legacy[1]}`,
    reference: legacy[2] || ref.match(/(?:^|[\s·-])(\d{6})$/)?.[1] || item.manufacturerReference || '' };
  if (!/^(?:mh-)?alfea-extensa-duo-a-i(?:-|$)/.test(ref)
    && !/^(?:MH\s+)?ALFEA\s+EXTENSA\s+DUO\s+A[.\s]*I[.\s]*(?:\s|$)/i.test(label)) return null;
  const r32 = /(?:^|-)r32(?:-|$)/.test(ref) || /\bR32\b/i.test(label);
  const family = `Alféa Extensa Duo A.I.${r32 ? ' R32' : ''}`;
  const indoor = ref.match(/-mh-(\d+)-(\d{6})$/) || ref.match(/^mh-alfea-extensa-duo-a-i-(\d+)-r32-(\d{6})$/);
  const outdoor = ref.match(/-a-i-(\d+)-(?:r32-)?(woya[a-z0-9]+)-(\d{6})$/);
  return { family, model: indoor ? `${family} · MH ${indoor[1]}`
    : outdoor ? `${family} · ${outdoor[1]} · ${outdoor[2].toUpperCase()}` : item.model || family,
    reference: indoor?.[2] || outdoor?.[3] || item.manufacturerReference || '' };
}

export function catalogModelLabel(item) {
  return completionModelLabels(item)?.model || atlanticExtensaLabels(item)?.model || chappeeInitiaLabels(item)?.model || item.model || item.manufacturerReference;
}

export function catalogModelReferenceLabel(item) {
  return completionModelLabels(item)?.reference || atlanticExtensaLabels(item)?.reference || chappeeInitiaLabels(item)?.reference || item.manufacturerReference || '';
}

export function compareCatalogModels(a, b) {
  return catalogModelFamily(a).localeCompare(catalogModelFamily(b), 'fr', { numeric: true })
    || ((completionModelLabels(a)?.power ?? 0) - (completionModelLabels(b)?.power ?? 0))
    || catalogModelLabel(a).localeCompare(catalogModelLabel(b), 'fr', { numeric: true })
    || (a.manufacturerReference || '').localeCompare(b.manufacturerReference || '', 'fr', { numeric: true });
}

export function catalogModelFamilies(models) {
  const groups = new Map();
  for (const item of models) {
    const name = catalogModelFamily(item);
    const key = normalizeReference(name);
    if (!groups.has(key)) groups.set(key, { name, key, count: 0 });
    groups.get(key).count++;
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
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
      modelReferences: [document.model_reference, ...(document.model_aliases || [])],
      ragStatus: document.rag_status || "pending",
    }];
    model.searchAliases = [...new Set([...(model.searchAliases || []), ...(document.model_aliases || [])])];
    if (document.hotline_phone) model.hotlinePhone = document.hotline_phone;
  }
  // Attach shared notices to existing exact model cards only. Aliases are
  // document-specific: never infer coverage from the family or another PDF.
  for (const source of models) for (const doc of [...(source.publishedDocuments || [])]) {
    if (!['installation_manual', 'user_manual'].includes(documentTypeFromTitle(doc.title))) continue;
    const covered = new Set((doc.modelReferences || []).map(normalizeReference));
    for (const target of models) {
      if (normalizeReference(source.brand) !== normalizeReference(target.brand) || source.type !== target.type
        || !covered.has(normalizeReference(target.manufacturerReference))) continue;
      if (!target.publishedDocuments.some(existing => existing.documentId === doc.documentId)) target.publishedDocuments.push(doc);
    }
  }
  for (const model of models) {
    const labels = chappeeInitiaLabels(model);
    if (labels) { model.model = labels.model; model.modelFamily = labels.family; }
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

export function sharedNoticeBrandSummary(models) {
  const groups = new Map();
  for (const model of models) for (const doc of model.publishedDocuments || []) {
    const kind = documentTypeFromTitle(doc.title || '');
    if (!['installation_manual', 'user_manual'].includes(kind) || !/^[a-f0-9]{64}$/.test(doc.sha256 || '')
      || !Number.isInteger(doc.sizeBytes) || doc.sizeBytes <= 0) continue;
    const key = `${doc.sha256}:${doc.sizeBytes}`;
    if (!groups.has(key)) groups.set(key, { references: new Set(), brands: new Map() });
    const group = groups.get(key), brand = normalizeReference(model.brand);
    for (const reference of doc.modelReferences || [model.manufacturerReference]) {
      if (reference) group.references.add(`${brand}:${normalizeReference(reference)}`);
    }
    group.brands.set(brand, model.brand);
  }
  const summaries = new Map();
  for (const group of groups.values()) {
    if (group.references.size < 2) continue;
    for (const [key, brand] of group.brands) {
      if (!summaries.has(key)) summaries.set(key, { brand, count: 0 });
      summaries.get(key).count++;
    }
  }
  return [...summaries.values()];
}

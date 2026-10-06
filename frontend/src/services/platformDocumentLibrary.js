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

export function catalogModelsWithPublishedDocuments(catalog, documents) {
  const models = (Array.isArray(catalog) ? catalog : []).map((item) => ({ ...item }));
  for (const document of Array.isArray(documents) ? documents : []) {
    if (!document?.id || !document.manufacturer || !document.model_reference || !document.catalog_category) continue;
    const existing = models.find((item) =>
      normalizeReference(item.brand) === normalizeReference(document.manufacturer)
      && normalizeReference(item.manufacturerReference || item.model) === normalizeReference(document.model_reference)
      && matchesCatalogCategory(item, document.catalog_category));
    const model = existing || {
      brand: document.manufacturer,
      model: document.model_reference,
      manufacturerReference: document.model_reference,
      type: document.catalog_category,
    };
    if (!existing) models.push(model);
    model.publishedDocuments = [...(model.publishedDocuments || []), {
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
  return publishedDocumentsForEquipment(result.documents, equipment);
}

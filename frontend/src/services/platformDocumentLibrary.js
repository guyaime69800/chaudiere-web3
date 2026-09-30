function normalizeReference(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}

function documentType(title) {
  return /vue\s*eclat|pi[eè]ces?\s+d[eé]tach|exploded|spare\s+parts/i.test(title.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    ? "exploded_view" : "technical_manual";
}

export function publishedDocumentsForEquipment(entries, equipment) {
  const reference = normalizeReference(equipment?.product_reference);
  const brand = normalizeReference(equipment?.brand);
  if (!reference || !brand) return [];

  return (entries || []).filter((entry) => {
    if (normalizeReference(entry.manufacturer) !== brand) return false;
    return [entry.model_reference, ...(entry.model_aliases || [])]
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
  if (response.status === 404) return []; // This catalog is Preview-only.
  if (!response.ok) throw new Error("Les documents publiés sont momentanément indisponibles.");
  const result = await response.json();
  return publishedDocumentsForEquipment(result.documents, equipment);
}

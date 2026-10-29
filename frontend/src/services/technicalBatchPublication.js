import lot from '../data/chappee-import-20261017-18.json' with { type: 'json' };

export const batchCatalogCategories = new Set(['boiler', 'heat_pump_indoor', 'heat_pump_outdoor', 'air_conditioning_indoor', 'air_conditioning_outdoor', 'burner', 'water_heater', 'regulation', 'heat_pump_water_heater', 'vmc']);

function publicationCategory(document, entries) {
  const matching = entries.filter(entry => chappeePublicationSelection([document], [entry]).length);
  const categories = new Set(matching.map(entry => entry.catalogCategory || 'boiler'));
  if (categories.size !== 1 || !batchCatalogCategories.has([...categories][0])) throw Error('Catégorie du lot absente, invalide ou ambiguë.');
  return [...categories][0];
}

export function chappeePublicationSelection(documents, entries = lot.entries) {
  return documents.filter(document => {
    if (!['pending_review', 'approved'].includes(document.status) || document.rag_error === 'deleted_by_admin') return false;
    if (document.status === 'approved' && (!document.distribution_confirmed_at || document.rag_status === 'ready')) return false;
    const hash = document.blob_pathname?.match(/^r2:\/\/platform-documents\/sha256\/([a-f0-9]{64})\.pdf#[a-f0-9-]{36}$/)?.[1];
    const normalizedBrand = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const candidates = entries.filter(entry => entry.sha256 === hash && entry.title === document.title
      && normalizedBrand(entry.manufacturer) === normalizedBrand(document.manufacturer));
    const allowed = new Set(candidates.flatMap(entry => [entry.modelReference, ...entry.modelAliases]));
    const references = [document.model_reference, ...(document.model_aliases || [])];
    return candidates.length > 0 && references.every(ref => allowed.has(ref));
  });
}

export async function publishChappeeBatch(documents, getToken, onProgress, fetcher = fetch, entries = lot.entries) {
  const selected = chappeePublicationSelection(documents, entries), results = [];
  const categories = new Map(selected.filter(document => document.status === 'pending_review').map(document => [document.id, publicationCategory(document, entries)]));
  for (const document of selected) {
    onProgress({ current: results.length + 1, total: selected.length, reference: document.model_reference });
    const response = await fetcher('/api/platform-admin-documents', { method: 'PATCH',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: document.id, action: document.status === 'pending_review' ? 'approve' : 'index',
        ...(document.status === 'pending_review' ? { category: categories.get(document.id), distributionConfirmed: true } : {}) }),
      signal: AbortSignal.timeout(180_000) });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw Error(result?.error || 'Publication interrompue. Actualisez la liste pour vérifier les fiches déjà traitées.');
    results.push({ id: document.id, status: result?.indexStatus || 'unknown' });
  }
  return results;
}

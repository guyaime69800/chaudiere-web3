const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function sharedDocumentScope(documents, requestedReference, equipmentIdentity) {
  if (!documents?.length) return null;
  if (requestedReference !== undefined && (typeof requestedReference !== 'string' || !requestedReference.trim() || requestedReference.length > 160)) return null;
  const first = documents[0];
  if (documents.some(d => normalized(d.manufacturer) !== normalized(first.manufacturer)
    || d.catalog_category !== first.catalog_category)) return null;
  const references = d => [d.model_reference, ...(Array.isArray(d.model_aliases) ? d.model_aliases : [])].filter(Boolean);
  const candidates = requestedReference ? [requestedReference] : references(first);
  const reference = candidates.find(ref => documents.every(d => references(d).some(r => normalized(r) === normalized(ref))));
  if (!reference) return null;
  if (equipmentIdentity && (normalized(equipmentIdentity.brand) !== normalized(first.manufacturer)
    || normalized(equipmentIdentity.manufacturerReference) !== normalized(reference))) return null;
  const primary = documents.find(d => normalized(d.model_reference) === normalized(reference));
  return { manufacturer: first.manufacturer, reference, model: primary?.model_name || reference };
}

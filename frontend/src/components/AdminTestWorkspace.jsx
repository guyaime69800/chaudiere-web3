import { useCallback, useEffect, useRef, useState } from 'react';
import PlateScanner from './PlateScanner';
import { COMMERCIAL_TERMS_VERSION } from '../../shared/commercial-terms.js';

const path = '/api/platform-admin?scope=test';
const emptyFields = { brand: '', model: '', productReference: '', serialNumber: '', manufactureYear: '', equipmentType: 'boiler' };
const labels = { brand: 'Marque', model: 'Modèle', productReference: 'Référence fabricant', serialNumber: 'Numéro de série', manufactureYear: 'Année de fabrication' };
const billingLabels = { none: 'aucun abonnement de test', pending: 'paiement de test en attente', active: 'Pro TEST actif', canceled: 'abonnement de test résilié', unpaid: 'paiement de test non confirmé', expired: 'paiement de test expiré' };
async function testWorkspaceRequest(token, body, signal) {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Error(data?.message || 'Espace de test indisponible.');
  return data;
}
export default function AdminTestWorkspace({ token }) {
  const [workspace, setWorkspace] = useState(null);
  const [fields, setFields] = useState(emptyFields);
  const [scan, setScan] = useState(null);
  const [notes, setNotes] = useState('Entretien de démonstration — TEST');
  const [accepted, setAccepted] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(null);
  const load = useCallback(async signal => {
    const result = await testWorkspaceRequest(token, null, signal);
    if (!signal?.aborted) setWorkspace(result.workspace);
  }, [token]);
  useEffect(() => {
    const controller = new AbortController();
    testWorkspaceRequest(token, null, controller.signal)
      .then(result => { if (!controller.signal.aborted) setWorkspace(result.workspace); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [token]);
  async function run(callback) {
    setBusy(true); setError('');
    try { await callback(); await load(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  async function billing(action) {
    await run(async () => {
      const result = await testWorkspaceRequest(token, { action, requestId: crypto.randomUUID(), terms: { accepted, version: COMMERCIAL_TERMS_VERSION } });
      if (result.url) {
        const url = new URL(result.url);
        const expected = action === 'checkout' ? 'checkout.stripe.com' : 'billing.stripe.com';
        if (url.protocol !== 'https:' || url.hostname !== expected || url.port || url.username || url.password) throw Error('Lien Stripe invalide.');
        window.location.assign(url.href);
      }
      if (result.invoices) setInvoices(result.invoices);
    });
  }
  async function download(id) {
    await run(async () => {
      const response = await fetch(`${path}&document=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('application/pdf')) throw Error('PDF de test indisponible.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = `TEST-${id}.pdf`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  if (!workspace) return <p role="status">{error || 'Chargement de votre espace de test…'}</p>;
  const equipment = workspace.records.filter(item => item.kind === 'equipment');
  const documents = workspace.records.filter(item => item.kind === 'document');
  return <div aria-label="Espace de test privé Paris 2">
    <p><strong>TEST — données fictives uniquement.</strong> Les fiches de cet espace sont séparées des clients. Les PDF ne constituent pas des documents d’intervention réels.</p>
    {error && <p role="alert">{error}</p>}
    <h3>Scanner et enregistrer un équipement de test</h3>
    <PlateScanner disabled={busy} allowPhotoRetention={false}
      request={(_path, options) => testWorkspaceRequest(token, options.body)}
      onConfirm={result => { setFields(result.fields); setScan({ ticket: result.ticket, candidateId: result.candidateId }); requestId.current = null; }} />
    <p>La photo est transmise au service d’analyse puis supprimée du parcours ; elle n’est pas archivée. Vous pouvez aussi saisir la fiche manuellement.</p>
    <form onSubmit={event => { event.preventDefault(); run(async () => {
      requestId.current ||= crypto.randomUUID();
      await testWorkspaceRequest(token, { action: 'save-equipment', fields, ...scan, requestId: requestId.current });
      setFields(emptyFields); setScan(null); requestId.current = null;
    }); }}>
      {Object.entries(labels).map(([key, label]) => <label key={key}>{label}<input value={fields[key] || ''} maxLength={key === 'serialNumber' ? 128 : 100}
        required={['brand', 'model'].includes(key)} onChange={event => { setFields(current => ({ ...current, [key]: event.target.value })); requestId.current = null; }} /></label>)}
      <label>Type<select value={fields.equipmentType || ''} required onChange={event => setFields(current => ({ ...current, equipmentType: event.target.value }))}>
        <option value="">Choisir</option><option value="boiler">Chaudière</option><option value="heat_pump">PAC</option><option value="air_conditioning">Climatisation</option>
        <option value="water_heater">Chauffe-eau</option><option value="vmc">VMC</option><option value="rooftop">Rooftop</option><option value="other">Autre</option>
      </select></label>
      <button disabled={busy}>Enregistrer dans mon espace de test</button>
    </form>
    <h3>Équipements et documents de test</h3>
    <label>Compte rendu fictif<textarea maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} /></label>
    {!equipment.length && <p>Aucun équipement de test enregistré.</p>}
    <ul>{equipment.map(item => <li key={item.id}>{item.data.fields.brand.value} {item.data.fields.model.value}{' '}
      <button type="button" disabled={busy} onClick={() => run(() => testWorkspaceRequest(token, { action: 'create-document', equipmentId: item.id, requestId: crypto.randomUUID(), notes }))}>Créer une fiche PDF TEST</button>
    </li>)}</ul>
    <ul>{documents.map(item => <li key={item.id}>Fiche TEST du {new Date(item.createdAt).toLocaleDateString('fr-FR')}{' '}
      <button type="button" disabled={busy} onClick={() => download(item.id)}>Télécharger le PDF TEST</button></li>)}</ul>
    <h3>Abonnement Stripe de test</h3>
    <p>État : <strong>{billingLabels[workspace.billing.status] || 'à vérifier'}</strong>{workspace.billing.cancelAtPeriodEnd ? ' — résiliation programmée en fin de période' : ''}.</p>
    {workspace.billing.paidUntil && <p>Fin de période de test : {new Date(workspace.billing.paidUntil).toLocaleDateString('fr-FR')}.</p>}
    <p>Ce parcours vérifie le paiement, le portail et les factures Stripe test. Ses droits restent dans cet espace ; la livraison des webhooks de production n’est pas validée par ce test.</p>
    {!workspace.billing.configured ? <p>La clé Stripe de test doit être ajoutée dans Vercel avant de commencer.</p> : <>
      <label><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /> J’accepte les <a href="/conditions-commerciales" target="_blank" rel="noopener noreferrer">CGV</a> pour ce parcours de test.</label>
      <button type="button" disabled={busy || !accepted || workspace.billing.status === 'active'} onClick={() => billing('checkout')}>Souscrire à Pro en mode TEST — 28 €/mois fictifs</button>
      <button type="button" disabled={busy} onClick={() => billing('sync-billing')}>Vérifier le paiement et la résiliation de test</button>
      <button type="button" disabled={busy} onClick={() => billing('portal')}>Ouvrir le portail Stripe TEST</button>
      <button type="button" disabled={busy} onClick={() => billing('invoices')}>Consulter les factures TEST</button>
      <p>Dans Stripe, vérifiez la mention « Test » et utilisez uniquement une carte de test, par exemple 4242 4242 4242 4242, une date future et un CVC fictif.</p>
    </>}
    <ul>{invoices.map(item => <li key={item.id}>{item.number} · {(item.total / 100).toLocaleString('fr-FR', { style: 'currency', currency: item.currency })} · {item.status}{' '}
      {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer">Ouvrir la facture TEST</a>}</li>)}</ul>
  </div>;
}

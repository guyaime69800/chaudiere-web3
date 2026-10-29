import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { COMMERCIAL_TERMS_VERSION } from '../../shared/commercial-terms.js';
import { stripePaymentUrl } from '../services/billingService.js';

async function request(token, action, body, signal) {
  const response = await fetch(`/api/billing?action=${action}`, { method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw Error(result?.message || 'Modification de places indisponible.');
  return result;
}
const money = value => (value / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
export default function LiveAdditionalAccounts({ token, assigned, capacity }) {
  const [quantity, setQuantity] = useState((capacity?.quantity || 0) + 1);
  const [retained, setRetained] = useState(assigned.map(row => row.user_id));
  const [quote, setQuote] = useState(null);
  const [change, setChange] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const reduction = quantity < (capacity?.quantity || 0);
  useEffect(() => {
    const controller = new AbortController();
    request(token, 'additional-status', null, controller.signal)
      .then(result => { if (!controller.signal.aborted) setChange(result.change); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [token]);
  function edit(callback) { callback(); setQuote(null); setAccepted(false); setError(''); setMessage(''); }
  async function run(callback) {
    setBusy(true); setError(''); setMessage('');
    try { await callback(); } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function apply(current = quote, action = 'additional-update') {
    const result = await request(token, action, { requestId: current.id, terms: { accepted, version: COMMERCIAL_TERMS_VERSION } });
    setMessage(result.message); setChange(result.change || null);
    if (result.url) window.location.assign(stripePaymentUrl(result.url, 'invoice.stripe.com'));
    else { setQuote(null); setChange((await request(token, 'additional-status')).change); }
  }
  return <div className="live-additional-accounts">
    {change ? <>
      <p>{change.status === 'scheduled' ? 'Réduction programmée' : 'Modification en cours'} : {change.quantity} comptes supplémentaires, puis <strong>{money(2800 + 2000 * change.quantity)} par mois</strong>.</p>
      {change.status === 'scheduled' ? <>
        <p>À partir du {new Date(change.nextRenewal).toLocaleDateString('fr-FR')}. Les accès actuels sont conservés jusqu’à cette échéance.</p>
        <p>Collaborateurs conservés : {assigned.filter(row => change.retainedMembers.includes(row.user_id)).map(row => row.email).join(', ') || 'aucun'}.</p>
      </> : <p>Les nouvelles places seront disponibles après confirmation du paiement. Reprenez cette même opération en cas d’interruption.</p>}
      <label><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /> J’accepte les <Link to="/conditions-commerciales" target="_blank" rel="noopener noreferrer">CGV</Link>.</label>
      <button type="button" disabled={busy || !accepted} onClick={() => run(() => apply(change, change.status === 'scheduled' ? 'additional-cancel' : 'additional-update'))}>
        {change.status === 'scheduled' ? 'Annuler cette réduction' : 'Reprendre la modification'}</button>
    </> : <>
      <label>Nombre total de comptes supplémentaires souhaités<input type="number" min="0" max="100" step="1" value={quantity}
        onChange={event => edit(() => setQuantity(event.target.value === '' ? '' : Number(event.target.value)))} /></label>
      <p>Compte principal : 28 €/mois. Chaque compte supplémentaire : 20 €/mois.</p>
      {reduction && <fieldset><legend>Collaborateurs à conserver à la prochaine échéance</legend>
        <p>Les collaborateurs non sélectionnés perdront leur accès à l’entreprise à cette échéance. Leurs dossiers seront conservés. Les invitations en attente expireront.</p>
        {assigned.map(row => <label key={row.user_id}><input type="checkbox" checked={retained.includes(row.user_id)}
          onChange={event => edit(() => setRetained(current => event.target.checked ? [...current, row.user_id] : current.filter(value => value !== row.user_id)))} />{row.email}</label>)}
        {retained.length > quantity && <p role="alert">Sélectionnez au maximum {quantity} collaborateurs.</p>}
      </fieldset>}
      <button type="button" disabled={busy || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 100 || quantity === (capacity?.quantity || 0) || (reduction && retained.length > quantity)}
        onClick={() => run(async () => {
          const result = await request(token, 'additional-quote', { requestId: crypto.randomUUID(), quantity,
            retainedMembers: reduction ? retained : [] });
          setQuote(result.quote); setAccepted(false);
        })}>Calculer le récapitulatif sans payer</button>
      {quote && <div role="status"><p>À régler maintenant : <strong>{money(quote.immediateAmountCents)}</strong>.</p>
        <p>Nouveau total : <strong>{money(2800 + 2000 * quote.quantity)} par mois</strong>. Prochaine échéance : {new Date(quote.nextRenewal).toLocaleDateString('fr-FR')}.</p>
        <p>{reduction ? 'La réduction prendra effet à cette échéance, sans remboursement de la période en cours.' : 'Le montant immédiat couvre le prorata jusqu’à cette échéance. Les places sont accordées après confirmation du paiement.'}</p>
        <label><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /> J’accepte les <Link to="/conditions-commerciales" target="_blank" rel="noopener noreferrer">CGV</Link>, le montant et les changements d’accès indiqués.</label>
        <button type="button" disabled={busy || !accepted} onClick={() => run(() => apply())}>{reduction ? 'Programmer la réduction à l’échéance' : `Confirmer l’ajout — ${money(quote.immediateAmountCents)} maintenant`}</button>
      </div>}
    </>}
    {busy && <p role="status">Vérification en cours…</p>}{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </div>;
}

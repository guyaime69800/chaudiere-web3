import { useEffect, useRef, useState } from 'react';
import { chappeePublicationSelection, publishChappeeBatch } from '../services/technicalBatchPublication.js';

export default function TechnicalBatchPublication({ token, documents, onComplete }) {
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const currentToken = useRef(token);
  useEffect(() => { currentToken.current = token; }, [token]);
  const selected = chappeePublicationSelection(documents);
  async function publish() {
    if (!confirmed || busy) return;
    setBusy(true);
    try {
      const results = await publishChappeeBatch(documents, () => currentToken.current, progress => setMessage(`Publication et Shiba : ${progress.current}/${progress.total} — ${progress.reference}`));
      const ready = results.filter(result => result.status === 'ready').length;
      setMessage(`${results.length} fiches traitées ; Shiba prêt pour ${ready}. ${results.length - ready} indexations à vérifier dans les fiches (OCR ou erreur possible).`);
    } catch (error) { setMessage(`Arrêt sans relance automatique : ${error.message}`); }
    finally { setBusy(false); setConfirmed(false); await onComplete?.(); }
  }
  return <section><h2>Publier le lot Chappée des 17 et 18 octobre</h2>
    <p>{selected.length} fiches du lot à publier ou à indexer pour Shiba. Les autres documents en attente sont exclus.</p>
    <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /> J’ai vérifié les références du lot et le droit de diffuser ces PDF à tous les comptes CarnetPass.</label>
    <button type="button" disabled={!confirmed || busy || !selected.length} onClick={publish}>{busy ? 'Publication en cours…' : 'Publier le lot et lancer Shiba'}</button>
    {message && <p role="status">{message}</p>}
  </section>;
}

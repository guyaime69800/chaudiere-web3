import { useEffect, useRef, useState } from 'react';
import { unzipSync, strFromU8 } from 'fflate';
import { uploadDirectR2 } from '../services/r2DirectUpload.js';
import { batchCatalogCategories, publishChappeeBatch } from '../services/technicalBatchPublication.js';

export default function TechnicalBatchImport({ token, onComplete }) {
  const [batch, setBatch] = useState(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [publishAfterImport, setPublishAfterImport] = useState(false);
  const currentToken = useRef(token);
  useEffect(() => { currentToken.current = token; }, [token]);
  async function prepare(file) {
    setBatch(null); setMessage(''); setPublishAfterImport(false);
    try {
      if (!file || file.size > 100 * 1024 * 1024) throw Error('Archive ZIP limitée à 100 Mo.');
      let total = 0;
      const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => {
        if (entry.name !== 'manifest.json' && !/^pdf\/[a-f0-9]{64}\.pdf$/.test(entry.name)) return false;
        total += entry.originalSize;
        if (entry.originalSize > (entry.name === 'manifest.json' ? 1024 * 1024 : 30 * 1024 * 1024) || total > 100 * 1024 * 1024) throw Error('Archive trop volumineuse.');
        return true;
      }});
      const manifest = JSON.parse(strFromU8(files['manifest.json'] || new Uint8Array()));
      if (manifest.version !== 1 || manifest.publication !== 'pending-only' || !Array.isArray(manifest.entries) || !manifest.entries.length || manifest.entries.length > 200) throw Error('Manifeste invalide.');
      for (const entry of manifest.entries) {
        if (entry.catalogCategory !== undefined && !batchCatalogCategories.has(entry.catalogCategory)) throw Error('Catégorie du document invalide.');
        const bytes = files[entry.file];
        if (!/^[a-f0-9]{64}$/.test(entry.sha256) || entry.file !== `pdf/${entry.sha256}.pdf` || !bytes || bytes.length !== entry.size || strFromU8(bytes.slice(0, 5)) !== '%PDF-') throw Error('PDF absent ou invalide.');
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        if (Array.from(digest, b => b.toString(16).padStart(2, '0')).join('') !== entry.sha256) throw Error('Empreinte PDF incorrecte.');
        for (const key of ['manufacturer', 'modelName', 'modelReference', 'title']) if (typeof entry[key] !== 'string' || entry[key].length < 2 || entry[key].length > 160) throw Error('Fiche invalide.');
        if (!Array.isArray(entry.modelAliases) || entry.modelAliases.length > 10 || entry.modelAliases.some(v => typeof v !== 'string' || v.length < 2 || v.length > 160)) throw Error('Références invalides.');
      }
      setBatch({ entries: manifest.entries, files });
      setMessage(`${new Set(manifest.entries.map(e => e.sha256)).size} PDF vérifiés, ${manifest.entries.length} fiches à traiter. Publication et indexation Shiba après validation.`);
    } catch (error) { setMessage(error.message); }
  }
  async function start() {
    setBusy(true); let imported = 0, skipped = 0;
    try {
      const response = await fetch('/api/platform-admin-documents', { headers: { Authorization: `Bearer ${currentToken.current}` }, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.documents)) throw Error('Vérification des doublons indisponible.');
      const known = new Set(result.documents.flatMap(d => [d.model_reference, ...(d.model_aliases || [])].map(ref => `${d.blob_pathname?.match(/sha256\/([a-f0-9]{64})\.pdf/)?.[1]}:${ref}`)));
      for (const entry of batch.entries) {
        const remaining = [entry.modelReference, ...entry.modelAliases].filter(ref => !known.has(`${entry.sha256}:${ref}`));
        if (!remaining.length) { skipped++; continue; }
        setMessage(`Import ${imported + skipped + 1}/${batch.entries.length} : ${entry.modelReference}`);
        const file = new File([batch.files[entry.file]], `${entry.title}-${entry.sha256.slice(0, 12)}.pdf`, { type: 'application/pdf' });
        await uploadDirectR2(file, { ...entry, modelReference: remaining[0], modelAliases: remaining.slice(1) }, currentToken.current);
        for (const ref of remaining) known.add(`${entry.sha256}:${ref}`);
        imported++;
      }
      if (publishAfterImport) {
        const latest = await fetch('/api/platform-admin-documents', { headers: { Authorization: `Bearer ${currentToken.current}` }, cache: 'no-store' });
        const data = await latest.json();
        if (!latest.ok || !Array.isArray(data.documents)) throw Error('Import terminé, mais vérification avant publication indisponible.');
        const results = await publishChappeeBatch(data.documents, () => currentToken.current,
          progress => setMessage(`Publication et indexation Shiba : ${progress.current}/${progress.total} — ${progress.reference}`), fetch, batch.entries);
        const ready = results.filter(result => result.status === 'ready').length;
        setMessage(`Terminé : ${imported} imports, ${skipped} fiches déjà présentes. ${results.length} fiches traitées pour la publication et Shiba ; ${ready} nouvelles indexations prêtes, ${results.length - ready} à vérifier. Les fiches déjà publiées et prêtes sont conservées.`);
      } else {
        setMessage(`Terminé : ${imported} fiches importées, ${skipped} déjà présentes. Documents en attente de validation ; Shiba sera indexé après publication.`);
      }
      await onComplete?.();
    } catch (error) { setMessage(`Arrêt après ${imported} imports et ${skipped} doublons évités : ${error.message} Aucun redémarrage automatique.`); }
    finally { setBusy(false); }
  }
  return <section><h2>Importer un lot de documents</h2><p>Choisissez l’archive préparée. Les PDF vont directement dans R2. Vous pouvez publier le lot et lancer Shiba à la suite de l’import.</p>
    <label>Archive d’import ZIP <input type="file" accept=".zip" disabled={busy} onChange={event => prepare(event.target.files?.[0])} /></label>
    <label><input type="checkbox" checked={publishAfterImport} disabled={!batch || busy} onChange={event => setPublishAfterImport(event.target.checked)} /> J’ai vérifié les références et les droits de diffusion de ce lot : publier les documents et les indexer pour Shiba après l’import.</label>
    <button type="button" disabled={!batch || busy} onClick={start}>{busy ? 'Traitement en cours…' : publishAfterImport ? 'Importer, publier et lancer Shiba' : 'Importer le lot dans R2'}</button>
    {message && <p role="status">{message}</p>}
  </section>;
}

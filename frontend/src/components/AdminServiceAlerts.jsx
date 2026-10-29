import { useEffect, useState } from 'react';

const openAILabels = {
  billing: 'Alerte : crédits OpenAI épuisés ou plafond de facturation atteint. Rechargez le compte OpenAI.',
  authentication: 'Alerte : OpenAI refuse la clé ou ses permissions. Vérifiez la configuration serveur.',
  rate_limit: 'Alerte : limite de requêtes OpenAI atteinte. Ce message ne prouve pas un manque de crédits.',
  unavailable: 'Alerte : OpenAI a signalé une indisponibilité.',
  missing: 'Alerte : la clé OpenAI de Shiba est absente.',
  success: 'Le dernier appel Shiba suivi a réussi. Cela ne garantit pas le solde restant.',
  unknown: 'Clé configurée ; aucun appel récent suivi. Le crédit restant n’est pas connu.',
  monitor_unavailable: 'Le suivi OpenAI est indisponible ; état de Shiba non confirmé.',
};
export default function AdminServiceAlerts({ token }) {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setBusy(true);
      try {
        const response = await fetch('/api/platform-admin?scope=service-health', {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw Error('Le contrôle des services est indisponible.');
        const result = await response.json();
        if (!controller.signal.aborted) { setHealth(result.health); setError(''); }
      } catch (cause) { if (!controller.signal.aborted) setError(cause.message); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    };
    load(); const timer = setInterval(load, 300000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [token, revision]);
  const polygon = health?.polygon;
  const openai = health?.openai;
  const billing = health?.billing;
  return <section aria-label="Alertes Polygon et Shiba">
    <h2>Alertes Polygon et Shiba</h2>
    <button type="button" disabled={busy} onClick={() => setRevision(value => value + 1)}>{busy ? 'Vérification…' : 'Actualiser les alertes'}</button>
    {error && <p role="alert" className="platform-admin-error">{error} Les informations précédentes peuvent être périmées.</p>}
    {polygon && <div>
      <h3>Blockchain Polygon · réserve POL</h3>
      <p className={polygon.state === 'healthy' ? '' : 'platform-admin-error'}>
        {polygon.state === 'unavailable' ? 'Contrôle Polygon indisponible : solde non confirmé.' : <>
          Solde : {polygon.balancePol} POL. {polygon.state === 'critical' ? 'Alerte critique : réserve insuffisante ou service blockchain bloqué.' : polygon.state === 'warning' ? 'Réserve faible : prévoyez un apport de POL.' : 'Réserve normale.'}
        </>}
      </p>
      <p>Avertissement à 0,30 POL · critique à 0,10 POL. Le coût des transactions peut varier.</p>
    </div>}
    {openai && <div>
      <h3>OpenAI · Shiba</h3>
      <p className={['success', 'unknown'].includes(openai.state) ? '' : 'platform-admin-error'}>{openAILabels[openai.state]}</p>
      {openai.at && <p>Dernier résultat suivi : {new Date(openai.at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.</p>}
      <p>Le solde prépayé OpenAI n’est pas disponible ici. Les crédits Shiba des clients sont distincts.</p>
      <a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noreferrer">Consulter la facturation et les recharges OpenAI</a>
    </div>}
    {billing && <div>
      <h3>Abonnements et confirmations par mail</h3>
      {billing.state === 'unavailable' ? <p role="alert" className="platform-admin-error">Le suivi des impayés et des mails est indisponible. Aucun état normal ne peut être confirmé.</p> : <>
        <p className={billing.state === 'healthy' ? '' : 'platform-admin-error'}>{billing.state === 'healthy' ? 'Aucun impayé ni retard détecté par ces contrôles.' : 'Des éléments de facturation ou de messagerie demandent une vérification.'}</p>
        <ul>
          <li>Abonnements en retard de paiement : <strong>{billing.overdueSubscriptions}</strong></li>
          <li>Notifications Stripe en attente depuis plus de 15 minutes : <strong>{billing.pendingEvents}</strong></li>
          <li>Événements Stripe à examiner : <strong>{billing.reviewEvents}</strong></li>
          <li>Confirmations de résiliation en attente depuis plus de 15 minutes : <strong>{billing.delayedEmails}</strong></li>
          <li>Confirmations de résiliation nécessitant une intervention : <strong>{billing.reviewEmails}</strong></li>
        </ul>
        <p>Un événement à examiner ne prouve pas un impayé. Les contrôles de mail portent sur l’envoi par CarnetPass, pas sur la réception en boîte.</p>
        <a href="https://dashboard.stripe.com/subscriptions" target="_blank" rel="noreferrer">Examiner les abonnements dans Stripe</a>
      </>}
    </div>}
    {health && <p>Contrôle : {new Date(health.checkedAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}. Actualisation toutes les cinq minutes pendant l’ouverture de cette page. Aucun achat automatique.</p>}
  </section>;
}

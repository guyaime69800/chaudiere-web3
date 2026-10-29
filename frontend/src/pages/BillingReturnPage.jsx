import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// Public shell only. No billing data is loaded until the server verifies the
// founder and MFA and renews the host-only HttpOnly internal credential.
export default function BillingReturnPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const token = session?.access_token;
  const [error, setError] = useState('');
  useEffect(() => {
    if (loading || !token) return;
    const controller = new AbortController();
    fetch('/api/access-session', { method: 'POST', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (result.mfaRequired) {
          navigate('/securite-compte', { replace: true, state: { from: { pathname: '/retour-facturation', search: '?test=1' } } });
          return;
        }
        if (!response.ok || result.role !== 'founder') throw Error('Reconnectez-vous au compte administrateur pour retrouver votre test.');
        window.location.replace('/administration-interne?test=1');
      }).catch(cause => { if (!controller.signal.aborted) setError(cause.message || 'Rétablissement de la connexion indisponible.'); });
    return () => controller.abort();
  }, [loading, token, navigate]);
  return <main style={{ maxWidth: 650, margin: '12vh auto', padding: 28 }}>
    <h1>Retour à votre espace de test</h1>
    <p role="status">{error || (loading || token ? 'Vérification de votre accès administrateur…' : 'Reconnectez-vous pour retrouver votre test.')}</p>
    <p>Le retour au site ne relance aucun paiement.</p>
    <Link to="/connexion-interne?retour=test">Se reconnecter à l’administration</Link>
  </main>;
}

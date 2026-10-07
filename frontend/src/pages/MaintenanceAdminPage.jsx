import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const defaultMessage = "Nous effectuons une mise à jour de CarnetPass. Le service sera de retour prochainement.";

export default function MaintenanceAdminPage() {
  const { session } = useAuth();
  const [state, setState] = useState(null);
  const [message, setMessage] = useState(defaultMessage);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accessUntil, setAccessUntil] = useState(null);
  useEffect(() => {
    if (!session?.access_token) return;
    fetch("/api/maintenance-control", { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 403 ? "Accès réservé au fondateur CarnetPass." : "Contrôle indisponible.");
        return response.json();
      })
      .then((result) => { setState(result.state); setMessage(result.state.message || defaultMessage); setAccessUntil(result.accessUntil); })
      .catch((cause) => setError(cause.message));
  }, [session?.access_token]);

  async function change(enabled) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/maintenance-control", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, message }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Changement refusé.");
      setState(result.state);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function changeAccess(grant) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/maintenance-control", {
        method: grant ? "POST" : "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        ...(grant ? { body: JSON.stringify({ action: "grant-durable-access" }) } : {}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Accès de vérification indisponible.");
      setAccessUntil(result.accessUntil || null);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  return <main style={{ maxWidth: 760, margin: "64px auto", padding: 24, fontFamily: "system-ui" }}>
    <Link to="/administration-interne">← Administration CarnetPass</Link>
    <h1>Maintenance du site et de la dApp</h1>
    <p><Link to="/espace-pro?action=scan-plaque" style={{ display: "inline-block", padding: "16px 22px", borderRadius: 12, background: "#bf3509", color: "#fff", fontWeight: 700, textDecoration: "none" }}>📷 Ouvrir mon espace de test — scan de plaque</Link></p>
    <p>Le mode maintenance affiche un message aux visiteurs et bloque les API publiques. L’accès à cette page et la tâche des rappels restent disponibles.</p>
    {error && <p role="alert" style={{ color: "#ad2500" }}>{error}</p>}
    {state && <>
      <p role="status"><strong>État : {state.enabled ? "Maintenance active" : "Site ouvert"}</strong></p>
      <label htmlFor="maintenance-message">Message affiché aux visiteurs</label>
      <textarea id="maintenance-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={300}
        rows={4} style={{ display: "block", width: "100%", margin: "12px 0 20px", padding: 12 }} />
      <button type="button" disabled={busy || state.enabled} onClick={() => change(true)}>Activer la maintenance</button>{" "}
      <button type="button" disabled={busy || !state.enabled} onClick={() => change(false)}>Rouvrir le site</button>
      {<section style={{ marginTop: 28, padding: 20, border: "1px solid #ead9ce", borderRadius: 12 }}>
        <h2>Vérifier avant de rouvrir</h2>
        <p>L’accès fondateur est réservé à ce navigateur pendant 30 jours et renouvelé lors des connexions. Il est retiré à la déconnexion et reste contrôlé côté serveur. Les visiteurs continuent de voir la maintenance. Vérifiez leur affichage dans une fenêtre privée.</p>
        <button type="button" disabled={busy} onClick={() => changeAccess(true)}>Activer mon accès de vérification</button>{" "}
        <button type="button" disabled={busy || !accessUntil} onClick={() => changeAccess(false)}>Retirer mon accès</button>
        {accessUntil && <p role="status">Accès actif jusqu’à {new Date(accessUntil).toLocaleString("fr-FR")}. <Link to="/">Ouvrir CarnetPass</Link></p>}
      </section>}
      {state.updatedAt && <p>Dernier changement : {new Date(state.updatedAt).toLocaleString("fr-FR")}</p>}
    </>}
  </main>;
}

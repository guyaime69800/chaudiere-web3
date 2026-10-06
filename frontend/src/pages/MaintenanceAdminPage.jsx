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
  useEffect(() => {
    if (!session?.access_token) return;
    fetch("/api/maintenance-control", { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 403 ? "Accès réservé au fondateur CarnetPass." : "Contrôle indisponible.");
        return response.json();
      })
      .then((result) => { setState(result.state); setMessage(result.state.message || defaultMessage); })
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

  return <main style={{ maxWidth: 760, margin: "64px auto", padding: 24, fontFamily: "system-ui" }}>
    <Link to="/administration-interne">← Administration CarnetPass</Link>
    <h1>Maintenance du site et de la dApp</h1>
    <p>Le mode maintenance affiche un message aux visiteurs et bloque les API publiques. L’accès à cette page et la tâche des rappels restent disponibles.</p>
    {error && <p role="alert" style={{ color: "#ad2500" }}>{error}</p>}
    {state && <>
      <p role="status"><strong>État : {state.enabled ? "Maintenance active" : "Site ouvert"}</strong></p>
      <label htmlFor="maintenance-message">Message affiché aux visiteurs</label>
      <textarea id="maintenance-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={300}
        rows={4} style={{ display: "block", width: "100%", margin: "12px 0 20px", padding: 12 }} />
      <button type="button" disabled={busy || state.enabled} onClick={() => change(true)}>Activer la maintenance</button>{" "}
      <button type="button" disabled={busy || !state.enabled} onClick={() => change(false)}>Rouvrir le site</button>
      {state.updatedAt && <p>Dernier changement : {new Date(state.updatedAt).toLocaleString("fr-FR")}</p>}
    </>}
  </main>;
}

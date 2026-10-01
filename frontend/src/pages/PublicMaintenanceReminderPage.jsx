import { useEffect, useRef, useState } from "react";
import "./PublicMaintenanceReminderPage.css";

const parisToday = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const api = async (body) => {
  const response = await fetch("/api/public-maintenance-reminders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Service indisponible.");
  return result;
};

export default function PublicMaintenanceReminderPage({ mode }) {
  const tokens = new URLSearchParams(window.location.hash.slice(1));
  const [reminder, setReminder] = useState(null);
  const [dueOn, setDueOn] = useState("");
  const [leadDays, setLeadDays] = useState("30");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const requested = useRef(false);
  const managementToken = mode === "activate" ? tokens.get("manage") : tokens.get("token");
  const verificationToken = tokens.get("verify");

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    if (!managementToken) {
      queueMicrotask(() => { setError("Lien manquant. Demandez un nouveau lien depuis la fiche QR."); setLoading(false); });
      return;
    }
    const body = mode === "activate"
      ? { operation: "activate", verify: verificationToken, manage: managementToken }
      : { operation: "read", manage: managementToken };
    api(body).then((result) => {
      if (mode === "activate") {
        window.location.replace(`/rappel/gerer#token=${encodeURIComponent(managementToken)}`);
        return;
      }
      setReminder(result.reminder);
      setDueOn(result.reminder.dueOn);
      setLeadDays(String(result.reminder.leadDays));
    }).catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [mode, managementToken, verificationToken]);

  async function save(event) {
    event.preventDefault();
    if (!reminder || busy) return;
    if (dueOn <= parisToday() || !Number.isInteger(Number(leadDays)) || Number(leadDays) < 0 || Number(leadDays) > 365) {
      setError("Choisissez une date future et une anticipation valide.");
      return;
    }
    if (!window.confirm(`Modifier le rappel de l’appareil ${reminder.carnetPassId} au ${dueOn}, ${leadDays} jour(s) avant ?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api({ operation: "update", manage: managementToken,
        version: reminder.version, dueOn, leadDays: Number(leadDays) });
      setReminder(result.reminder);
      setMessage("Rappel modifié et confirmé par la base.");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!reminder || busy || !window.confirm(`Annuler votre rappel pour l’appareil ${reminder.carnetPassId} ?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api({ operation: "cancel", manage: managementToken, version: reminder.version });
      setReminder(result.reminder);
      setMessage("Rappel annulé et confirmé par la base. Un e-mail déjà accepté avant cette annulation ne peut pas être rappelé.");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return <main className="public-reminder-page">
    <a href="/">← Retour à CarnetPass</a>
    <h1>{mode === "activate" ? "Activation du rappel" : "Gérer mon rappel"}</h1>
    <p>Ce lien prouve seulement l’accès à votre adresse e-mail. Il ne vous donne pas accès aux données privées de l’appareil.</p>
    {loading && <p role="status">Vérification du lien…</p>}
    {error && <p role="alert" className="public-reminder-page__error">{error}</p>}
    {message && <p role="status" className="public-reminder-page__success">{message}</p>}
    {reminder && <>
      <p>Appareil : <strong>{reminder.carnetPassId}</strong></p>
      <p>État : <strong>{reminder.status === "active" ? "actif" : reminder.status === "review_required" ? "à réévaluer après un entretien validé" : "annulé"}</strong>. Envoi : {reminder.notificationState === "accepted" ? "accepté par le service d’e-mail" : "non confirmé"}.</p>
      {["active", "review_required"].includes(reminder.status) && <form onSubmit={save}>
        <label>Prochaine échéance choisie par vous <input type="date" required min={parisToday()} value={dueOn} onChange={(event) => setDueOn(event.target.value)} /></label>
        <label>Prévenir combien de jours avant ? <input type="number" min="0" max="365" required value={leadDays} onChange={(event) => setLeadDays(event.target.value)} /></label>
        <button type="submit" disabled={busy}>Enregistrer la modification</button>
        <button type="button" disabled={busy} onClick={cancel}>Annuler mon rappel</button>
      </form>}
    </>}
  </main>;
}

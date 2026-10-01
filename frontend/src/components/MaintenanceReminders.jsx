import { useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { parseReminderDate } from "../lib/reminder-date.js";
import shibaTechnicien from "../assets/carnetpass-shiba-technicien.png";
import "./MaintenanceReminders.css";

const emptyForm = () => ({ dueOn: "", lastMaintenanceOn: "", leadDays: "30" });
const parisToday = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const readableDate = (value) => value ? new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long", timeZone: "Europe/Paris",
}).format(new Date(`${value}T12:00:00Z`)) : "non renseignée";
const sourceLabel = (value) => value === "professional_validated"
  ? "Date validée par le professionnel" : "Date choisie par l’utilisateur";
const previewEmailTestEnabled = import.meta.env.VITE_REMINDER_PREVIEW_TEST_ENABLED === "true";

export default function MaintenanceReminders({ equipment, session, interventions = [], promptAfterCreation = false }) {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [shibaRequest, setShibaRequest] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const manualDialogRef = useRef(null);

  useEffect(() => {
    const dialog = manualDialogRef.current;
    if (!dialog) return;
    if (manualOpen && !dialog.open) dialog.showModal();
    if (!manualOpen && dialog.open) dialog.close();
  }, [manualOpen]);

  async function reload() {
    const { data, error: loadError } = await supabase.from("maintenance_reminders")
      .select("id,equipment_id,recipient_email,due_on,due_source,last_maintenance_on,lead_days,status,notification_state,accepted_at,version,created_at")
      .eq("equipment_id", equipment.id).order("created_at", { ascending: false });
    if (loadError) throw loadError;
    setReminders(data || []);
  }

  useEffect(() => {
    let active = true;
    supabase.from("maintenance_reminders")
      .select("id,equipment_id,recipient_email,due_on,due_source,last_maintenance_on,lead_days,status,notification_state,accepted_at,version,created_at")
      .eq("equipment_id", equipment.id).order("created_at", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError("Les rappels sont indisponibles. La migration de la base de test est peut-être encore à appliquer.");
        else setReminders(data || []);
        setLoading(false);
      });
    return () => { active = false; };
  }, [equipment.id]);

  const active = reminders.filter((reminder) => ["active", "review_required"].includes(reminder.status));
  const validatedMaintenance = interventions.filter((intervention) =>
    intervention.interventionType === "maintenance" && intervention.maintenanceVerifiedAt)
    .sort((a, b) => String(b.interventionAt).localeCompare(String(a.interventionAt)))[0];
  const declaredMaintenance = reminders.find((reminder) => reminder.last_maintenance_on)?.last_maintenance_on;
  const recipientEmail = session?.user?.email || "";
  const emailConfirmed = Boolean(session?.user?.email_confirmed_at);

  function prepare(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    const leadDays = Number(form.leadDays);
    if (!form.dueOn || form.dueOn <= parisToday() || !Number.isInteger(leadDays)
      || leadDays < 0 || leadDays > 365
      || (form.lastMaintenanceOn && (form.lastMaintenanceOn > form.dueOn || form.lastMaintenanceOn > parisToday()))) {
      setError("Choisissez une échéance future et une anticipation entre 0 et 365 jours. Le dernier entretien ne peut pas être après l’échéance.");
      return;
    }
    if (!emailConfirmed || !recipientEmail) {
      setError("Confirmez d’abord l’adresse e-mail de votre compte.");
      return;
    }
    setProposal({
      ...form, leadDays, source: "user_selected", actionSource: "manual", recipientEmail,
      confirmationKey: editing ? null : crypto.randomUUID(),
      editing: editing ? { id: editing.id, version: editing.version } : null,
    });
    setManualOpen(false);
  }

  function prepareShiba(event) {
    event.preventDefault();
    setError(""); setMessage("");
    if (!emailConfirmed || !recipientEmail) {
      setError("Confirmez d’abord l’adresse e-mail de votre compte.");
      return;
    }
    const normalized = shibaRequest.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const isCancel = /annul|supprim/.test(normalized);
    const isUpdate = /modifi|deplac|change/.test(normalized);
    if ((isCancel || isUpdate) && active.length !== 1) {
      setError("Pour modifier ou annuler, ouvrez le rappel concerné : Shiba ne peut pas choisir entre plusieurs rappels.");
      return;
    }
    if (isCancel) {
      setProposal({ kind: "cancel", actionSource: "shiba",
        editing: { id: active[0].id, version: active[0].version }, dueOn: active[0].due_on });
      return;
    }
    const dueOn = parseReminderDate(shibaRequest, parisToday());
    if (!dueOn || dueOn <= parisToday()) {
      setError("Shiba n’a pas trouvé de date future non ambiguë. Indiquez « rappel le JJ/MM/AAAA » ou « rappel dans X jours/mois ». La saisie manuelle reste disponible.");
      return;
    }
    setProposal({ kind: isUpdate ? "update" : "create", dueOn, recipientEmail,
      lastMaintenanceOn: isUpdate ? active[0].last_maintenance_on || "" : "",
      leadDays: isUpdate ? active[0].lead_days : 30,
      source: "user_selected", actionSource: "shiba",
      confirmationKey: isUpdate ? null : crypto.randomUUID(),
      editing: isUpdate ? { id: active[0].id, version: active[0].version } : null,
    });
  }

  async function confirm() {
    if (!proposal || busyRef.current) return;
    if (proposal.kind !== "cancel" && recipientEmail !== proposal.recipientEmail) {
      setProposal(null);
      setError("L’adresse du destinataire a changé. Préparez et confirmez à nouveau le rappel.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const { error: saveError } = proposal.kind === "cancel"
        ? await supabase.rpc("cancel_maintenance_reminder", {
          p_id: proposal.editing.id, p_expected_version: proposal.editing.version,
          p_action_source: proposal.actionSource,
        })
        : proposal.editing
        ? await supabase.rpc("update_maintenance_reminder", {
          p_id: proposal.editing.id, p_expected_version: proposal.editing.version,
          p_due_on: proposal.dueOn, p_due_source: proposal.source,
          p_last_maintenance_on: proposal.lastMaintenanceOn || null, p_lead_days: proposal.leadDays,
          p_expected_recipient_email: proposal.recipientEmail,
          p_action_source: proposal.actionSource,
        })
        : await supabase.rpc("create_maintenance_reminder", {
          p_equipment_id: equipment.id, p_due_on: proposal.dueOn,
          p_due_source: proposal.source, p_last_maintenance_on: proposal.lastMaintenanceOn || null,
          p_lead_days: proposal.leadDays, p_confirmation_key: proposal.confirmationKey,
          p_expected_recipient_email: proposal.recipientEmail,
          p_action_source: proposal.actionSource,
        });
      if (saveError) throw saveError;
      await reload();
      setMessage(proposal.kind === "cancel" ? "Rappel annulé et confirmé par la base."
        : `Rappel ${proposal.editing ? "modifié" : "enregistré"} pour le ${readableDate(proposal.dueOn)}. Aucun e-mail n’a encore été envoyé.`);
      setProposal(null);
      setEditing(null);
      setForm(emptyForm());
    } catch {
      setError("L’enregistrement n’a pas été confirmé par la base. Vérifiez la liste avant de réessayer.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function cancel(reminder) {
    if (busyRef.current || !window.confirm(`Annuler le rappel du ${readableDate(reminder.due_on)} pour ${equipment.brand} ${equipment.model} ?`)) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const { error: cancelError } = await supabase.rpc("cancel_maintenance_reminder", {
        p_id: reminder.id, p_expected_version: reminder.version,
        p_action_source: "manual",
      });
      if (cancelError) throw cancelError;
      await reload();
      setMessage("Rappel annulé. Un e-mail déjà accepté avant cette annulation ne peut pas être rappelé.");
    } catch {
      setError("L’annulation n’a pas été confirmée. Actualisez la liste avant de réessayer.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function sendTest(reminder) {
    if (busyRef.current || !session?.access_token) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/maintenance-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ reminderId: reminder.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Envoi indisponible.");
      setMessage("E-mail de test accepté par le service d’envoi. Cela ne confirme ni sa livraison ni sa lecture.");
    } catch (sendError) {
      setError(sendError.message || "E-mail de test indisponible.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return <>
  <section className="maintenance-reminders" aria-labelledby="maintenance-reminders-title">
    <h3 id="maintenance-reminders-title">Entretien et rappels</h3>
    {promptAfterCreation && <p className="maintenance-reminders__prompt">Équipement enregistré. Souhaitez-vous programmer son prochain entretien ?</p>}
    <p>Dernier entretien validé : {validatedMaintenance ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(new Date(validatedMaintenance.interventionAt)) : "aucun"}. {declaredMaintenance ? `Date déclarée séparément : ${readableDate(declaredMaintenance)}.` : ""} La date d’installation ne compte pas comme entretien.</p>
    <p>Prochaine échéance : {active.length ? `${readableDate(active[0].due_on)} (${sourceLabel(active[0].due_source)})` : "à définir"}.</p>
    {loading && <p role="status">Chargement des rappels…</p>}
    {error && !manualOpen && <p className="pro-form-error" role="alert">{error}</p>}
    {message && <p className="pro-form-success" role="status">{message}</p>}
    {!loading && <>
      {!proposal && <div className="maintenance-reminders__shiba">
        <div className="maintenance-reminders__shiba-heading">
          <img src={shibaTechnicien} alt="" />
          <div>
            <h4>Programmer avec Shiba Bot</h4>
            <p>Décrivez le rappel souhaité pour cet appareil. Shiba prépare la date ; vous vérifiez et confirmez avant tout enregistrement.</p>
          </div>
        </div>
        <form className="maintenance-reminders__shiba-form" onSubmit={prepareShiba}>
          <label htmlFor="shiba-reminder-request">Votre demande</label>
          <div className="maintenance-reminders__shiba-row">
            <input id="shiba-reminder-request" type="text" value={shibaRequest} onChange={(event) => setShibaRequest(event.target.value)} placeholder="Écrivez ici votre demande de rappel" maxLength={300} aria-describedby="shiba-reminder-hint" />
            <button className="pro-primary-button" type="submit" disabled={!shibaRequest.trim() || busy}>Préparer avec Shiba</button>
          </div>
        </form>
        <small id="shiba-reminder-hint">Saisissez votre demande pour activer le bouton. Formats reconnus : « rappel le JJ/MM/AAAA » ou « rappel dans X jours/mois ». Aucune instruction d’un document ne déclenche une action.</small>
      </div>}
      {!proposal && <button className="maintenance-reminders__manual-link" type="button" onClick={() => {
        setEditing(null); setForm(emptyForm()); setError(""); setManualOpen(true);
      }}>Saisir un rappel manuellement →</button>}
      {proposal && <div className="maintenance-reminders__proposal" role="group" aria-label="Confirmation du rappel">
        <strong>Confirmer cette action ?</strong>
        <p>{proposal.kind === "cancel" ? "Annuler le rappel" : proposal.editing ? "Modifier le rappel" : "Créer le rappel"} · {equipment.brand} {equipment.model} · {readableDate(proposal.dueOn)} · {proposal.kind === "cancel" ? active[0]?.recipient_email || recipientEmail : proposal.recipientEmail}{proposal.kind === "cancel" ? "" : ` · e-mail ${proposal.leadDays} jour(s) avant`}.</p>
        <p>{proposal.kind === "cancel" ? "Une notification déjà envoyée ne peut pas être rappelée." : "Origine : date choisie par vous. Aucun message n’est envoyé maintenant."}</p>
        <button className="pro-primary-button" type="button" disabled={busy} onClick={confirm}>{busy ? "Enregistrement…" : "Confirmer"}</button>
        <button type="button" disabled={busy} onClick={() => setProposal(null)}>Annuler</button>
      </div>}
      {active.length > 0 && <ul className="maintenance-reminders__list">
        {active.map((reminder) => <li key={reminder.id}>
          <div><strong>{readableDate(reminder.due_on)}</strong> · {sourceLabel(reminder.due_source)}<br />
            Destinataire : {reminder.recipient_email} · E-mail prévu {reminder.lead_days} jour(s) avant<br />
            État : {reminder.status === "review_required" ? "à réévaluer après un entretien validé ; aucun nouvel envoi" : reminder.notification_state === "accepted" ? "accepté par le service e-mail" : reminder.notification_state === "failed" ? "échec d’envoi" : "prévu, non envoyé"}
          </div>
          <div className="maintenance-reminders__actions">
            {previewEmailTestEnabled && <button type="button" disabled={busy} onClick={() => sendTest(reminder)}>E-mail test Preview</button>}
            <button type="button" disabled={busy} onClick={() => {
              setEditing(reminder); setProposal(null); setError(""); setManualOpen(true);
              setForm({ dueOn: reminder.due_on, lastMaintenanceOn: reminder.last_maintenance_on || "", leadDays: String(reminder.lead_days) });
            }}>Modifier</button>
            <button type="button" disabled={busy} onClick={() => cancel(reminder)}>Annuler</button>
          </div>
        </li>)}
      </ul>}
    </>}
  </section>
  <dialog ref={manualDialogRef} className="maintenance-reminders__dialog" aria-labelledby="manual-reminder-title" onClose={() => {
    setManualOpen(false); setEditing(null); setForm(emptyForm());
  }}>
    <div className="maintenance-reminders__dialog-heading">
      <h3 id="manual-reminder-title">{editing ? "Modifier le rappel" : "Saisir un rappel manuellement"}</h3>
      <button type="button" aria-label="Fermer la saisie manuelle" onClick={() => setManualOpen(false)}>×</button>
    </div>
    <p>Choisissez vous-même une date pour {equipment.brand} {equipment.model}. Aucune périodicité n’est supposée ; la documentation n’est pas obligatoire.</p>
    {error && manualOpen && <p className="pro-form-error" role="alert">{error}</p>}
    <form className="maintenance-reminders__form" onSubmit={prepare}>
      <label>Date du dernier entretien, si connue <input type="date" value={form.lastMaintenanceOn} max={form.dueOn || undefined} onChange={(event) => setForm({ ...form, lastMaintenanceOn: event.target.value })} /></label>
      <label>Prochaine échéance * <input type="date" required min={parisToday()} value={form.dueOn} onChange={(event) => setForm({ ...form, dueOn: event.target.value })} /></label>
      <label>Prévenir combien de jours avant ? <input type="number" required min="0" max="365" value={form.leadDays} onChange={(event) => setForm({ ...form, leadDays: event.target.value })} /></label>
      <p>Destinataire : <strong>{recipientEmail || "adresse indisponible"}</strong> (adresse du compte confirmée). Canal : e-mail et rappel dans CarnetPass.</p>
      <button className="pro-primary-button" type="submit" disabled={busy || !emailConfirmed}>Préparer le rappel</button>
    </form>
  </dialog>
  </>;
}

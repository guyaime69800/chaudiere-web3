import { useEffect, useState } from "react";
import "./ModelRemindersContents.css";

function readableDate(value) {
  if (!value) return "Date indisponible";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" })
    .format(new Date(`${value}T12:00:00Z`));
}

function stateLabel(reminder) {
  if (reminder.status === "review_required") return "À réévaluer après un entretien validé";
  if (reminder.notificationState === "accepted") return "E-mail accepté par le service d’envoi";
  if (reminder.notificationState === "failed") return "Échec d’envoi";
  return "Prévu, non envoyé";
}

export default function ModelRemindersContents({ equipment, session }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!equipment?.id || !session?.access_token) return undefined;
    const controller = new AbortController();
    fetch(`/api/model-reminders?equipmentId=${encodeURIComponent(equipment.id)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Liste indisponible.");
      setResult(body);
    }).catch((cause) => {
      if (cause.name !== "AbortError") setError(cause.message || "Liste indisponible.");
    });
    return () => controller.abort();
  }, [equipment?.id, session?.access_token]);

  if (error) return <p className="pro-form-error" role="alert">{error}</p>;
  if (!result) return <p role="status">Chargement des rappels du modèle…</p>;

  return <div className="model-reminders">
    <p><strong>{result.reminderCount} rappel{result.reminderCount > 1 ? "s" : ""} enregistré{result.reminderCount > 1 ? "s" : ""}</strong> sur {result.equipmentCount} appareil{result.equipmentCount > 1 ? "s" : ""} de ce modèle dans votre entreprise.</p>
    <p className="model-reminders__privacy">Les adresses des particuliers ne sont pas affichées. Seuls leurs rappels vérifiés sont comptés ; les rappels annulés ne le sont pas.</p>
    {result.reminders.length === 0
      ? <p>Aucun rappel en cours pour ce modèle.</p>
      : <ul className="model-reminders__list">
        {result.reminders.map((reminder, index) => <li key={`${reminder.equipmentId}-${reminder.audience}-${index}`}>
          <div>
            <strong>{readableDate(reminder.dueOn)}</strong>
            <span>{reminder.audience === "individual" ? "Particulier · adresse vérifiée" : "Compte professionnel"}</span>
          </div>
          <div>
            <span>{reminder.serialNumber ? `N° de série : ${reminder.serialNumber}` : `Appareil réf. ${reminder.equipmentId.slice(0, 8)}`}</span>
            <span>Préavis : {reminder.leadDays} jour(s) · {stateLabel(reminder)}</span>
          </div>
        </li>)}
      </ul>}
  </div>;
}

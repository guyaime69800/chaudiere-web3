import { useMemo, useState } from "react";

const EMPTY_INTERVENTION_FORM = {
  equipmentId: "",
  interventionType: "maintenance",
  workPerformed: "",
  resultStatus: "resolved",
};

function getEquipmentLabel(equipment) {
  return `${equipment.brand} ${equipment.model} — ${equipment.serial_number}`;
}

export default function InterventionForm({
  session,
  equipments,
  carnetPassStatuses,
  carnetPassStatusLoading,
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_INTERVENTION_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeEquipments = useMemo(
    () =>
      equipments.filter(
        (equipment) =>
          carnetPassStatuses[equipment.id]?.status === "active"
      ),
    [equipments, carnetPassStatuses]
  );

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submitting) return;

    setError("");
    setSuccess("");

    if (!session?.access_token) {
      setError("Votre session a expiré. Reconnectez-vous.");
      return;
    }

    if (!form.equipmentId) {
      setError(
        "Sélectionnez un équipement possédant un CarnetPass actif."
      );
      return;
    }

    if (!form.workPerformed.trim()) {
      setError("Décrivez le travail effectué.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/interventions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          equipmentId: form.equipmentId,
          interventionType: form.interventionType,
          workPerformed: form.workPerformed.trim(),
          resultStatus: form.resultStatus,
          aiAssistanceUsed: false,
          aiTrainingAllowed: false,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.error ||
            "L’intervention n’a pas pu être enregistrée."
        );
      }

      setSuccess(
        result?.intervention?.polygonState === "confirmed"
          ? "Intervention enregistrée et preuve Polygon confirmée."
          : "Intervention enregistrée. La confirmation Polygon est en cours."
      );

      setForm(EMPTY_INTERVENTION_FORM);
      setFormOpen(false);
    } catch (submitError) {
      setError(
        submitError?.message ||
          "L’intervention n’a pas pu être enregistrée."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const noActiveEquipment =
    !carnetPassStatusLoading && activeEquipments.length === 0;

  return (
    <section
      className="pro-dashboard-grid"
      aria-labelledby="intervention-form-title"
    >
      <article className="pro-dashboard-card pro-equipment-card">
        <div>
          <span className="pro-dashboard-icon" aria-hidden="true">
            🧰
          </span>

          <h2 id="intervention-form-title">
            Interventions techniques
          </h2>

          <p>
            Enregistrez une intervention sur un équipement
            possédant un CarnetPass actif. Seule une empreinte
            cryptographique sera publiée sur Polygon.
          </p>
        </div>

        <button
          className="pro-primary-button"
          type="button"
          disabled={
            carnetPassStatusLoading ||
            noActiveEquipment ||
            submitting
          }
          onClick={() => {
            setFormOpen((isOpen) => !isOpen);
            setError("");
            setSuccess("");
          }}
        >
          {carnetPassStatusLoading
            ? "Vérification des CarnetPass…"
            : noActiveEquipment
              ? "Aucun CarnetPass actif"
              : formOpen
                ? "Fermer le formulaire"
                : "Ajouter une intervention"}
        </button>

        {success && (
          <p className="pro-form-success" role="status">
            {success}
          </p>
        )}

        {error && (
          <p className="pro-form-error" role="alert">
            {error}
          </p>
        )}

        {noActiveEquipment && (
          <p className="pro-equipment-lock">
            Créez ou activez d’abord le CarnetPass d’un équipement.
          </p>
        )}

        {formOpen && !noActiveEquipment && (
          <form
            className="pro-form pro-equipment-form"
            onSubmit={handleSubmit}
            aria-busy={submitting}
          >
            <label>
              <span>Équipement *</span>

              <select
                name="equipmentId"
                value={form.equipmentId}
                onChange={handleChange}
                disabled={submitting}
                required
              >
                <option value="">
                  Sélectionner un équipement
                </option>

                {activeEquipments.map((equipment) => (
                  <option
                    key={equipment.id}
                    value={equipment.id}
                  >
                    {getEquipmentLabel(equipment)}
                  </option>
                ))}
              </select>
            </label>

            <div className="pro-form-row">
              <label>
                <span>Type d’intervention *</span>

                <select
                  name="interventionType"
                  value={form.interventionType}
                  onChange={handleChange}
                  disabled={submitting}
                  required
                >
                  <option value="maintenance">Entretien</option>
                  <option value="repair">Dépannage</option>
                  <option value="installation">Installation</option>
                  <option value="commissioning">
                    Mise en service
                  </option>
                  <option value="inspection">Contrôle</option>
                  <option value="other">Autre</option>
                </select>
              </label>

              <label>
                <span>Résultat *</span>

                <select
                  name="resultStatus"
                  value={form.resultStatus}
                  onChange={handleChange}
                  disabled={submitting}
                  required
                >
                  <option value="resolved">Résolu</option>
                  <option value="partially_resolved">
                    Partiellement résolu
                  </option>
                  <option value="not_resolved">
                    Non résolu
                  </option>
                  <option value="not_applicable">
                    Sans objet
                  </option>
                </select>
              </label>
            </div>

            <label>
              <span>Travail effectué *</span>

              <textarea
                name="workPerformed"
                value={form.workPerformed}
                onChange={handleChange}
                placeholder="Décrivez précisément le contrôle, l’entretien ou la réparation effectuée."
                maxLength={4000}
                rows={6}
                disabled={submitting}
                required
              />

              <small>
                {form.workPerformed.length}/4000 caractères
              </small>
            </label>

            <p className="pro-form-notice">
              Vérifiez les informations avant l’envoi : une preuve
              confirmée sur Polygon ne peut pas être effacée.
            </p>

            <button
              className="pro-primary-button"
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? "Enregistrement et confirmation Polygon…"
                : "Enregistrer l’intervention"}
            </button>
          </form>
        )}
      </article>
    </section>
  );
}
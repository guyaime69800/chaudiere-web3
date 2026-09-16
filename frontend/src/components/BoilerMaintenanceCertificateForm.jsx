import { useEffect, useMemo, useState } from "react";

const EMPTY_FORM = {
  interventionId: "",
  customerName: "",
  customerAddress: "",
  installationAddress: "",
  boilerLocation: "",
};

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date non renseignée";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function BoilerMaintenanceCertificateForm({
  session,
  interventions = [],
  equipments = [],
}) {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const equipmentById = useMemo(
    () =>
      Object.fromEntries(
        equipments.map((equipment) => [
          equipment.id,
          equipment,
        ])
      ),
    [equipments]
  );

  const certificateByInterventionId = useMemo(
    () =>
      Object.fromEntries(
        certificates.map((certificate) => [
          certificate.interventionId,
          certificate,
        ])
      ),
    [certificates]
  );

  const eligibleInterventions = useMemo(
    () =>
      interventions.filter((intervention) => {
        const equipment =
          equipmentById[intervention.equipmentId];

        return (
          intervention.interventionType === "maintenance" &&
          intervention.polygonState === "confirmed" &&
          equipment?.equipment_type === "boiler"
        );
      }),
    [interventions, equipmentById]
  );

  const availableInterventions = useMemo(
    () =>
      eligibleInterventions.filter(
        (intervention) =>
          !certificateByInterventionId[intervention.id]
      ),
    [
      eligibleInterventions,
      certificateByInterventionId,
    ]
  );

  useEffect(() => {
    if (!session?.access_token) {
      setCertificates([]);
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function loadCertificates() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          "/api/interventions?resource=boiler-certificates",
          {
            headers: {
              Authorization:
                `Bearer ${session.access_token}`,
            },
            signal: controller.signal,
          }
        );

        const result =
          await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            result?.error ||
              "Les attestations n’ont pas pu être chargées."
          );
        }

        if (!cancelled) {
          setCertificates(
            Array.isArray(result?.certificates)
              ? result.certificates
              : []
          );
        }
      } catch (loadError) {
        if (
          !cancelled &&
          loadError?.name !== "AbortError"
        ) {
          setError(
            loadError?.message ||
              "Les attestations n’ont pas pu être chargées."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCertificates();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [session?.access_token]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  }

  function openForm() {
    const firstIntervention =
      availableInterventions[0];

    setForm({
      ...EMPTY_FORM,
      interventionId: firstIntervention?.id || "",
    });

    setError("");
    setSuccess("");
    setFormOpen(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submitting) return;

    if (!session?.access_token) {
      setError(
        "Votre session a expiré. Reconnectez-vous."
      );
      return;
    }

    if (!form.interventionId) {
      setError(
        "Sélectionnez une intervention d’entretien."
      );
      return;
    }

    if (!form.customerName.trim()) {
      setError("Renseignez le nom du commanditaire.");
      return;
    }

    if (!form.customerAddress.trim()) {
      setError(
        "Renseignez l’adresse du commanditaire."
      );
      return;
    }

    if (!form.installationAddress.trim()) {
      setError(
        "Renseignez l’adresse de l’installation."
      );
      return;
    }

    if (!form.boilerLocation.trim()) {
      setError(
        "Renseignez le local où se trouve la chaudière."
      );
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        "/api/interventions?resource=boiler-certificates",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization:
              `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            interventionId: form.interventionId,
            customer: {
              name: form.customerName.trim(),
              address: form.customerAddress.trim(),
            },
            installation: {
              address:
                form.installationAddress.trim(),
              boilerLocation:
                form.boilerLocation.trim(),
            },
          }),
        }
      );

      const result =
        await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.error ||
            "Le brouillon n’a pas pu être créé."
        );
      }

      const certificate = result?.certificate;

      if (certificate?.id) {
        setCertificates((currentCertificates) => {
          const filtered =
            currentCertificates.filter(
              (item) =>
                item.id !== certificate.id
            );

          return [certificate, ...filtered];
        });
      }

      setSuccess(
        result?.alreadyExists
          ? "Le brouillon existait déjà."
          : "Brouillon de l’attestation créé."
      );

      setForm(EMPTY_FORM);
      setFormOpen(false);
    } catch (submitError) {
      setError(
        submitError?.message ||
          "Le brouillon n’a pas pu être créé."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (
    !loading &&
    eligibleInterventions.length === 0 &&
    certificates.length === 0
  ) {
    return null;
  }

  return (
    <section
      className="pro-dashboard-grid"
      aria-labelledby="boiler-certificate-title"
    >
      <article className="pro-dashboard-card pro-equipment-card">
        <div>
          <span
            className="pro-dashboard-icon"
            aria-hidden="true"
          >
            📋
          </span>

          <h2 id="boiler-certificate-title">
            Attestations d’entretien chaudière
          </h2>

          <p>
            Une attestation réglementaire distincte est
            conservée pour chaque chaudière entretenue.
          </p>
        </div>

        {loading && (
          <p className="pro-form-notice" role="status">
            Chargement des attestations…
          </p>
        )}

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

        {!loading &&
          availableInterventions.length > 0 &&
          !formOpen && (
            <button
              className="pro-primary-button"
              type="button"
              onClick={openForm}
            >
              Préparer une attestation
            </button>
          )}

        {formOpen && (
          <form
            className="pro-form pro-equipment-form"
            onSubmit={handleSubmit}
            aria-busy={submitting}
          >
            <label>
              <span>Intervention d’entretien *</span>

              <select
                name="interventionId"
                value={form.interventionId}
                onChange={handleChange}
                disabled={submitting}
                required
              >
                <option value="">
                  Sélectionner une intervention
                </option>

                {availableInterventions.map(
                  (intervention) => {
                    const equipment =
                      equipmentById[
                        intervention.equipmentId
                      ];

                    return (
                      <option
                        key={intervention.id}
                        value={intervention.id}
                      >
                        {equipment
                          ? `${equipment.brand} ${equipment.model} — ${equipment.serial_number}`
                          : intervention.carnetPassId}
                        {" — "}
                        {formatDate(
                          intervention.interventionAt
                        )}
                      </option>
                    );
                  }
                )}
              </select>
            </label>

            <label>
              <span>Nom du commanditaire *</span>

              <input
                type="text"
                name="customerName"
                value={form.customerName}
                onChange={handleChange}
                maxLength={200}
                disabled={submitting}
                required
              />
            </label>

            <label>
              <span>Adresse du commanditaire *</span>

              <textarea
                name="customerAddress"
                value={form.customerAddress}
                onChange={handleChange}
                maxLength={500}
                rows={3}
                disabled={submitting}
                required
              />
            </label>

            <label>
              <span>Adresse de l’installation *</span>

              <textarea
                name="installationAddress"
                value={form.installationAddress}
                onChange={handleChange}
                maxLength={500}
                rows={3}
                disabled={submitting}
                required
              />
            </label>

            <label>
              <span>Local de la chaudière *</span>

              <input
                type="text"
                name="boilerLocation"
                value={form.boilerLocation}
                onChange={handleChange}
                placeholder="Exemple : cuisine, sous-sol, chaufferie"
                maxLength={200}
                disabled={submitting}
                required
              />
            </label>

            <p className="pro-form-notice">
              Cette étape crée uniquement un brouillon.
              L’attestation ne sera pas encore émise.
            </p>

            <div className="pro-form-row">
              <button
                className="pro-primary-button"
                type="submit"
                disabled={submitting}
              >
                {submitting
                  ? "Création du brouillon…"
                  : "Créer le brouillon"}
              </button>

              <button
                className="pro-action-card-button"
                type="button"
                disabled={submitting}
                onClick={() => {
                  setFormOpen(false);
                  setForm(EMPTY_FORM);
                  setError("");
                }}
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        {certificates.length > 0 && (
          <ul className="pro-regulatory-list">
            {certificates.map((certificate) => (
              <li key={certificate.id}>
                <span>
                  {certificate.equipmentSnapshot?.brand}{" "}
                  {certificate.equipmentSnapshot?.model}
                </span>

                <strong>
                  {certificate.status === "issued"
                    ? "Attestation émise"
                    : "Brouillon à compléter"}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
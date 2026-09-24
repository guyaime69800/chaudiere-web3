import { useEffect, useMemo, useState } from "react";
import { createInterventionPdf } from "../services/interventionPdfService";
import DocumentPreviewModal from "./DocumentPreviewModal";
const EMPTY_INTERVENTION_FORM = {
  equipmentId: "",
  interventionType: "maintenance",
  symptoms: "",
  faultCode: "",
  diagnosis: "",
  workPerformed: "",
  partsReplaced: "",
  measurements: "",
  resultStatus: "resolved",
};

function getEquipmentLabel(equipment) {
  return `${equipment.brand} ${equipment.model} — ${equipment.serial_number || `CarnetPass ${equipment.id.slice(0, 8)}`}`;
}

function getInterventionTypeLabel(type) {
  const labels = {
    maintenance: "Entretien",
    repair: "Dépannage",
    installation: "Installation",
    commissioning: "Mise en service",
    inspection: "Contrôle",
    other: "Autre",
  };

  return labels[type] || "Intervention";
}

function getResultStatusLabel(status) {
  const labels = {
    resolved: "Résolu",
    partially_resolved: "Partiellement résolu",
    not_resolved: "Non résolu",
    not_applicable: "Sans objet",
  };

  return labels[status] || "Résultat non renseigné";
}

function formatInterventionDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date non renseignée";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
function parseMeasurements(value) {
  const measurements = {};

  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const [index, line] of lines.entries()) {
    const separatorIndex = line.indexOf(":");

    if (separatorIndex <= 0 || separatorIndex === line.length - 1) {
      throw new Error(
        `Mesure ligne ${index + 1} : utilisez le format "Nom : valeur".`,
      );
    }

    const name = line.slice(0, separatorIndex).trim();
    const measurement = line.slice(separatorIndex + 1).trim();

    if (Object.prototype.hasOwnProperty.call(measurements, name)) {
      throw new Error(`La mesure "${name}" est renseignée plusieurs fois.`);
    }

    measurements[name] = measurement;
  }

  return measurements;
}
export default function InterventionForm({
  session,
  company,
  equipments,
  carnetPassStatuses,
  carnetPassStatusLoading,
  selectedEquipmentId = "",
  embedded = false,
  interventions = [],
  boilerCertificates = [],
  boilerCertificatesLoading = false,
  interventionLoading,
  interventionLoadError,
  onOpenRegulatoryDocument,
  onInterventionCreated,
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    ...EMPTY_INTERVENTION_FORM,
    equipmentId: selectedEquipmentId || "",
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pdfGeneratingId, setPdfGeneratingId] = useState("");
  const [pdfPreview, setPdfPreview] = useState(null);

  const boilerCertificateByInterventionId = useMemo(
    () =>
      Object.fromEntries(
        boilerCertificates.map((certificate) => [
          certificate.interventionId,
          certificate,
        ]),
      ),
    [boilerCertificates],
  );

  const selectedEquipment = useMemo(
    () =>
      equipments.find(
        (equipment) => String(equipment.id) === String(selectedEquipmentId),
      ) || null,
    [equipments, selectedEquipmentId],
  );

  const activeEquipments = useMemo(
    () =>
      equipments.filter(
        (equipment) =>
          carnetPassStatuses[equipment.id]?.status === "active" &&
          (!selectedEquipmentId ||
            String(equipment.id) === String(selectedEquipmentId)),
      ),
    [equipments, carnetPassStatuses, selectedEquipmentId],
  );

  useEffect(() => {
    setForm({
      ...EMPTY_INTERVENTION_FORM,
      equipmentId: selectedEquipmentId || "",
    });
    setFormOpen(false);
    setError("");
    setSuccess("");
    setPdfPreview(null);
  }, [selectedEquipmentId]);

  useEffect(
    () => () => {
      if (pdfPreview?.url) {
        URL.revokeObjectURL(pdfPreview.url);
      }
    },
    [pdfPreview?.url],
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
      setError("Sélectionnez un équipement possédant un CarnetPass actif.");
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
          symptoms: form.symptoms.trim(),
          faultCode: form.faultCode.trim(),
          diagnosis: form.diagnosis.trim(),
          workPerformed: form.workPerformed.trim(),
          partsReplaced: form.partsReplaced
            .split(/\r?\n/)
            .map((part) => part.trim())
            .filter(Boolean),
          measurements: parseMeasurements(form.measurements),
          resultStatus: form.resultStatus,
          aiAssistanceUsed: false,
          aiTrainingAllowed: false,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.error || "L’intervention n’a pas pu être enregistrée.",
        );
      }

      setSuccess(
        result?.intervention?.polygonState === "confirmed"
          ? "Intervention enregistrée et preuve Polygon confirmée."
          : "Intervention enregistrée. La confirmation Polygon est en cours.",
      );

      onInterventionCreated?.();

      setForm({
        ...EMPTY_INTERVENTION_FORM,
        equipmentId: selectedEquipmentId || "",
      });
      setFormOpen(false);
    } catch (submitError) {
      setError(
        submitError?.message || "L’intervention n’a pas pu être enregistrée.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function handleOpenPdfPreview(intervention, equipment) {
    if (pdfGeneratingId) return;

    setPdfGeneratingId(intervention.id);
    setError("");

    try {
      const { blob, fileName } = await createInterventionPdf({
        intervention,
        equipment,
        company,
      });

      const equipmentLabel = [equipment?.brand, equipment?.model]
        .filter(Boolean)
        .join(" ");

      setPdfPreview({
        url: URL.createObjectURL(blob),
        fileName,
        title: "Rapport d’intervention technique",
        subtitle: [
          equipmentLabel,
          formatInterventionDate(intervention.interventionAt),
        ]
          .filter(Boolean)
          .join(" · "),
      });
    } catch (pdfError) {
      setError(pdfError?.message || "Le rapport PDF n'a pas pu être créé.");
    } finally {
      setPdfGeneratingId("");
    }
  }

  function handlePdfPreviewOpenChange(nextOpen) {
    if (!nextOpen) {
      setPdfPreview(null);
    }
  }
  const noActiveEquipment =
    !carnetPassStatusLoading && activeEquipments.length === 0;

  return (
    <>
      <section
        className={
          embedded ? "pro-equipment-workspace-module" : "pro-dashboard-grid"
        }
        aria-labelledby="intervention-form-title"
      >
        <article
          className={`pro-dashboard-card pro-equipment-card${
            embedded ? " pro-dashboard-card--embedded" : ""
          }`}
        >
          <div>
            <span className="pro-dashboard-icon" aria-hidden="true">
              🧰
            </span>

            <h2 id="intervention-form-title">
              {selectedEquipment
                ? "Interventions de l’équipement"
                : "Interventions techniques"}
            </h2>

            <p>
              {selectedEquipment
                ? "Ajoutez une intervention et consultez tout l’historique de cet équipement. Seule une empreinte cryptographique sera publiée sur Polygon."
                : "Enregistrez une intervention sur un équipement possédant un CarnetPass actif. Seule une empreinte cryptographique sera publiée sur Polygon."}
            </p>
          </div>

          <button
            className="pro-primary-button"
            type="button"
            disabled={
              carnetPassStatusLoading || noActiveEquipment || submitting
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
              {selectedEquipment ? (
                <div className="pro-selected-equipment-field">
                  <span>Équipement sélectionné</span>
                  <strong>{getEquipmentLabel(selectedEquipment)}</strong>
                </div>
              ) : (
                <label>
                  <span>Équipement *</span>

                  <select
                    name="equipmentId"
                    value={form.equipmentId}
                    onChange={handleChange}
                    disabled={submitting}
                    required
                  >
                    <option value="">Sélectionner un équipement</option>

                    {activeEquipments.map((equipment) => (
                      <option key={equipment.id} value={equipment.id}>
                        {getEquipmentLabel(equipment)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

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
                    <option value="commissioning">Mise en service</option>
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
                    <option value="not_resolved">Non résolu</option>
                    <option value="not_applicable">Sans objet</option>
                  </select>
                </label>
              </div>

              <label>
                <span>Symptômes constatés</span>

                <textarea
                  name="symptoms"
                  value={form.symptoms}
                  onChange={handleChange}
                  placeholder="Décrivez les symptômes signalés ou constatés."
                  maxLength={4000}
                  rows={4}
                  disabled={submitting}
                />

                <small>{form.symptoms.length}/4000 caractères</small>
              </label>

              <label>
                <span>Code défaut</span>

                <input
                  type="text"
                  name="faultCode"
                  value={form.faultCode}
                  onChange={handleChange}
                  placeholder="Exemple : F28"
                  maxLength={100}
                  disabled={submitting}
                />
              </label>

              <label>
                <span>Diagnostic</span>

                <textarea
                  name="diagnosis"
                  value={form.diagnosis}
                  onChange={handleChange}
                  placeholder="Décrivez le diagnostic établi par le technicien."
                  maxLength={4000}
                  rows={4}
                  disabled={submitting}
                />

                <small>{form.diagnosis.length}/4000 caractères</small>
              </label>
              <label>
                <span>Travail effectué *</span>

                <textarea
                  name="workPerformed"
                  value={form.workPerformed}
                  onChange={handleChange}
                  placeholder="Décrivez précisément le contrôle, l’entretien ou la réparation effectuée."
                  maxLength={8000}
                  rows={6}
                  disabled={submitting}
                  required
                />

                <small>{form.workPerformed.length}/8000 caractères</small>
              </label>
              <label>
                <span>Pièces remplacées</span>

                <textarea
                  name="partsReplaced"
                  value={form.partsReplaced}
                  onChange={handleChange}
                  placeholder="Une pièce par ligne. Exemple : Sonde extérieure"
                  maxLength={4000}
                  rows={3}
                  disabled={submitting}
                />

                <small>
                  Une pièce par ligne. Laissez vide si aucune pièce n'a été
                  remplacée.
                </small>
              </label>

              <label>
                <span>Mesures relevées</span>

                <textarea
                  name="measurements"
                  value={form.measurements}
                  onChange={handleChange}
                  placeholder="Une mesure par ligne. Exemple : Pression chauffage : 1,5 bar"
                  maxLength={6000}
                  rows={4}
                  disabled={submitting}
                />

                <small>Format obligatoire : nom de la mesure : valeur</small>
              </label>
              <p className="pro-form-notice">
                Vérifiez les informations avant l’envoi : une preuve confirmée
                sur Polygon ne peut pas être effacée.
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

          <div
            className="pro-intervention-history"
            aria-labelledby="intervention-history-title"
          >
            <div className="pro-intervention-history-heading">
              <div>
                <h3 id="intervention-history-title">
                  {selectedEquipment
                    ? "Historique de l’équipement"
                    : "Historique récent"}
                </h3>
                <p>
                  {selectedEquipment
                    ? "Toutes les interventions chargées pour cet équipement."
                    : "Interventions enregistrées par votre entreprise."}
                </p>
              </div>

              {!interventionLoading && !interventionLoadError && (
                <span>
                  {interventions.length} affichée
                  {interventions.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {interventionLoading && (
              <p className="pro-form-notice" role="status">
                Chargement de l'historique…
              </p>
            )}

            {!interventionLoading && interventionLoadError && (
              <p className="pro-form-error" role="alert">
                {interventionLoadError}
              </p>
            )}

            {!interventionLoading &&
              !interventionLoadError &&
              interventions.length === 0 && (
                <p className="pro-intervention-history-empty">
                  Aucune intervention enregistrée pour le moment.
                </p>
              )}

            {!interventionLoading &&
              !interventionLoadError &&
              interventions.length > 0 && (
                <ul className="pro-intervention-history-list">
                  {interventions.map((intervention) => {
                    const equipment = equipments.find(
                      (item) =>
                        String(item.id) === String(intervention.equipmentId),
                    );

                    const hasBoilerCertificate =
                      equipment?.equipment_type === "boiler" &&
                      intervention.interventionType === "maintenance" &&
                      intervention.polygonState === "confirmed";

                    const boilerCertificate =
                      boilerCertificateByInterventionId[intervention.id];

                    const certificateButtonLabel =
                      boilerCertificate?.status === "issued"
                        ? "Voir l’attestation"
                        : boilerCertificate?.status === "draft"
                          ? "Compléter le brouillon"
                          : "Compléter l’attestation";

                    return (
                      <li key={intervention.id}>
                        <div className="pro-intervention-history-main">
                          <strong>
                            {equipment
                              ? `${equipment.brand} ${equipment.model}`
                              : intervention.carnetPassId}
                          </strong>
                          {equipment?.serial_number && (
                            <span>N° de série : {equipment.serial_number}</span>
                          )}
                          <span>
                            {getInterventionTypeLabel(
                              intervention.interventionType,
                            )}{" "}
                            ·{" "}
                            <time dateTime={intervention.interventionAt}>
                              {formatInterventionDate(
                                intervention.interventionAt,
                              )}
                            </time>
                          </span>
                          <p>{intervention.workPerformed}</p>
                        </div>

                        <div className="pro-intervention-history-status">
                          <strong>
                            {getResultStatusLabel(intervention.resultStatus)}
                          </strong>
                          <span
                            className={
                              intervention.polygonState === "confirmed"
                                ? "is-confirmed"
                                : ""
                            }
                          >
                            {intervention.polygonState === "confirmed"
                              ? "✓ Preuve Polygon confirmée"
                              : "Confirmation Polygon en cours"}
                          </span>
                          {intervention.polygonState === "confirmed" && (
                            <button
                              className="pro-primary-button"
                              style={{
                                minHeight: "36px",
                                padding: "0 12px",
                                borderRadius: "9px",
                                boxShadow: "none",
                                fontSize: "12px",
                              }}
                              type="button"
                              aria-haspopup="dialog"
                              disabled={Boolean(pdfGeneratingId)}
                              onClick={() =>
                                handleOpenPdfPreview(intervention, equipment)
                              }
                            >
                              {pdfGeneratingId === intervention.id
                                ? "Préparation du rapport…"
                                : "📄 Voir le rapport"}
                            </button>
                          )}
                          {hasBoilerCertificate &&
                            !boilerCertificatesLoading && (
                              <button
                                className="pro-action-card-button"
                                type="button"
                                onClick={() =>
                                  onOpenRegulatoryDocument?.(intervention.id)
                                }
                              >
                                {certificateButtonLabel}
                              </button>
                            )}
                          {hasBoilerCertificate &&
                            boilerCertificatesLoading && (
                              <span className="is-loading">
                                Chargement de l’attestation…
                              </span>
                            )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
        </article>
      </section>

      <DocumentPreviewModal
        open={Boolean(pdfPreview)}
        onOpenChange={handlePdfPreviewOpenChange}
        title={pdfPreview?.title}
        subtitle={pdfPreview?.subtitle}
        documentUrl={pdfPreview?.url}
        fileName={pdfPreview?.fileName}
        eyebrow="RAPPORT CARNETPASS"
        downloadLabel="Télécharger le rapport"
      />
    </>
  );
}

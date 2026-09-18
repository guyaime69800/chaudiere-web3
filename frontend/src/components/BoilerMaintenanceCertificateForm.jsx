import { useEffect, useMemo, useState } from "react";
import AttestationModal from "./AttestationModal";

const EMPTY_FORM = {
  interventionId: "",
  customerName: "",
  customerAddress: "",
  installationAddress: "",
  boilerLocation: "",
};
const EMPTY_DETAILS_FORM = {
  certificateId: "",
  boilerEnergy: "",
  flueExhaustType: "",
  commissioningDate: "",
  nominalPowerKw: "",
  hasForcedAirBurner: false,
  forcedAirBurnerBrand: "",
  forcedAirBurnerModel: "",
  forcedAirBurnerDate: "",
  previousMaintenanceDate: "",
  previousChimneySweepingDate: "",
  ambientCoPpm: "",
  boilerEfficiencyPercent: "",
  referenceEfficiencyPercent: "",
  boilerEnergyClass: "",
  replacementEnergyClasses: [],
  adviceGoodUse: "",
  adviceImprovements: "",
  adviceReplacement: "",
  controlledPoints: [],
  measuringInstruments: "",
  measurementsText: "",
  boilerSizingAssessment: "",
  pollutantEmissionsText: "",
  issuanceAccepted: false,
};

const CONTROLLED_POINT_OPTIONS = [
  "Nettoyage de la chaudière",
  "Vérification du brûleur",
  "Vérification des dispositifs de sécurité",
  "Contrôle de l’évacuation des fumées",
  "Contrôle de la ventilation du local",
  "Réglage de la combustion",
  "Contrôle de l’étanchéité du circuit",
  "Contrôle du circulateur",
];
const ENERGY_CLASS_OPTIONS = [
  "A+++",
  "A++",
  "A+",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
];
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
function objectToLines(value, excludedKeys = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  return Object.entries(value)
    .filter(([key]) => !excludedKeys.includes(key))
    .map(([name, measurement]) => `${name} : ${measurement ?? ""}`)
    .join("\n");
}
function linesToObject(value, fieldName) {
  const result = {};

  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const [index, line] of lines.entries()) {
    const separatorIndex = line.indexOf(":");

    if (separatorIndex <= 0 || separatorIndex === line.length - 1) {
      throw new Error(
        `${fieldName}, ligne ${index + 1} : utilisez le format "Nom : valeur".`,
      );
    }

    const name = line.slice(0, separatorIndex).trim();

    const measurement = line.slice(separatorIndex + 1).trim();

    if (Object.prototype.hasOwnProperty.call(result, name)) {
      throw new Error(`${fieldName} : "${name}" est renseigné plusieurs fois.`);
    }

    result[name] = measurement;
  }

  return result;
}

function certificateBelongsToEquipment(
  certificate,
  equipment,
  interventionIds,
) {
  if (!equipment) return true;

  if (interventionIds.has(String(certificate?.interventionId || ""))) {
    return true;
  }

  const equipmentId = String(equipment.id || "");
  const serialNumber = String(equipment.serial_number || "");
  const snapshot = certificate?.equipmentSnapshot || {};

  const certificateEquipmentIds = [
    certificate?.equipmentId,
    certificate?.equipment_id,
    snapshot?.id,
    snapshot?.equipmentId,
    snapshot?.equipment_id,
  ].map((value) => String(value || ""));

  const snapshotSerialNumbers = [
    snapshot?.serialNumber,
    snapshot?.serial_number,
  ].map((value) => String(value || ""));

  return (
    (equipmentId && certificateEquipmentIds.includes(equipmentId)) ||
    (serialNumber && snapshotSerialNumbers.includes(serialNumber))
  );
}

export default function BoilerMaintenanceCertificateForm({
  session,
  interventions = [],
  equipments = [],
  selectedEquipmentId = "",
  embedded = false,
  requestedInterventionId = "",
  onRequestHandled,
  onCertificatesChange,
  onClose,
}) {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [detailsForm, setDetailsForm] = useState(EMPTY_DETAILS_FORM);
  const [editingCertificateId, setEditingCertificateId] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [previewCertificate, setPreviewCertificate] = useState(null);
  const equipmentById = useMemo(
    () =>
      Object.fromEntries(
        equipments.map((equipment) => [equipment.id, equipment]),
      ),
    [equipments],
  );

  const selectedEquipment = useMemo(
    () =>
      selectedEquipmentId
        ? equipmentById[selectedEquipmentId] ||
          equipments.find(
            (equipment) => String(equipment.id) === String(selectedEquipmentId),
          ) ||
          null
        : null,
    [equipmentById, equipments, selectedEquipmentId],
  );

  const selectedInterventionIds = useMemo(
    () =>
      new Set(
        interventions
          .filter(
            (intervention) =>
              !selectedEquipmentId ||
              String(intervention.equipmentId) === String(selectedEquipmentId),
          )
          .map((intervention) => String(intervention.id)),
      ),
    [interventions, selectedEquipmentId],
  );

  const certificateByInterventionId = useMemo(
    () =>
      Object.fromEntries(
        certificates.map((certificate) => [
          certificate.interventionId,
          certificate,
        ]),
      ),
    [certificates],
  );

  const eligibleInterventions = useMemo(
    () =>
      interventions.filter((intervention) => {
        const equipment = equipmentById[intervention.equipmentId];

        return (
          intervention.interventionType === "maintenance" &&
          intervention.polygonState === "confirmed" &&
          equipment?.equipment_type === "boiler" &&
          (!selectedEquipmentId ||
            String(intervention.equipmentId) === String(selectedEquipmentId))
        );
      }),
    [interventions, equipmentById, selectedEquipmentId],
  );

  const visibleCertificates = useMemo(
    () =>
      certificates.filter((certificate) =>
        certificateBelongsToEquipment(
          certificate,
          selectedEquipment,
          selectedInterventionIds,
        ),
      ),
    [certificates, selectedEquipment, selectedInterventionIds],
  );

  const availableInterventions = useMemo(
    () =>
      eligibleInterventions.filter(
        (intervention) => !certificateByInterventionId[intervention.id],
      ),
    [eligibleInterventions, certificateByInterventionId],
  );

  useEffect(() => {
    if (!loading) {
      onCertificatesChange?.(certificates);
    }
  }, [certificates, loading, onCertificatesChange]);

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
              Authorization: `Bearer ${session.access_token}`,
            },
            signal: controller.signal,
          },
        );

        const result = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            result?.error || "Les attestations n’ont pas pu être chargées.",
          );
        }

        if (!cancelled) {
          setCertificates(
            Array.isArray(result?.certificates) ? result.certificates : [],
          );
        }
      } catch (loadError) {
        if (!cancelled && loadError?.name !== "AbortError") {
          setError(
            loadError?.message ||
              "Les attestations n’ont pas pu être chargées.",
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
  useEffect(() => {
    if (!requestedInterventionId || loading) {
      return;
    }

    const intervention = eligibleInterventions.find(
      (item) => String(item.id) === String(requestedInterventionId),
    );

    if (!intervention) {
      setError(
        "Cette intervention ne permet pas de créer une attestation chaudière.",
      );
      onRequestHandled?.();
      return;
    }

    const existingCertificate =
      certificateByInterventionId[requestedInterventionId];

    if (existingCertificate?.status === "draft") {
      openDetailsForm(existingCertificate);
    } else if (existingCertificate) {
      setFormOpen(false);
      setEditingCertificateId("");
      setError("");
      setSuccess("");
      setPreviewCertificate(existingCertificate);
    } else {
      setForm({
        ...EMPTY_FORM,
        interventionId: requestedInterventionId,
      });

      setEditingCertificateId("");
      setDetailsForm(EMPTY_DETAILS_FORM);
      setError("");
      setSuccess("");
      setFormOpen(true);
    }

    if (existingCertificate?.status !== "issued") {
      window.requestAnimationFrame(() => {
        document.getElementById("boiler-certificate-title")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }

    onRequestHandled?.();
  }, [
    requestedInterventionId,
    loading,
    eligibleInterventions,
    certificateByInterventionId,
    onRequestHandled,
  ]);
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
    const firstIntervention = availableInterventions[0];

    setForm({
      ...EMPTY_FORM,
      interventionId: firstIntervention?.id || "",
    });

    setError("");
    setSuccess("");
    setFormOpen(true);
  }
  function handleDetailsChange(event) {
    const { name, value, type, checked } = event.target;

    setDetailsForm((currentForm) => ({
      ...currentForm,
      [name]: type === "checkbox" ? checked : value,
    }));

    setError("");
    setSuccess("");
  }

  function toggleControlledPoint(point) {
    setDetailsForm((currentForm) => {
      const alreadySelected = currentForm.controlledPoints.includes(point);

      return {
        ...currentForm,
        controlledPoints: alreadySelected
          ? currentForm.controlledPoints.filter((item) => item !== point)
          : [...currentForm.controlledPoints, point],
      };
    });

    setError("");
    setSuccess("");
  }
  function toggleReplacementEnergyClass(energyClass) {
    setDetailsForm((currentForm) => {
      const alreadySelected =
        currentForm.replacementEnergyClasses.includes(energyClass);

      return {
        ...currentForm,
        replacementEnergyClasses: alreadySelected
          ? currentForm.replacementEnergyClasses.filter(
              (item) => item !== energyClass,
            )
          : [...currentForm.replacementEnergyClasses, energyClass],
      };
    });

    setError("");
    setSuccess("");
  }
  function openDetailsForm(certificate) {
    setDetailsForm({
      certificateId: certificate.id,
      boilerEnergy: certificate.boilerEnergy || "",
      flueExhaustType: certificate.flueExhaustType || "",
      commissioningDate: certificate.commissioningDate || "",
      nominalPowerKw: certificate.nominalPowerKw ?? "",
      hasForcedAirBurner: Boolean(certificate.forcedAirBurner),
      forcedAirBurnerBrand: certificate.forcedAirBurner?.brand || "",
      forcedAirBurnerModel: certificate.forcedAirBurner?.model || "",
      forcedAirBurnerDate: certificate.forcedAirBurner?.date || "",
      previousMaintenanceDate: certificate.previousMaintenanceDate || "",
      previousChimneySweepingDate:
        certificate.previousChimneySweepingDate || "",
      ambientCoPpm: certificate.ambientCoPpm ?? "",
      boilerEfficiencyPercent: certificate.boilerEfficiencyPercent ?? "",
      referenceEfficiencyPercent: certificate.referenceEfficiencyPercent ?? "",
      boilerEnergyClass: certificate.boilerEnergyClass || "",
      replacementEnergyClasses: Array.isArray(
        certificate.replacementEnergyClasses,
      )
        ? certificate.replacementEnergyClasses
        : [],
      adviceGoodUse: certificate.adviceGoodUse || "",
      adviceImprovements: certificate.adviceImprovements || "",
      adviceReplacement: certificate.adviceReplacement || "",
      controlledPoints: Array.isArray(certificate.controlledPoints)
        ? certificate.controlledPoints
        : [],
      measuringInstruments: Array.isArray(certificate.measuringInstruments)
        ? certificate.measuringInstruments.join("\n")
        : "",
      measurementsText: objectToLines(certificate.measurements, [
        "boilerSizingAssessment",
      ]),
      boilerSizingAssessment:
        certificate.measurements?.boilerSizingAssessment || "",
      pollutantEmissionsText: objectToLines(certificate.pollutantEmissions),
      issuanceAccepted: false,
    });

    setEditingCertificateId(certificate.id);
    setFormOpen(false);
    setError("");
    setSuccess("");
  }
  async function handleSubmit(event) {
    event.preventDefault();

    if (submitting) return;

    if (!session?.access_token) {
      setError("Votre session a expiré. Reconnectez-vous.");
      return;
    }

    if (!form.interventionId) {
      setError("Sélectionnez une intervention d’entretien.");
      return;
    }

    if (!form.customerName.trim()) {
      setError("Renseignez le nom du commanditaire.");
      return;
    }

    if (!form.customerAddress.trim()) {
      setError("Renseignez l’adresse du commanditaire.");
      return;
    }

    if (!form.installationAddress.trim()) {
      setError("Renseignez l’adresse de l’installation.");
      return;
    }

    if (!form.boilerLocation.trim()) {
      setError("Renseignez le local où se trouve la chaudière.");
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
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            interventionId: form.interventionId,
            customer: {
              name: form.customerName.trim(),
              address: form.customerAddress.trim(),
            },
            installation: {
              address: form.installationAddress.trim(),
              boilerLocation: form.boilerLocation.trim(),
            },
          }),
        },
      );

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || "Le brouillon n’a pas pu être créé.");
      }

      const certificate = result?.certificate;

      if (certificate?.id) {
        setCertificates((currentCertificates) => {
          const filtered = currentCertificates.filter(
            (item) => item.id !== certificate.id,
          );

          return [certificate, ...filtered];
        });
      }

      setSuccess(
        result?.alreadyExists
          ? "Le brouillon existait déjà."
          : "Brouillon de l’attestation créé.",
      );

      setForm(EMPTY_FORM);
      setFormOpen(false);
    } catch (submitError) {
      setError(submitError?.message || "Le brouillon n’a pas pu être créé.");
    } finally {
      setSubmitting(false);
    }
  }
  async function handleSaveDetails(event) {
    event.preventDefault();

    const action =
      event.nativeEvent?.submitter?.value === "issue" ? "issue" : "save";

    if (savingDetails) return;

    if (!session?.access_token) {
      setError("Votre session a expiré. Reconnectez-vous.");
      return;
    }

    if (!detailsForm.certificateId) {
      setError("Le brouillon sélectionné est invalide.");
      return;
    }

    if (action === "issue" && !detailsForm.issuanceAccepted) {
      setError("Cochez la confirmation avant l’émission définitive.");
      return;
    }

    if (
      action === "issue" &&
      !window.confirm(
        "Émettre définitivement cette attestation ? Elle ne pourra plus être modifiée.",
      )
    ) {
      return;
    }

    setSavingDetails(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        "/api/interventions?resource=boiler-certificates",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action,
            issuanceAccepted: detailsForm.issuanceAccepted,
            certificateId: detailsForm.certificateId,
            boilerEnergy: detailsForm.boilerEnergy,
            flueExhaustType: detailsForm.flueExhaustType,
            commissioningDate: detailsForm.commissioningDate,
            nominalPowerKw: detailsForm.nominalPowerKw,

            forcedAirBurner: detailsForm.hasForcedAirBurner
              ? {
                  brand: detailsForm.forcedAirBurnerBrand.trim(),
                  model: detailsForm.forcedAirBurnerModel.trim(),
                  date: detailsForm.forcedAirBurnerDate || null,
                }
              : null,

            previousMaintenanceDate: detailsForm.previousMaintenanceDate,
            previousChimneySweepingDate:
              detailsForm.previousChimneySweepingDate,

            controlledPoints: detailsForm.controlledPoints,

            measuringInstruments: detailsForm.measuringInstruments
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),

            measurements: {
              ...linesToObject(
                detailsForm.measurementsText,
                "Mesures techniques",
              ),
              ...(detailsForm.boilerSizingAssessment.trim()
                ? {
                    boilerSizingAssessment:
                      detailsForm.boilerSizingAssessment.trim(),
                  }
                : {}),
            },

            ambientCoPpm: detailsForm.ambientCoPpm,
            boilerEfficiencyPercent: detailsForm.boilerEfficiencyPercent,
            referenceEfficiencyPercent: detailsForm.referenceEfficiencyPercent,

            pollutantEmissions: linesToObject(
              detailsForm.pollutantEmissionsText,
              "Émissions polluantes",
            ),

            adviceGoodUse: detailsForm.adviceGoodUse,
            adviceImprovements: detailsForm.adviceImprovements,
            adviceReplacement: detailsForm.adviceReplacement,
            boilerEnergyClass: detailsForm.boilerEnergyClass,
            replacementEnergyClasses: detailsForm.replacementEnergyClasses,
          }),
        },
      );

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.error || "Le brouillon n’a pas pu être enregistré.",
        );
      }

      const certificate = result?.certificate;

      if (certificate?.id) {
        setCertificates((currentCertificates) =>
          currentCertificates.map((item) =>
            item.id === certificate.id ? certificate : item,
          ),
        );
      }

      setSuccess(
        action === "issue"
          ? `Attestation émise définitivement${
              certificate?.certificateNumber
                ? ` — ${certificate.certificateNumber}`
                : ""
            }.`
          : "Brouillon enregistré.",
      );
      setEditingCertificateId("");
      setDetailsForm(EMPTY_DETAILS_FORM);
      if (action === "issue" && certificate) {
        setPreviewCertificate(certificate);
      }
    } catch (saveError) {
      setError(
        saveError?.message || "Le brouillon n’a pas pu être enregistré.",
      );
    } finally {
      setSavingDetails(false);
    }
  }
  if (
    !loading &&
    eligibleInterventions.length === 0 &&
    visibleCertificates.length === 0 &&
    !selectedEquipmentId
  ) {
    return null;
  }

  return (
    <section
      className={
        embedded ? "pro-equipment-workspace-module" : "pro-dashboard-grid"
      }
      aria-labelledby="boiler-certificate-title"
    >
      <article
        className={`pro-dashboard-card pro-equipment-card${
          embedded ? " pro-dashboard-card--embedded" : ""
        }`}
        style={{ gridColumn: "1 / -1" }}
      >
        <div>
          <span className="pro-dashboard-icon" aria-hidden="true">
            📋
          </span>

          <h2 id="boiler-certificate-title">
            {selectedEquipment
              ? "Attestations de la chaudière"
              : "Attestations d’entretien chaudière"}
          </h2>

          <p>
            Une attestation réglementaire distincte est conservée pour chaque
            chaudière entretenue.
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
          eligibleInterventions.length === 0 &&
          visibleCertificates.length === 0 && (
            <p className="pro-intervention-history-empty">
              Aucune intervention d’entretien confirmée ne permet encore de
              créer une attestation pour cette chaudière.
            </p>
          )}

        {!loading && availableInterventions.length > 0 && !formOpen && (
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
                <option value="">Sélectionner une intervention</option>

                {availableInterventions.map((intervention) => {
                  const equipment = equipmentById[intervention.equipmentId];

                  return (
                    <option key={intervention.id} value={intervention.id}>
                      {equipment
                        ? `${equipment.brand} ${equipment.model} — ${equipment.serial_number}`
                        : intervention.carnetPassId}
                      {" — "}
                      {formatDate(intervention.interventionAt)}
                    </option>
                  );
                })}
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
              Cette étape crée uniquement un brouillon. L’attestation ne sera
              pas encore émise.
            </p>

            <div className="pro-form-row">
              <button
                className="pro-primary-button"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "Création du brouillon…" : "Créer le brouillon"}
              </button>

              <button
                className="pro-action-card-button"
                type="button"
                disabled={submitting}
                onClick={() => {
                  setFormOpen(false);
                  setForm(EMPTY_FORM);
                  setError("");
                  onClose?.();
                }}
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        {visibleCertificates.length > 0 && (
          <ul className="pro-regulatory-list">
            {visibleCertificates.map((certificate) => (
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
                <button
                  className="pro-action-card-button"
                  type="button"
                  onClick={() => setPreviewCertificate(certificate)}
                >
                  Voir l’attestation
                </button>
                {certificate.status === "draft" && (
                  <button
                    className="pro-action-card-button"
                    type="button"
                    onClick={() => openDetailsForm(certificate)}
                    disabled={savingDetails}
                  >
                    Compléter le brouillon
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {editingCertificateId && (
          <form
            className="pro-form pro-equipment-form"
            onSubmit={handleSaveDetails}
            aria-busy={savingDetails}
          >
            <h3>Compléter l’attestation</h3>

            <label>
              <span>Énergie de la chaudière</span>
              <select
                name="boilerEnergy"
                value={detailsForm.boilerEnergy}
                onChange={handleDetailsChange}
                disabled={savingDetails}
              >
                <option value="">Sélectionner</option>
                <option value="natural_gas">Gaz naturel</option>
                <option value="propane">Propane</option>
                <option value="fuel_oil">Fioul domestique</option>
                <option value="wood">Bois</option>
                <option value="other">Autre</option>
              </select>
            </label>

            <label>
              <span>Type d’évacuation des fumées</span>
              <select
                name="flueExhaustType"
                value={detailsForm.flueExhaustType}
                onChange={handleDetailsChange}
                disabled={savingDetails}
              >
                <option value="">Sélectionner</option>
                <option value="chimney">Conduit de cheminée</option>
                <option value="sealed">Ventouse / circuit étanche</option>
                <option value="vmc_gas">VMC gaz</option>
                <option value="other">Autre</option>
              </select>
            </label>

            <label>
              <span>Date de mise en service</span>
              <input
                type="date"
                name="commissioningDate"
                value={detailsForm.commissioningDate}
                onChange={handleDetailsChange}
                disabled={savingDetails}
              />
            </label>

            <label>
              <span>Puissance nominale (kW)</span>
              <input
                type="number"
                name="nominalPowerKw"
                value={detailsForm.nominalPowerKw}
                onChange={handleDetailsChange}
                min="0"
                step="0.01"
                disabled={savingDetails}
              />
            </label>
            <fieldset className="pro-controlled-points">
              <legend>Brûleur à air soufflé</legend>

              <label>
                <input
                  type="checkbox"
                  checked={detailsForm.hasForcedAirBurner}
                  onChange={(event) => {
                    const checked = event.target.checked;

                    setDetailsForm((currentForm) => ({
                      ...currentForm,
                      hasForcedAirBurner: checked,
                      ...(checked
                        ? {}
                        : {
                            forcedAirBurnerBrand: "",
                            forcedAirBurnerModel: "",
                            forcedAirBurnerDate: "",
                          }),
                    }));

                    setError("");
                    setSuccess("");
                  }}
                  disabled={savingDetails}
                />

                <span>La chaudière possède un brûleur à air soufflé</span>
              </label>

              {detailsForm.hasForcedAirBurner && (
                <>
                  <label className="pro-burner-detail">
                    <span>Marque du brûleur *</span>
                    <input
                      type="text"
                      name="forcedAirBurnerBrand"
                      value={detailsForm.forcedAirBurnerBrand}
                      onChange={handleDetailsChange}
                      maxLength={200}
                      disabled={savingDetails}
                      required
                    />
                  </label>

                  <label className="pro-burner-detail">
                    <span>Modèle du brûleur *</span>
                    <input
                      type="text"
                      name="forcedAirBurnerModel"
                      value={detailsForm.forcedAirBurnerModel}
                      onChange={handleDetailsChange}
                      maxLength={200}
                      disabled={savingDetails}
                      required
                    />
                  </label>

                  <label className="pro-burner-detail">
                    <span>Date du brûleur, si disponible</span>
                    <input
                      type="date"
                      name="forcedAirBurnerDate"
                      value={detailsForm.forcedAirBurnerDate}
                      onChange={handleDetailsChange}
                      disabled={savingDetails}
                    />
                  </label>
                </>
              )}
            </fieldset>
            <label>
              <span>Date du précédent entretien</span>
              <input
                type="date"
                name="previousMaintenanceDate"
                value={detailsForm.previousMaintenanceDate}
                onChange={handleDetailsChange}
                disabled={savingDetails}
              />
            </label>

            <label>
              <span>Date du précédent ramonage</span>
              <input
                type="date"
                name="previousChimneySweepingDate"
                value={detailsForm.previousChimneySweepingDate}
                onChange={handleDetailsChange}
                disabled={savingDetails}
              />
            </label>

            <fieldset className="pro-controlled-points">
              <legend>Points contrôlés</legend>

              {CONTROLLED_POINT_OPTIONS.map((point) => (
                <label key={point}>
                  <input
                    type="checkbox"
                    checked={detailsForm.controlledPoints.includes(point)}
                    onChange={() => toggleControlledPoint(point)}
                    disabled={savingDetails}
                  />
                  <span>{point}</span>
                </label>
              ))}
            </fieldset>

            <label>
              <span>Appareils de mesure utilisés (un appareil par ligne)</span>
              <textarea
                name="measuringInstruments"
                value={detailsForm.measuringInstruments}
                onChange={handleDetailsChange}
                rows={4}
                maxLength={2_000}
                placeholder={
                  "Analyseur de combustion TESTO 300\nDétecteur CO TESTO 317-3"
                }
                disabled={savingDetails}
              />
            </label>
            <label>
              <span>Autres mesures techniques (une mesure par ligne)</span>

              <textarea
                name="measurementsText"
                value={detailsForm.measurementsText}
                onChange={handleDetailsChange}
                rows={5}
                maxLength={4_000}
                placeholder={
                  "Pression chauffage : 1,5 bar\nTempérature des fumées : 65 °C"
                }
                disabled={savingDetails}
              />

              <small>Format obligatoire : nom de la mesure : valeur</small>
            </label>

            <label>
              <span>Évaluation du dimensionnement de la chaudière</span>

              <select
                name="boilerSizingAssessment"
                value={detailsForm.boilerSizingAssessment}
                onChange={handleDetailsChange}
                disabled={savingDetails}
              >
                <option value="">Non évalué</option>
                <option value="appropriate">Dimensionnement adapté</option>
                <option value="oversized">
                  Chaudière probablement surdimensionnée
                </option>
                <option value="undersized">
                  Chaudière probablement sous-dimensionnée
                </option>
                <option value="not_evaluable">
                  Impossible à évaluer pendant la visite
                </option>
              </select>
            </label>
            <label>
              <span>Monoxyde de carbone ambiant (ppm)</span>
              <input
                type="number"
                name="ambientCoPpm"
                value={detailsForm.ambientCoPpm}
                onChange={handleDetailsChange}
                min="0"
                step="0.01"
                disabled={savingDetails}
              />
            </label>

            <label>
              <span>Rendement de la chaudière (%)</span>
              <input
                type="number"
                name="boilerEfficiencyPercent"
                value={detailsForm.boilerEfficiencyPercent}
                onChange={handleDetailsChange}
                min="0"
                max="100"
                step="0.01"
                disabled={savingDetails}
              />
            </label>

            <label>
              <span>Rendement de référence (%)</span>
              <input
                type="number"
                name="referenceEfficiencyPercent"
                value={detailsForm.referenceEfficiencyPercent}
                onChange={handleDetailsChange}
                min="0"
                max="100"
                step="0.01"
                disabled={savingDetails}
              />
            </label>
            <label>
              <span>Émissions polluantes mesurées (une mesure par ligne)</span>

              <textarea
                name="pollutantEmissionsText"
                value={detailsForm.pollutantEmissionsText}
                onChange={handleDetailsChange}
                rows={4}
                maxLength={4_000}
                placeholder={"NOx : 45 mg/kWh\nCO fumées : 12 ppm"}
                disabled={savingDetails}
              />

              <small>Format obligatoire : nom du polluant : valeur</small>
            </label>
            <label>
              <span>Classe énergétique de la chaudière</span>
              <select
                name="boilerEnergyClass"
                value={detailsForm.boilerEnergyClass}
                onChange={handleDetailsChange}
                disabled={savingDetails}
              >
                <option value="">Non renseignée</option>
                <option value="A+++">A+++</option>
                <option value="A++">A++</option>
                <option value="A+">A+</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
                <option value="E">E</option>
                <option value="F">F</option>
                <option value="G">G</option>
              </select>
            </label>
            <fieldset className="pro-controlled-points">
              <legend>
                Classes énergétiques conseillées en cas de remplacement
              </legend>

              <p className="pro-form-notice">
                Facultatif : sélectionnez uniquement les classes adaptées au
                conseil donné au client.
              </p>

              {ENERGY_CLASS_OPTIONS.map((energyClass) => (
                <label key={energyClass}>
                  <input
                    type="checkbox"
                    checked={detailsForm.replacementEnergyClasses.includes(
                      energyClass,
                    )}
                    onChange={() => toggleReplacementEnergyClass(energyClass)}
                    disabled={savingDetails}
                  />

                  <span>{energyClass}</span>
                </label>
              ))}
            </fieldset>
            <label>
              <span>Conseils de bon usage</span>
              <textarea
                name="adviceGoodUse"
                value={detailsForm.adviceGoodUse}
                onChange={handleDetailsChange}
                rows={3}
                maxLength={2_000}
                disabled={savingDetails}
              />
            </label>

            <label>
              <span>Améliorations possibles</span>
              <textarea
                name="adviceImprovements"
                value={detailsForm.adviceImprovements}
                onChange={handleDetailsChange}
                rows={3}
                maxLength={2_000}
                disabled={savingDetails}
              />
            </label>

            <label>
              <span>Conseils de remplacement</span>
              <textarea
                name="adviceReplacement"
                value={detailsForm.adviceReplacement}
                onChange={handleDetailsChange}
                rows={3}
                maxLength={2_000}
                disabled={savingDetails}
              />
            </label>

            <p className="pro-form-notice">
              Le niveau de risque lié au monoxyde de carbone est calculé
              automatiquement à partir de la mesure saisie.
            </p>

            <label className="pro-issuance-confirmation">
              <input
                name="issuanceAccepted"
                type="checkbox"
                checked={detailsForm.issuanceAccepted}
                onChange={handleDetailsChange}
                disabled={savingDetails}
              />
              <span>
                Je confirme l’exactitude des informations. Je comprends qu’après
                émission l’attestation sera définitive et non modifiable.
              </span>
            </label>

            <div className="pro-form-row">
              <button
                className="pro-primary-button"
                type="submit"
                name="certificateAction"
                value="save"
                disabled={savingDetails}
              >
                {savingDetails ? "Enregistrement…" : "Enregistrer le brouillon"}
              </button>

              <button
                className="pro-primary-button pro-issue-button"
                type="submit"
                name="certificateAction"
                value="issue"
                disabled={savingDetails || !detailsForm.issuanceAccepted}
              >
                {savingDetails ? "Traitement…" : "Émettre définitivement"}
              </button>

              <button
                className="pro-action-card-button"
                type="button"
                disabled={savingDetails}
                onClick={() => {
                  setEditingCertificateId("");
                  setDetailsForm(EMPTY_DETAILS_FORM);
                  setError("");
                  onClose?.();
                }}
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </article>
      <AttestationModal
        certificate={previewCertificate}
        onClose={() => setPreviewCertificate(null)}
      />
    </section>
  );
}

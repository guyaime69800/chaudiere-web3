import { useEffect, useMemo, useRef, useState } from "react";
import BoilerMaintenanceCertificateForm from "./BoilerMaintenanceCertificateForm";
import InterventionForm from "./InterventionForm";
import "./EquipmentWorkspace.css";

const WORKSPACE_TABS = [
  { id: "summary", label: "Synthèse" },
  { id: "history", label: "Interventions" },
  { id: "regulatory", label: "Attestations / CERFA" },
  { id: "documents", label: "Documents" },
  { id: "traceability", label: "Traçabilité" },
];

function getEquipmentTypeLabel(type) {
  const labels = {
    boiler: "Chaudière",
    heat_pump: "Pompe à chaleur",
    air_conditioning: "Climatisation",
    vmc: "VMC",
    rooftop: "Rooftop",
    other: "Autre équipement",
  };

  return labels[type] || "Équipement";
}

function formatDate(value, withTime = false) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date non renseignée";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
  }).format(date);
}

function certificateBelongsToEquipment(
  certificate,
  equipment,
  interventionIds,
) {
  if (interventionIds.has(String(certificate?.interventionId || ""))) {
    return true;
  }

  const equipmentId = String(equipment?.id || "");
  const serialNumber = String(equipment?.serial_number || "");
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

function getCarnetPassPresentation(status, loading, error) {
  if (loading && !status) {
    return {
      label: "Vérification du CarnetPass…",
      buttonLabel: "Vérification…",
      tone: "neutral",
      disabled: true,
    };
  }

  if (error || !status) {
    return {
      label: "Statut CarnetPass indisponible",
      buttonLabel: "Statut indisponible",
      tone: "warning",
      disabled: true,
    };
  }

  if (status.status === "active") {
    return {
      label: "CarnetPass actif",
      buttonLabel: "Voir le CarnetPass",
      tone: "success",
      disabled: false,
    };
  }

  if (status.status === "blockchain_pending") {
    return {
      label: "Confirmation Polygon en cours",
      buttonLabel: "Confirmation Polygon…",
      tone: "pending",
      disabled: true,
    };
  }

  if (status.exists) {
    return {
      label: "CarnetPass momentanément indisponible",
      buttonLabel: "CarnetPass indisponible",
      tone: "warning",
      disabled: true,
    };
  }

  return {
    label: "CarnetPass à créer",
    buttonLabel: "Créer le CarnetPass",
    tone: "neutral",
    disabled: false,
  };
}

export default function EquipmentWorkspace({
  session,
  company,
  equipment,
  carnetPassStatus,
  carnetPassStatusLoading = false,
  carnetPassStatusError = "",
  interventions = [],
  interventionLoading = false,
  interventionLoadError = "",
  boilerCertificates = [],
  boilerCertificatesLoading = false,
  onClose,
  onOpenCarnetPass,
  onInterventionCreated,
  onCertificatesChange,
}) {
  const [activeTab, setActiveTab] = useState("summary");
  const [requestedInterventionId, setRequestedInterventionId] = useState("");
  const workspaceRef = useRef(null);

  const equipmentInterventions = useMemo(
    () =>
      interventions.filter(
        (intervention) =>
          String(intervention.equipmentId) === String(equipment.id),
      ),
    [equipment.id, interventions],
  );

  const interventionIds = useMemo(
    () =>
      new Set(
        equipmentInterventions.map((intervention) => String(intervention.id)),
      ),
    [equipmentInterventions],
  );

  const equipmentCertificates = useMemo(
    () =>
      boilerCertificates.filter((certificate) =>
        certificateBelongsToEquipment(certificate, equipment, interventionIds),
      ),
    [boilerCertificates, equipment, interventionIds],
  );

  const latestIntervention = useMemo(
    () =>
      [...equipmentInterventions].sort(
        (left, right) =>
          new Date(right.interventionAt).getTime() -
          new Date(left.interventionAt).getTime(),
      )[0] || null,
    [equipmentInterventions],
  );

  const confirmedInterventionCount = equipmentInterventions.filter(
    (intervention) => intervention.polygonState === "confirmed",
  ).length;

  const issuedCertificateCount = equipmentCertificates.filter(
    (certificate) => certificate.status === "issued",
  ).length;

  const draftCertificateCount = equipmentCertificates.filter(
    (certificate) => certificate.status === "draft",
  ).length;

  const carnetPassPresentation = getCarnetPassPresentation(
    carnetPassStatus,
    carnetPassStatusLoading,
    carnetPassStatusError,
  );

  useEffect(() => {
    setActiveTab("summary");
    setRequestedInterventionId("");

    window.requestAnimationFrame(() => {
      workspaceRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [equipment.id]);

  function openRegulatoryDocument(interventionId) {
    setRequestedInterventionId(interventionId);
    setActiveTab("regulatory");
  }

  function renderTabLabel(tab) {
    if (tab.id === "history" && equipmentInterventions.length > 0) {
      return `${tab.label} (${equipmentInterventions.length})`;
    }

    if (tab.id === "regulatory" && equipmentCertificates.length > 0) {
      return `${tab.label} (${equipmentCertificates.length})`;
    }

    return tab.label;
  }

  function handleTabKeyDown(event, currentIndex) {
    const supportedKeys = ["ArrowLeft", "ArrowRight", "Home", "End"];

    if (!supportedKeys.includes(event.key)) return;

    event.preventDefault();

    let nextIndex = currentIndex;

    if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = WORKSPACE_TABS.length - 1;
    } else if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % WORKSPACE_TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + WORKSPACE_TABS.length) % WORKSPACE_TABS.length;
    }

    const nextTab = WORKSPACE_TABS[nextIndex];
    setActiveTab(nextTab.id);

    window.requestAnimationFrame(() => {
      document.getElementById(`equipment-tab-${nextTab.id}`)?.focus();
    });
  }

  return (
    <section
      ref={workspaceRef}
      id="equipment-workspace"
      className="equipment-workspace"
      aria-labelledby="equipment-workspace-title"
    >
      <header className="equipment-workspace__header">
        <div className="equipment-workspace__identity">
          <span className="equipment-workspace__eyebrow">
            DOSSIER ÉQUIPEMENT
          </span>
          <h2 id="equipment-workspace-title">
            {equipment.brand} {equipment.model}
          </h2>
          <div className="equipment-workspace__metadata">
            <span>{getEquipmentTypeLabel(equipment.equipment_type)}</span>
            <span>N° de série : {equipment.serial_number}</span>
            {equipment.product_reference && (
              <span>Réf. produit : {equipment.product_reference}</span>
            )}
          </div>
          <span
            className={`equipment-workspace__status equipment-workspace__status--${carnetPassPresentation.tone}`}
          >
            {carnetPassPresentation.label}
          </span>
        </div>

        <div className="equipment-workspace__header-actions">
          <button
            className="pro-primary-button"
            type="button"
            disabled={carnetPassPresentation.disabled}
            onClick={onOpenCarnetPass}
          >
            {carnetPassPresentation.buttonLabel}
          </button>
          <button
            className="pro-action-card-button"
            type="button"
            onClick={onClose}
          >
            Fermer le dossier
          </button>
        </div>
      </header>

      <nav
        className="equipment-workspace__tabs"
        aria-label="Rubriques du dossier équipement"
        role="tablist"
      >
        {WORKSPACE_TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`equipment-tab-${tab.id}`}
            className={activeTab === tab.id ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`equipment-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            {renderTabLabel(tab)}
          </button>
        ))}
      </nav>

      <div
        id={`equipment-panel-${activeTab}`}
        className="equipment-workspace__panel"
        role="tabpanel"
        aria-labelledby={`equipment-tab-${activeTab}`}
      >
        {activeTab === "summary" && (
          <div className="equipment-workspace__summary">
            <article>
              <span>Interventions enregistrées</span>
              <strong>
                {interventionLoading ? "…" : equipmentInterventions.length}
              </strong>
              <small>
                {latestIntervention
                  ? `Dernière intervention : ${formatDate(
                      latestIntervention.interventionAt,
                      true,
                    )}`
                  : "Aucune intervention pour cet équipement"}
              </small>
              <button type="button" onClick={() => setActiveTab("history")}>
                Ouvrir l’historique
              </button>
            </article>

            <article>
              <span>Documents réglementaires</span>
              <strong>
                {boilerCertificatesLoading ? "…" : equipmentCertificates.length}
              </strong>
              <small>
                {issuedCertificateCount} émise
                {issuedCertificateCount > 1 ? "s" : ""}
                {draftCertificateCount > 0
                  ? ` · ${draftCertificateCount} brouillon${
                      draftCertificateCount > 1 ? "s" : ""
                    }`
                  : ""}
              </small>
              <button type="button" onClick={() => setActiveTab("regulatory")}>
                Voir les attestations
              </button>
            </article>

            <article>
              <span>Preuves Polygon</span>
              <strong>{confirmedInterventionCount}</strong>
              <small>
                Empreinte confirmée pour chaque intervention validée
              </small>
              <button
                type="button"
                onClick={() => setActiveTab("traceability")}
              >
                Voir la traçabilité
              </button>
            </article>
          </div>
        )}

        {activeTab === "history" && (
          <InterventionForm
            embedded
            selectedEquipmentId={equipment.id}
            session={session}
            company={company}
            equipments={[equipment]}
            carnetPassStatuses={{
              [equipment.id]: carnetPassStatus,
            }}
            carnetPassStatusLoading={carnetPassStatusLoading}
            interventions={equipmentInterventions}
            boilerCertificates={equipmentCertificates}
            boilerCertificatesLoading={boilerCertificatesLoading}
            interventionLoading={interventionLoading}
            interventionLoadError={interventionLoadError}
            onOpenRegulatoryDocument={openRegulatoryDocument}
            onInterventionCreated={onInterventionCreated}
          />
        )}

        {activeTab === "regulatory" &&
          (equipment.equipment_type === "boiler" ? (
            <BoilerMaintenanceCertificateForm
              embedded
              selectedEquipmentId={equipment.id}
              session={session}
              interventions={equipmentInterventions}
              equipments={[equipment]}
              requestedInterventionId={requestedInterventionId}
              onCertificatesChange={onCertificatesChange}
              onRequestHandled={() => setRequestedInterventionId("")}
              onClose={() => {
                setRequestedInterventionId("");
                setActiveTab("summary");
              }}
            />
          ) : (
            <div className="equipment-workspace__empty-state">
              <span aria-hidden="true">📋</span>
              <h3>Documents réglementaires de l’équipement</h3>
              <p>
                Les attestations PAC, les fiches d’intervention climatisation et
                les CERFA fluides frigorigènes seront ajoutés ici selon le type
                d’équipement.
              </p>
            </div>
          ))}

        {activeTab === "documents" && (
          <div className="equipment-workspace__documents">
            <article>
              <span aria-hidden="true">📄</span>
              <div>
                <h3>Rapports d’intervention</h3>
                <p>
                  {confirmedInterventionCount} rapport
                  {confirmedInterventionCount > 1 ? "s" : ""} PDF disponible
                  {confirmedInterventionCount > 1 ? "s" : ""} depuis
                  l’historique.
                </p>
              </div>
              <button type="button" onClick={() => setActiveTab("history")}>
                Voir les rapports
              </button>
            </article>

            <article>
              <span aria-hidden="true">✅</span>
              <div>
                <h3>Attestations et CERFA</h3>
                <p>
                  {equipmentCertificates.length} document
                  {equipmentCertificates.length > 1 ? "s" : ""}
                  réglementaire
                  {equipmentCertificates.length > 1 ? "s" : ""} lié
                  {equipmentCertificates.length > 1 ? "s" : ""} à cet
                  équipement.
                </p>
              </div>
              <button type="button" onClick={() => setActiveTab("regulatory")}>
                Voir les documents
              </button>
            </article>

            <article className="is-upcoming">
              <span aria-hidden="true">📎</span>
              <div>
                <h3>Pièces jointes privées</h3>
                <p>
                  Photos, factures, devis, notices et autres justificatifs
                  seront déposés ici lors de l’étape multi-documents.
                </p>
              </div>
              <small>Prochaine étape</small>
            </article>
          </div>
        )}

        {activeTab === "traceability" && (
          <div className="equipment-workspace__traceability">
            <article>
              <h3>État du CarnetPass</h3>
              <span
                className={`equipment-workspace__status equipment-workspace__status--${carnetPassPresentation.tone}`}
              >
                {carnetPassPresentation.label}
              </span>
              {carnetPassStatus?.carnetPassId && (
                <p>
                  Identifiant : <strong>{carnetPassStatus.carnetPassId}</strong>
                </p>
              )}
              {carnetPassStatusError && (
                <p className="pro-form-error" role="alert">
                  {carnetPassStatusError}
                </p>
              )}
              <button
                className="pro-primary-button"
                type="button"
                disabled={carnetPassPresentation.disabled}
                onClick={onOpenCarnetPass}
              >
                {carnetPassPresentation.buttonLabel}
              </button>
            </article>

            <article>
              <h3>Preuves d’intervention</h3>
              <strong>{confirmedInterventionCount}</strong>
              <p>
                Seule l’empreinte cryptographique est publiée sur Polygon. Les
                informations professionnelles restent conservées dans l’espace
                privé de l’entreprise.
              </p>
            </article>
          </div>
        )}
      </div>
    </section>
  );
}

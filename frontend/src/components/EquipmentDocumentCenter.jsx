import { useEffect, useMemo, useState } from "react";
import { getEquipmentDocumentLibrary } from "../services/equipmentKnowledge";
import DocumentPreviewModal from "./DocumentPreviewModal";
import "./EquipmentDocumentCenter.css";

const DOCUMENT_FILTERS = [
  { id: "all", label: "Tous" },
  { id: "technical_manual", label: "Notices techniques" },
  { id: "exploded_view", label: "Vues éclatées" },
  { id: "user_manual", label: "Notices utilisateur" },
  { id: "diagram", label: "Schémas" },
  { id: "other", label: "Autres" },
];

const DOCUMENT_TYPE_PRESENTATIONS = {
  installation_maintenance: {
    category: "technical_manual",
    icon: "📘",
    label: "Notice technique",
  },
  service_manual: {
    category: "technical_manual",
    icon: "🛠️",
    label: "Manuel de maintenance",
  },
  technical_manual: {
    category: "technical_manual",
    icon: "📘",
    label: "Documentation technique",
  },
  exploded_view: {
    category: "exploded_view",
    icon: "🧩",
    label: "Vue éclatée",
  },
  spare_parts_catalog: {
    category: "exploded_view",
    icon: "⚙️",
    label: "Catalogue de pièces",
  },
  user_manual: {
    category: "user_manual",
    icon: "📗",
    label: "Notice utilisateur",
  },
  electrical_diagram: {
    category: "diagram",
    icon: "⚡",
    label: "Schéma électrique",
  },
  hydraulic_diagram: {
    category: "diagram",
    icon: "💧",
    label: "Schéma hydraulique",
  },
};

function getDocumentPresentation(documentType) {
  return (
    DOCUMENT_TYPE_PRESENTATIONS[documentType] || {
      category: "other",
      icon: "📄",
      label: "Document constructeur",
    }
  );
}

function formatDocumentRevision(value) {
  if (!value) return "Version constructeur";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return `Révision ${new Intl.DateTimeFormat("fr-FR", {
    month: "short",
    year: "numeric",
  }).format(date)}`;
}

function createDocumentFileName(technicalDocument, equipment) {
  const documentLabel = getDocumentPresentation(
    technicalDocument?.documentType,
  ).label;
  const rawName = [equipment?.brand, equipment?.model, documentLabel]
    .filter(Boolean)
    .join("-");
  const safeName = rawName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${safeName || "document-carnetpass"}.pdf`;
}

export default function EquipmentDocumentCenter({
  equipment,
  carnetPassId = "",
  reportCount = 0,
  certificateCount = 0,
  onOpenHistory,
  onOpenRegulatory,
  onTechnicalDocumentCountChange,
}) {
  const [technicalDocuments, setTechnicalDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [documentFilter, setDocumentFilter] = useState("all");
  const [selectedDocument, setSelectedDocument] = useState(null);

  const availableDocumentFilters = useMemo(
    () =>
      DOCUMENT_FILTERS.map((filter) => ({
        ...filter,
        count:
          filter.id === "all"
            ? technicalDocuments.length
            : technicalDocuments.filter(
                (technicalDocument) =>
                  getDocumentPresentation(technicalDocument.documentType)
                    .category === filter.id,
              ).length,
      })).filter((filter) => filter.id === "all" || filter.count > 0),
    [technicalDocuments],
  );

  const filteredTechnicalDocuments = useMemo(() => {
    if (documentFilter === "all") return technicalDocuments;

    return technicalDocuments.filter(
      (technicalDocument) =>
        getDocumentPresentation(technicalDocument.documentType).category ===
        documentFilter,
    );
  }, [documentFilter, technicalDocuments]);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setLoadError("");
    setTechnicalDocuments([]);
    setDocumentFilter("all");
    setSelectedDocument(null);
    onTechnicalDocumentCountChange?.(0);

    getEquipmentDocumentLibrary({
      brand: equipment.brand,
      model: equipment.model,
      product_reference: equipment.product_reference,
      carnetPassId,
    })
      .then((library) => {
        if (!active) return;

        setTechnicalDocuments(library.documents);
        onTechnicalDocumentCountChange?.(library.documents.length);
      })
      .catch((error) => {
        console.error("Chargement de la documentation impossible :", error);

        if (!active) return;

        setLoadError(
          "La documentation technique est momentanément indisponible.",
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    carnetPassId,
    equipment.brand,
    equipment.id,
    equipment.model,
    equipment.product_reference,
    onTechnicalDocumentCountChange,
  ]);

  return (
    <div className="equipment-workspace__documents">
      <section
        className="equipment-workspace__document-library"
        aria-labelledby="equipment-technical-documents-title"
      >
        <header className="equipment-workspace__document-heading">
          <div>
            <span>DOCUMENTATION CONSTRUCTEUR</span>
            <h3 id="equipment-technical-documents-title">
              Notices, vues éclatées et schémas
            </h3>
            <p>
              Les documents correspondent à la référence exacte de l’équipement
              et s’ouvrent sans quitter son dossier.
            </p>
          </div>

          <strong aria-live="polite">
            {loading
              ? "Chargement…"
              : `${technicalDocuments.length} document${
                  technicalDocuments.length > 1 ? "s" : ""
                }`}
          </strong>
        </header>

        {loading && (
          <div
            className="equipment-workspace__document-loading"
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true" />
            Recherche de la documentation correspondant à la référence
            constructeur…
          </div>
        )}

        {!loading && loadError && (
          <div
            className="equipment-workspace__document-message is-error"
            role="alert"
          >
            <span aria-hidden="true">⚠️</span>
            <div>
              <h4>Documentation indisponible</h4>
              <p>{loadError}</p>
            </div>
          </div>
        )}

        {!loading && !loadError && technicalDocuments.length === 0 && (
          <div className="equipment-workspace__document-message">
            <span aria-hidden="true">📚</span>
            <div>
              <h4>Documentation technique à compléter</h4>
              <p>
                Aucune notice n’est encore référencée pour
                {equipment.product_reference
                  ? ` la référence ${equipment.product_reference}`
                  : " cet équipement"}
                . L’équipement reste utilisable dans CarnetPass.
              </p>
            </div>
          </div>
        )}

        {!loading && !loadError && technicalDocuments.length > 0 && (
          <>
            <div
              className="equipment-workspace__document-filters"
              role="group"
              aria-label="Filtrer la documentation technique"
            >
              {availableDocumentFilters.map((filter) => (
                <button
                  key={filter.id}
                  className={documentFilter === filter.id ? "is-active" : ""}
                  type="button"
                  aria-pressed={documentFilter === filter.id}
                  onClick={() => setDocumentFilter(filter.id)}
                >
                  {filter.label}
                  <span>{filter.count}</span>
                </button>
              ))}
            </div>

            <div className="equipment-workspace__document-grid">
              {filteredTechnicalDocuments.map((technicalDocument) => {
                const presentation = getDocumentPresentation(
                  technicalDocument.documentType,
                );
                const documentVerified = String(
                  technicalDocument.verificationStatus || "",
                ).startsWith("verified");

                return (
                  <article
                    key={technicalDocument.documentId}
                    className="equipment-workspace__document-card"
                  >
                    <div className="equipment-workspace__document-card-header">
                      <span aria-hidden="true">{presentation.icon}</span>
                      <div>
                        <small>{presentation.label}</small>
                        <h4>{technicalDocument.title}</h4>
                      </div>
                    </div>

                    <dl className="equipment-workspace__document-details">
                      <div>
                        <dt>Source</dt>
                        <dd>
                          {technicalDocument.sourceName || equipment.brand}
                        </dd>
                      </div>
                      <div>
                        <dt>Référence</dt>
                        <dd>
                          {technicalDocument.documentCode ||
                            technicalDocument.manufacturerReference ||
                            equipment.product_reference ||
                            "Non renseignée"}
                        </dd>
                      </div>
                      <div>
                        <dt>Contenu</dt>
                        <dd>
                          {technicalDocument.pageCount
                            ? `${technicalDocument.pageCount} pages`
                            : "PDF constructeur"}
                        </dd>
                      </div>
                      <div>
                        <dt>Version</dt>
                        <dd>
                          {formatDocumentRevision(
                            technicalDocument.revisionDate,
                          )}
                        </dd>
                      </div>
                    </dl>

                    <div className="equipment-workspace__document-card-footer">
                      <span className={documentVerified ? "" : "is-neutral"}>
                        <span aria-hidden="true">
                          {documentVerified ? "✓" : "i"}
                        </span>
                        {documentVerified
                          ? "Document vérifié"
                          : "Source référencée"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedDocument(technicalDocument)}
                      >
                        Consulter
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section
        className="equipment-workspace__related-documents"
        aria-labelledby="equipment-related-documents-title"
      >
        <header>
          <span>DOCUMENTS DU DOSSIER</span>
          <h3 id="equipment-related-documents-title">
            Rapports et documents réglementaires
          </h3>
        </header>

        <div className="equipment-workspace__document-shortcuts">
          <article>
            <span aria-hidden="true">📄</span>
            <div>
              <h4>Rapports d’intervention</h4>
              <p>
                {reportCount} rapport{reportCount > 1 ? "s" : ""} PDF
                disponible{reportCount > 1 ? "s" : ""} dans l’historique.
              </p>
            </div>
            <button type="button" onClick={onOpenHistory}>
              Voir les rapports
            </button>
          </article>

          <article>
            <span aria-hidden="true">✅</span>
            <div>
              <h4>Attestations et CERFA</h4>
              <p>
                {certificateCount} document{certificateCount > 1 ? "s" : ""}
                réglementaire{certificateCount > 1 ? "s" : ""} lié
                {certificateCount > 1 ? "s" : ""} à cet équipement.
              </p>
            </div>
            <button type="button" onClick={onOpenRegulatory}>
              Voir les documents
            </button>
          </article>

          <article className="is-upcoming">
            <span aria-hidden="true">📎</span>
            <div>
              <h4>Pièces jointes privées</h4>
              <p>
                Photos, factures, devis et justificatifs seront ajoutés lors de
                la prochaine étape multi-documents.
              </p>
            </div>
            <small>À venir</small>
          </article>
        </div>
      </section>

      <DocumentPreviewModal
        open={Boolean(selectedDocument)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDocument(null);
          }
        }}
        eyebrow="DOCUMENT CONSTRUCTEUR"
        title={selectedDocument?.title || "Document technique"}
        subtitle={[
          selectedDocument?.sourceName || equipment.brand,
          selectedDocument
            ? getDocumentPresentation(selectedDocument.documentType).label
            : null,
          selectedDocument?.pageCount
            ? `${selectedDocument.pageCount} pages`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        documentUrl={selectedDocument?.documentUrl || ""}
        fileName={
          selectedDocument
            ? createDocumentFileName(selectedDocument, equipment)
            : "document-carnetpass.pdf"
        }
        downloadLabel="Télécharger le document"
      />
    </div>
  );
}

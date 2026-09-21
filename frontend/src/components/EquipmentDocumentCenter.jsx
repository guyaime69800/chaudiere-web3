import { useEffect, useMemo, useState } from "react";
import { getEquipmentDocumentLibrary } from "../services/equipmentKnowledge";
import {
  deleteEquipmentAttachment,
  downloadEquipmentAttachment,
  getAttachmentFile,
  getEquipmentAttachments,
  uploadEquipmentAttachment,
} from "../services/equipmentAttachmentsService";
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

const ATTACHMENT_KINDS = [
  { id: "photo", label: "Photo" },
  { id: "invoice", label: "Facture" },
  { id: "quote", label: "Devis" },
  { id: "proof", label: "Justificatif" },
  { id: "other", label: "Autre" },
];

function attachmentKindLabel(kind) {
  return ATTACHMENT_KINDS.find((item) => item.id === kind)?.label || "Document";
}

function formatFileSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "Taille inconnue";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

function formatAttachmentDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

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
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [attachmentError, setAttachmentError] = useState("");
  const [showAttachmentForm, setShowAttachmentForm] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentKind, setAttachmentKind] = useState("photo");
  const [attachmentTitle, setAttachmentTitle] = useState("");
  const [attachmentDescription, setAttachmentDescription] = useState("");
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentActionId, setAttachmentActionId] = useState("");
  const [attachmentPreview, setAttachmentPreview] = useState(null);

  useEffect(() => {
    return () => {
      if (attachmentPreview?.objectUrl) {
        URL.revokeObjectURL(attachmentPreview.objectUrl);
      }
    };
  }, [attachmentPreview]);
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

  async function loadAttachments({ quiet = false } = {}) {
    if (!equipment?.id) return;

    if (!quiet) setAttachmentsLoading(true);
    setAttachmentError("");

    try {
      const rows = await getEquipmentAttachments(equipment.id);
      setAttachments(rows);
    } catch (error) {
      console.error("Chargement des pièces jointes impossible :", error);
      setAttachmentError(error.message || "Chargement des pièces jointes impossible.");
    } finally {
      if (!quiet) setAttachmentsLoading(false);
    }
  }

  useEffect(() => {
    setAttachments([]);
    setShowAttachmentForm(false);
    setAttachmentFile(null);
    setAttachmentTitle("");
    setAttachmentDescription("");
    loadAttachments();
  }, [equipment.id]);

  async function handleAttachmentUpload(event) {
    event.preventDefault();

    if (!attachmentFile || !attachmentTitle.trim()) {
      setAttachmentError("Choisis un fichier et indique un titre.");
      return;
    }

    setAttachmentBusy(true);
    setAttachmentError("");

    try {
      await uploadEquipmentAttachment({
        file: attachmentFile,
        equipmentId: equipment.id,
        documentKind: attachmentKind,
        title: attachmentTitle.trim(),
        description: attachmentDescription.trim(),
      });

      setAttachmentFile(null);
      setAttachmentTitle("");
      setAttachmentDescription("");
      setShowAttachmentForm(false);

      // Le webhook Blob peut enregistrer les métadonnées quelques instants
      // après la fin de l'envoi. Deux actualisations couvrent ce court délai.
      await loadAttachments({ quiet: true });
      window.setTimeout(() => loadAttachments({ quiet: true }), 1200);
    } catch (error) {
      setAttachmentError(error.message || "Envoi du document impossible.");
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function handleAttachmentAction(attachment, action) {
    setAttachmentActionId(attachment.id);
    setAttachmentError("");

    try {
      if (action === "view") {
        const blob = await getAttachmentFile(attachment.id, "view");
        const objectUrl = URL.createObjectURL(blob);

        setAttachmentPreview({
          attachment,
          objectUrl,
          mimeType: blob.type || attachment.mimeType,
        });
      }

      if (action === "download") {
        await downloadEquipmentAttachment(attachment);
      }
    } catch (error) {
      setAttachmentError(error.message || "Document inaccessible.");
    } finally {
      setAttachmentActionId("");
    }
  }

  async function handleAttachmentDelete(attachment) {
    if (!window.confirm(`Supprimer définitivement « ${attachment.title} » ?`)) return;

    setAttachmentActionId(attachment.id);
    setAttachmentError("");

    try {
      await deleteEquipmentAttachment(attachment.id);
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
    } catch (error) {
      setAttachmentError(error.message || "Suppression impossible.");
    } finally {
      setAttachmentActionId("");
    }
  }

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
              : `${technicalDocuments.length} document${technicalDocuments.length > 1 ? "s" : ""
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

          <article>
            <span aria-hidden="true">📎</span>
            <div>
              <h4>Pièces jointes privées</h4>
              <p>
                {attachmentsLoading
                  ? "Chargement des documents…"
                  : `${attachments.length} fichier${attachments.length > 1 ? "s" : ""} privé${attachments.length > 1 ? "s" : ""} lié${attachments.length > 1 ? "s" : ""} à cet équipement.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAttachmentForm((current) => !current)}
            >
              {showAttachmentForm ? "Fermer" : "Ajouter un document"}
            </button>
          </article>
        </div>

        <div className="equipment-workspace__attachments">
          {showAttachmentForm && (
            <form
              className="equipment-workspace__attachment-form"
              onSubmit={handleAttachmentUpload}
            >
              <div className="equipment-workspace__attachment-form-heading">
                <div>
                  <h4>Ajouter une pièce jointe privée</h4>
                  <p>PDF, JPEG, PNG ou WebP — 10 Mo maximum.</p>
                </div>
              </div>

              <div className="equipment-workspace__attachment-fields">
                <label>
                  <span>Type de document</span>
                  <select
                    value={attachmentKind}
                    onChange={(event) => setAttachmentKind(event.target.value)}
                    disabled={attachmentBusy}
                  >
                    {ATTACHMENT_KINDS.map((kind) => (
                      <option key={kind.id} value={kind.id}>{kind.label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Titre</span>
                  <input
                    type="text"
                    value={attachmentTitle}
                    maxLength={160}
                    placeholder="Ex. Facture de remplacement"
                    onChange={(event) => setAttachmentTitle(event.target.value)}
                    disabled={attachmentBusy}
                    required
                  />
                </label>

                <label className="is-wide">
                  <span>Description (facultative)</span>
                  <textarea
                    value={attachmentDescription}
                    maxLength={1000}
                    rows={3}
                    placeholder="Informations utiles sur ce document"
                    onChange={(event) => setAttachmentDescription(event.target.value)}
                    disabled={attachmentBusy}
                  />
                </label>

                <label className="is-wide">
                  <span>Fichier</span>
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(event) => setAttachmentFile(event.target.files?.[0] || null)}
                    disabled={attachmentBusy}
                    required
                  />
                </label>
              </div>

              <div className="equipment-workspace__attachment-form-actions">
                <button
                  type="button"
                  className="is-secondary"
                  onClick={() => setShowAttachmentForm(false)}
                  disabled={attachmentBusy}
                >
                  Annuler
                </button>
                <button type="submit" disabled={attachmentBusy}>
                  {attachmentBusy ? "Envoi en cours…" : "Envoyer le document"}
                </button>
              </div>
            </form>
          )}

          {attachmentError && (
            <div className="equipment-workspace__attachment-error" role="alert">
              ⚠️ {attachmentError}
            </div>
          )}

          {!attachmentsLoading && attachments.length > 0 && (
            <div className="equipment-workspace__attachment-list">
              {attachments.map((attachment) => {
                const busy = attachmentActionId === attachment.id;

                return (
                  <article key={attachment.id}>
                    <div className="equipment-workspace__attachment-main">
                      <span aria-hidden="true">
                        {attachment.mimeType === "application/pdf" ? "📄" : "🖼️"}
                      </span>
                      <div>
                        <small>{attachmentKindLabel(attachment.documentKind)}</small>
                        <h4>{attachment.title}</h4>
                        <p>
                          {attachment.originalFilename} · {formatFileSize(attachment.sizeBytes)} · {formatAttachmentDate(attachment.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="equipment-workspace__attachment-actions">
                      <button type="button" disabled={busy} onClick={() => handleAttachmentAction(attachment, "view")}>Voir</button>
                      <button type="button" disabled={busy} onClick={() => handleAttachmentAction(attachment, "download")}>Télécharger</button>
                      {attachment.canDelete && (
                        <button type="button" className="is-danger" disabled={busy} onClick={() => handleAttachmentDelete(attachment)}>Supprimer</button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
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
      <DocumentPreviewModal
        open={Boolean(attachmentPreview)}
        onOpenChange={(open) => {
          if (!open) {
            setAttachmentPreview(null);
          }
        }}
        eyebrow="PIÈCE JOINTE PRIVÉE"
        title={attachmentPreview?.attachment?.title || "Document"}
        subtitle={[
          attachmentPreview?.attachment
            ? attachmentKindLabel(
              attachmentPreview.attachment.documentKind,
            )
            : null,
          attachmentPreview?.attachment?.originalFilename,
          attachmentPreview?.attachment
            ? formatFileSize(attachmentPreview.attachment.sizeBytes)
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        documentUrl={attachmentPreview?.objectUrl || ""}
        fileName={
          attachmentPreview?.attachment?.originalFilename ||
          "document-carnetpass"
        }
        mimeType={attachmentPreview?.mimeType || ""}
        downloadLabel="Télécharger le document"
      />
    </div>
  );
}

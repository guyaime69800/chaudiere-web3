import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getEquipmentDocumentLibrary } from "../services/equipmentKnowledge";
import { getPlatformDocumentsForEquipment } from "../services/platformDocumentLibrary.js";
import {
  deleteEquipmentAttachment,
  downloadEquipmentAttachment,
  getAttachmentFile,
  getEquipmentAttachments,
  submitAttachmentToCatalog,
  uploadEquipmentAttachment,
} from "../services/equipmentAttachmentsService";
import { photosToPdf } from "../services/photosToPdf";
import DocumentPreviewModal from "./DocumentPreviewModal";
import shibaTechnicien from "../assets/simba-assistance-technique.webp";
import "./EquipmentDocumentCenter.css";
import { useAuth } from "../hooks/useAuth";
import ShibaUsage from "./ShibaUsage";
import { openShibaRecharge, refreshShibaUsage } from "../services/shibaUsageEvents";

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

export default function EquipmentDocumentCenter(props) {
  const { equipment, carnetPassId } = props;
  const equipmentKey = JSON.stringify([
    equipment.id,
    equipment.brand,
    equipment.model,
    equipment.product_reference,
    carnetPassId,
  ]);

  return <EquipmentDocumentCenterContent key={equipmentKey} {...props} />;
}

function EquipmentDocumentCenterContent({
  equipment,
  carnetPassId = "",
  reportCount = 0,
  certificateCount = 0,
  onOpenHistory,
  onOpenRegulatory,
  onTechnicalDocumentCountChange,
}) {
  const { session } = useAuth();
  const [technicalDocuments, setTechnicalDocuments] = useState([]);
  const [technicalEquipmentId, setTechnicalEquipmentId] = useState("");
  const indexedPlatformDocumentIds = technicalDocuments.filter(
    (document) => document.storage === "platform-private" && document.ragStatus === "ready",
  ).map((document) => document.documentId);
  const canAskAi = Boolean(technicalEquipmentId || indexedPlatformDocumentIds.length);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const aiRequestId = useRef(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [documentFilter, setDocumentFilter] = useState("all");
  const [selectedDocument, setSelectedDocument] = useState(null);
  useEffect(() => {
    const url = selectedDocument?.documentUrl;
    return () => {
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [selectedDocument]);
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [attachmentError, setAttachmentError] = useState("");
  const [showAttachmentForm, setShowAttachmentForm] = useState(false);
  const [attachmentMode, setAttachmentMode] = useState("file");
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [attachmentKind, setAttachmentKind] = useState("photo");
  const [attachmentTitle, setAttachmentTitle] = useState("");
  const [attachmentDescription, setAttachmentDescription] = useState("");
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentActionId, setAttachmentActionId] = useState("");
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [attachmentNotice, setAttachmentNotice] = useState("");
  const [submissionFormId, setSubmissionFormId] = useState("");
  const [submissionBusy, setSubmissionBusy] = useState(false);
  const [submissionConsent, setSubmissionConsent] = useState(false);

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
    aiRequestId.current += 1;

    onTechnicalDocumentCountChange?.(0);

    Promise.allSettled([getEquipmentDocumentLibrary({
      brand: equipment.brand,
      model: equipment.model,
      product_reference: equipment.product_reference,
      carnetPassId,
    }), getPlatformDocumentsForEquipment(equipment, session?.access_token)])
      .then(([libraryResult, publishedResult]) => {
        if (!active) return;

        const library = libraryResult.status === "fulfilled"
          ? libraryResult.value : { documents: [], catalogueEquipment: null };
        const publishedDocuments = publishedResult.status === "fulfilled"
          ? publishedResult.value : [];
        const failures = [libraryResult, publishedResult]
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason?.message || "La documentation technique est momentanément indisponible.");
        setLoadError([...new Set(failures)].join(" "));
        if (failures.length) {
          console.error("Chargement de la documentation impossible :", failures);
        }

        const legacyDocuments = publishedDocuments.managed || publishedDocuments.length ? [] : library.documents;
        const documents = [...legacyDocuments, ...publishedDocuments.filter(
          (document) => !legacyDocuments.some((existing) => existing.documentId === document.documentId),
        )];
        setTechnicalDocuments(documents);
        setTechnicalEquipmentId(publishedDocuments.managed || publishedDocuments.length ? "" : library.catalogueEquipment?.equipmentId || "");
        onTechnicalDocumentCountChange?.(documents.length);
      })
      .catch((error) => {
        console.error("Chargement de la documentation impossible :", error);

        if (!active) return;

        setLoadError(error?.message || "La documentation technique est momentanément indisponible.");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      aiRequestId.current += 1;
    };
  }, [
    carnetPassId,
    equipment.brand,
    equipment,
    equipment.id,
    equipment.model,
    equipment.product_reference,
    session?.access_token,
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
    let active = true;

    if (!equipment.id) {
      return () => {
        active = false;
      };
    }

    getEquipmentAttachments(equipment.id)
      .then((rows) => {
        if (active) setAttachments(rows);
      })
      .catch((error) => {
        console.error("Chargement des pièces jointes impossible :", error);
        if (active) {
          setAttachmentError(
            error.message || "Chargement des pièces jointes impossible.",
          );
        }
      })
      .finally(() => {
        if (active) setAttachmentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [equipment.id]);

  async function handleAttachmentUpload(event) {
    event.preventDefault();

    if (!attachmentTitle.trim() || (attachmentMode === "photos" ? !photoFiles.length : !attachmentFile)) {
      setAttachmentError("Choisis un fichier ou des photos et indique un titre.");
      return;
    }

    setAttachmentBusy(true);
    setAttachmentError("");
    setAttachmentNotice("");

    try {
      const file = attachmentMode === "photos"
        ? await photosToPdf(photoFiles, `document-${equipment.id}.pdf`)
        : attachmentFile;
      await uploadEquipmentAttachment({
        file,
        equipmentId: equipment.id,
        documentKind: attachmentMode === "photos" ? "other" : attachmentKind,
        title: attachmentTitle.trim(),
        description: attachmentDescription.trim(),
      });

      setAttachmentFile(null);
      setPhotoFiles([]);
      setAttachmentTitle("");
      setAttachmentDescription("");
      setShowAttachmentForm(false);
      setAttachmentNotice("Document envoyé dans le dossier privé. Il n’apparaîtra dans le catalogue qu’après une proposition et une validation par l’administration.");

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

  function addPhotos(files) {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;
    if (photoFiles.length + incoming.length > 8) {
      setAttachmentError("Un PDF peut contenir au maximum 8 photos. Crée un second document pour les pages suivantes.");
      return;
    }
    if (incoming.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setAttachmentError("Choisis des photos JPEG, PNG ou WebP.");
      return;
    }
    setPhotoFiles((current) => [...current, ...incoming]);
    setAttachmentError("");
  }

  async function handleSubmitToCatalog(attachment) {
    if (!submissionConsent || !equipment.product_reference) return;
    setSubmissionBusy(true);
    setAttachmentError("");
    setAttachmentNotice("");
    try {
      const result = await submitAttachmentToCatalog(attachment.id);
      setAttachmentNotice(result.status === "approved"
        ? "Ce PDF a déjà été validé par l’administration."
        : result.status === "rejected"
          ? "Cette version du PDF a été refusée. Corrige le document et ajoute une nouvelle pièce jointe avant de la proposer."
          : result.alreadySubmitted
            ? "Ce PDF est déjà en attente de validation par l’administration."
            : "PDF proposé à l’administration. Il reste privé tant que sa diffusion n’a pas été validée.");
      setSubmissionConsent(false);
      setSubmissionFormId("");
    } catch (error) {
      setAttachmentError(error.message || "Proposition au catalogue impossible.");
    } finally {
      setSubmissionBusy(false);
    }
  }
  async function handleTechnicalDocumentOpen(technicalDocument) {
    if (technicalDocument.storage !== "private" && technicalDocument.storage !== "platform-private") {
      setSelectedDocument(technicalDocument);
      return;
    }

    try {
      if (!session?.access_token) {
        throw new Error("Connecte-toi pour consulter ce document.");
      }

      const endpoint = technicalDocument.storage === "platform-private"
        ? `/api/platform-catalog-documents?id=${encodeURIComponent(technicalDocument.documentId)}`
        : `/api/technical-document?pathname=${encodeURIComponent(new URL(technicalDocument.documentUrl).pathname.slice(1))}`;
      const response = await fetch(
        endpoint,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      if (!response.ok) {
        const details = await response.json().catch(() => null);
        throw new Error(details?.error || "Impossible d’ouvrir ce document technique.");
      }

      const pdf = await response.blob();
      const objectUrl = URL.createObjectURL(pdf);

      setSelectedDocument({
        ...technicalDocument,
        documentUrl: objectUrl,
      });
    } catch (error) {
      window.alert(error.message || "Document inaccessible.");
    }
  }
  async function handleAskAi(event) {
    event.preventDefault();
    if (aiBusy || !canAskAi || !aiQuestion.trim()) return;

    const requestId = ++aiRequestId.current;
    setAiBusy(true);
    setAiError("");
    setAiAnswer("");

    try {
      if (!session?.access_token) {
        throw new Error("Connecte-toi à ton compte professionnel pour interroger l’IA.");
      }

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          equipmentId: technicalEquipmentId,
          platformDocumentIds: indexedPlatformDocumentIds,
          question: aiQuestion.trim(),
        }),
      });
      const result = await response.json();
      refreshShibaUsage();
      if (result?.code === "SHIBA_QUOTA_REACHED") openShibaRecharge(result.usage, true);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || result?.error || "Réponse IA indisponible.");
      }

      if (requestId === aiRequestId.current) {
        setAiAnswer(result.answer || "Aucune réponse reçue.");
      }
    } catch (error) {
      if (requestId === aiRequestId.current) {
        setAiError(error?.message || "Réponse IA indisponible.");
      }
    } finally {
      if (requestId === aiRequestId.current) setAiBusy(false);
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
      <div className={`equipment-workspace__top ${!loading && technicalDocuments.length > 0 ? "has-assistant" : ""}`}>
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
              <button type="button" onClick={() => {
                setAttachmentMode("photos");
                setShowAttachmentForm(true);
                window.setTimeout(() => document.getElementById("equipment-attachment-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
              }}>Créer un PDF avec des photos de la notice</button>
            </div>
          </div>
        )}

        {!loading && technicalDocuments.length > 0 && (
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
                        onClick={() => handleTechnicalDocumentOpen(technicalDocument)}
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

      {!loading && technicalDocuments.length > 0 && (
        <section className="equipment-workspace__ai" aria-labelledby="equipment-ai-title">
          <div className="equipment-workspace__ai-intro">
            <img className="equipment-workspace__ai-mascot" src={shibaTechnicien} alt="Simba avec une clé à molette, assistant technique Shiba Bot" width="92" height="138" />
            <div>
              <span>ASSISTANT IA CARNETPASS</span>
              <h3 id="equipment-ai-title">Shiba Bot</h3>
            </div>
          </div>
          <p>Posez une question sur les notices et la vue éclatée. Vérifiez la page citée avant toute intervention.</p>
          <ShibaUsage session={session} />
          <form onSubmit={handleAskAi}>
            <label htmlFor="equipment-ai-question">Votre question</label>
            <textarea
              id="equipment-ai-question"
              value={aiQuestion}
              onChange={(event) => {
                setAiQuestion(event.target.value);
                setAiAnswer("");
                setAiError("");
              }}
              rows={3}
              maxLength={1000}
              placeholder="Ex. Quelle est la référence du capteur de pression dans la vue éclatée ?"
            />
            <button type="submit" disabled={aiBusy || !canAskAi || !aiQuestion.trim()}>
              {aiBusy ? "Shiba recherche…" : "Demander à Shiba Bot"}
            </button>
          </form>
          {!canAskAi && (
            <p role="alert">Aucun document de ce modèle n’est encore indexé pour Shiba.</p>
          )}
          {aiError && <p className="equipment-workspace__ai-error" role="alert">{aiError}</p>}
          {aiAnswer && (
            <div className="equipment-workspace__ai-answer" aria-live="polite">
              <ReactMarkdown>{aiAnswer}</ReactMarkdown>
            </div>
          )}
        </section>
      )}
      </div>

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
              id="equipment-attachment-form"
              className="equipment-workspace__attachment-form"
              onSubmit={handleAttachmentUpload}
            >
              <div className="equipment-workspace__attachment-form-heading">
                <div>
                  <h4>Ajouter une pièce jointe privée</h4>
                  <p>Ce document reste dans le dossier de l’équipement. Une proposition au catalogue est une action distincte.</p>
                </div>
              </div>

              <div className="equipment-workspace__attachment-mode" role="group" aria-label="Source du document">
                <button type="button" className={attachmentMode === "file" ? "is-active" : ""} aria-pressed={attachmentMode === "file"} onClick={() => setAttachmentMode("file")}>Importer un fichier</button>
                <button type="button" className={attachmentMode === "photos" ? "is-active" : ""} aria-pressed={attachmentMode === "photos"} onClick={() => setAttachmentMode("photos")}>Photos → PDF</button>
              </div>

              <div className="equipment-workspace__attachment-fields">
                {attachmentMode === "file" && <label>
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
                </label>}

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

                {attachmentMode === "file" ? <label className="is-wide">
                  <span>Fichier PDF ou photo · 10 Mo maximum</span>
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(event) => setAttachmentFile(event.target.files?.[0] || null)}
                    disabled={attachmentBusy} required />
                </label> : <div className="is-wide equipment-workspace__photo-inputs">
                  <label><span>Photographier une page</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
                    onChange={(event) => { addPhotos(event.target.files); event.target.value = ""; }} disabled={attachmentBusy} /></label>
                  <label><span>Choisir plusieurs photos</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple
                    onChange={(event) => { addPhotos(event.target.files); event.target.value = ""; }} disabled={attachmentBusy} /></label>
                  <small>1 à 8 pages, dans l’ordre affiché. Le PDF créé est limité à 10 Mo.</small>
                  {photoFiles.length > 0 && <ol>{photoFiles.map((file, index) => <li key={`${file.name}-${index}`}>
                    <span>Page {index + 1} · {file.name}</span>
                    <button type="button" onClick={() => setPhotoFiles((current) => current.filter((_, position) => position !== index))} disabled={attachmentBusy}>Retirer</button>
                  </li>)}</ol>}
                </div>}
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
                  {attachmentBusy ? "Préparation et envoi…" : attachmentMode === "photos" ? "Créer et envoyer le PDF privé" : "Envoyer le document privé"}
                </button>
              </div>
            </form>
          )}

          {attachmentNotice && <p className="equipment-workspace__attachment-notice" role="status">{attachmentNotice}</p>}

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
                      {attachment.mimeType === "application/pdf" && ["other", "photo"].includes(attachment.documentKind) && (
                        <button type="button" disabled={busy || submissionBusy} onClick={() => {
                          setSubmissionFormId((current) => current === attachment.id ? "" : attachment.id);
                          setSubmissionConsent(false);
                        }}>{submissionFormId === attachment.id ? "Fermer la proposition" : "Proposer au catalogue"}</button>
                      )}
                      {attachment.canDelete && (
                        <button type="button" className="is-danger" disabled={busy} onClick={() => handleAttachmentDelete(attachment)}>Supprimer</button>
                      )}
                    </div>
                    {submissionFormId === attachment.id && <div className="equipment-workspace__catalog-submission">
                      <p>Ce PDF restera privé dans le dossier client. Une copie sera envoyée à l’administration pour vérification avant toute diffusion.</p>
                      <p>Modèle proposé : <strong>{equipment.brand} · {equipment.model} · {equipment.product_reference || "référence constructeur manquante"}</strong></p>
                      {!equipment.product_reference && <p role="alert">Renseigne d’abord la référence exacte de l’équipement.</p>}
                      <label><input type="checkbox" checked={submissionConsent} onChange={(event) => setSubmissionConsent(event.target.checked)} /> J’ai vérifié que le PDF ne contient pas de données privées du client et que sa diffusion aux professionnels est autorisée.</label>
                      <button type="button" disabled={!submissionConsent || !equipment.product_reference || submissionBusy} onClick={() => handleSubmitToCatalog(attachment)}>
                        {submissionBusy ? "Envoi à l’administration…" : "Envoyer pour validation"}
                      </button>
                    </div>}
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
        historicalPrices={Boolean(selectedDocument?.notes?.includes("Prix affichés historiques"))}
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

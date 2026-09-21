import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./DocumentPreviewModal.css";

export default function DocumentPreviewModal({
  open,
  onOpenChange,
  title,
  subtitle,
  documentUrl,
  fileName,
  mimeType = "application/pdf",
  eyebrow = "APERÇU DU DOCUMENT",
  downloadLabel = "Télécharger le PDF",
}) {
  const [loading, setLoading] = useState(true);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const triggerRef = useRef(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const titleId = useId();
  const descriptionId = useId();

  const isImage = String(mimeType).startsWith("image/");

  const viewerUrl =
    documentUrl && !isImage
      ? documentUrl + "#toolbar=1&navpanes=0&view=FitH"
      : documentUrl;

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return undefined;

    triggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setLoading(true);

    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChangeRef.current(false);
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), a[href], iframe, [tabindex]:not([tabindex="-1"])',
      );

      if (!focusableElements?.length) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;

      window.requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    };
  }, [documentUrl, open]);

  if (!open || !documentUrl || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="document-preview-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChangeRef.current(false);
        }
      }}
    >
      <section
        ref={dialogRef}
        className="document-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="document-preview-modal__header">
          <div>
            <span className="document-preview-modal__eyebrow">{eyebrow}</span>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>
              {subtitle || "Consultez le document avant de le télécharger."}
            </p>
          </div>

          <button
            ref={closeButtonRef}
            className="document-preview-modal__close"
            type="button"
            aria-label="Fermer l’aperçu du document"
            onClick={() => onOpenChangeRef.current(false)}
          >
            ×
          </button>
        </header>

        <div className="document-preview-modal__viewer" aria-busy={loading}>
          {loading ? (
            <div
              className="document-preview-modal__loading"
              role="status"
              aria-live="polite"
            >
              <span aria-hidden="true" />
              Préparation de l’aperçu…
            </div>
          ) : null}

          {isImage ? (
            <img
              src={viewerUrl}
              alt={title || "Aperçu du document"}
              onLoad={() => setLoading(false)}
              onError={() => setLoading(false)}
            />
          ) : (
            <iframe
              src={viewerUrl}
              title={title || "Aperçu du document PDF"}
              onLoad={() => setLoading(false)}
            />
          )}
        </div>

        <footer className="document-preview-modal__footer">
          <p>
            Vérifiez le document avant de le télécharger ou de le transmettre.
          </p>

          <div>
            <a
              className="document-preview-modal__button document-preview-modal__button--secondary"
              href={documentUrl}
              target="_blank"
              rel="noreferrer"
            >
              Ouvrir dans un nouvel onglet
            </a>

            <a
              className="document-preview-modal__button document-preview-modal__button--primary"
              href={documentUrl}
              download={fileName || "document-carnetpass.pdf"}
            >
              {downloadLabel}
            </a>

            <button
              className="document-preview-modal__button document-preview-modal__button--close"
              type="button"
              onClick={() => onOpenChangeRef.current(false)}
            >
              Fermer
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

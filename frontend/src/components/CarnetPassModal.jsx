import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./CarnetPassModal.css";

export default function CarnetPassModal({
  open,
  onOpenChange,
  onOpenDocuments,
  carnetPassId,
  equipment,
  statusLabel,
  statusTone = "neutral",
}) {
  const [loading, setLoading] = useState(true);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const triggerRef = useRef(null);

  const publicPath = useMemo(
    () => (carnetPassId ? `/appareil/${encodeURIComponent(carnetPassId)}` : ""),
    [carnetPassId],
  );

  const embeddedPath = publicPath ? `${publicPath}?embed=1` : "";

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
        onOpenChange(false);
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
  }, [open, onOpenChange]);

  if (!open || !carnetPassId || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="carnetpass-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <section
        ref={dialogRef}
        className="carnetpass-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="carnetpass-modal-title"
        aria-describedby="carnetpass-modal-description"
      >
        <header className="carnetpass-modal__header">
          <div>
            <span className="carnetpass-modal__eyebrow">
              CARNETPASS &amp; TRAÇABILITÉ
            </span>

            <h2 id="carnetpass-modal-title">
              {equipment.brand} {equipment.model}
            </h2>

            <p id="carnetpass-modal-description">
              Carnet public vérifiable · N° de série : {equipment.serial_number}
            </p>
          </div>

          <button
            ref={closeButtonRef}
            className="carnetpass-modal__close"
            type="button"
            aria-label="Fermer le CarnetPass"
            onClick={() => onOpenChange(false)}
          >
            ×
          </button>
        </header>

        <div className="carnetpass-modal__statusbar">
          <span
            className={`equipment-workspace__status equipment-workspace__status--${statusTone}`}
          >
            {statusLabel}
          </span>

          <span>
            Identifiant : <strong>{carnetPassId}</strong>
          </span>
        </div>

        <div className="carnetpass-modal__viewer">
          {loading && (
            <div
              className="carnetpass-modal__loading"
              role="status"
              aria-live="polite"
            >
              <span aria-hidden="true" />
              Chargement du CarnetPass…
            </div>
          )}

          <iframe
            src={embeddedPath}
            title={`CarnetPass de ${equipment.brand} ${equipment.model}`}
            loading="eager"
            referrerPolicy="same-origin"
            onLoad={() => setLoading(false)}
          />
        </div>

        <footer className="carnetpass-modal__footer">
          <p>
            Aperçu de la fiche visible après le scan du QR code. Les notices et
            l’assistant technique sont dans l’onglet Documents du dossier professionnel.
          </p>

          <div>
            <button
              className="pro-action-card-button"
              type="button"
              onClick={onOpenDocuments}
            >
              Documents professionnels
            </button>
            <a
              className="pro-action-card-button"
              href={publicPath}
              target="_blank"
              rel="noreferrer"
            >
              Ouvrir dans un nouvel onglet
            </a>

            <button
              className="pro-primary-button"
              type="button"
              onClick={() => onOpenChange(false)}
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

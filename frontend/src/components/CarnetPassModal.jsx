import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeCanvas } from "qrcode.react";
import { publicQrUrl } from "../lib/public-qr-url.js";
import "./CarnetPassModal.css";

function CarnetPassModalContents({
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

  const publicUrl = publicQrUrl(window.location.origin, carnetPassId);

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
              Carnet public vérifiable · N° de série : {equipment.serial_number || "non lisible"}
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
          <aside className="carnetpass-modal__qr" aria-label="QR de la fiche publique">
            <div>
              <strong>QR de la fiche particulier</strong>
              <p>Scannez-le avec votre téléphone pour contrôler les informations publiées.</p>
            </div>
            <QRCodeCanvas
              value={publicUrl}
              size={172}
              level="M"
              includeMargin
              role="img"
              aria-label={`QR vers la fiche publique du CarnetPass ${carnetPassId}`}
            />
          </aside>
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
            Le QR ouvre cette fiche publique sur téléphone. Les documents et
            l’assistant réservés aux professionnels restent dans l’onglet Documents.
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

export default function CarnetPassModal(props) {
  if (!props.open || !props.carnetPassId || typeof document === "undefined") return null;
  return <CarnetPassModalContents key={props.carnetPassId} {...props} />;
}

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { QRCodeCanvas } from "qrcode.react";
import "./CarnetPassCreatedModal.css";

export default function CarnetPassCreatedModal({ carnetPass, onClose }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const closeRef = useRef(onClose);
  const open = Boolean(carnetPass);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }

      if (event.key !== "Tab") return;
      const items = dialogRef.current?.querySelectorAll('button:not([disabled]), a[href]');
      if (!items?.length) return;

      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [open]);

  if (!carnetPass || typeof document === "undefined") return null;

  const publicUrl = `${window.location.origin}/appareil/${encodeURIComponent(carnetPass.qrToken)}`;

  return createPortal(
    <div className="created-carnetpass-overlay" role="presentation">
      <section
        ref={dialogRef}
        className="created-carnetpass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="created-carnetpass-title"
        aria-describedby="created-carnetpass-description"
      >
        <button
          ref={closeButtonRef}
          className="created-carnetpass__close"
          type="button"
          aria-label="Fermer la confirmation"
          onClick={onClose}
        >
          ×
        </button>
        <span className="created-carnetpass__check" aria-hidden="true">✓</span>
        <h2 id="created-carnetpass-title">CarnetPass créé avec succès</h2>
        <p id="created-carnetpass-description">
          {carnetPass.brand} {carnetPass.model} · N° de série : {carnetPass.serialNumber || "non lisible"}
        </p>
        <p className="created-carnetpass__id">Identifiant : <strong>{carnetPass.carnetPassId}</strong></p>
        <div className="created-carnetpass__qr">
          <QRCodeCanvas value={publicUrl} size={180} includeMargin />
          <p>Ce QR ouvre la fiche publique de l’appareil.</p>
        </div>
        <div className="created-carnetpass__actions">
          <a className="btn btn-primary" href={publicUrl} target="_blank" rel="noopener noreferrer">
            Voir le CarnetPass
          </a>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Retour à l’espace professionnel
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

import { useId, useRef } from "react";
import "../pages/ShibaDevisPage.css";
import ShibaDevisMascot from "./ShibaDevisMascot";
import OfficialAidLinks from "./OfficialAidLinks";

export default function ShibaDevisEntry() {
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const titleId = useId();
  return (
    <section className="devis-entry" aria-label="Liens vers les aides officielles">
      <ShibaDevisMascot decorative />
      <div>
        <span className="devis-eyebrow">Services publics externes</span>
        <h2>Aides aux travaux</h2>
        <p>
          Accédez aux simulateurs officiels France Rénov’ et à l’annuaire RGE.
        </p>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          className="devis-button"
          onClick={() => dialogRef.current?.showModal()}
        >
          Consulter les outils officiels →
        </button>
      </div>
      <dialog ref={dialogRef} className="official-aids-dialog" aria-labelledby={titleId}
        onClose={() => triggerRef.current?.focus()}
        onClick={(event) => { if (event.target === dialogRef.current) { const rect = dialogRef.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialogRef.current.close(); } }}>
        <div className="official-aids-dialog__header">
          <h2 id={titleId}>Les outils officiels pour vos travaux</h2>
          <button type="button" className="official-aids-dialog__close" onClick={() => dialogRef.current?.close()}>Fermer</button>
        </div>
        <OfficialAidLinks />
      </dialog>
    </section>
  );
}

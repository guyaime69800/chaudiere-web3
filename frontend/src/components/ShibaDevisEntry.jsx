import { Link } from "react-router-dom";
import "../pages/ShibaDevisPage.css";
import ShibaDevisMascot from "./ShibaDevisMascot";

export default function ShibaDevisEntry({ professional = false }) {
  return (
    <section className="devis-entry" aria-label="Liens vers les aides officielles">
      <ShibaDevisMascot decorative />
      <div>
        <span className="devis-eyebrow">Services publics externes</span>
        <h2>Aides aux travaux</h2>
        <p>
          Accédez aux simulateurs officiels France Rénov’ et à l’annuaire RGE.
        </p>
        <Link
          className="devis-button"
          to={`/shiba-devis${professional ? "?profil=professionnel" : ""}`}
        >
          Consulter les outils officiels →
        </Link>
      </div>
    </section>
  );
}

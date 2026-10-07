import { Link } from "react-router-dom";
import "../pages/ShibaDevisPage.css";
import ShibaDevisMascot from "./ShibaDevisMascot";

export default function ShibaDevisEntry({ professional = false }) {
  return (
    <section className="devis-entry" aria-label="Shiba Devis gratuit">
      <ShibaDevisMascot decorative />
      <div>
        <span className="devis-eyebrow">Gratuit · préparation du projet</span>
        <h2>Shiba Devis & aides</h2>
        <p>
          Réunissez les informations de votre projet, les aides à vérifier et
          les étapes suivantes. Sans montant garanti.
        </p>
        <Link
          className="devis-button"
          to={`/shiba-devis${professional ? "?profil=professionnel" : ""}`}
        >
          Préparer mon projet gratuitement →
        </Link>
      </div>
    </section>
  );
}

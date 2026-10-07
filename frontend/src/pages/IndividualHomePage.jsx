import { Link } from "react-router-dom";
import ShibaDevisEntry from "../components/ShibaDevisEntry";
import "./ShibaDevisPage.css";

export default function IndividualHomePage() {
  return (
    <main className="devis-page">
      <Link to="/">← Accueil CarnetPass</Link>
      <span className="devis-eyebrow">Espace particulier</span>
      <h1>Préparez votre projet de travaux.</h1>
      <p>
        Retrouvez les services publics pour estimer vos aides et rechercher un professionnel RGE.
      </p>
      <ShibaDevisEntry />
      <section className="devis-panel">
        <h2>Vous avez déjà un appareil CarnetPass ?</h2>
        <p>
          Ouvrez sa fiche avec le QR code ou retrouvez-le depuis la recherche
          publique.
        </p>
        <Link to="/#rechercher-appareil">Rechercher mon appareil →</Link>
      </section>
    </main>
  );
}

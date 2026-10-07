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
        Un parcours gratuit, sans compte obligatoire. Votre brouillon reste dans
        cet onglet ; il n’est pas enregistré dans un compte CarnetPass.
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

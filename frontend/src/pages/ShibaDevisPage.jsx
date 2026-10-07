import { Link } from "react-router-dom";
import "./ShibaDevisPage.css";
import OfficialAidLinks from "../components/OfficialAidLinks";
export default function ShibaDevisPage() {
  return <main className="devis-page">
    <nav className="devis-nav" aria-label="Navigation aides officielles"><Link to="/">← Accueil</Link><Link to="/espace-pro">Espace professionnel</Link></nav>
    <header className="devis-heading"><div><span className="devis-eyebrow">Services publics externes</span><h1>Aides aux travaux : les outils officiels</h1><p>Consultez les simulateurs France Rénov’ pour préparer votre projet.</p></div></header>
    <p>CarnetPass fournit ces liens sans calculer d’aides ni établir de devis. Les estimations officielles restent indicatives ; l’accord définitif appartient aux organismes financeurs.</p>
    <OfficialAidLinks />
    <p>Les informations saisies sur ces services ne sont pas transmises à CarnetPass. Chaque service applique sa propre politique de confidentialité.</p>
  </main>;
}

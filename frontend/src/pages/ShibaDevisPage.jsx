import { Link } from "react-router-dom";
import "./ShibaDevisPage.css";
const services = [
  ["Estimer mes aides avec France Rénov’", "https://france-renov.gouv.fr/aides/simulation", "Renseignez votre situation directement sur le simulateur du service public."],
  ["Mes Aides Réno", "https://mesaides.france-renov.gouv.fr/", "Accédez au simulateur officiel des aides à la rénovation énergétique."],
  ["Trouver un professionnel RGE", "https://france-renov.gouv.fr/annuaire-rge/recherche", "Recherchez une entreprise selon votre localisation et vos travaux."],
  ["Vérifier la qualification d’une entreprise", "https://france-renov.gouv.fr/annuaire-rge/identifier", "Vérifiez les domaines de travaux et la qualification à la date concernée."],
];
export default function ShibaDevisPage() {
  return <main className="devis-page">
    <nav className="devis-nav" aria-label="Navigation aides officielles"><Link to="/">← Accueil</Link><Link to="/espace-pro">Espace professionnel</Link></nav>
    <header className="devis-heading"><div><span className="devis-eyebrow">Services publics externes</span><h1>Aides aux travaux : les outils officiels</h1><p>Consultez les simulateurs France Rénov’ pour préparer votre projet.</p></div></header>
    <p>CarnetPass fournit ces liens sans calculer d’aides ni établir de devis. Les estimations officielles restent indicatives ; l’accord définitif appartient aux organismes financeurs.</p>
    {services.map(([title, url, description]) => <section className="devis-panel" key={url}><h2>{title}</h2><p>{description}</p><a className="devis-button" href={url} target="_blank" rel="noopener noreferrer">{title} ↗</a><p><small>Site externe : {new URL(url).hostname} · nouvel onglet</small></p></section>)}
    <p>Les informations saisies sur ces services ne sont pas transmises à CarnetPass. Chaque service applique sa propre politique de confidentialité.</p>
  </main>;
}

import { Link } from "react-router-dom";
import "./SiteFooter.css";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div><strong>CarnetPass</strong><span>Documentation et carnet d’entretien des équipements.</span></div>
      <nav aria-label="Informations et conditions">
        <Link to="/faq">FAQ</Link>
        <Link to="/mentions-legales">Mentions légales</Link>
        <Link to="/confidentialite">Confidentialité</Link>
        <Link to="/cookies">Cookies</Link>
        <Link to="/conditions-utilisation">Conditions d’utilisation</Link>
        <Link to="/conditions-commerciales">Conditions commerciales</Link>
      </nav>
    </footer>
  );
}

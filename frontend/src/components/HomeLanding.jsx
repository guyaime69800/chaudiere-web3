import { Link } from "react-router-dom";
import shibaTechnicien from "../assets/simba-assistance-technique.webp";
import InstallCarnetPass from "./InstallCarnetPass";
import ShibaDevisEntry from "./ShibaDevisEntry.jsx";
import "./HomeLanding.css";

const benefits = [
  {
    number: "01",
    title: "Les documents au bon endroit",
    description: "Retrouvez notices, vues éclatées et informations techniques en partant du modèle de l’appareil.",
  },
  {
    number: "02",
    title: "Un suivi qui reste avec l’appareil",
    description: "Rassemblez les interventions et les pièces du dossier dans un carnet consultable au fil du temps.",
  },
  {
    number: "03",
    title: "Un accès simple sur le terrain",
    description: "Ouvrez une fiche avec sa référence, son identifiant CarnetPass ou son QR code.",
  },
];

export default function HomeLanding() {
  return (
    <div className="home-landing">
      <ShibaDevisEntry />
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero__copy">
          <span className="home-eyebrow">CarnetPass · L’espace technique des équipements</span>
          <h1 id="home-title">Le bon document. Le bon appareil. Le bon historique.</h1>
          <p>
            CarnetPass relie la documentation constructeur, le carnet d’entretien
            et les interventions à chaque équipement. Les professionnels retrouvent
            l’information utile, même en déplacement.
          </p>
          <div className="home-actions">
            <Link className="home-button home-button--secondary" to="/espace-particulier">Préparer mon projet particulier</Link>
            <Link className="home-button home-button--primary" to="/connexion">Accéder à l’application <span aria-hidden="true">→</span></Link>
            <Link className="home-button home-button--secondary" to="/inscription">Créer un espace professionnel</Link>
            <InstallCarnetPass className="install-carnetpass--home" />
          </div>
          <Link className="home-hero__pricing" to="/tarifs">Découvrir les offres en préparation →</Link>
          <a className="home-hero__lookup" href="#rechercher-appareil">Vous avez un identifiant ou un QR code ? Rechercher un appareil ↓</a>
        </div>
        <div className="home-hero__visual" aria-label="Aperçu des informations réunies dans CarnetPass">
          <div className="home-visual-topline"><span className="home-visual-dot" /> Dossier équipement</div>
          <div className="home-visual-device">
            <span className="home-visual-device__icon" aria-hidden="true">▦</span>
            <div><strong>Un appareil, un carnet</strong><span>Référence · documents · interventions</span></div>
          </div>
          <div className="home-visual-document"><span aria-hidden="true">▤</span><div><strong>Documentation constructeur</strong><small>Notice · vue éclatée · aide au dépannage</small></div><b aria-hidden="true">↗</b></div>
          <div className="home-visual-document"><span aria-hidden="true">◷</span><div><strong>Historique d’entretien</strong><small>Interventions regroupées dans le carnet</small></div><b aria-hidden="true">↗</b></div>
          <div className="home-visual-shiba"><img src={shibaTechnicien} alt="" /><div><strong>Shiba Bot</strong><span>Une aide qui s’appuie sur les documents du modèle.</span></div></div>
        </div>
      </section>

      <section className="home-benefits" aria-labelledby="home-benefits-title">
        <div className="home-section-heading"><span className="home-eyebrow">Pour les professionnels</span><h2 id="home-benefits-title">Moins de temps à chercher. Plus de contexte pour intervenir.</h2></div>
        <div className="home-benefits__grid">
          {benefits.map((benefit) => <article className="home-benefit" key={benefit.number}><span>{benefit.number}</span><h3>{benefit.title}</h3><p>{benefit.description}</p></article>)}
        </div>
      </section>

      <section className="home-shiba" aria-labelledby="home-shiba-title">
        <div className="home-shiba__portrait"><img src={shibaTechnicien} alt="Simba avec une clé à molette, assistant documentaire Shiba Bot" /></div>
        <div><span className="home-eyebrow">Shiba Bot</span><h2 id="home-shiba-title">Posez la question avec le modèle sous les yeux.</h2><p>Shiba Bot recherche dans les notices et les vues éclatées associées à l’appareil. Ses réponses indiquent le document et la page pour que le professionnel puisse vérifier l’information.</p><Link to="/connexion">Ouvrir mon espace et utiliser Shiba <span aria-hidden="true">→</span></Link></div>
      </section>

      <section className="home-final" aria-labelledby="home-final-title"><div><span className="home-eyebrow">CarnetPass sur le terrain</span><h2 id="home-final-title">Commencez avec votre prochain appareil.</h2><p>Créez votre espace professionnel, ajoutez un équipement et constituez son carnet au fil des interventions.</p></div><Link className="home-button home-button--primary" to="/inscription">Créer mon espace <span aria-hidden="true">→</span></Link></section>
    </div>
  );
}

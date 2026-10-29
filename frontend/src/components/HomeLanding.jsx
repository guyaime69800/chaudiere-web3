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
    title: "Imprimez, collez, scannez",
    description: "Imprimez le QR code de l’équipement et apposez-le sur l’appareil. Un scan permet de retrouver rapidement sa fiche et les informations d’intervention accessibles.",
  },
];

export default function HomeLanding({ presentation = false, maintenance = false }) {
  return (
    <div className="home-landing">
      {!presentation && <ShibaDevisEntry />}
      {maintenance && <p className="home-maintenance" role="status">L’accès à l’application CarnetPass est temporairement fermé pour maintenance. Cette présentation et les informations publiques restent consultables.</p>}
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero__copy">
          <span className="home-eyebrow">CarnetPass · L’espace technique des équipements</span>
          <h1 id="home-title">Le carnet d’entretien numérique de vos équipements.</h1>
          <p>
            CarnetPass rassemble l’historique d’entretien et les documents associés
            aux chaudières, pompes à chaleur, climatisations et VMC. Artisans,
            techniciens et entreprises organisent les interventions ; les particuliers
            retrouvent les informations de leur équipement selon les accès prévus.
          </p>
          {!maintenance && <div className="home-actions">
            <Link className="home-button home-button--primary" to="/rechercher-appareil#rechercher-appareil">Particulier — consulter mon équipement</Link>
            <Link className="home-button home-button--secondary" to="/connexion">Professionnel — me connecter <span aria-hidden="true">→</span></Link>
            <Link className="home-button home-button--secondary" to="/inscription">Créer un espace professionnel</Link>
            {!presentation && <InstallCarnetPass className="install-carnetpass--home" />}
          </div>}
          {!maintenance && <p className="home-hero__details">Particulier : scannez le QR code de votre appareil ou saisissez son identifiant pour consulter son historique, sa notice d’utilisation et les contacts du professionnel. Consultation en lecture seule, sans abonnement professionnel.</p>}
          {!maintenance && <Link className="home-hero__pricing" to="/espace-particulier">Préparer un projet de travaux ou d’entretien →</Link>}
          {!maintenance && <Link className="home-hero__pricing" to="/tarifs">Découvrir les offres professionnelles →</Link>}
          {!presentation && <a className="home-hero__lookup" href="#rechercher-appareil">Vous avez un identifiant ou un QR code ? Rechercher un appareil ↓</a>}
          {presentation && !maintenance && <a className="home-hero__lookup" href="/rechercher-appareil#rechercher-appareil">Rechercher un appareil par son identifiant ou son QR code →</a>}
          <p className="home-hero__details"><strong>Imprimez le QR code, apposez-le sur l’appareil et retrouvez plus vite son historique d’interventions.</strong> Scannez-le sur place pour ouvrir sa fiche. Les documents privés restent accessibles aux seules personnes autorisées.</p>
        </div>
        <div className="home-hero__visual" aria-label="Aperçu des informations réunies dans CarnetPass">
          <div className="home-visual-topline"><span className="home-visual-dot" /> Dossier équipement</div>
          <div className="home-visual-device">
            <span className="home-visual-device__icon" aria-hidden="true">▦</span>
            <div><strong>Un appareil, un carnet</strong><span>Référence · documents · interventions</span></div>
          </div>
          <div className="home-visual-document"><span aria-hidden="true">▤</span><div><strong>Documentation constructeur</strong><small>Notice · vue éclatée · aide au dépannage</small></div><b aria-hidden="true">↗</b></div>
          <div className="home-visual-document"><span aria-hidden="true">◷</span><div><strong>Historique d’entretien</strong><small>Interventions regroupées dans le carnet</small></div><b aria-hidden="true">↗</b></div>
          <div className="home-visual-shiba"><img src={shibaTechnicien} alt="" width="48" height="72" /><div><strong>Shiba Bot</strong><span>Une aide qui s’appuie sur les documents du modèle.</span></div></div>
        </div>
      </section>

      <section className="home-benefits" aria-labelledby="home-benefits-title">
        <div className="home-section-heading"><span className="home-eyebrow">Pour les professionnels</span><h2 id="home-benefits-title">Moins de temps à chercher. Plus de contexte pour intervenir.</h2></div>
        <div className="home-benefits__grid">
          {benefits.map((benefit) => <article className="home-benefit" key={benefit.number}><span>{benefit.number}</span><h3>{benefit.title}</h3><p>{benefit.description}</p></article>)}
        </div>
      </section>

      <section className="home-shiba" aria-labelledby="home-shiba-title">
        <div className="home-shiba__portrait"><img src={shibaTechnicien} alt="Simba avec une clé à molette, assistant documentaire Shiba Bot" width="240" height="360" loading="lazy" /></div>
        <div><span className="home-eyebrow">Shiba Bot</span><h2 id="home-shiba-title">Retrouver et comprendre les documents techniques.</h2><p>Shiba Bot aide à rechercher une information dans les notices et les vues éclatées disponibles pour le modèle. Les sources proposées permettent de vérifier la réponse. L’assistant peut se tromper et ne remplace pas l’appréciation d’un professionnel qualifié.</p>{!maintenance && <Link to="/connexion">Ouvrir mon espace et utiliser Shiba <span aria-hidden="true">→</span></Link>}</div>
      </section>

      <section className="home-final" aria-labelledby="home-final-title"><div><span className="home-eyebrow">Traçabilité</span><h2 id="home-final-title">Une trace durable, des données protégées.</h2><p>CarnetPass utilise la technologie blockchain Polygon pour renforcer la traçabilité des interventions, avec une attention portée à la protection des données personnelles et au respect du RGPD.</p><p>Des empreintes techniques servent de preuves de traçabilité. Les documents privés restent hors de la blockchain, avec des accès réservés aux personnes autorisées.</p><Link to="/confidentialite">Protection des données et droits RGPD →</Link><p>Retrouvez le détail des preuves enregistrées et de leur portée dans notre FAQ.</p><Link to="/faq">Comprendre le fonctionnement de CarnetPass →</Link></div></section>
    </div>
  );
}

import { Link } from "react-router-dom";
import "./PricingPage.css";

const offers = [
  {
    name: "Découverte",
    audience: "Pour découvrir CarnetPass sur le terrain",
    features: ["Essai de 14 jours envisagé", "Jusqu’à 5 équipements", "Carnet et rapports", "20 questions à Shiba Bot sur la période testée"],
  },
  {
    name: "Pro",
    audience: "Pour un artisan ou une petite entreprise",
    features: ["Équipements et interventions sans plafond métier", "Documents et attestations", "Catalogue technique disponible", "200 questions IA par mois et par technicien"],
    featured: true,
  },
  {
    name: "Équipe",
    audience: "Pour une entreprise CVC d’au moins cinq techniciens",
    features: ["Fonctions Pro", "Comptes, droits et suivi partagé", "200 questions IA par mois et par technicien", "Accompagnement au démarrage"],
  },
  {
    name: "Entreprise",
    audience: "Pour un réseau ou un grand compte",
    features: ["Volume et besoins étudiés ensemble", "Accompagnement adapté", "Conditions définies sur devis"],
  },
];

export default function PricingPage() {
  return (
    <main className="pricing-page">
      <nav className="pricing-nav" aria-label="Navigation"><Link to="/">← CarnetPass</Link><Link to="/connexion">Accéder à l’application</Link></nav>
      <header className="pricing-intro">
        <span className="pricing-eyebrow">Offres en préparation</span>
        <h1>Une formule adaptée à votre façon de travailler.</h1>
        <p>Voici le contenu des offres envisagées pour CarnetPass. Les tarifs et les conditions commerciales sont en cours de validation. Aucun paiement n’est ouvert.</p>
      </header>
      <section className="pricing-grid" aria-label="Offres proposées">
        {offers.map((offer) => (
          <article className={`pricing-card${offer.featured ? " pricing-card--featured" : ""}`} key={offer.name}>
            <div className="pricing-card__top"><h2>{offer.name}</h2>{offer.featured && <span>Offre principale proposée</span>}</div>
            <p>{offer.audience}</p>
            <strong className="pricing-card__status">Tarif à valider</strong>
            <ul>{offer.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            <Link to="/inscription">Créer un compte <span aria-hidden="true">→</span></Link>
          </article>
        ))}
      </section>
      <aside className="pricing-note"><h2>Votre travail reste accessible.</h2><p>Atteindre la limite de questions à Shiba Bot suspend seulement les nouvelles questions IA jusqu’au renouvellement du compteur. Les carnets et les documents restent accessibles. Les volumes proposés sont testés en Preview et peuvent évoluer avant lancement.</p><p>« Sans plafond métier » ne signifie pas stockage illimité : une limite raisonnable pour les fichiers envoyés reste à définir.</p></aside>
    </main>
  );
}

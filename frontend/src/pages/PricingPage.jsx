import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "./PricingPage.css";

const offers = [
  {
    name: "Découverte",
    audience: "Pour découvrir CarnetPass sur le terrain",
    price: "Gratuit",
    priceDetail: "pendant 5 jours",
    features: ["Essai gratuit de 5 jours", "Jusqu’à 5 équipements", "Carnet et rapports", "20 questions à Shiba Bot pendant l’essai"],
  },
  {
    name: "Pro",
    audience: "Pour un artisan indépendant",
    price: "25 € HT",
    priceDetail: "par mois · 1 technicien",
    features: ["Un compte technicien", "Équipements et interventions sans plafond métier", "Documents et attestations", "Catalogue technique disponible", "200 questions IA par mois"],
    featured: true,
  },
  {
    name: "Équipe",
    audience: "Pour une équipe de 5 personnes",
    price: "35 € HT",
    priceDetail: "par mois · une seule facture pour l’équipe",
    features: ["Fonctions Pro", "Jusqu’à 5 comptes et droits d’équipe", "Une seule facture", "Suivi partagé", "200 questions IA par mois et par technicien", "Accompagnement au démarrage"],
  },
  {
    name: "Entreprise",
    audience: "Pour un réseau ou un grand compte",
    price: "Sur étude",
    priceDetail: "proposition personnalisée",
    features: ["Volume et besoins étudiés ensemble", "Accompagnement adapté", "Conditions définies sur devis"],
  },
];

export default function PricingPage() {
  const { user } = useAuth();
  return (
    <main className="pricing-page">
      <nav className="pricing-nav" aria-label="Navigation"><Link to={user ? "/parametres-compte#formule" : "/"}>← {user ? "Mes paramètres" : "CarnetPass"}</Link><Link to={user ? "/espace-pro" : "/connexion"}>Accéder à l’application</Link></nav>
      <header className="pricing-intro">
        <span className="pricing-eyebrow">Offres en préparation</span>
        <h1>Une formule adaptée à votre façon de travailler.</h1>
        <p>Voici les offres et tarifs proposés pour CarnetPass. Vous pouvez demander un changement de formule ; aucun paiement ni changement automatique de droits n’est encore ouvert.</p>
      </header>
      <section className="pricing-grid" aria-label="Offres proposées">
        {offers.map((offer) => (
          <article className={`pricing-card${offer.featured ? " pricing-card--featured" : ""}`} key={offer.name}>
            <div className="pricing-card__top"><h2>{offer.name}</h2>{offer.featured && <span>Offre principale proposée</span>}</div>
            <p>{offer.audience}</p>
            <div className="pricing-card__price"><strong>{offer.price}</strong><span>{offer.priceDetail}</span></div>
            <ul>{offer.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            {user && offer.name !== "Découverte" ? (
              <a href={`mailto:contact@carnetpass.fr?subject=${encodeURIComponent(`Demande de formule ${offer.name} — CarnetPass`)}&body=${encodeURIComponent(`Bonjour,\n\nJe souhaite être informé de l'ouverture de la formule ${offer.name} pour mon compte ${user.email}.\n\nMerci.`)}`}>Demander cette formule <span aria-hidden="true">→</span></a>
            ) : user ? (
              <Link to="/parametres-compte#formule">Consulter ma formule <span aria-hidden="true">→</span></Link>
            ) : (
              <Link to="/inscription">Créer un compte <span aria-hidden="true">→</span></Link>
            )}
          </article>
        ))}
      </section>
      <aside className="pricing-note"><h2>Votre travail reste accessible.</h2><p>Atteindre la limite de questions à Shiba Bot suspend seulement les nouvelles questions IA jusqu’au renouvellement du compteur. Les carnets et les documents restent accessibles. Les volumes proposés sont testés en Preview et peuvent évoluer avant lancement.</p><p>« Sans plafond métier » ne signifie pas stockage illimité : une limite raisonnable pour les fichiers envoyés reste à définir.</p></aside>
    </main>
  );
}

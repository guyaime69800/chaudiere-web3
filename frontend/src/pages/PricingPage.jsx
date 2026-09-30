import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { startBilling } from "../services/billingService";
import { getMyCompany } from "../services/companyService";
import { activeStripeTestPlan, getStripeTestSubscription } from "../services/stripeTestSubscription";
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
    plan: "pro",
    audience: "Pour un artisan indépendant",
    price: "28 € TTC",
    taxDetail: "23,33 € HT + 4,67 € de TVA (20 %, arrondis)",
    priceDetail: "par mois · 1 technicien",
    features: ["Un compte technicien", "Équipements et interventions sans plafond métier", "Documents et attestations", "Catalogue technique disponible", "200 questions IA par mois"],
    featured: true,
  },
  {
    name: "Équipe",
    plan: "team",
    audience: "Pour une équipe de 5 personnes",
    price: "38 € TTC",
    taxDetail: "31,67 € HT + 6,33 € de TVA (20 %, arrondis)",
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
  const { user, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorPlan, setErrorPlan] = useState("");
  const [currentPlan, setCurrentPlan] = useState(undefined);
  const [companySiret, setCompanySiret] = useState("");
  const [testSubscription, setTestSubscription] = useState(null);
  const testBilling = import.meta.env.VITE_STRIPE_TEST_BILLING_ENABLED === "true";
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    getMyCompany(user.id)
      .then(async (company) => {
        if (!active) return;
        setCurrentPlan(company?.subscription?.plan || null);
        setCompanySiret(company?.siret || "");
        if (company?.id && testBilling) {
          const stripeTest = await getStripeTestSubscription(company.id);
          if (active) setTestSubscription(stripeTest);
        }
      })
      .catch(() => { if (active) setCurrentPlan(null); });
    return () => { active = false; };
  }, [user?.id, testBilling]);
  const testPlan = activeStripeTestPlan(testSubscription);
  async function choose(plan) {
    setBusy(true);
    setError("");
    setErrorPlan(plan);
    try { window.location.assign(await startBilling(session.access_token, "checkout", plan)); }
    catch (requestError) { setError(requestError.message); setBusy(false); }
  }
  return (
    <main className="pricing-page">
      <nav className="pricing-nav" aria-label="Navigation"><Link to={user ? "/parametres-compte#formule" : "/"}>← {user ? "Mes paramètres" : "CarnetPass"}</Link><Link to={user ? "/espace-pro" : "/connexion"}>Accéder à l’application</Link></nav>
      <header className="pricing-intro">
        <span className="pricing-eyebrow">{testBilling ? "Paiement en mode test" : "Offres en préparation"}</span>
        <h1>Une formule adaptée à votre façon de travailler.</h1>
        <p>{testBilling ? "Les prix TTC ci-dessous supposent une TVA de 20 %. Le paiement reste en mode test : vérifiez le montant et la TVA affichés par Stripe avant de confirmer. Aucun paiement réel ne sera prélevé et vos droits CarnetPass ne changent pas pendant ce test." : "Voici les offres et tarifs proposés pour CarnetPass. Vous pouvez demander un changement de formule ; aucun paiement ni changement automatique de droits n’est encore ouvert."}</p>
        {error && <p role="alert" className="pricing-error">{error}</p>}
      </header>
      <section className="pricing-grid" aria-label="Offres proposées">
        {offers.map((offer) => (
          <article className={`pricing-card${offer.featured ? " pricing-card--featured" : ""}`} key={offer.name}>
            <div className="pricing-card__top"><h2>{offer.name}</h2>{offer.featured && <span>Offre principale proposée</span>}</div>
            <p>{offer.audience}</p>
            <div className="pricing-card__price"><strong>{offer.price}</strong><span>{offer.priceDetail}</span>{offer.taxDetail && <span>{offer.taxDetail}</span>}</div>
            <ul>{offer.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            {user && currentPlan === undefined && offer.name === "Découverte" ? (
              <span className="pricing-current" role="status">Chargement de votre formule…</span>
            ) : user && currentPlan === "free" && offer.name === "Découverte" ? (
              <span className="pricing-current" aria-label="Formule d'accès actuelle">Accès actuel : Découverte</span>
            ) : user && testBilling && offer.plan === testPlan ? (
              <span className="pricing-current" aria-label="Abonnement de test actif">Abonnement test actif : {offer.name}</span>
            ) : offer.name === "Entreprise" ? (
              <Link to="/demande-entreprise">Demander cette formule <span aria-hidden="true">→</span></Link>
            ) : user && testBilling && offer.plan ? (
              <><button type="button" disabled={busy || !/^\d{14}$/.test(companySiret)} onClick={() => choose(offer.plan)}>Choisir ou modifier la formule <span aria-hidden="true">→</span></button>
                {!/^\d{14}$/.test(companySiret) && <p className="pricing-error">Le SIRET de l’entreprise est obligatoire avant l’abonnement. <Link to="/espace-pro">Renseigner le SIRET</Link></p>}
                {error && errorPlan === offer.plan && <p className="pricing-error" role="alert">{error}</p>}</>
            ) : user && offer.name !== "Découverte" ? (
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

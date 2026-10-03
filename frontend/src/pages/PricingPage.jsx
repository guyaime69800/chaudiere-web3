import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { startBilling } from "../services/billingService";
import { getMyCompany } from "../services/companyService";
import { activeStripeTestPlan, getStripeTestSubscription } from "../services/stripeTestSubscription";
import { openShibaRecharge } from "../services/shibaUsageEvents.js";
import { SHIBA_RECHARGE_PACKS } from "../lib/shiba-recharge-packs.js";
import "./PricingPage.css";

const offers = [
  {
    name: "Découverte",
    audience: "Pour découvrir CarnetPass sur le terrain",
    price: "Gratuit",
    priceDetail: "pendant 5 jours",
    features: ["Essai gratuit de 5 jours", "Jusqu’à 5 équipements", "Carnet et rapports", "Découvrez Shiba Bot pendant votre essai"],
  },
  {
    name: "CarnetPass Pro",
    plan: "pro",
    audience: "Une seule formule professionnelle, facturée par utilisateur",
    price: "28 € TTC",
    taxDetail: "23,33 € HT + 4,67 € de TVA (20 %, arrondis)",
    priceDetail: "par utilisateur et par mois",
    features: ["Équipements et interventions sans plafond métier", "Documents et attestations", "Catalogue technique disponible", "Shiba Bot à vos côtés pour avancer plus vite, des notices techniques à la recherche Web"],
    featured: true,
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
        <span className="pricing-eyebrow">{testBilling ? "Paiement en mode test" : "Abonnement en préparation"}</span>
        <h1>Une seule formule professionnelle, 28 € par utilisateur.</h1>
        <p>{testBilling ? "Les prix TTC ci-dessous supposent une TVA de 20 %. Le paiement reste en mode test pour un utilisateur : vérifiez le montant et la TVA affichés par Stripe avant de confirmer. Aucun paiement réel ne sera prélevé et vos droits CarnetPass ne changent pas pendant ce test." : "Voici le tarif proposé pour CarnetPass. La facturation par utilisateur et l’achat de crédits IA ne sont pas encore ouverts en production."}</p>
        {error && <p role="alert" className="pricing-error">{error}</p>}
      </header>
      <section className="pricing-grid" aria-label="Essai et abonnement proposés">
        {offers.map((offer) => (
          <article className={`pricing-card${offer.featured ? " pricing-card--featured" : ""}`} key={offer.name}>
            <div className="pricing-card__top"><h2>{offer.name}</h2>{offer.featured && <span>Formule professionnelle</span>}</div>
            <p>{offer.audience}</p>
            <div className="pricing-card__price"><strong>{offer.price}</strong><span>{offer.priceDetail}</span>{offer.taxDetail && <span>{offer.taxDetail}</span>}</div>
            <ul>{offer.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            {user && currentPlan === undefined && offer.name === "Découverte" ? (
              <span className="pricing-current" role="status">Chargement de votre formule…</span>
            ) : user && currentPlan === "free" && offer.name === "Découverte" ? (
              <span className="pricing-current" aria-label="Formule d'accès actuelle">Accès actuel : Découverte</span>
            ) : user && testBilling && offer.plan === testPlan ? (
              <span className="pricing-current" aria-label="Abonnement de test actif">Abonnement test actif : {offer.name}</span>
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
      <aside className="pricing-note" id="credits">
        <h2>Recharges Shiba Bot</h2>
        <p>Vous pouvez acheter une recharge ponctuelle à tout moment : {SHIBA_RECHARGE_PACKS[0].credits} crédits IA pour {SHIBA_RECHARGE_PACKS[0].euros} € TTC ou {SHIBA_RECHARGE_PACKS[1].credits} crédits IA pour {SHIBA_RECHARGE_PACKS[1].euros} € TTC. Les crédits achetés s’ajoutent au solde disponible, restent utilisables après le renouvellement de l’abonnement et servent aux questions sur la documentation comme aux recherches Web. {testBilling ? "Les paiements et crédits supplémentaires sont réservés aux tests Preview : aucun débit réel." : "Ces recharges sont en préparation : aucun achat de crédits n’est encore possible."}</p>
        {user && testBilling && <button type="button" className="pricing-preview-recharge" onClick={() => openShibaRecharge({ demo: true }, true)}>Recharger Shiba Bot (test)</button>}
        <h2>Votre travail reste accessible.</h2>
        <p>Atteindre la limite de questions à Shiba Bot suspend les nouvelles questions IA tant qu’aucun crédit supplémentaire n’est disponible. La formule professionnelle se réinitialise chaque mois ; l’essai Découverte ne se réinitialise pas. Les crédits ponctuels restants sont conservés d’un mois à l’autre. Les carnets, documents et historiques restent accessibles. Le compteur et les paiements sont testés uniquement en Preview.</p>
        <p>« Sans plafond métier » ne signifie pas stockage illimité : une limite raisonnable pour les fichiers envoyés reste à définir.</p>
      </aside>
    </main>
  );
}

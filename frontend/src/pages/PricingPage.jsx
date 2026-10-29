import { COMMERCIAL_TERMS_VERSION } from "../../shared/commercial-terms.js";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { startBilling, purchaseRequestId } from "../services/billingService";
import useLivePurchases from '../hooks/useLivePurchases.js';
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
    features: ["Essai gratuit de 5 jours, sans carte bancaire", "Jusqu’à 5 équipements", "Consultation de notices", "Shiba, agent IA", "Carnets et historiques conservés"],
  },
  {
    name: "CarnetPass Pro",
    plan: "pro",
    audience: "Un compte principal, puis des comptes supplémentaires pour votre équipe",
    price: "28 €",
    priceDetail: "par mois pour le compte principal",
    features: ["Carnets, équipements et interventions", "Documents et attestations", "Consultation de notices", "Shiba, agent IA", "Documentation et recherche Web"],
    featured: true,
  },
];

export default function PricingPage() {
  const { user, session } = useAuth();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorPlan, setErrorPlan] = useState("");
  const [currentPlan, setCurrentPlan] = useState(undefined);
  const [companySiret, setCompanySiret] = useState("");
  const [company, setCompany] = useState(null);
  const livePurchases = useLivePurchases();
  const [testSubscription, setTestSubscription] = useState(null);
  const testBilling = import.meta.env.VITE_STRIPE_TEST_BILLING_ENABLED === "true";
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    getMyCompany(user.id)
      .then(async (company) => {
        if (!active) return;
        setCurrentPlan(company?.subscription?.plan || null);
        setCompany(company);
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
    if (!termsAccepted) return;
    setBusy(true);
    setError("");
    setErrorPlan(plan);
    try {
      const attempt = purchaseRequestId(user.id, plan);
      const url = await startBilling(session.access_token, "checkout", plan, { accepted: termsAccepted, version: COMMERCIAL_TERMS_VERSION }, attempt.requestId);
      attempt.complete(); window.location.assign(url);
    }
    catch (requestError) { setError(requestError.message); setBusy(false); }
  }
  return (
    <main className="pricing-page">
      <nav className="pricing-nav" aria-label="Navigation"><Link to={user ? "/parametres-compte#formule" : "/"}>← {user ? "Mes paramètres" : "CarnetPass"}</Link><Link to={user ? "/espace-pro" : "/connexion"}>Accéder à l’application</Link></nav>
      <header className="pricing-intro">
        <span className="pricing-eyebrow">{testBilling ? "Paiement en mode test" : livePurchases.available ? 'Abonnement professionnel' : "Abonnement en préparation"}</span>
        <h1>CarnetPass Pro à 28 € par mois. Votre équipe grandit avec vous.</h1>
        <p>Retrouvez vos notices, suivez vos interventions et faites avancer vos recherches avec Shiba. Découvrez CarnetPass gratuitement pendant 5 jours. {!livePurchases.available && 'Les achats réels d’abonnements et de recharges ne sont pas encore ouverts.'} {testBilling && "Les paiements disponibles sont des tests Stripe sans débit réel."}</p>
        {error && <p role="alert" className="pricing-error">{error}</p>}
      </header>
      <section className="pricing-grid" aria-label="Essai et abonnement proposés">
        {offers.map((offer) => (
          <article className={`pricing-card${offer.featured ? " pricing-card--featured" : ""}`} key={offer.name}>
            <div className="pricing-card__top"><h2>{offer.name}</h2>{offer.featured && <span>Formule professionnelle</span>}</div>
            <p>{offer.audience}</p>
            <div className="pricing-card__price"><strong>{offer.price}</strong><span>{offer.priceDetail}</span></div>
            <ul>{offer.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            <small className="pricing-card__conditions">Offre soumise à des limites d’utilisation. <Link to="/conditions-commerciales">Voir les conditions</Link>.</small>
            {user && currentPlan === undefined && offer.name === "Découverte" ? (
              <span className="pricing-current" role="status">Chargement de votre formule…</span>
            ) : user && currentPlan === "free" && offer.name === "Découverte" ? (
              <span className="pricing-current" aria-label="Formule d'accès actuelle">Accès actuel : Découverte</span>
            ) : user && testBilling && offer.plan === testPlan ? (
              <span className="pricing-current" aria-label="Abonnement de test actif">Abonnement test actif : {offer.name}</span>
            ) : user && !testBilling && offer.plan && company?.subscription?.plan === 'pro' && company.subscription.status === 'active' ? (
              <Link to="/parametres-compte#formule">Gérer mon abonnement Pro</Link>
            ) : user && (testBilling || livePurchases.available) && offer.plan ? (
              <><label className="commercial-terms-acceptance"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /> J’accepte les <Link to="/conditions-commerciales" target="_blank" rel="noopener noreferrer">CGV B2B</Link> et leurs limites d’utilisation.</label><button type="button" disabled={!termsAccepted || busy || !/^\d{14}$/.test(companySiret) || !['owner', 'admin'].includes(company?.role) || (!testBilling && company?.verification?.status !== 'approved')} onClick={() => choose(offer.plan)}>S’abonner à CarnetPass Pro <span aria-hidden="true">→</span></button>
                {!['owner', 'admin'].includes(company?.role) && <p>Le responsable de l’entreprise peut souscrire l’abonnement.</p>}
                {!testBilling && company?.verification?.status !== 'approved' && <p>La validation de votre entreprise est nécessaire avant le paiement.</p>}
                {!/^\d{14}$/.test(companySiret) && <p className="pricing-error">Le SIRET de l’entreprise est obligatoire avant l’abonnement. <Link to="/espace-pro">Renseigner le SIRET</Link></p>}
                {error && errorPlan === offer.plan && <p className="pricing-error" role="alert">{error}</p>}</>
            ) : user && offer.name !== "Découverte" ? (
              <Link to="/parametres-compte#formule">S’abonner à CarnetPass Pro <span aria-hidden="true">→</span></Link>
            ) : user ? (
              <Link to="/parametres-compte#formule">Consulter ma formule <span aria-hidden="true">→</span></Link>
            ) : (
              <Link to="/inscription">Créer un compte <span aria-hidden="true">→</span></Link>
            )}
          </article>
        ))}
      </section>
      <aside className="pricing-note" id="comptes-supplementaires"><h2>Ajoutez votre équipe à CarnetPass</h2><p>20 € par mois pour chaque compte supplémentaire, avec ses propres identifiants, la consultation des notices et Shiba, agent IA. Choisissez le nombre de comptes adapté à votre entreprise. <Link to="/parametres-compte#comptes">Préparer mes comptes supplémentaires →</Link></p><p>Le compte principal reste à 28 € par mois. Les quotas et modalités figurent dans les <Link to="/conditions-commerciales">CGV B2B</Link>. {!livePurchases.seatsAvailable && 'La souscription de comptes supplémentaires reste en préparation.'}</p></aside>
      <aside className="pricing-note" id="credits">
        <h2>Recharger CarnetPass</h2>
        <p>Besoin de poursuivre vos recherches avec Shiba ? Recharges {livePurchases.available ? 'disponibles' : 'prévues'} : {SHIBA_RECHARGE_PACKS[0].credits} crédits pour {SHIBA_RECHARGE_PACKS[0].euros} € ou {SHIBA_RECHARGE_PACKS[1].credits} crédits pour {SHIBA_RECHARGE_PACKS[1].euros} €. Un crédit permet une question documentaire ou une recherche Web. Les modalités figurent dans les <Link to="/conditions-commerciales">CGV B2B</Link>. {!livePurchases.available && 'Aucun achat réel n’est ouvert.'}</p>
        {user && (testBilling || (livePurchases.available && company?.subscription?.plan === 'pro' && company.subscription.status === 'active')) && <button type="button" className="pricing-preview-recharge" onClick={() => openShibaRecharge(testBilling ? { demo: true } : { period: 'month' }, true)}>Recharger CarnetPass{testBilling ? ' (test)' : ''}</button>}
        <h2>Votre travail reste accessible.</h2>
        <p>Vos carnets et historiques restent accessibles selon vos droits après l’essai. Les accès aux notices et à Shiba dépendent de votre formule et de ses limites d’utilisation. Aucun dépassement n’est automatiquement facturé. Retrouvez le détail des quotas et des recharges dans les <Link to="/conditions-utilisation">conditions d’utilisation</Link> et les <Link to="/conditions-commerciales">CGV B2B</Link>.</p>
      </aside>
    </main>
  );
}

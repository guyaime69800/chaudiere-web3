import { COMMERCIAL_TERMS_VERSION } from "../../shared/commercial-terms.js";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth.js";
import { formatShibaResetDate, shibaCreditsExhaustedMessage } from "../lib/shiba-credit-copy.js";
import { SHIBA_RECHARGE_PACKS } from "../lib/shiba-recharge-packs.js";
import shibaTechnicien from "../assets/simba-assistance-technique.webp";
import { startShibaRecharge } from "../services/shibaRechargeService.js";
import { purchaseRequestId } from '../services/billingService.js';
import useLivePurchases from '../hooks/useLivePurchases.js';
import "./ShibaRechargeModal.css";

function dismissalKey(userId, usage) {
  return `shiba-recharge-shown:${userId}:${usage?.period || "unknown"}:${usage?.resetAt || "unknown"}`;
}

function wasDismissed(key) {
  try { return window.sessionStorage.getItem(key) === "1"; }
  catch { return false; }
}

function rememberDismissal(key) {
  try { window.sessionStorage.setItem(key, "1"); }
  catch { /* Private browsing may disable storage; closing still works. */ }
}

export default function ShibaRechargeModal() {
  const { user, session } = useAuth();
  const dialogRef = useRef(null);
  const [usage, setUsage] = useState(null);
  const [selected, setSelected] = useState(SHIBA_RECHARGE_PACKS[0].euros);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const testBilling = import.meta.env.VITE_STRIPE_TEST_BILLING_ENABLED === "true";
  const livePurchases = useLivePurchases();
  const purchasesAvailable = testBilling || livePurchases.available;

  useEffect(() => {
    function onRechargeRequested(event) {
      if (!user?.id) return;
      const nextUsage = event.detail?.usage || {};
      const key = dismissalKey(user.id, nextUsage);
      if (!event.detail?.force && wasDismissed(key)) return;
      setTermsAccepted(false);
      setUsage(nextUsage);
    }
    window.addEventListener("shiba-recharge-requested", onRechargeRequested);
    return () => window.removeEventListener("shiba-recharge-requested", onRechargeRequested);
  }, [user?.id]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (usage && dialog && !dialog.open) dialog.showModal();
    if (!usage && dialog?.open) dialog.close();
  }, [usage]);

  useEffect(() => {
    if (!user?.id && dialogRef.current?.open) dialogRef.current.close();
  }, [user?.id]);

  function dismiss() {
    if (user?.id && usage) rememberDismissal(dismissalKey(user.id, usage));
    setUsage(null);
  }

  async function checkout() {
    if (!session?.access_token || !purchasesAvailable || !termsAccepted || busy || usage?.period === "trial") return;
    setBusy(true);
    setError("");
    try {
      const attempt = purchaseRequestId(user.id, `recharge-${selected}`);
      const url = await startShibaRecharge(session.access_token, selected, { accepted: termsAccepted, version: COMMERCIAL_TERMS_VERSION }, attempt.requestId);
      attempt.complete();
      if (user?.id && usage) rememberDismissal(dismissalKey(user.id, usage));
      window.location.assign(url);
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  const reset = formatShibaResetDate(usage?.resetAt);
  const pack = SHIBA_RECHARGE_PACKS.find((item) => item.euros === selected);

  return (
    <dialog ref={dialogRef} className="shiba-recharge-dialog" aria-labelledby="shiba-recharge-title"
      onClose={dismiss} onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current.close(); }}>
      {usage && <div className="shiba-recharge-dialog__content">
        <button type="button" className="shiba-recharge-dialog__close" aria-label="Fermer" onClick={() => dialogRef.current?.close()}>×</button>
        <div className="shiba-recharge-dialog__icon" aria-hidden="true"><img src={shibaTechnicien} alt="" /></div>
        <p className="shiba-recharge-dialog__eyebrow">{usage.demo ? "Paiement de test" : "CarnetPass"}</p>
        <h2 id="shiba-recharge-title">{usage.period === "trial" ? "Quota Découverte atteint" : "Recharger CarnetPass"}</h2>
        <p>{usage.demo
          ? "Choisissez une recharge ponctuelle. Les crédits achetés s’ajoutent à votre solde et restent disponibles après le renouvellement de votre abonnement."
          : usage.remaining > 0
            ? "Vous pouvez acheter une recharge à tout moment. Les crédits achetés s’ajoutent à votre solde et restent disponibles après le renouvellement de votre abonnement."
            : shibaCreditsExhaustedMessage(usage.period)}</p>
        {!usage.demo && usage.period === "month" && reset && <p className="shiba-recharge-dialog__reset">Réinitialisation prévue le {reset} (heure de Paris).</p>}
        {!usage.demo && usage.period === "trial" && <p className="shiba-recharge-dialog__reset">L’essai Découverte ne se réinitialise pas automatiquement.</p>}
        {usage.period !== "trial" && <div className="shiba-recharge-dialog__packs" role="group" aria-label="Choisir une recharge">
          {SHIBA_RECHARGE_PACKS.map((item) => <button type="button" key={item.euros}
            className={`shiba-recharge-dialog__pack${selected === item.euros ? " is-selected" : ""}`}
            aria-pressed={selected === item.euros} onClick={() => setSelected(item.euros)}>
            <strong>{item.euros} €</strong><span>{item.credits} crédits Shiba</span>
          </button>)}
        </div>}
        {usage.period !== "trial" && <label className="commercial-terms-acceptance"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /> J’accepte les <a href="/conditions-commerciales" target="_blank" rel="noopener noreferrer">CGV B2B</a> et les conditions de recharge.</label>}
        {usage.period !== "trial" && <button type="button" className="shiba-recharge-dialog__pay" disabled={!termsAccepted || !purchasesAvailable || busy} onClick={checkout}>
          {busy ? 'Ouverture du paiement…' : `Recharger pour ${pack.euros} €`}
        </button>}
        {error && <p className="shiba-recharge-dialog__error" role="alert">{error}</p>}
        <p className="shiba-recharge-dialog__notice">Un crédit sert à une question documentaire ou une recherche Web avec Shiba. La recharge ne remplace pas Pro et n’augmente pas le quota quotidien de notices. TVA non applicable, article 293 B du CGI.</p>
        <p className="shiba-recharge-dialog__notice">{usage.period === "trial"
          ? "Les documents constructeur ne sont plus accessibles après les 20 questions de l’essai. Vos carnets et historiques restent accessibles."
          : `${testBilling
            ? "Paiement Stripe en mode test uniquement : aucun débit réel. Les crédits sont ajoutés après confirmation serveur du paiement, jamais au simple retour sur CarnetPass."
            : livePurchases.available ? 'Paiement sécurisé par Stripe. Les crédits sont ajoutés après confirmation du paiement.' : "Paiement en préparation : aucun achat ni ajout de crédits n’est encore possible."} Vos carnets, documents et historiques restent accessibles.`}</p>
      </div>}
    </dialog>
  );
}

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth.js";
import { formatShibaResetDate, shibaCreditsExhaustedMessage } from "../lib/shiba-credit-copy.js";
import { SHIBA_RECHARGE_PACKS } from "../lib/shiba-recharge-packs.js";
import shibaTechnicien from "../assets/carnetpass-shiba-technicien.png";
import { startShibaRecharge } from "../services/shibaRechargeService.js";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const testBilling = import.meta.env.VITE_STRIPE_TEST_BILLING_ENABLED === "true";

  useEffect(() => {
    function onRechargeRequested(event) {
      if (!user?.id) return;
      const nextUsage = event.detail?.usage || {};
      const key = dismissalKey(user.id, nextUsage);
      if (!event.detail?.force && wasDismissed(key)) return;
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
    if (!session?.access_token || !testBilling || busy) return;
    setBusy(true);
    setError("");
    try {
      const url = await startShibaRecharge(session.access_token, selected);
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
        <p className="shiba-recharge-dialog__eyebrow">{usage.demo ? "Aperçu Preview" : "Shiba Bot"}</p>
        <h2 id="shiba-recharge-title">Recharger Shiba Bot</h2>
        <p>{usage.demo ? "Cette fenêtre apparaîtra lorsque les crédits Shiba Bot seront épuisés." : shibaCreditsExhaustedMessage(usage.period)}</p>
        {!usage.demo && usage.period === "month" && reset && <p className="shiba-recharge-dialog__reset">Réinitialisation prévue le {reset} (heure de Paris).</p>}
        {!usage.demo && usage.period === "trial" && <p className="shiba-recharge-dialog__reset">L’essai Découverte ne se réinitialise pas automatiquement.</p>}
        <div className="shiba-recharge-dialog__packs" role="group" aria-label="Choisir une recharge">
          {SHIBA_RECHARGE_PACKS.map((item) => <button type="button" key={item.euros}
            className={`shiba-recharge-dialog__pack${selected === item.euros ? " is-selected" : ""}`}
            aria-pressed={selected === item.euros} onClick={() => setSelected(item.euros)}>
            <strong>{item.euros} € TTC</strong><span>{item.credits} crédits IA</span>
          </button>)}
        </div>
        <button type="button" className="shiba-recharge-dialog__pay" disabled={!testBilling || busy} onClick={checkout}>
          {busy ? "Ouverture du paiement test…" : `Recharger pour ${pack.euros} €`}
        </button>
        {error && <p className="shiba-recharge-dialog__error" role="alert">{error}</p>}
        <p className="shiba-recharge-dialog__notice">{testBilling
          ? "Paiement Stripe en mode test uniquement : aucun débit réel. Les crédits sont ajoutés après confirmation serveur du paiement, jamais au simple retour sur CarnetPass."
          : "Paiement en préparation : aucun achat ni ajout de crédits n’est encore possible."} Vos carnets, documents et historiques restent accessibles.</p>
      </div>}
    </dialog>
  );
}

import { useEffect, useState } from "react";
import { formatShibaResetDate, shibaCreditsExhaustedMessage } from "../lib/shiba-credit-copy.js";
import { openShibaRecharge } from "../services/shibaUsageEvents.js";
import "./ShibaUsage.css";

export default function ShibaUsage({ session }) {
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState(false);
  const userId = session?.user?.id;

  useEffect(() => {
    if (!session?.access_token) return undefined;
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/shiba-usage", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok) throw new Error("Compteur indisponible");
        const result = await response.json();
        if (active) {
          setUsage(result);
          setError(false);
          if (result.enabled && result.remaining <= 0) openShibaRecharge(result);
          else if (result.enabled && result.remaining > 0) {
            try { window.sessionStorage.removeItem(`shiba-recharge-shown:${userId}:${result.period || "unknown"}:${result.resetAt || "unknown"}`); }
            catch { /* Private browsing can disable storage. */ }
          }
        }
      } catch {
        if (active) setError(true);
      }
    }
    load();
    window.addEventListener("shiba-usage-changed", load);
    const returningFromRecharge = new URLSearchParams(window.location.search).get("recharge") === "retour";
    const timer = window.setInterval(load, 60_000);
    const fastTimer = returningFromRecharge ? window.setInterval(load, 5_000) : null;
    const fastStop = returningFromRecharge ? window.setTimeout(() => window.clearInterval(fastTimer), 60_000) : null;
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      if (fastTimer) window.clearInterval(fastTimer);
      if (fastStop) window.clearTimeout(fastStop);
      window.removeEventListener("shiba-usage-changed", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session?.access_token, userId]);

  if (!session?.access_token || usage?.enabled === false) return null;
  if (error) return <p className="shiba-usage shiba-usage--error">Le compteur de questions est momentanément indisponible.</p>;
  if (!usage) return <p className="shiba-usage">Chargement du compteur Shiba Bot…</p>;
  const reset = formatShibaResetDate(usage.resetAt);
  const exhausted = usage.remaining <= 0;
  const includedRemaining = Math.max(0, usage.limit - usage.used);
  const purchasedRemaining = Math.max(0, Number(usage.bonusRemaining) || 0);
  const testBilling = import.meta.env.VITE_STRIPE_TEST_BILLING_ENABLED === "true";
  return (
    <div className="shiba-usage" aria-live="polite">
      <div className="shiba-usage__line"><strong>Shiba Bot · documents et Web</strong><span>{exhausted ? "Crédits épuisés" : "Disponible"}</span></div>
      <div className="shiba-usage__balances">
        <span>Crédits inclus disponibles : <strong>{includedRemaining}</strong></span>
        <span>Crédits achetés disponibles : <strong>{purchasedRemaining}</strong></span>
        <span>Total disponible : <strong>{usage.remaining}</strong></span>
      </div>
      {exhausted ? (
        <>
          <p className="shiba-usage__exhausted">{shibaCreditsExhaustedMessage(usage.period)}</p>
          {usage.period === "month" && reset && <small>Réinitialisation prévue le {reset} (heure de Paris).</small>}
          {usage.period === "trial" && reset && <small>Fin de l’essai le {reset} (heure de Paris), sans réinitialisation automatique.</small>}
          <button className="shiba-usage__recharge" type="button" onClick={() => openShibaRecharge(usage, true)}>Recharger mes crédits</button>
          <small>{testBilling
            ? "La recharge Stripe est disponible uniquement en mode test Preview."
            : "La recharge est en préparation et n’est pas encore achetable."}</small>
        </>
      ) : (
        <>
          <small>{usage.period === "trial" ? "Fin de l’essai le" : "Prochaine réinitialisation le"} {reset || "date non disponible"}. Vos carnets, documents et historiques restent accessibles.</small>
          {testBilling && <button className="shiba-usage__recharge" type="button" onClick={() => openShibaRecharge(usage, true)}>Recharger mes crédits</button>}
        </>
      )}
      {exhausted && <small>Vos carnets, documents et historiques restent accessibles.</small>}
    </div>
  );
}

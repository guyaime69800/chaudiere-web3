import { useEffect, useState } from "react";
import { formatShibaResetDate, shibaCreditsExhaustedMessage } from "../lib/shiba-credit-copy.js";
import { openShibaRecharge } from "../services/shibaUsageEvents.js";
import "./ShibaUsage.css";

export default function ShibaUsage({ session }) {
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState(false);

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
        }
      } catch {
        if (active) setError(true);
      }
    }
    load();
    window.addEventListener("shiba-usage-changed", load);
    const timer = window.setInterval(load, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("shiba-usage-changed", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session?.access_token]);

  if (!session?.access_token || usage?.enabled === false) return null;
  if (error) return <p className="shiba-usage shiba-usage--error">Le compteur de questions est momentanément indisponible.</p>;
  if (!usage) return <p className="shiba-usage">Chargement du compteur Shiba Bot…</p>;
  const reset = formatShibaResetDate(usage.resetAt);
  const exhausted = usage.remaining <= 0;
  return (
    <div className="shiba-usage" aria-live="polite">
      <div className="shiba-usage__line"><strong>Shiba Bot · documents et Web</strong><span>{exhausted ? "Crédits épuisés" : "Disponible"}</span></div>
      {exhausted ? (
        <>
          <p className="shiba-usage__exhausted">{shibaCreditsExhaustedMessage(usage.period)}</p>
          {usage.period === "month" && reset && <small>Réinitialisation prévue le {reset} (heure de Paris).</small>}
          {usage.period === "trial" && reset && <small>Fin de l’essai le {reset} (heure de Paris), sans réinitialisation automatique.</small>}
          <button className="shiba-usage__recharge" type="button" onClick={() => openShibaRecharge(usage, true)}>Recharger mes crédits</button>
          <small>La recharge est en préparation et n’est pas encore achetable.</small>
        </>
      ) : (
        <small>{usage.period === "trial" ? "Fin de l’essai le" : "Prochaine réinitialisation le"} {reset || "date non disponible"}. Vos carnets, documents et historiques restent accessibles.</small>
      )}
      {exhausted && <small>Vos carnets, documents et historiques restent accessibles.</small>}
    </div>
  );
}

import { useEffect, useState } from "react";
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
        if (active) { setUsage(result); setError(false); }
      } catch {
        if (active) setError(true);
      }
    }
    load();
    window.addEventListener("shiba-usage-changed", load);
    return () => { active = false; window.removeEventListener("shiba-usage-changed", load); };
  }, [session?.access_token]);

  if (!session?.access_token || usage?.enabled === false) return null;
  if (error) return <p className="shiba-usage shiba-usage--error">Le compteur de questions est momentanément indisponible.</p>;
  if (!usage) return <p className="shiba-usage">Chargement du compteur Shiba Bot…</p>;
  const reset = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(new Date(usage.resetAt));
  return (
    <div className="shiba-usage" aria-live="polite">
      <div className="shiba-usage__line"><strong>Questions à Shiba Bot · documents et Web</strong><span>{usage.used} / {usage.limit} {usage.period === "trial" ? "pendant l’essai" : "ce mois"}</span></div>
      <progress value={Math.min(usage.used, usage.limit)} max={usage.limit} aria-label="Questions à Shiba Bot utilisées" />
      <small>{usage.remaining ? `${usage.remaining} question${usage.remaining > 1 ? "s" : ""} restante${usage.remaining > 1 ? "s" : ""}` : "Limite atteinte : nouvelles questions suspendues"} · {usage.period === "trial" ? "fin de l’essai le" : "remise à zéro le"} {reset}. Vos carnets et documents restent accessibles.</small>
    </div>
  );
}

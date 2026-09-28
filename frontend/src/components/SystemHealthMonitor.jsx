import { useEffect, useState } from "react";
import "./SystemHealthMonitor.css";

const labels = { database: "Base de données", redis: "Protection des requêtes", ai: "Shiba Bot", email: "E-mails", stripeTest: "Stripe test" };

export default function SystemHealthMonitor({ companyRole, accessToken }) {
  const canMonitor = ["owner", "admin"].includes(companyRole);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!canMonitor || !accessToken) return undefined;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/system-health", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Contrôle des services indisponible.");
        setResult(await response.json());
        setError("");
      } catch (loadError) {
        if (loadError.name !== "AbortError") setError(loadError.message);
      }
    }
    load();
    const interval = window.setInterval(load, 300000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [accessToken, canMonitor, refresh]);

  if (!canMonitor) return null;
  return <section className="system-health" aria-live="polite">
    <div className="system-health__heading"><div><span>SURVEILLANCE CARNETPASS</span><h2>{error ? "Contrôle indisponible" : result?.ok ? "Services configurés" : result ? "Anomalie à vérifier" : "Vérification des services…"}</h2></div><button type="button" onClick={() => setRefresh((value) => value + 1)}>Actualiser</button></div>
    {error && <p role="alert">{error}</p>}
    {result && <><ul>{Object.entries(result.checks).filter(([, status]) => status !== "not_applicable").map(([name, status]) => <li key={name}><span>{labels[name] || name}</span><strong className={status === "unavailable" ? "system-health__problem" : ""}>{status === "ok" ? "Opérationnel" : status === "configured" ? "Configuré" : "À vérifier"}</strong></li>)}</ul><small>Contrôle effectué à {new Date(result.checkedAt).toLocaleTimeString("fr-FR")}. « Configuré » confirme la présence d’une clé, pas la disponibilité du service externe. Vérification automatique pendant l’ouverture de cette page.</small></>}
  </section>;
}

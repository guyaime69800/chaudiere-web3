import { useEffect, useState } from "react";
import "./PolygonWalletMonitor.css";

function formatPolAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount);
}

export function PolygonWalletMonitor({ companyRole, accessToken }) {
  const canMonitor = ["owner", "admin"].includes(companyRole);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!canMonitor || !accessToken) return undefined;

    const controller = new AbortController();
    let cancelled = false;

    async function loadStatus() {
      try {
        const response = await fetch("/api/polygon-status", {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: controller.signal,
        });
        const result = await response.json();

        if (!response.ok || result?.ok !== true) {
          throw new Error(
            result?.error || "Impossible de vérifier le solde POL."
          );
        }

        if (!cancelled) setStatus(result.polygon);
      } catch (loadError) {
        if (!cancelled && loadError?.name !== "AbortError") {
          setError(
            loadError?.message || "Impossible de vérifier le solde POL."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStatus();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [accessToken, canMonitor, refreshKey]);

  if (!canMonitor) return null;

  const operationalIssue = Boolean(
    status
    && (
      status.chainId !== 137
      || status.paused
      || !status.serverAuthorized
    )
  );

  const level = operationalIssue
    ? "critical"
    : status?.balanceStatus || "unavailable";

  let title = "Contrôle Polygon indisponible";
  let message = error
    || "Le solde du wallet serveur n’a pas encore pu être vérifié.";

  if (loading) {
    title = "Vérification du wallet Polygon…";
    message =
      "CarnetPass contrôle le réseau, le contrat et la réserve de POL.";
  } else if (operationalIssue) {
    title = "Service Polygon à contrôler";
    message =
      "Le réseau, l’autorisation du wallet ou l’état du contrat empêche une utilisation normale.";
  } else if (status?.balanceStatus === "critical") {
    title = "Réserve POL critique";
    message =
      `Recharge nécessaire : le seuil critique est fixé à ${status.balanceThresholds?.criticalPol || "0.10"} POL.`;
  } else if (status?.balanceStatus === "warning") {
    title = "Réserve POL faible";
    message =
      `Recharge recommandée avant d’atteindre ${status.balanceThresholds?.criticalPol || "0.10"} POL.`;
  } else if (status?.balanceStatus === "healthy") {
    title = "Wallet Polygon opérationnel";
    message =
      `Alerte automatique à partir de ${status.balanceThresholds?.warningPol || "0.30"} POL.`;
  }

  return (
    <section
      className={`pro-polygon-monitor pro-polygon-monitor--${level}`}
      aria-live="polite"
    >
      <div className="pro-polygon-monitor-main">
        <span className="pro-polygon-monitor-icon" aria-hidden="true">
          {level === "healthy" ? "✓" : "!"}
        </span>

        <div>
          <span className="pro-polygon-monitor-label">
            SURVEILLANCE BLOCKCHAIN
          </span>
          <h2>{title}</h2>
          <p>{message}</p>
        </div>
      </div>

      <div className="pro-polygon-monitor-actions">
        {status && (
          <strong>{formatPolAmount(status.balancePol)} POL</strong>
        )}

        <div>
          {status?.serverWalletAddress && (
            <a
              href={`https://polygonscan.com/address/${status.serverWalletAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              Voir sur PolygonScan
            </a>
          )}

          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError("");
              setRefreshKey((currentKey) => currentKey + 1);
            }}
            disabled={loading}
          >
            {loading ? "Contrôle…" : "Actualiser"}
          </button>
        </div>
      </div>
    </section>
  );
}
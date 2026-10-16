import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

// SPA navigation must pass a fresh server decision before mounting pages or loading their data.
export default function AccessBoundary({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  const pathname = decodeURIComponent(location.pathname).replace(/\/+$/, "").toLowerCase();
  const token = session?.access_token;
  const key = `${location.pathname}:${location.search}:${token || ""}`;
  const [decision, setDecision] = useState(null);
  const privateLogin = ["/connexion-interne", "/securite-compte", "/reinitialiser-mot-de-passe"].includes(location.pathname);
  useEffect(() => {
    if (loading || privateLogin) return;
    let active = true;
    let running = false;
    async function check() {
      if (running) return;
      running = true;
      try {
        const response = await fetch("/api/access-session", {
          cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const result = await response.json();
        const required = pathname === "/administration-maintenance" ? "founder"
          : pathname.startsWith("/administration-") ? "operator" : null;
        const allowed = response.ok && (!required || result.role === "founder" || (required === "operator" && result.role === "operator"));
        if (active) setDecision({ key, allowed, mfaRequired: result.mfaRequired === true, maintenance: result.maintenance === true, message: result.message });
        if (active && allowed && result.role && token) {
          await fetch("/api/access-session", { method: "POST", cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
        }
      } catch {
        if (active) setDecision({ key, allowed: false });
      } finally { running = false; }
    }
    check();
    const timer = setInterval(check, 30000);
    window.addEventListener("focus", check);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", check); };
  }, [key, token, loading, privateLogin, pathname]);

  if (privateLogin) return children;
  if (loading || decision?.key !== key) return <main><p role="status">Vérification de l’accès…</p></main>;
  if (decision.mfaRequired) return <Navigate to="/securite-compte" replace state={{ from: location }} />;
  if (!decision.allowed) return <main style={{ maxWidth: 650, margin: "15vh auto", padding: 28 }}>
    <h1>{decision.maintenance ? "Le site est momentanément en maintenance." : "Accès indisponible."}</h1>
    {decision.maintenance && <p>{decision.message || "Merci de revenir dans quelques instants."}</p>}
  </main>;
  return children;
}

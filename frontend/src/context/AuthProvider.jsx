import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { AuthContext } from "./AuthContext";
import { loadMfaSecurity } from "../services/mfaService";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (!loading && !session) fetch("/api/access-session", { method: "DELETE", cache: "no-store" }).catch(() => {}); }, [loading, session]);
  const [security, setSecurity] = useState(null);
  const [securityRetry, setSecurityRetry] = useState(0);
  const refreshSecurity = useCallback(() => setSecurityRetry((value) => value + 1), []);
  const securityLoading = Boolean(session?.access_token && security?.token !== session.access_token);
  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    let active = true;
    loadMfaSecurity(token).then((result) => {
      if (active) setSecurity({ ...result, token, error: "" });
    }).catch(() => {
      if (active) setSecurity({ token, error: "Le contrôle de sécurité est indisponible. Réessayez.", factors: [] });
    });
    return () => { active = false; };
  }, [session?.access_token, securityRetry]);
  useEffect(() => {
    if (!session?.access_token || securityLoading || security?.error || security?.needsVerification) return;
    // Only the server-confirmed founder receives a pass; other users get 403.
    fetch("/api/access-session", {
      method: "POST", cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` },
    }).catch(() => {});
  }, [session?.access_token, securityLoading, security?.error, security?.needsVerification]);

  useEffect(() => {
    let isActive = true;

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!isActive) {
        return;
      }

      if (error) {
        console.error("Impossible de récupérer la session Supabase.");
        setSession(null);
      } else {
        setSession(data.session);
      }

      setLoading(false);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isActive) {
        return;
      }

      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      security,
      securityLoading,
      refreshSecurity,
    }),
    [session, loading, security, securityLoading, refreshSecurity]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

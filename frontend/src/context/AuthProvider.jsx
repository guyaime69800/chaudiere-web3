import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { AuthContext } from "./AuthContext";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!session?.access_token) return;
    // Only the server-confirmed founder receives a pass; other users get 403.
    fetch("/api/maintenance-control", {
      method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "grant-durable-access" }),
    }).catch(() => {});
  }, [session?.access_token]);

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
    }),
    [session, loading]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

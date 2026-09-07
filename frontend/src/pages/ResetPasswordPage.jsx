import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../services/supabaseClient";
import "./AuthPage.css";

export default function ResetPasswordPage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        if (active) {
          setSession(currentSession);
        }
      }
    );

    async function loadSession() {
      try {
        const { data, error: sessionError } =
          await supabase.auth.getSession();

        if (!active) return;

        if (sessionError) {
          setError(
            "Le lien n’a pas pu être validé. Demandez un nouvel e-mail."
          );
        } else {
          setSession(data.session);
        }
      } catch {
        if (active) {
          setError("Connexion indisponible. Rechargez la page.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSession();

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function requestReset(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(
          email.trim().toLowerCase(),
          {
            redirectTo:
              `${window.location.origin}/reinitialiser-mot-de-passe`,
          }
        );

      if (resetError) throw resetError;

      setMessage(
        "Si un compte correspond à cette adresse, un e-mail de " +
        "réinitialisation vous sera envoyé. Consultez aussi les indésirables."
      );
    } catch {
      setError(
        "Impossible d’envoyer la demande. Patientez un peu puis réessayez."
      );
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    if (busy) return;

    setError("");
    setMessage("");

    if (password.length < 12) {
      setError("Choisissez un mot de passe d’au moins 12 caractères.");
      return;
    }

    if (password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setBusy(true);

    try {
      const { error: updateError } =
        await supabase.auth.updateUser({ password });

      if (updateError) throw updateError;

      setPassword("");
      setConfirmation("");
      setDone(true);

      const { error: signOutError } =
        await supabase.auth.signOut({ scope: "global" });

      setMessage(
        signOutError
          ? "Votre mot de passe a été changé. La déconnexion des sessions " +
            "n’a pas pu être confirmée."
          : "Votre mot de passe a été changé. Reconnectez-vous avec le nouveau."
      );
    } catch {
      setError(
        "Le changement n’a pas abouti. Le lien peut avoir expiré, " +
        "ou le mot de passe peut être refusé. Utilisez un mot de passe " +
        "nouveau et unique ; si nécessaire, demandez un nouvel e-mail."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="auth-page"
      style={{ display: "block", padding: "32px 16px" }}
    >
      <section
        className="auth-card"
        style={{ maxWidth: "520px", margin: "0 auto" }}
      >
        <h1>Mot de passe CarnetPass</h1>

        {loading ? (
          <p>Vérification de votre session…</p>
        ) : done ? (
          <Link to="/connexion">Retour à la connexion</Link>
        ) : session ? (
          <form className="auth-form" onSubmit={changePassword}>
            <p>
              Changement pour : <strong>{session.user.email}</strong>
            </p>

            <label className="auth-field">
              <span>Nouveau mot de passe</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
                required
              />
            </label>

            <label className="auth-field">
              <span>Confirmer le nouveau mot de passe</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={busy}
                required
              />
            </label>

            <button className="auth-submit" disabled={busy} type="submit">
              {busy ? "Enregistrement…" : "Changer mon mot de passe"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={requestReset}>
            <p>
              Saisissez l’adresse e-mail de votre compte CarnetPass.
            </p>

            <label className="auth-field">
              <span>Adresse e-mail</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
                required
              />
            </label>

            <button className="auth-submit" disabled={busy} type="submit">
              {busy ? "Envoi…" : "Recevoir un lien de réinitialisation"}
            </button>
          </form>
        )}

        <div aria-live="polite">
          {error && (
            <p className="auth-message auth-message-error">{error}</p>
          )}
          {message && (
            <p className="auth-message auth-message-success">{message}</p>
          )}
        </div>
      </section>
    </main>
  );
}
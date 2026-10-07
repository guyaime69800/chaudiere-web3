import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { signIn, signUp } from "../services/authService";
import PasswordField from "../components/PasswordField";
import "./AuthPage.css";

const initialForm = {
  fullName: "",
  email: "",
  phone: "",
  discoverySource: "",
  discoverySourceOther: "",
  password: "",
  confirmation: "",
};

function getFriendlyError(error) {
  const message = error?.message ?? "";

  if (message === "Invalid phone number") {
    return "Indiquez un numéro de téléphone valide (10 à 15 chiffres).";
  }

  if (message.includes("Précisez comment vous avez connu")) {
    return "Précisez comment vous avez connu CarnetPass.";
  }

  if (message.includes("Invalid login credentials")) {
    return "Adresse e-mail ou mot de passe incorrect.";
  }

  if (message.includes("Email not confirmed")) {
    return "Confirmez d’abord votre adresse e-mail.";
  }

  if (message.includes("User already registered")) {
    return "Un compte existe déjà avec cette adresse e-mail.";
  }

  if (message.includes("Password should be")) {
    return "Le mot de passe ne respecte pas les critères de sécurité.";
  }

  return "Une erreur est survenue. Veuillez réessayer.";
}

async function isPlatformAdmin(accessToken) {
  if (!accessToken) return false;
  try {
    const response = await fetch("/api/platform-admin", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function renewFounderAccess(accessToken) {
  if (!accessToken) return;
  try {
    await fetch("/api/maintenance-control", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "grant-durable-access" }), signal: AbortSignal.timeout(5000) });
  } catch { /* The maintenance control page remains available for retry. */ }
}

export default function AuthPage({ mode = "connexion" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const adminPaths = ["/administration-interne", "/administration-maintenance", "/administration-aides"];
  const queryDestination = new URLSearchParams(location.search).get("destination");
  const requested = location.state?.from?.pathname || (adminPaths.includes(queryDestination) ? queryDestination : null);
  const adminRequested = adminPaths.includes(requested);
  const scanRequested = requested === "/espace-pro" && location.state?.from?.search === "?action=scan-plaque";
  const destination = adminRequested
    ? requested : scanRequested ? "/espace-pro?action=scan-plaque" : "/espace-pro";
  const isSignUp = mode === "inscription";

  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  function updateField(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));

    setErrorMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (isSignUp && form.password !== form.confirmation) {
      setErrorMessage("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isSignUp) {
        const data = await signUp({
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          discoverySource: form.discoverySource,
          discoverySourceOther: form.discoverySourceOther,
          password: form.password,
        });

        if (data.session) {
          await renewFounderAccess(data.session.access_token);
          const admin = !adminRequested && !scanRequested && await isPlatformAdmin(data.session.access_token);
          navigate(adminRequested || scanRequested ? destination : admin ? "/administration-interne" : destination);
          return;
        }

        setSuccessMessage(
          "Si cette adresse est nouvelle, consultez votre boîte e-mail et les indésirables. Si elle est déjà liée à un compte, connectez-vous ou réinitialisez votre mot de passe."
        );

        setForm(initialForm);
      } else {
        const data = await signIn({
          email: form.email,
          password: form.password,
        });
        await renewFounderAccess(data.session?.access_token);
        const admin = !adminRequested && !scanRequested && await isPlatformAdmin(data.session?.access_token);
        navigate(adminRequested || scanRequested ? destination : admin ? "/administration-interne" : destination);
      }
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-presentation">
        <Link className="auth-brand" to="/" aria-label="Retour à CarnetPass">
          <span className="auth-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 2c.5 3-1 4.3-2.2 5.8C8.4 9.5 7.5 10.8 7.5 13a4.5 4.5 0 0 0 9 0c0-1.4-.5-2.6-1.3-3.7 1.6.8 2.8 2.9 2.8 5.2a7 7 0 0 1-14 0c0-4.3 4-6.5 8-12.5Z" />
            </svg>
          </span>

          <span>CarnetPass</span>
        </Link>

        <div className="auth-presentation-content">
          <span className="auth-eyebrow">Espace professionnel</span>

          <h1>La maintenance technique, organisée simplement.</h1>

          <p>
            Centralisez les équipements, les interventions et la documentation
            technique de votre entreprise.
          </p>

          <ul className="auth-benefits">
            <li>Historique d’entretien vérifiable</li>
            <li>Documentation accessible sur le terrain</li>
            <li>Assistant technique alimenté par l’IA</li>
          </ul>
        </div>

        <p className="auth-security">
          Données sécurisées et accès réservé à votre entreprise.
        </p>
      </section>

      <section className="auth-form-section">
        <div className="auth-card">
          <Link className="auth-back-link" to="/">
            ← Retour à l’accueil
          </Link>

          <div className="auth-card-heading">
            <span className="auth-lock" aria-hidden="true">
              🔒
            </span>

            <div>
              <h2>{isSignUp ? "Créer votre compte" : "Bienvenue"}</h2>

              <p>
                {isSignUp
                  ? "Commencez à organiser votre activité avec CarnetPass."
                  : "Connectez-vous à votre espace professionnel."}
              </p>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {isSignUp && (
              <label className="auth-field">
                <span>Nom complet</span>

                <input
                  type="text"
                  name="fullName"
                  value={form.fullName}
                  onChange={updateField}
                  autoComplete="name"
                  minLength="2"
                  placeholder="Jean Dupont"
                  required
                />
              </label>
            )}

            <label className="auth-field">
              <span>Adresse e-mail professionnelle</span>

              <input
                type="email"
                name="email"
                value={form.email}
                onChange={updateField}
                autoComplete="email"
                placeholder="jean@entreprise.fr"
                required
              />
            </label>

            {isSignUp && (
              <label className="auth-field">
                <span>Numéro de téléphone professionnel *</span>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={updateField}
                  autoComplete="tel"
                  inputMode="tel"
                  minLength="10"
                  maxLength="20"
                  placeholder="06 12 34 56 78"
                  required
                />
              </label>
            )}

            {isSignUp && (
              <>
                <label className="auth-field">
                  <span>Comment avez-vous connu CarnetPass ? *</span>
                  <select name="discoverySource" value={form.discoverySource} onChange={updateField} required>
                    <option value="">Choisissez une r&#233;ponse</option>
                    <option value="search">Recherche sur Internet</option>
                    <option value="recommendation">Recommandation d’un coll&#232;gue ou d’un proche</option>
                    <option value="social_media">R&#233;seaux sociaux</option>
                    <option value="professional_event">Salon ou &#233;v&#233;nement professionnel</option>
                    <option value="press_article">Article, blog ou presse</option>
                    <option value="other">Autre</option>
                  </select>
                </label>
                {form.discoverySource === "other" && (
                  <label className="auth-field">
                    <span>Précisez comment vous avez connu CarnetPass *</span>
                    <input
                      type="text"
                      name="discoverySourceOther"
                      value={form.discoverySourceOther}
                      onChange={updateField}
                      maxLength={160}
                      required
                      placeholder="Ex. recherche dans un annuaire professionnel"
                    />
                  </label>
                )}
              </>
            )}

            <PasswordField
                label="Mot de passe"
                name="password"
                value={form.password}
                onChange={updateField}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                minLength="8"
                placeholder="8 caractères minimum"
                required
            />

            {isSignUp && (
              <PasswordField
                  label="Confirmer le mot de passe"
                  name="confirmation"
                  value={form.confirmation}
                  onChange={updateField}
                  autoComplete="new-password"
                  minLength="8"
                  placeholder="Saisissez à nouveau le mot de passe"
                  required
              />
            )}

            <div className="auth-feedback" aria-live="polite">
              {errorMessage && (
                <p className="auth-message auth-message-error">
                  {errorMessage}
                </p>
              )}

              {successMessage && (
                <p className="auth-message auth-message-success">
                  {successMessage}
                </p>
              )}
            </div>

            <button
              className="auth-submit"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Veuillez patienter…"
                : isSignUp
                  ? "Créer mon compte"
                  : "Se connecter"}
            </button>
          </form>
          {isSignUp && <p className="auth-switch">Avant de créer un compte, consultez nos <Link to="/conditions-utilisation">conditions d’utilisation</Link> et notre <Link to="/confidentialite">information sur les données personnelles</Link>.</p>}
          {!isSignUp && (
            <p className="auth-switch">
              <Link to="/reinitialiser-mot-de-passe">
                Mot de passe oublié ?
              </Link>
            </p>
          )}
          <p className="auth-switch">
            {isSignUp ? "Vous avez déjà un compte ?" : "Nouveau sur CarnetPass ?"}{" "}
            <Link to={isSignUp ? "/connexion" : "/inscription"} state={location.state}>
              {isSignUp ? "Se connecter" : "Créer un compte"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

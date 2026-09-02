import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signIn, signUp } from "../services/authService";
import "./AuthPage.css";

const initialForm = {
  fullName: "",
  email: "",
  password: "",
  confirmation: "",
};

function getFriendlyError(error) {
  const message = error?.message ?? "";

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

export default function AuthPage({ mode = "connexion" }) {
  const navigate = useNavigate();
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
          password: form.password,
        });

        if (data.session) {
          navigate("/espace-pro");
          return;
        }

        setSuccessMessage(
          "Compte créé ! Consultez votre boîte e-mail pour confirmer votre inscription."
        );

        setForm(initialForm);
      } else {
        await signIn({
          email: form.email,
          password: form.password,
        });

        navigate("/espace-pro");
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

            <label className="auth-field">
              <span>Mot de passe</span>

              <input
                type="password"
                name="password"
                value={form.password}
                onChange={updateField}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                minLength="8"
                placeholder="8 caractères minimum"
                required
              />
            </label>

            {isSignUp && (
              <label className="auth-field">
                <span>Confirmer le mot de passe</span>

                <input
                  type="password"
                  name="confirmation"
                  value={form.confirmation}
                  onChange={updateField}
                  autoComplete="new-password"
                  minLength="8"
                  placeholder="Saisissez à nouveau le mot de passe"
                  required
                />
              </label>
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

          <p className="auth-switch">
            {isSignUp ? "Vous avez déjà un compte ?" : "Nouveau sur CarnetPass ?"}{" "}
            <Link to={isSignUp ? "/connexion" : "/inscription"}>
              {isSignUp ? "Se connecter" : "Créer un compte"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
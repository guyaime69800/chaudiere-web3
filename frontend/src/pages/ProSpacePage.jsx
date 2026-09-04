import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { signOut } from "../services/authService";
import {
  createCompany,
  getMyCompany,
} from "../services/companyService";
import "./ProSpacePage.css";

const EMPTY_FORM = {
  name: "",
  siret: "",
  phone: "",
  jobTitle: "",
};

function Brand() {
  return (
    <Link className="pro-brand" to="/">
      <span className="pro-brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 2c.5 3-1 4.3-2.2 5.8C8.4 9.5 7.5 10.8 7.5 13a4.5 4.5 0 0 0 9 0c0-1.4-.5-2.6-1.3-3.7 1.6.8 2.8 2.9 2.8 5.2a7 7 0 0 1-14 0c0-4.3 4-6.5 8-12.5Z" />
        </svg>
      </span>

      <span>CarnetPass</span>
    </Link>
  );
}

function getPlanLabel(plan) {
  const labels = {
    free: "Découverte",
    pro: "Professionnel",
    enterprise: "Entreprise",
  };

  return labels[plan] || "Découverte";
}

function getRoleLabel(role) {
  const labels = {
    owner: "Propriétaire",
    admin: "Administrateur",
    technician: "Technicien",
  };

  return labels[role] || role;
}

export default function ProSpacePage() {
  const { user } = useAuth();
  const userId = user?.id;

  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCompany() {
      if (!userId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError("");

      try {
        const companyData = await getMyCompany(userId);

        if (!cancelled) {
          setCompany(companyData);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCompany();

    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");

    if (!form.name.trim()) {
      setFormError("Indiquez le nom de votre entreprise.");
      return;
    }

    const siretDigits = form.siret.replace(/\D/g, "");

    if (form.siret.trim() && siretDigits.length !== 14) {
      setFormError(
        "Le SIRET doit contenir exactement 14 chiffres."
      );
      return;
    }

    setSubmitting(true);

    try {
      await createCompany(form);
      setForm(EMPTY_FORM);
      setLoading(true);
      setRefreshKey((currentKey) => currentKey + 1);
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);

    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  if (loading) {
    return (
      <main className="pro-space pro-space--center">
        <div className="pro-loading" role="status">
          <span className="pro-spinner" />
          <strong>Préparation de votre espace professionnel</strong>
          <span>Nous chargeons les informations de votre compte…</span>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="pro-space pro-space--center">
        <section className="pro-error-card">
          <span className="pro-error-icon" aria-hidden="true">
            !
          </span>

          <h1>Impossible de charger votre espace</h1>
          <p>{loadError}</p>

          <button
            className="pro-primary-button"
            type="button"
            onClick={() =>
              setRefreshKey((currentKey) => currentKey + 1)
            }
          >
            Réessayer
          </button>

          <Link className="pro-text-link" to="/">
            Retourner à l’accueil
          </Link>
        </section>
      </main>
    );
  }

  if (!company) {
    return (
      <main className="pro-space">
        <header className="pro-header">
          <Brand />

          <div className="pro-header-actions">
            <span className="pro-secure-badge">
              <span aria-hidden="true">🔒</span>
              Session sécurisée
            </span>

            <button
              className="pro-logout-button"
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? "Déconnexion…" : "Se déconnecter"}
            </button>
          </div>
        </header>

        <section className="pro-onboarding">
          <div className="pro-onboarding-intro">
            <span className="pro-eyebrow">
              CONFIGURATION DE VOTRE ESPACE
            </span>

            <h1>
              Votre entreprise,
              <br />
              prête pour le terrain.
            </h1>

            <p>
              Configurez votre espace CarnetPass pour centraliser
              les équipements, les interventions et la
              documentation technique.
            </p>

            <div className="pro-benefits">
              <article>
                <span aria-hidden="true">01</span>
                <div>
                  <strong>Un espace professionnel sécurisé</strong>
                  <p>
                    Les données restent accessibles uniquement aux
                    membres autorisés.
                  </p>
                </div>
              </article>

              <article>
                <span aria-hidden="true">02</span>
                <div>
                  <strong>Une équipe organisée</strong>
                  <p>
                    Ajoutez ensuite vos administrateurs et vos
                    techniciens.
                  </p>
                </div>
              </article>

              <article>
                <span aria-hidden="true">03</span>
                <div>
                  <strong>Une formule découverte</strong>
                  <p>
                    Votre espace démarre avec l’abonnement gratuit
                    CarnetPass.
                  </p>
                </div>
              </article>
            </div>
          </div>

          <section className="pro-onboarding-card">
            <div className="pro-step">
              <span>Étape 1 sur 1</span>
              <span>Création de l’entreprise</span>
            </div>

            <div className="pro-card-heading">
              <span className="pro-heading-icon" aria-hidden="true">
                🏢
              </span>

              <div>
                <h2>Parlez-nous de votre activité</h2>
                <p>
                  Ces informations permettront de personnaliser
                  votre tableau de bord.
                </p>
              </div>
            </div>

            <form className="pro-form" onSubmit={handleSubmit}>
              <label>
                <span>Nom de l’entreprise *</span>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Ex. Entreprise Dupont Chauffage"
                  autoComplete="organization"
                  required
                />
              </label>

              <div className="pro-form-row">
                <label>
                  <span>SIRET</span>
                  <input
                    type="text"
                    name="siret"
                    value={form.siret}
                    onChange={handleChange}
                    placeholder="14 chiffres"
                    inputMode="numeric"
                  />
                  <small>Optionnel pendant les tests</small>
                </label>

                <label>
                  <span>Téléphone professionnel</span>
                  <input
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="06 12 34 56 78"
                    autoComplete="tel"
                  />
                </label>
              </div>

              <label>
                <span>Votre fonction</span>
                <input
                  type="text"
                  name="jobTitle"
                  value={form.jobTitle}
                  onChange={handleChange}
                  placeholder="Ex. Gérant, responsable ou technicien"
                  autoComplete="organization-title"
                />
              </label>

              {formError && (
                <p className="pro-form-error" role="alert">
                  {formError}
                </p>
              )}

              <button
                className="pro-primary-button"
                type="submit"
                disabled={submitting}
              >
                {submitting
                  ? "Création de votre espace…"
                  : "Créer mon espace professionnel"}
              </button>

              <p className="pro-form-notice">
                🔒 Vos données sont protégées par les règles de
                sécurité CarnetPass.
              </p>
            </form>
          </section>
        </section>
      </main>
    );
  }

  const plan = company.subscription?.plan || "free";

  return (
    <main className="pro-space pro-dashboard">
      <header className="pro-header">
        <Brand />

        <div className="pro-header-actions">
          <span className="pro-plan-badge">
            Formule {getPlanLabel(plan)}
          </span>

          <button
            className="pro-logout-button"
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? "Déconnexion…" : "Se déconnecter"}
          </button>
        </div>
      </header>

      <section className="pro-dashboard-hero">
        <div>
          <span className="pro-eyebrow">ESPACE PROFESSIONNEL</span>
          <h1>Bienvenue chez {company.name}</h1>
          <p>
            Votre tableau de bord CarnetPass est maintenant prêt.
          </p>
        </div>

        <div className="pro-company-identity">
          <span className="pro-company-avatar" aria-hidden="true">
            {company.name.charAt(0).toUpperCase()}
          </span>

          <div>
            <strong>{company.name}</strong>
            <span>{getRoleLabel(company.role)}</span>
          </div>
        </div>
      </section>

      <section className="pro-stat-grid">
        <article>
          <span>Équipements suivis</span>
          <strong>0</strong>
          <small>Ajoutez votre premier équipement</small>
        </article>

        <article>
          <span>Interventions</span>
          <strong>0</strong>
          <small>L’historique apparaîtra ici</small>
        </article>

        <article>
          <span>Membres de l’équipe</span>
          <strong>1</strong>
          <small>Vous êtes le propriétaire</small>
        </article>

        <article>
          <span>Abonnement</span>
          <strong>{getPlanLabel(plan)}</strong>
          <small>Compte actif</small>
        </article>
      </section>

      <section className="pro-dashboard-grid">
        <article className="pro-dashboard-card">
          <div>
            <span className="pro-dashboard-icon" aria-hidden="true">
              🔧
            </span>
            <h2>Commencez votre espace</h2>
            <p>
              La prochaine étape permettra d’ajouter et de gérer
              les équipements de votre entreprise.
            </p>
          </div>

          <button
            className="pro-primary-button"
            type="button"
            disabled
          >
            Ajouter un équipement — bientôt
          </button>
        </article>

        <article className="pro-dashboard-card">
          <h2>Sécurité du compte</h2>

          <ul className="pro-status-list">
            <li>
              <span aria-hidden="true">✓</span>
              Adresse e-mail confirmée
            </li>
            <li>
              <span aria-hidden="true">✓</span>
              Espace protégé par authentification
            </li>
            <li>
              <span aria-hidden="true">○</span>
              Double authentification à configurer
            </li>
          </ul>
        </article>
      </section>

      <footer className="pro-footer">
        <span>
          CarnetPass — La maintenance technique organisée
          simplement.
        </span>

        <Link to="/">Retour à la consultation publique</Link>
      </footer>
    </main>
  );
}
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { signOut } from "../services/authService";
import {
  createCompany,
  getMyCompany,
  updateCompanySiret,
} from "../services/companyService";
import {
  createCompanyEquipment,
  getCompanyEquipments,
} from "../services/equipmentService";
import "./ProSpacePage.css";

const EMPTY_FORM = {
  name: "",
  siret: "",
  phone: "",
  jobTitle: "",
};

const EMPTY_EQUIPMENT_FORM = {
  equipmentType: "boiler",
  brand: "",
  model: "",
  productReference: "",
  serialNumber: "",
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

function getEquipmentTypeLabel(type) {
  const labels = {
    boiler: "Chaudière",
    heat_pump: "Pompe à chaleur",
    air_conditioning: "Climatisation",
    vmc: "VMC",
    rooftop: "Rooftop",
    other: "Autre",
  };

  return labels[type] || "Autre";
}

function CompanySiretForm({ company, onEditing, onSaved }) {
  const [siret, setSiret] = useState(company.siret || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const normalizedSiret = siret.replace(/\s/g, "");
  const unchanged = normalizedSiret === (company.siret || "");
  const canEdit = ["owner", "admin"].includes(company.role);

  async function handleSave(event) {
    event.preventDefault();
    if (busy || !canEdit || unchanged) return;
    onEditing();
    setError("");
    if (!/^\d{14}$/.test(normalizedSiret)) {
      setError("Le SIRET doit contenir exactement 14 chiffres. Les espaces sont acceptés.");
      return;
    }
    setBusy(true);
    try {
      await updateCompanySiret(company.id, normalizedSiret);
      onSaved();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pro-dashboard-grid" aria-labelledby="company-siret-title">
      <article className="pro-dashboard-card" style={{ gridColumn: "1 / -1", minWidth: 0 }}>
        <h2 id="company-siret-title">{company.siret ? "SIRET de l’entreprise" : "Renseigner mon SIRET"}</h2>
        {canEdit ? (
          <form className="pro-form" onSubmit={handleSave} aria-busy={busy}>
            <label htmlFor="company-siret">
              <span>SIRET de {company.name}</span>
              <input
                id="company-siret"
                name="companySiret"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={64}
                required
                value={siret}
                onChange={(event) => {
                  setSiret(event.target.value);
                  setError("");
                  onEditing();
                }}
                disabled={busy}
                aria-describedby={`company-siret-help${error ? " company-siret-error" : ""}`}
                aria-errormessage={error ? "company-siret-error" : undefined}
                aria-invalid={Boolean(error)}
                placeholder="14 chiffres"
              />
            </label>
            <p id="company-siret-help" className="pro-form-notice">
              L’enregistrement du SIRET ne valide pas automatiquement votre entreprise.
              Toute modification nécessite une nouvelle validation avant de créer des carnets.
              {company.verification?.status === "suspended" && " La suspension restera en place : contactez l’assistance."}
            </p>
            {error && (
              <p id="company-siret-error" className="pro-form-error" role="alert">
                {error}
              </p>
            )}
            <button className="pro-primary-button" type="submit" disabled={busy || unchanged}>
              {busy ? "Enregistrement…" : "Enregistrer le SIRET"}
            </button>
          </form>
        ) : (
          <div>
            <p>SIRET : {company.siret || "Non renseigné"}</p>
            <p>Seul le propriétaire ou un administrateur peut modifier le SIRET.</p>
          </div>
        )}
      </article>
    </section>
  );
}

export default function ProSpacePage() {
  const { user } = useAuth();
  const userId = user?.id;

  const [company, setCompany] = useState(null);
  const [siretMessage, setSiretMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [equipments, setEquipments] = useState([]);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [equipmentLoadError, setEquipmentLoadError] = useState("");
  const [equipmentFormOpen, setEquipmentFormOpen] = useState(false);
  const [equipmentForm, setEquipmentForm] = useState(
    EMPTY_EQUIPMENT_FORM
  );
  const [equipmentError, setEquipmentError] = useState("");
  const [equipmentMessage, setEquipmentMessage] = useState("");
  const [equipmentSubmitting, setEquipmentSubmitting] = useState(false);
  const [equipmentRefreshKey, setEquipmentRefreshKey] = useState(0);

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

  useEffect(() => {
    let cancelled = false;

    async function loadEquipments() {
      if (!company?.id) {
        setEquipments([]);
        return;
      }

      setEquipmentLoading(true);
      setEquipmentLoadError("");

      try {
        const equipmentData = await getCompanyEquipments(company.id);

        if (!cancelled) {
          setEquipments(equipmentData);
        }
      } catch (error) {
        if (!cancelled) {
          setEquipmentLoadError(error.message);
        }
      } finally {
        if (!cancelled) {
          setEquipmentLoading(false);
        }
      }
    }

    loadEquipments();

    return () => {
      cancelled = true;
    };
  }, [company?.id, equipmentRefreshKey]);

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

  function handleEquipmentChange(event) {
    const { name, value } = event.target;

    setEquipmentForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
    setEquipmentError("");
    setEquipmentMessage("");
  }

  async function handleEquipmentSubmit(event) {
    event.preventDefault();
    setEquipmentError("");
    setEquipmentMessage("");

    if (!equipmentForm.brand.trim()) {
      setEquipmentError("Indiquez la marque de l’équipement.");
      return;
    }

    if (!equipmentForm.model.trim()) {
      setEquipmentError("Indiquez le modèle de l’équipement.");
      return;
    }

    if (!equipmentForm.serialNumber.trim()) {
      setEquipmentError("Indiquez le numéro de série de l’équipement.");
      return;
    }

    setEquipmentSubmitting(true);

    try {
      await createCompanyEquipment(company.id, equipmentForm);
      setEquipmentForm(EMPTY_EQUIPMENT_FORM);
      setEquipmentFormOpen(false);
      setEquipmentMessage("Équipement ajouté avec succès.");
      setEquipmentRefreshKey((currentKey) => currentKey + 1);
    } catch (error) {
      setEquipmentError(error.message);
    } finally {
      setEquipmentSubmitting(false);
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
  const verification = company.verification;
  const companyApproved =
    verification?.status === "approved" &&
    /^\d{14}$/.test(company.siret || "") &&
    verification.verified_siret === company.siret &&
    Boolean(verification.verified_at);

  let verificationTitle = "Entreprise en attente de validation";
  let verificationMessage =
    "Votre entreprise doit être validée avant de pouvoir créer des carnets.";

  if (companyApproved) {
    verificationTitle = "Entreprise validée";
    verificationMessage =
      "La validation de votre entreprise permet la création de carnets.";
  } else if (verification?.status === "suspended") {
    verificationTitle = "Validation suspendue";
    verificationMessage =
      "La création de carnets est bloquée. Contactez l’assistance.";
  } else if (verification?.status === "rejected") {
    verificationTitle = "Validation refusée";
    verificationMessage =
      "Contactez l’assistance pour connaître les informations à corriger.";
  } else if (!company.siret) {
    verificationTitle = "SIRET à renseigner";
    verificationMessage =
      "Aucun SIRET n’est enregistré pour votre entreprise. Sa validation est nécessaire avant de pouvoir créer des carnets.";
  } else if (verification?.status === "approved") {
    verificationTitle = "Validation à vérifier";
    verificationMessage =
      "Les informations actuelles ne correspondent pas à une validation complète. La création de carnets reste bloquée.";
  }

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
      <section
        aria-labelledby="company-verification-title"
        className={`pro-verification ${companyApproved ? "pro-verification--approved" : ""
          }`}
      >
        <div className="pro-verification-content">
          <h2 id="company-verification-title">
            {verificationTitle}
          </h2>

          <p>{verificationMessage}</p>
        </div>

        <button
          type="button"
          className="pro-verification-button"
          onClick={() => setRefreshKey((currentKey) => currentKey + 1)}
        >
          Actualiser le statut
        </button>
      </section>
      {siretMessage && (
        <p className="pro-form-notice" role="status" style={{ padding: "0 24px", textAlign: "center" }}>
          {siretMessage}
        </p>
      )}
      <CompanySiretForm
        key={`${company.id}:${company.siret || ""}`}
        company={company}
        onEditing={() => setSiretMessage("")}
        onSaved={() => {
          setSiretMessage("SIRET enregistré. Consultez le statut de validation affiché au-dessus.");
          setLoading(true);
          setRefreshKey((currentKey) => currentKey + 1);
        }}
      />
      <section className="pro-stat-grid">
        <article>
          <span>Équipements suivis</span>
          <strong>{equipmentLoading ? "…" : equipments.length}</strong>
          <small>
            {equipments.length > 0
              ? `${equipments.length} équipement${equipments.length > 1 ? "s" : ""} enregistré${equipments.length > 1 ? "s" : ""}`
              : "Ajoutez votre premier équipement"}
          </small>
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
        <article className="pro-dashboard-card pro-equipment-card">
          <div>
            <span className="pro-dashboard-icon" aria-hidden="true">
              🔧
            </span>
            <h2>Équipements de l’entreprise</h2>
            <p>
              Ajoutez les chaudières, pompes à chaleur, climatisations
              et autres équipements suivis par votre entreprise.
            </p>
          </div>

          <button
            className="pro-primary-button"
            type="button"
            disabled={!companyApproved}
            onClick={() => {
              setEquipmentFormOpen((isOpen) => !isOpen);
              setEquipmentError("");
              setEquipmentMessage("");
            }}
          >
            {companyApproved
              ? equipmentFormOpen
                ? "Fermer le formulaire"
                : "Ajouter un équipement"
              : "Validation requise"}
          </button>

          {!companyApproved && (
            <p className="pro-equipment-lock">
              L’ajout sera disponible après la validation du SIRET de l’entreprise.
            </p>
          )}

          {equipmentMessage && (
            <p className="pro-form-success" role="status">
              {equipmentMessage}
            </p>
          )}

          {equipmentLoadError && (
            <p className="pro-form-error" role="alert">
              {equipmentLoadError}
            </p>
          )}

          {equipmentFormOpen && companyApproved && (
            <form
              className="pro-form pro-equipment-form"
              onSubmit={handleEquipmentSubmit}
              aria-busy={equipmentSubmitting}
            >
              <label>
                <span>Type d’équipement *</span>
                <select
                  name="equipmentType"
                  value={equipmentForm.equipmentType}
                  onChange={handleEquipmentChange}
                  disabled={equipmentSubmitting}
                  required
                >
                  <option value="boiler">Chaudière</option>
                  <option value="heat_pump">Pompe à chaleur</option>
                  <option value="air_conditioning">Climatisation</option>
                  <option value="vmc">VMC</option>
                  <option value="rooftop">Rooftop</option>
                  <option value="other">Autre</option>
                </select>
              </label>

              <div className="pro-form-row">
                <label>
                  <span>Marque *</span>
                  <input
                    name="brand"
                    type="text"
                    value={equipmentForm.brand}
                    onChange={handleEquipmentChange}
                    placeholder="Ex. Saunier Duval"
                    maxLength={100}
                    disabled={equipmentSubmitting}
                    required
                  />
                </label>

                <label>
                  <span>Modèle *</span>
                  <input
                    name="model"
                    type="text"
                    value={equipmentForm.model}
                    onChange={handleEquipmentChange}
                    placeholder="Ex. ThemaPlus Condens"
                    maxLength={150}
                    disabled={equipmentSubmitting}
                    required
                  />
                </label>
              </div>

              <div className="pro-form-row">
                <label>
                  <span>Référence produit</span>
                  <input
                    name="productReference"
                    type="text"
                    value={equipmentForm.productReference}
                    onChange={handleEquipmentChange}
                    placeholder="Ex. 0010017388"
                    maxLength={100}
                    disabled={equipmentSubmitting}
                  />
                </label>

                <label>
                  <span>Numéro de série *</span>
                  <input
                    name="serialNumber"
                    type="text"
                    value={equipmentForm.serialNumber}
                    onChange={handleEquipmentChange}
                    placeholder="Numéro indiqué sur l’appareil"
                    maxLength={150}
                    disabled={equipmentSubmitting}
                    required
                  />
                </label>
              </div>

              {equipmentError && (
                <p className="pro-form-error" role="alert">
                  {equipmentError}
                </p>
              )}

              <button
                className="pro-primary-button"
                type="submit"
                disabled={equipmentSubmitting}
              >
                {equipmentSubmitting
                  ? "Enregistrement…"
                  : "Enregistrer l’équipement"}
              </button>
            </form>
          )}

          {equipments.length > 0 && (
            <ul className="pro-equipment-list">
              {equipments.map((equipment) => (
                <li key={equipment.id}>
                  <div>
                    <strong>{equipment.brand} {equipment.model}</strong>
                    <span>{getEquipmentTypeLabel(equipment.equipment_type)}</span>
                    <span>N° de série : {equipment.serial_number}</span>
                  </div>
                  {equipment.product_reference && (
                    <small>Réf. {equipment.product_reference}</small>
                  )}
                </li>
              ))}
            </ul>
          )}
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

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { signOut } from "../services/authService";
import {
  createCompany,
  getMyCompany,
  updateCompanyContactDetails,
  updateCompanySiret,
  verifyMyCompany,
} from "../services/companyService";
import {
  createCompanyEquipment,
  getCompanyEquipments,
} from "../services/equipmentService";
import { getCompanyCarnetPassStatuses } from "../services/carnetPassService";
import EquipmentWorkspace from "../components/EquipmentWorkspace";
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

const MODAL_FOCUSABLE_ELEMENTS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function formatAccountDate(value) {
  if (!value) return "Non disponible";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Non disponible";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

function ModalShell({
  open,
  onClose,
  dialogId,
  titleId,
  eyebrow,
  title,
  description,
  className = "",
  initialFocusRef,
  children,
}) {
  const dialogRef = useRef(null);
  const closeCallbackRef = useRef(onClose);

  useEffect(() => {
    closeCallbackRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocusedElement = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;

    function getFocusableElements() {
      if (!dialogRef.current) return [];

      return Array.from(
        dialogRef.current.querySelectorAll(MODAL_FOCUSABLE_ELEMENTS),
      ).filter(
        (element) =>
          element.getAttribute("aria-hidden") !== "true" &&
          element.getClientRects().length > 0,
      );
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCallbackRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!dialogRef.current?.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
        return;
      }

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    const focusFrame = window.requestAnimationFrame(() => {
      const preferredElement = initialFocusRef?.current;
      const firstFocusableElement = getFocusableElements()[0];

      (preferredElement || firstFocusableElement || dialogRef.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;

      if (
        previouslyFocusedElement instanceof HTMLElement &&
        previouslyFocusedElement.isConnected
      ) {
        previouslyFocusedElement.focus();
      }
    };
  }, [initialFocusRef, open]);

  if (!open) return null;

  const descriptionId = description ? `${titleId}-description` : undefined;

  return (
    <div
      className="pro-modal-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        id={dialogId}
        className={`pro-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="pro-modal-header">
          <div>
            {eyebrow && (
              <span className="pro-action-card-label">{eyebrow}</span>
            )}

            <h2 id={titleId}>{title}</h2>

            {description && <p id={descriptionId}>{description}</p>}
          </div>

          <button
            className="pro-modal-close"
            type="button"
            aria-label={`Fermer — ${title}`}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {children}
      </section>
    </div>
  );
}

function CompanyAccountCard({
  company,
  user,
  session,
  companyVerified,
  verificationTitle,
  verificationMessage,
  verificationBusy,
  onVerify,
  onEditing,
  onSiretSaved,
  onContactSaved,
}) {
  const [activeModal, setActiveModal] = useState(null);
  const [siret, setSiret] = useState(company.siret || "");
  const [siretBusy, setSiretBusy] = useState(false);
  const [siretError, setSiretError] = useState("");
  const siretInputRef = useRef(null);
  const [contactForm, setContactForm] = useState({
    phone: company.phone || "",
    email: company.email || "",
    addressLine1: company.address_line1 || "",
    addressLine2: company.address_line2 || "",
    postalCode: company.postal_code || "",
    city: company.city || "",
    country: company.country || "France",
  });
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState("");

  const normalizedSiret = siret.replace(/\s/g, "");
  const unchanged = normalizedSiret === (company.siret || "");
  const canEdit = ["owner", "admin"].includes(company.role);
  const emailConfirmed = Boolean(
    user?.email_confirmed_at || user?.confirmed_at,
  );
  const authenticatedSession = Boolean(session?.access_token);
  const mfaConfigured = Boolean(
    Array.isArray(user?.factors) &&
    user.factors.some((factor) => factor?.status === "verified"),
  );
  const activeProtectionCount = [
    emailConfirmed,
    authenticatedSession,
    mfaConfigured,
  ].filter(Boolean).length;
  const activeProtectionLabel = `${activeProtectionCount} protection${activeProtectionCount === 1 ? "" : "s"
    } active${activeProtectionCount === 1 ? "" : "s"} sur 3`;

  const addressSummary = [
    company.address_line1,
    company.postal_code,
    company.city,
  ]
    .filter(Boolean)
    .join(", ");

  async function handleSiretSave(event) {
    event.preventDefault();

    if (siretBusy || !canEdit || unchanged) return;

    onEditing();
    setSiretError("");

    if (!/^\d{14}$/.test(normalizedSiret)) {
      setSiretError(
        "Le SIRET doit contenir exactement 14 chiffres. Les espaces sont acceptés.",
      );
      return;
    }

    setSiretBusy(true);

    try {
      await updateCompanySiret(company.id, normalizedSiret);
      onSiretSaved();
    } catch (saveError) {
      setSiretError(saveError.message);
    } finally {
      setSiretBusy(false);
    }
  }

  function handleContactChange(event) {
    const { name, value } = event.target;

    setContactForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));

    setContactError("");
  }

  async function handleContactSave(event) {
    event.preventDefault();

    if (contactBusy || !canEdit) return;

    setContactBusy(true);
    setContactError("");

    try {
      await updateCompanyContactDetails(company.id, contactForm);
      onContactSaved();
    } catch (saveError) {
      setContactError(
        saveError?.message || "Impossible d’enregistrer les coordonnées.",
      );
    } finally {
      setContactBusy(false);
    }
  }

  return (
    <>
      <section
        className="pro-dashboard-grid pro-account-grid"
        aria-label="Paramètres du compte"
      >
        <article className="pro-action-card pro-company-card">
          <div className="pro-company-card-topline">
            <div className="pro-action-card-heading">
              <span className="pro-action-card-icon" aria-hidden="true">
                🏢
              </span>

              <div>
                <span className="pro-action-card-label">
                  Compte professionnel
                </span>

                <h2>Mon entreprise</h2>
                <p>{company.name}</p>
              </div>
            </div>

            <span
              className={`pro-company-status ${companyVerified ? "pro-company-status--approved" : ""
                }`}
            >
              {verificationTitle}
            </span>
          </div>

          <div className="pro-company-summary">
            <div>
              <span>SIRET</span>
              <strong>{company.siret || "Non renseigné"}</strong>
            </div>

            <div>
              <span>Adresse officielle</span>
              <strong>{addressSummary || "À compléter"}</strong>
            </div>
          </div>

          <p className="pro-company-verification-text">{verificationMessage}</p>

          <div className="pro-company-card-actions">
            {!companyVerified && company.is_demo !== true && (
              <button
                type="button"
                className="pro-primary-button"
                disabled={
                  verificationBusy ||
                  !company.siret ||
                  company.verification?.status === "suspended"
                }
                onClick={onVerify}
              >
                {verificationBusy ? "Vérification…" : "Vérifier mon entreprise"}
              </button>
            )}

            {canEdit && (
              <button
                className="pro-action-card-button"
                type="button"
                aria-haspopup="dialog"
                aria-expanded={activeModal === "company"}
                aria-controls="company-account-modal"
                onClick={() => setActiveModal("company")}
              >
                Modifier
              </button>
            )}
          </div>
        </article>
        <div className="pro-account-side-column">
          <article className="pro-action-card pro-security-card">
            <div className="pro-action-card-heading">
              <span className="pro-action-card-icon" aria-hidden="true">
                🔐
              </span>

              <div>
                <span className="pro-action-card-label">Sécurité</span>

                <h2>Sécurité du compte</h2>
                <p>{activeProtectionLabel}</p>
              </div>
            </div>

            <button
              className="pro-action-card-button"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={activeModal === "security"}
              aria-controls="account-security-modal"
              onClick={() => setActiveModal("security")}
            >
              Voir la sécurité
            </button>
          </article>
          <article className="pro-action-card pro-compliance-card">
            <div className="pro-action-card-heading">
              <span className="pro-action-card-icon" aria-hidden="true">
                ℹ️
              </span>

              <div>
                <span className="pro-action-card-label">
                  Informations conformité
                </span>

                <h2>Ressources réglementaires</h2>

                <p>CERFA, entretien, F-Gas et Trackdéchets</p>
              </div>
            </div>

            <button
              className="pro-action-card-button"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={activeModal === "compliance"}
              aria-controls="compliance-modal"
              onClick={() => setActiveModal("compliance")}
            >
              Consulter les ressources
            </button>
          </article>
        </div>
      </section>

      <ModalShell
        open={activeModal === "company" && canEdit}
        onClose={() => setActiveModal(null)}
        dialogId="company-account-modal"
        titleId="company-account-modal-title"
        eyebrow="Compte professionnel"
        title="Informations de l’entreprise"
        description="Mettez à jour le SIRET et les coordonnées utilisées dans vos dossiers CarnetPass."
        className="pro-account-modal"
        initialFocusRef={siretInputRef}
      >
        <div className="pro-modal-status-bar">
          <div>
            <strong>{company.name}</strong>
            <span>
              {company.is_demo === true
                ? "Espace de démonstration"
                : "Compte professionnel"}
            </span>
          </div>

          <span
            className={`pro-company-status ${companyVerified ? "pro-company-status--approved" : ""
              }`}
          >
            {verificationTitle}
          </span>
        </div>

        <div className="pro-company-modal-grid">
          <section className="pro-modal-section">
            <div className="pro-modal-section-heading">
              <span className="pro-modal-section-icon" aria-hidden="true">
                🏢
              </span>

              <div>
                <h3>Identité de l’entreprise</h3>
                <p>
                  Le SIRET contient 14 chiffres et sert à vérifier l’entreprise.
                </p>
              </div>
            </div>

            <form
              className="pro-form"
              onSubmit={handleSiretSave}
              aria-busy={siretBusy}
            >
              <label htmlFor="company-siret">
                <span>SIRET de l’entreprise</span>

                <input
                  ref={siretInputRef}
                  id="company-siret"
                  name="companySiret"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={18}
                  required
                  value={siret}
                  onChange={(event) => {
                    setSiret(event.target.value);
                    setSiretError("");
                    onEditing();
                  }}
                  disabled={siretBusy}
                  aria-invalid={Boolean(siretError)}
                  aria-describedby={
                    siretError ? "company-siret-error" : "company-siret-help"
                  }
                  placeholder="123 456 789 00012"
                />

                <small id="company-siret-help">
                  Les espaces sont acceptés et seront retirés lors de
                  l’enregistrement.
                </small>
              </label>

              {siretError && (
                <p
                  id="company-siret-error"
                  className="pro-form-error"
                  role="alert"
                >
                  {siretError}
                </p>
              )}

              <button
                className="pro-primary-button"
                type="submit"
                disabled={siretBusy || unchanged}
              >
                {siretBusy ? "Enregistrement…" : "Enregistrer le SIRET"}
              </button>
            </form>

            <p className="pro-modal-inline-note">{verificationMessage}</p>
          </section>

          <section className="pro-modal-section">
            <div className="pro-modal-section-heading">
              <span className="pro-modal-section-icon" aria-hidden="true">
                📍
              </span>

              <div>
                <h3>Coordonnées professionnelles</h3>
                <p>
                  Ces informations apparaissent dans les documents générés par
                  l’entreprise.
                </p>
              </div>
            </div>

            <form
              className="pro-form"
              onSubmit={handleContactSave}
              aria-busy={contactBusy}
            >
              <div className="pro-form-row">
                <label>
                  <span>Téléphone professionnel</span>

                  <input
                    type="tel"
                    name="phone"
                    value={contactForm.phone}
                    onChange={handleContactChange}
                    autoComplete="tel"
                    placeholder="04 00 00 00 00"
                    disabled={contactBusy}
                  />
                </label>

                <label>
                  <span>Adresse e-mail professionnelle</span>

                  <input
                    type="email"
                    name="email"
                    value={contactForm.email}
                    onChange={handleContactChange}
                    autoComplete="email"
                    placeholder="contact@entreprise.fr"
                    disabled={contactBusy}
                  />
                </label>
              </div>

              <label>
                <span>Adresse *</span>

                <input
                  type="text"
                  name="addressLine1"
                  value={contactForm.addressLine1}
                  onChange={handleContactChange}
                  autoComplete="address-line1"
                  placeholder="Numéro et nom de la voie"
                  required
                  disabled={contactBusy}
                />
              </label>

              <label>
                <span>Complément d’adresse</span>

                <input
                  type="text"
                  name="addressLine2"
                  value={contactForm.addressLine2}
                  onChange={handleContactChange}
                  autoComplete="address-line2"
                  placeholder="Bâtiment, étage, zone d’activité…"
                  disabled={contactBusy}
                />
              </label>

              <div className="pro-form-row">
                <label>
                  <span>Code postal *</span>

                  <input
                    type="text"
                    name="postalCode"
                    value={contactForm.postalCode}
                    onChange={handleContactChange}
                    autoComplete="postal-code"
                    placeholder="69800"
                    required
                    disabled={contactBusy}
                  />
                </label>

                <label>
                  <span>Ville *</span>

                  <input
                    type="text"
                    name="city"
                    value={contactForm.city}
                    onChange={handleContactChange}
                    autoComplete="address-level2"
                    placeholder="Saint-Priest"
                    required
                    disabled={contactBusy}
                  />
                </label>
              </div>

              <label>
                <span>Pays *</span>

                <input
                  type="text"
                  name="country"
                  value={contactForm.country}
                  onChange={handleContactChange}
                  autoComplete="country-name"
                  required
                  disabled={contactBusy}
                />
              </label>

              {contactError && (
                <p className="pro-form-error" role="alert">
                  {contactError}
                </p>
              )}

              <button
                className="pro-primary-button"
                type="submit"
                disabled={contactBusy}
              >
                {contactBusy
                  ? "Enregistrement…"
                  : "Enregistrer les coordonnées"}
              </button>
            </form>
          </section>
        </div>

        <div className="pro-modal-actions">
          <button
            className="pro-primary-button"
            type="button"
            onClick={() => setActiveModal(null)}
          >
            Fermer
          </button>
        </div>
      </ModalShell>

      <ModalShell
        open={activeModal === "security"}
        onClose={() => setActiveModal(null)}
        dialogId="account-security-modal"
        titleId="account-security-modal-title"
        eyebrow="Sécurité"
        title="Sécurité du compte"
        description="Vérifiez en un coup d’œil les protections réellement actives sur votre compte."
        className="pro-security-modal"
      >
        <div className="pro-security-overview">
          <span className="pro-security-overview-icon" aria-hidden="true">
            🔐
          </span>

          <div>
            <strong>{activeProtectionLabel}</strong>
            <p>
              Les statuts ci-dessous proviennent de votre compte et de votre
              session actuelle.
            </p>
          </div>
        </div>

        <ul className="pro-security-list">
          <li className={emailConfirmed ? "is-active" : "is-pending"}>
            <span className="pro-security-list-icon" aria-hidden="true">
              {emailConfirmed ? "✓" : "!"}
            </span>

            <div>
              <strong>Adresse e-mail</strong>
              <p>
                {emailConfirmed
                  ? "Votre adresse e-mail est confirmée."
                  : "Votre adresse e-mail doit encore être confirmée."}
              </p>
            </div>

            <span className="pro-security-state">
              {emailConfirmed ? "Active" : "À vérifier"}
            </span>
          </li>

          <li className={authenticatedSession ? "is-active" : "is-pending"}>
            <span className="pro-security-list-icon" aria-hidden="true">
              {authenticatedSession ? "✓" : "!"}
            </span>

            <div>
              <strong>Session authentifiée</strong>
              <p>
                {authenticatedSession
                  ? "Votre espace professionnel est protégé par une session active."
                  : "Aucune session active n’a été détectée."}
              </p>
            </div>

            <span className="pro-security-state">
              {authenticatedSession ? "Active" : "Inactive"}
            </span>
          </li>

          <li className={mfaConfigured ? "is-active" : "is-pending"}>
            <span className="pro-security-list-icon" aria-hidden="true">
              {mfaConfigured ? "✓" : "○"}
            </span>

            <div>
              <strong>Double authentification</strong>
              <p>
                {mfaConfigured
                  ? "Une méthode de double authentification est vérifiée."
                  : "Aucune méthode de double authentification vérifiée."}
              </p>
            </div>

            <span className="pro-security-state">
              {mfaConfigured ? "Active" : "À venir"}
            </span>
          </li>
        </ul>

        <dl className="pro-security-account-details">
          <div>
            <dt>Compte connecté</dt>
            <dd>{user?.email || company.email || "Non disponible"}</dd>
          </div>

          <div>
            <dt>Dernière connexion</dt>
            <dd>{formatAccountDate(user?.last_sign_in_at)}</dd>
          </div>
        </dl>

        {!mfaConfigured && (
          <p className="pro-security-note">
            <strong>À prévoir avant la production :</strong> l’activation de la
            double authentification fera partie du renforcement final de la
            sécurité CarnetPass.
          </p>
        )}

        <div className="pro-modal-actions">
          <button
            className="pro-primary-button"
            type="button"
            onClick={() => setActiveModal(null)}
          >
            Fermer
          </button>
        </div>
      </ModalShell>

      <ModalShell
        open={activeModal === "compliance"}
        onClose={() => setActiveModal(null)}
        dialogId="compliance-modal"
        titleId="compliance-modal-title"
        eyebrow="Informations conformité"
        title="Ressources réglementaires officielles"
        description="Consultez les formulaires et les règles applicables aux interventions techniques."
        className="pro-compliance-modal"
      >
        <div className="pro-compliance-links">
          <a
            href="https://entreprendre.service-public.gouv.fr/vosdroits/R43122"
            target="_blank"
            rel="noreferrer"
            className="pro-compliance-link"
          >
            <strong>📄 Cerfa 15497*04</strong>
            <span>Fluides frigorigènes — formulaire officiel</span>
          </a>

          <a
            href="https://www.ecologie.gouv.fr/politiques-publiques/entretien-inspection-systemes-chauffage-climatisation"
            target="_blank"
            rel="noreferrer"
            className="pro-compliance-link"
          >
            <strong>🔥 Entretien des équipements</strong>
            <span>Chaudières, PAC et climatisation</span>
          </a>

          <a
            href="https://faq.trackdechets.fr/fluides-frigorigenes/informations-generales"
            target="_blank"
            rel="noreferrer"
            className="pro-compliance-link"
          >
            <strong>♻️ Trackdéchets — BSFF</strong>
            <span>Traçabilité des déchets de fluides frigorigènes</span>
          </a>

          <a
            href="https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32024R0573"
            target="_blank"
            rel="noreferrer"
            className="pro-compliance-link"
          >
            <strong>🇪🇺 Règlement F-Gas</strong>
            <span>Règlement européen UE 2024/573</span>
          </a>
        </div>

        <p className="pro-compliance-watch">
          <strong>Information :</strong> Trackdéchets et le BSFF sont déjà en
          vigueur. Le Cerfa 15497*04 reste un document distinct.
        </p>

        <div className="pro-modal-actions">
          <button
            className="pro-primary-button"
            type="button"
            onClick={() => setActiveModal(null)}
          >
            Fermer
          </button>
        </div>
      </ModalShell>
    </>
  );
}
export default function ProSpacePage() {
  const { user, session } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();

  const [company, setCompany] = useState(null);
  const [siretMessage, setSiretMessage] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(false);
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
  const [equipmentForm, setEquipmentForm] = useState(EMPTY_EQUIPMENT_FORM);
  const [equipmentError, setEquipmentError] = useState("");
  const [equipmentMessage, setEquipmentMessage] = useState("");
  const [equipmentSubmitting, setEquipmentSubmitting] = useState(false);
  const [equipmentRefreshKey, setEquipmentRefreshKey] = useState(0);
  const [carnetPassStatuses, setCarnetPassStatuses] = useState({});
  const [carnetPassStatusLoading, setCarnetPassStatusLoading] = useState(false);
  const [carnetPassStatusError, setCarnetPassStatusError] = useState("");
  const [interventions, setInterventions] = useState([]);
  const [interventionTotal, setInterventionTotal] = useState(0);
  const [interventionLoading, setInterventionLoading] = useState(false);
  const [interventionLoadError, setInterventionLoadError] = useState("");
  const [interventionRefreshKey, setInterventionRefreshKey] = useState(0);
  const [boilerCertificates, setBoilerCertificates] = useState([]);
  const [boilerCertificatesLoading, setBoilerCertificatesLoading] =
    useState(true);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState("");
  const [carnetPassPreview, setCarnetPassPreview] = useState(null);
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

  useEffect(() => {
    if (
      selectedEquipmentId &&
      !equipments.some(
        (equipment) => String(equipment.id) === String(selectedEquipmentId),
      )
    ) {
      setSelectedEquipmentId("");
    }
  }, [equipments, selectedEquipmentId]);

  useEffect(() => {
    let cancelled = false;

    async function loadCarnetPassStatuses() {
      if (!company?.id || equipmentLoading) return;

      if (equipments.length === 0) {
        setCarnetPassStatuses({});
        setCarnetPassStatusError("");
        setCarnetPassStatusLoading(false);
        return;
      }

      setCarnetPassStatusLoading(true);
      setCarnetPassStatusError("");

      try {
        const statuses = await getCompanyCarnetPassStatuses(
          company.id,
          equipments.map((equipment) => equipment.serial_number),
        );

        if (!cancelled) {
          setCarnetPassStatuses(
            Object.fromEntries(
              equipments.map((equipment, index) => [
                equipment.id,
                statuses[index] || { exists: false },
              ]),
            ),
          );
        }
      } catch (error) {
        if (!cancelled) {
          setCarnetPassStatuses({});
          setCarnetPassStatusError(
            error?.message || "Impossible de vérifier les CarnetPass.",
          );
        }
      } finally {
        if (!cancelled) {
          setCarnetPassStatusLoading(false);
        }
      }
    }

    loadCarnetPassStatuses();

    return () => {
      cancelled = true;
    };
  }, [company?.id, equipmentLoading, equipments]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadInterventions() {
      if (!company?.id || !session?.access_token) {
        setInterventions([]);
        setInterventionTotal(0);
        setInterventionLoadError("");
        setInterventionLoading(false);
        return;
      }

      setInterventionLoading(true);
      setInterventionLoadError("");

      try {
        const response = await fetch("/api/interventions", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: controller.signal,
        });

        const result = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            result?.error ||
            "L’historique des interventions n’a pas pu être chargé.",
          );
        }

        if (!cancelled) {
          setInterventions(
            Array.isArray(result?.interventions) ? result.interventions : [],
          );
          setInterventionTotal(
            Number.isInteger(result?.total) ? result.total : 0,
          );
        }
      } catch (error) {
        if (!cancelled && error?.name !== "AbortError") {
          setInterventions([]);
          setInterventionTotal(0);
          setInterventionLoadError(
            error?.message ||
            "L’historique des interventions n’a pas pu être chargé.",
          );
        }
      } finally {
        if (!cancelled) {
          setInterventionLoading(false);
        }
      }
    }

    loadInterventions();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [company?.id, session?.access_token, interventionRefreshKey]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadBoilerCertificates() {
      if (!session?.access_token) {
        setBoilerCertificates([]);
        setBoilerCertificatesLoading(false);
        return;
      }

      if (!company?.id) {
        setBoilerCertificates([]);
        setBoilerCertificatesLoading(true);
        return;
      }

      setBoilerCertificatesLoading(true);

      try {
        const response = await fetch(
          "/api/interventions?resource=boiler-certificates",
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            signal: controller.signal,
          },
        );

        const result = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            result?.error ||
            "Les attestations chaudière n’ont pas pu être chargées.",
          );
        }

        if (!cancelled) {
          setBoilerCertificates(
            Array.isArray(result?.certificates) ? result.certificates : [],
          );
        }
      } catch (error) {
        if (!cancelled && error?.name !== "AbortError") {
          console.error("BOILER_CERTIFICATES_LOAD_FAILED");
          setBoilerCertificates([]);
        }
      } finally {
        if (!cancelled) {
          setBoilerCertificatesLoading(false);
        }
      }
    }

    loadBoilerCertificates();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [company?.id, session?.access_token]);

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
      setFormError("Le SIRET doit contenir exactement 14 chiffres.");
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
  async function handleCompanyVerification() {
    if (verificationBusy) return;

    setVerificationBusy(true);
    setSiretMessage("");

    try {
      const result = await verifyMyCompany();

      setSiretMessage(result.message || "Vérification terminée.");

      setRefreshKey((currentKey) => currentKey + 1);
    } catch (error) {
      setSiretMessage(error.message);
    } finally {
      setVerificationBusy(false);
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

  function handleSelectEquipment(equipment) {
    setSelectedEquipmentId(equipment.id);
    setEquipmentFormOpen(false);
    setEquipmentError("");
    setEquipmentMessage("");
  }

  function handleOpenCarnetPass(equipment) {
    if (carnetPassStatusLoading) return;

    const carnetPassStatus = carnetPassStatuses[equipment.id];

    if (carnetPassStatusError || !carnetPassStatus) {
      setEquipmentError(
        "Le statut du CarnetPass n'a pas pu être vérifié. Actualisez la page avant de continuer.",
      );
      return;
    }

    if (carnetPassStatus.exists) {
      if (
        carnetPassStatus.status === "active" &&
        carnetPassStatus.carnetPassId
      ) {
        setCarnetPassPreview({
          id: carnetPassStatus.carnetPassId,
          name: `${equipment.brand} ${equipment.model}`,
        });
        return;
      }

      setEquipmentError(
        carnetPassStatus.status === "blockchain_pending"
          ? "La confirmation Polygon de ce CarnetPass est encore en cours. Ne relancez pas sa création."
          : "Ce CarnetPass existe, mais il est momentanément indisponible. Réessayez plus tard.",
      );
      return;
    }

    const productReference = String(equipment?.product_reference || "").trim();

    if (!productReference) {
      setEquipmentError(
        "Ajoutez une référence produit avant de créer le CarnetPass.",
      );
      return;
    }

    setEquipmentError("");
    setEquipmentMessage("");

    navigate("/", {
      state: {
        professionalEquipment: {
          productReference,
          serialNumber: equipment.serial_number,
          brand: equipment.brand,
          model: equipment.model,
          productType: getEquipmentTypeLabel(equipment.equipment_type),
        },
      },
    });
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
            onClick={() => setRefreshKey((currentKey) => currentKey + 1)}
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
            <span className="pro-eyebrow">CONFIGURATION DE VOTRE ESPACE</span>

            <h1>
              Votre entreprise,
              <br />
              prête pour le terrain.
            </h1>

            <p>
              Configurez votre espace CarnetPass pour centraliser les
              équipements, les interventions et la documentation technique.
            </p>

            <div className="pro-benefits">
              <article>
                <span aria-hidden="true">01</span>
                <div>
                  <strong>Un espace professionnel sécurisé</strong>
                  <p>
                    Les données restent accessibles uniquement aux membres
                    autorisés.
                  </p>
                </div>
              </article>

              <article>
                <span aria-hidden="true">02</span>
                <div>
                  <strong>Une équipe organisée</strong>
                  <p>Ajoutez ensuite vos administrateurs et vos techniciens.</p>
                </div>
              </article>

              <article>
                <span aria-hidden="true">03</span>
                <div>
                  <strong>Une formule découverte</strong>
                  <p>
                    Votre espace démarre avec l’abonnement gratuit CarnetPass.
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
                  Ces informations permettront de personnaliser votre tableau de
                  bord.
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
                🔒 Vos données sont protégées par les règles de sécurité
                CarnetPass.
              </p>
            </form>
          </section>
        </section>
      </main>
    );
  }

  const plan = company.subscription?.plan || "free";
  const selectedEquipment =
    equipments.find(
      (equipment) => String(equipment.id) === String(selectedEquipmentId),
    ) || null;
  const verification = company.verification;
  const companyVerified =
    verification?.status === "approved" &&
    /^\d{14}$/.test(company.siret || "") &&
    verification.verified_siret === company.siret &&
    Boolean(verification.verified_at);

  const companyCanCreateEquipment = companyVerified || company.is_demo === true;

  let verificationTitle = "Entreprise en attente de validation";
  let verificationMessage =
    "Votre entreprise doit être validée avant de pouvoir créer des carnets.";

  if (company.is_demo === true) {
    verificationTitle = "Mode démonstration";
    verificationMessage =
      "Cet espace de démonstration peut créer des équipements sans représenter une entreprise officiellement validée.";
  } else if (companyVerified) {
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
          <span className="pro-plan-badge">Formule {getPlanLabel(plan)}</span>

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
          <p>Votre tableau de bord CarnetPass est maintenant prêt.</p>
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
      {siretMessage && (
        <p
          className="pro-form-notice"
          role="status"
          style={{
            padding: "0 24px",
            textAlign: "center",
          }}
        >
          {siretMessage}
        </p>
      )}

      <CompanyAccountCard
        key={`${company.id}:${company.siret || ""}:${company.updated_at || ""}`}
        company={company}
        user={user}
        session={session}
        companyVerified={companyVerified}
        verificationTitle={verificationTitle}
        verificationMessage={verificationMessage}
        verificationBusy={verificationBusy}
        onVerify={handleCompanyVerification}
        onEditing={() => setSiretMessage("")}
        onSiretSaved={() => {
          setSiretMessage(
            "SIRET enregistré. Consultez le statut de validation affiché.",
          );
          setLoading(true);
          setRefreshKey((currentKey) => currentKey + 1);
        }}
        onContactSaved={() => {
          setSiretMessage(
            "Coordonnées de l’entreprise enregistrées avec succès.",
          );
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
          <strong>{interventionLoading ? "…" : interventionTotal}</strong>
          <small>
            {interventionLoadError
              ? "Historique momentanément indisponible"
              : interventionTotal > 0
                ? `${interventionTotal} intervention${interventionTotal > 1 ? "s" : ""} enregistrée${interventionTotal > 1 ? "s" : ""}`
                : "Aucune intervention enregistrée"}
          </small>
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
        <article className="pro-dashboard-card pro-equipment-card pro-equipment-card--full">
          <div>
            <span className="pro-dashboard-icon" aria-hidden="true">
              🔧
            </span>
            <h2>Équipements de l’entreprise</h2>
            <p>
              Ajoutez les chaudières, pompes à chaleur, climatisations et autres
              équipements suivis par votre entreprise.
            </p>
          </div>

          <button
            className="pro-primary-button"
            type="button"
            disabled={!companyCanCreateEquipment}
            onClick={() => {
              setEquipmentFormOpen((isOpen) => !isOpen);
              setEquipmentError("");
              setEquipmentMessage("");
            }}
          >
            {companyCanCreateEquipment
              ? equipmentFormOpen
                ? "Fermer le formulaire"
                : "Ajouter un équipement"
              : "Validation requise"}
          </button>

          {!companyCanCreateEquipment && (
            <p className="pro-equipment-lock">
              L’ajout sera disponible après la validation du SIRET de
              l’entreprise.
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
          {carnetPassStatusError && (
            <p className="pro-form-error" role="alert">
              {carnetPassStatusError}
            </p>
          )}
          {equipmentError && (
            <p className="pro-form-error" role="alert">
              {equipmentError}
            </p>
          )}

          {equipmentFormOpen && companyCanCreateEquipment && (
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
              {equipments.map((equipment) => {
                const carnetPassStatus = carnetPassStatuses[equipment.id];
                const statusIsLoading =
                  carnetPassStatusLoading && !carnetPassStatus;
                const isSelected =
                  String(selectedEquipmentId) === String(equipment.id);

                let carnetPassLabel = "CarnetPass à créer";
                let carnetPassTone = "neutral";

                if (statusIsLoading) {
                  carnetPassLabel = "Vérification…";
                } else if (carnetPassStatus?.status === "active") {
                  carnetPassLabel = "CarnetPass actif";
                  carnetPassTone = "active";
                } else if (carnetPassStatus?.status === "blockchain_pending") {
                  carnetPassLabel = "Polygon en cours";
                  carnetPassTone = "pending";
                } else if (carnetPassStatus?.exists) {
                  carnetPassLabel = "CarnetPass indisponible";
                  carnetPassTone = "warning";
                } else if (carnetPassStatusError || !carnetPassStatus) {
                  carnetPassLabel = "Statut indisponible";
                  carnetPassTone = "warning";
                }

                return (
                  <li
                    key={equipment.id}
                    className={isSelected ? "is-selected" : ""}
                  >
                    <button
                      className="pro-equipment-open-button"
                      type="button"
                      onClick={() => handleSelectEquipment(equipment)}
                      aria-current={isSelected ? "true" : undefined}
                      aria-label={`Ouvrir le dossier de ${equipment.brand} ${equipment.model}`}
                    >
                      <div>
                        <strong>
                          {equipment.brand} {equipment.model}
                        </strong>
                        <span>
                          {getEquipmentTypeLabel(equipment.equipment_type)}
                        </span>
                        <span>N° de série : {equipment.serial_number}</span>
                      </div>

                      <div className="pro-equipment-open-action">
                        {equipment.product_reference && (
                          <small>Réf. {equipment.product_reference}</small>
                        )}

                        <span
                          className={`pro-equipment-status pro-equipment-status--${carnetPassTone}`}
                        >
                          {carnetPassLabel}
                        </span>

                        <strong>
                          {isSelected
                            ? "Dossier ouvert"
                            : "Ouvrir le dossier →"}
                        </strong>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </article>
      </section>
      {selectedEquipment && (
        <EquipmentWorkspace
          key={selectedEquipment.id}
          session={session}
          company={company}
          equipment={selectedEquipment}
          carnetPassStatus={carnetPassStatuses[selectedEquipment.id]}
          carnetPassStatusLoading={carnetPassStatusLoading}
          carnetPassStatusError={carnetPassStatusError}
          interventions={interventions}
          interventionLoading={interventionLoading}
          interventionLoadError={interventionLoadError}
          boilerCertificates={boilerCertificates}
          boilerCertificatesLoading={boilerCertificatesLoading}
          onOpenCarnetPass={() => handleOpenCarnetPass(selectedEquipment)}
          onClose={() => setSelectedEquipmentId("")}
          onInterventionCreated={() =>
            setInterventionRefreshKey((currentKey) => currentKey + 1)
          }
          onCertificatesChange={(certificates) => {
            setBoilerCertificates(certificates);
            setBoilerCertificatesLoading(false);
          }}
        />
      )}
      <ModalShell
        open={Boolean(carnetPassPreview?.id)}
        onClose={() => setCarnetPassPreview(null)}
        dialogId="carnetpass-preview-modal"
        titleId="carnetpass-preview-modal-title"
        eyebrow="Traçabilité"
        title={`CarnetPass — ${carnetPassPreview?.name || "Équipement"}`}
        description="Consultation de la fiche publique et de son historique vérifié."
        className="pro-carnetpass-modal"
      >
        {carnetPassPreview?.id && (
          <iframe
            className="pro-carnetpass-frame"
            src={`/appareil/${encodeURIComponent(carnetPassPreview.id)}`}
            title={`CarnetPass de ${carnetPassPreview.name}`}
          />
        )}
      </ModalShell>
      <footer className="pro-footer">
        <span>CarnetPass — La maintenance technique organisée simplement.</span>

        <Link to="/">Retour à la consultation publique</Link>
      </footer>
    </main>
  );
}

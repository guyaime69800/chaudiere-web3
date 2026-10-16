import { useEffect } from "react";
import { createPortal } from "react-dom";

function displayValue(value, fallback = "Non renseigné") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function formatDate(value) {
  if (!value) return "Non renseignée";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return displayValue(value);

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
  }).format(date);
}

function formatObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).filter(
    ([, itemValue]) =>
      itemValue !== null &&
      itemValue !== undefined &&
      itemValue !== ""
  );
}

const ENERGY_LABELS = {
  natural_gas: "Gaz naturel",
  propane: "Propane",
  fuel_oil: "Fioul domestique",
  wood: "Bois",
  other: "Autre",
};

const SIZING_LABELS = {
  appropriate: "Dimensionnement adapté",
  oversized: "Chaudière probablement surdimensionnée",
  undersized: "Chaudière probablement sous-dimensionnée",
  not_evaluable: "Impossible à évaluer pendant la visite",
};

const FLUE_LABELS = {
  chimney: "Conduit de cheminée",
  sealed: "Ventouse / circuit étanche",
  vmc_gas: "VMC gaz",
  other: "Autre",
};

const CO_MESSAGES = {
  normal: "La situation est normale.",
  anomaly:
    "Il y a anomalie de fonctionnement nécessitant impérativement des investigations complémentaires concernant le tirage du conduit de fumée et la ventilation du local.",
  serious_immediate_danger:
    "Il y a un danger grave et imminent nécessitant la mise à l’arrêt de la chaudière et la recherche du dysfonctionnement avant remise en service.",
};

function formatAddress(snapshot = {}) {
  return [
    snapshot.addressLine1,
    snapshot.addressLine2,
    [snapshot.postalCode, snapshot.city].filter(Boolean).join(" "),
    snapshot.country,
  ]
    .filter(Boolean)
    .join(", ");
}

export default function AttestationModal({ certificate, onClose }) {
  useEffect(() => {
    if (!certificate) return undefined;

    function handleEscape(event) {
      if (event.key === "Escape") onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [certificate, onClose]);

  if (!certificate) return null;

  const equipment = certificate.equipmentSnapshot || {};
  const company = certificate.companySnapshot || {};
  const customer = certificate.customerSnapshot || {};
  const installation = certificate.installationSnapshot || {};
  const technician = certificate.technicianSnapshot || {};
  const measurements = formatObject(certificate.measurements).filter(
    ([name]) => name !== "boilerSizingAssessment"
  );
  const emissions = formatObject(certificate.pollutantEmissions);
  const sizingAssessment =
    certificate.measurements?.boilerSizingAssessment;
  const isIssued = certificate.status === "issued";
  const companyAddress = formatAddress(company);
  const coMessage =
    CO_MESSAGES[certificate.ambientCoStatus] ||
    (certificate.ambientCoPpm != null
      ? certificate.ambientCoPpm < 10
        ? CO_MESSAGES.normal
        : certificate.ambientCoPpm < 50
          ? CO_MESSAGES.anomaly
          : CO_MESSAGES.serious_immediate_danger
      : "");

  return createPortal(
    (
    <div
      className="pro-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="pro-compliance-modal pro-attestation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attestation-modal-title"
      >
        {!isIssued && (
          <div className="pro-attestation-draft-banner" role="status">
            BROUILLON — NON VALABLE
          </div>
        )}

        <div className="pro-modal-header">
          <div>
            <span className="pro-action-card-label">
              Attestation d’entretien
            </span>
            <h2 id="attestation-modal-title">
              {equipment.brand || equipment.model
                ? `${equipment.brand || ""} ${equipment.model || ""}`.trim()
                : "Chaudière"}
            </h2>
            <p>
              {isIssued
                ? `Attestation émise le ${formatDate(certificate.issuedAt)}`
                : "Brouillon de l’attestation"}
            </p>
            {isIssued && certificate.certificateNumber && (
              <p className="pro-attestation-number">
                N° {certificate.certificateNumber}
              </p>
            )}
          </div>

          <button
            className="pro-modal-close"
            type="button"
            aria-label="Fermer l’aperçu de l’attestation"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="pro-attestation-summary">
          <section>
            <h3>Professionnel ayant réalisé l’entretien</h3>
            <dl>
              <div><dt>Entreprise</dt><dd>{displayValue(company.name)}</dd></div>
              <div><dt>SIRET</dt><dd>{displayValue(company.siret)}</dd></div>
              <div><dt>Adresse</dt><dd>{displayValue(companyAddress)}</dd></div>
              <div><dt>Contact</dt><dd>{displayValue(company.phone || company.email)}</dd></div>
              <div><dt>Technicien</dt><dd>{displayValue(technician.fullName)}</dd></div>
              <div><dt>Coordonnées</dt><dd>{displayValue(technician.email || technician.companyPhone)}</dd></div>
              <div><dt>Date de la visite</dt><dd>{formatDate(certificate.visitDate || installation.visitDate)}</dd></div>
            </dl>
          </section>

          <section>
            <h3>Commanditaire et installation</h3>
            <dl>
              <div><dt>Commanditaire</dt><dd>{displayValue(customer.name)}</dd></div>
              <div><dt>Adresse</dt><dd>{displayValue(customer.address)}</dd></div>
              <div><dt>Installation</dt><dd>{displayValue(installation.address)}</dd></div>
              <div><dt>Local chaudière</dt><dd>{displayValue(installation.boilerLocation)}</dd></div>
            </dl>
          </section>

          <section>
            <h3>Équipement</h3>
            <dl>
              <div><dt>Marque</dt><dd>{displayValue(equipment.brand)}</dd></div>
              <div><dt>Modèle</dt><dd>{displayValue(equipment.model)}</dd></div>
              <div><dt>N° de série</dt><dd>{displayValue(equipment.serialNumber || equipment.serial_number)}</dd></div>
              <div><dt>Énergie</dt><dd>{ENERGY_LABELS[certificate.boilerEnergy] || displayValue(certificate.boilerEnergy)}</dd></div>
              <div><dt>Puissance</dt><dd>{certificate.nominalPowerKw !== null && certificate.nominalPowerKw !== undefined && certificate.nominalPowerKw !== "" ? `${certificate.nominalPowerKw} kW` : "Non renseignée"}</dd></div>
            </dl>
          </section>

          <section>
            <h3>Intervention</h3>
            <dl>
              <div><dt>Date de mise en service</dt><dd>{formatDate(certificate.commissioningDate)}</dd></div>
              <div><dt>Entretien précédent</dt><dd>{formatDate(certificate.previousMaintenanceDate)}</dd></div>
              <div><dt>Ramonage précédent</dt><dd>{formatDate(certificate.previousChimneySweepingDate)}</dd></div>
              <div><dt>Évacuation des fumées</dt><dd>{FLUE_LABELS[certificate.flueExhaustType] || displayValue(certificate.flueExhaustType)}</dd></div>
              <div><dt>Classe énergétique</dt><dd>{displayValue(certificate.boilerEnergyClass)}</dd></div>
            </dl>
          </section>
        </div>

        {certificate.forcedAirBurner && (
          <section className="pro-attestation-section">
            <h3>Brûleur à air soufflé</h3>
            <dl>
              <div><dt>Marque</dt><dd>{displayValue(certificate.forcedAirBurner.brand)}</dd></div>
              <div><dt>Modèle</dt><dd>{displayValue(certificate.forcedAirBurner.model)}</dd></div>
              <div><dt>Date</dt><dd>{formatDate(certificate.forcedAirBurner.date)}</dd></div>
            </dl>
          </section>
        )}

        {Array.isArray(certificate.controlledPoints) &&
          certificate.controlledPoints.length > 0 && (
            <section className="pro-attestation-section">
              <h3>Points contrôlés</h3>
              <ul>
                {certificate.controlledPoints.map((point) => (
                  <li key={point}>✓ {point}</li>
                ))}
              </ul>
            </section>
          )}

        {Array.isArray(certificate.measuringInstruments) &&
          certificate.measuringInstruments.length > 0 && (
            <section className="pro-attestation-section">
              <h3>Appareils de mesure utilisés</h3>
              <ul>
                {certificate.measuringInstruments.map((instrument) => (
                  <li key={instrument}>{instrument}</li>
                ))}
              </ul>
            </section>
          )}

        {(measurements.length > 0 || emissions.length > 0) && (
          <div className="pro-attestation-summary">
            {measurements.length > 0 && (
              <section>
                <h3>Mesures techniques</h3>
                <dl>
                  {measurements.map(([name, value]) => (
                    <div key={name}><dt>{name}</dt><dd>{displayValue(value)}</dd></div>
                  ))}
                </dl>
              </section>
            )}

            {emissions.length > 0 && (
              <section>
                <h3>Émissions polluantes</h3>
                <dl>
                  {emissions.map(([name, value]) => (
                    <div key={name}><dt>{name}</dt><dd>{displayValue(value)}</dd></div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        )}

        {(certificate.ambientCoPpm != null ||
          certificate.boilerEfficiencyPercent != null ||
          certificate.referenceEfficiencyPercent != null ||
          sizingAssessment) && (
            <section className="pro-attestation-section">
              <h3>Résultats</h3>
              <dl>
                {certificate.ambientCoPpm !== null && certificate.ambientCoPpm !== undefined && (
                  <div><dt>CO ambiant</dt><dd>{certificate.ambientCoPpm} ppm</dd></div>
                )}
                {certificate.boilerEfficiencyPercent !== null && certificate.boilerEfficiencyPercent !== undefined && (
                  <div><dt>Rendement chaudière</dt><dd>{certificate.boilerEfficiencyPercent} %</dd></div>
                )}
                {certificate.referenceEfficiencyPercent !== null && certificate.referenceEfficiencyPercent !== undefined && (
                  <div><dt>Rendement de référence</dt><dd>{certificate.referenceEfficiencyPercent} %</dd></div>
                )}
                {sizingAssessment && (
                  <div><dt>Dimensionnement</dt><dd>{SIZING_LABELS[sizingAssessment] || sizingAssessment}</dd></div>
                )}
              </dl>
              {coMessage && (
                <p className={`pro-attestation-co pro-attestation-co-${certificate.ambientCoStatus || "normal"}`}>
                  <strong>Conclusion CO :</strong> {coMessage}
                </p>
              )}
            </section>
          )}

        {Array.isArray(certificate.replacementEnergyClasses) &&
          certificate.replacementEnergyClasses.length > 0 && (
            <section className="pro-attestation-section">
              <h3>Solutions de remplacement</h3>
              <p>
                Classes énergétiques indicatives : {certificate.replacementEnergyClasses.join(", ")}.
              </p>
            </section>
          )}

        {(certificate.adviceGoodUse ||
          certificate.adviceImprovements ||
          certificate.adviceReplacement) && (
            <section className="pro-attestation-section">
              <h3>Conseils au client</h3>
              {certificate.adviceGoodUse && <p><strong>Bon usage :</strong> {certificate.adviceGoodUse}</p>}
              {certificate.adviceImprovements && <p><strong>Améliorations :</strong> {certificate.adviceImprovements}</p>}
              {certificate.adviceReplacement && <p><strong>Remplacement :</strong> {certificate.adviceReplacement}</p>}
            </section>
          )}

        {isIssued && certificate.technicianSignature && (
          <section className="pro-attestation-section pro-attestation-signature">
            <h3>Validation du technicien</h3>
            <p>
              Attestation validée électroniquement par{" "}
              <strong>
                {displayValue(certificate.technicianSignature.fullName)}
              </strong>
              {certificate.technicianSignature.signedAt
                ? ` le ${formatDate(certificate.technicianSignature.signedAt)}`
                : ""}.
            </p>
          </section>
        )}

        <footer className="pro-attestation-legal">
          <p>
            Attestation établie conformément à l’arrêté du 15 septembre 2009
            relatif à l’entretien annuel des chaudières de 4 à 400 kW,
            notamment son annexe 5.
          </p>
          <p>
            Les conseils et recommandations sont donnés à titre indicatif et
            ont une valeur informative. Ils ne constituent pas une obligation
            d’investissement, sauf mesure de sécurité liée au monoxyde de carbone.
          </p>
        </footer>

        <div className="pro-attestation-actions">
          <button
            className="pro-action-card-button"
            type="button"
            onClick={() => window.print()}
          >
            Imprimer
          </button>
          <button
            className="pro-primary-button pro-modal-footer-button"
            type="button"
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
      </section>
    </div>
    ),
    document.body
  );
}

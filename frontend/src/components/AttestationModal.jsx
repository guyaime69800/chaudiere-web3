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
    const measurements = formatObject(certificate.measurements).filter(
        ([name]) => name !== "boilerSizingAssessment"
    );
    const emissions = formatObject(certificate.pollutantEmissions);
    const sizingAssessment =
        certificate.measurements?.boilerSizingAssessment;

    return createPortal((
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
                            {certificate.status === "issued"
                                ? "Attestation émise"
                                : "Brouillon de l’attestation"}
                        </p>
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
                            <div><dt>Évacuation des fumées</dt><dd>{displayValue(certificate.flueExhaustType)}</dd></div>
                            <div><dt>Classe énergétique</dt><dd>{displayValue(certificate.boilerEnergyClass)}</dd></div>
                        </dl>
                    </section>
                </div>

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
    ), document.body);
}

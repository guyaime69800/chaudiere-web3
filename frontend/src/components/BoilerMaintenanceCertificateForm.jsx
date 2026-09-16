import { useEffect, useMemo, useState } from "react";

const EMPTY_FORM = {
    interventionId: "",
    customerName: "",
    customerAddress: "",
    installationAddress: "",
    boilerLocation: "",
};
const EMPTY_DETAILS_FORM = {
    certificateId: "",
    boilerEnergy: "",
    flueExhaustType: "",
    commissioningDate: "",
    nominalPowerKw: "",
    previousMaintenanceDate: "",
    previousChimneySweepingDate: "",
    ambientCoPpm: "",
    boilerEfficiencyPercent: "",
    referenceEfficiencyPercent: "",
    boilerEnergyClass: "",
    adviceGoodUse: "",
    adviceImprovements: "",
    adviceReplacement: "",
    controlledPoints: [],
    measuringInstruments: "",
};

const CONTROLLED_POINT_OPTIONS = [
    "Nettoyage de la chaudière",
    "Vérification du brûleur",
    "Vérification des dispositifs de sécurité",
    "Contrôle de l’évacuation des fumées",
    "Contrôle de la ventilation du local",
    "Réglage de la combustion",
    "Contrôle de l’étanchéité du circuit",
    "Contrôle du circulateur",
];
function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Date non renseignée";
    }

    return new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

export default function BoilerMaintenanceCertificateForm({
    session,
    interventions = [],
    equipments = [],
}) {
    const [certificates, setCertificates] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [detailsForm, setDetailsForm] = useState(
        EMPTY_DETAILS_FORM
    );
    const [editingCertificateId, setEditingCertificateId] =
        useState("");
    const [savingDetails, setSavingDetails] = useState(false);
    const equipmentById = useMemo(
        () =>
            Object.fromEntries(
                equipments.map((equipment) => [
                    equipment.id,
                    equipment,
                ])
            ),
        [equipments]
    );

    const certificateByInterventionId = useMemo(
        () =>
            Object.fromEntries(
                certificates.map((certificate) => [
                    certificate.interventionId,
                    certificate,
                ])
            ),
        [certificates]
    );

    const eligibleInterventions = useMemo(
        () =>
            interventions.filter((intervention) => {
                const equipment =
                    equipmentById[intervention.equipmentId];

                return (
                    intervention.interventionType === "maintenance" &&
                    intervention.polygonState === "confirmed" &&
                    equipment?.equipment_type === "boiler"
                );
            }),
        [interventions, equipmentById]
    );

    const availableInterventions = useMemo(
        () =>
            eligibleInterventions.filter(
                (intervention) =>
                    !certificateByInterventionId[intervention.id]
            ),
        [
            eligibleInterventions,
            certificateByInterventionId,
        ]
    );

    useEffect(() => {
        if (!session?.access_token) {
            setCertificates([]);
            return undefined;
        }

        const controller = new AbortController();
        let cancelled = false;

        async function loadCertificates() {
            setLoading(true);
            setError("");

            try {
                const response = await fetch(
                    "/api/interventions?resource=boiler-certificates",
                    {
                        headers: {
                            Authorization:
                                `Bearer ${session.access_token}`,
                        },
                        signal: controller.signal,
                    }
                );

                const result =
                    await response.json().catch(() => null);

                if (!response.ok) {
                    throw new Error(
                        result?.error ||
                        "Les attestations n’ont pas pu être chargées."
                    );
                }

                if (!cancelled) {
                    setCertificates(
                        Array.isArray(result?.certificates)
                            ? result.certificates
                            : []
                    );
                }
            } catch (loadError) {
                if (
                    !cancelled &&
                    loadError?.name !== "AbortError"
                ) {
                    setError(
                        loadError?.message ||
                        "Les attestations n’ont pas pu être chargées."
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadCertificates();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [session?.access_token]);

    function handleChange(event) {
        const { name, value } = event.target;

        setForm((currentForm) => ({
            ...currentForm,
            [name]: value,
        }));

        setError("");
        setSuccess("");
    }

    function openForm() {
        const firstIntervention =
            availableInterventions[0];

        setForm({
            ...EMPTY_FORM,
            interventionId: firstIntervention?.id || "",
        });

        setError("");
        setSuccess("");
        setFormOpen(true);
    }
    function handleDetailsChange(event) {
        const { name, value } = event.target;

        setDetailsForm((currentForm) => ({
            ...currentForm,
            [name]: value,
        }));

        setError("");
        setSuccess("");
    }

    function toggleControlledPoint(point) {
        setDetailsForm((currentForm) => {
            const alreadySelected =
                currentForm.controlledPoints.includes(point);

            return {
                ...currentForm,
                controlledPoints: alreadySelected
                    ? currentForm.controlledPoints.filter(
                        (item) => item !== point
                    )
                    : [...currentForm.controlledPoints, point],
            };
        });

        setError("");
        setSuccess("");
    }

    function openDetailsForm(certificate) {
        setDetailsForm({
            certificateId: certificate.id,
            boilerEnergy: certificate.boilerEnergy || "",
            flueExhaustType:
                certificate.flueExhaustType || "",
            commissioningDate:
                certificate.commissioningDate || "",
            nominalPowerKw:
                certificate.nominalPowerKw ?? "",
            previousMaintenanceDate:
                certificate.previousMaintenanceDate || "",
            previousChimneySweepingDate:
                certificate.previousChimneySweepingDate || "",
            ambientCoPpm:
                certificate.ambientCoPpm ?? "",
            boilerEfficiencyPercent:
                certificate.boilerEfficiencyPercent ?? "",
            referenceEfficiencyPercent:
                certificate.referenceEfficiencyPercent ?? "",
            boilerEnergyClass:
                certificate.boilerEnergyClass || "",
            adviceGoodUse:
                certificate.adviceGoodUse || "",
            adviceImprovements:
                certificate.adviceImprovements || "",
            adviceReplacement:
                certificate.adviceReplacement || "",
            controlledPoints: Array.isArray(
                certificate.controlledPoints
            )
                ? certificate.controlledPoints
                : [],
            measuringInstruments: Array.isArray(
                certificate.measuringInstruments
            )
                ? certificate.measuringInstruments.join("\n")
                : "",
        });

        setEditingCertificateId(certificate.id);
        setFormOpen(false);
        setError("");
        setSuccess("");
    }
    async function handleSubmit(event) {
        event.preventDefault();

        if (submitting) return;

        if (!session?.access_token) {
            setError(
                "Votre session a expiré. Reconnectez-vous."
            );
            return;
        }

        if (!form.interventionId) {
            setError(
                "Sélectionnez une intervention d’entretien."
            );
            return;
        }

        if (!form.customerName.trim()) {
            setError("Renseignez le nom du commanditaire.");
            return;
        }

        if (!form.customerAddress.trim()) {
            setError(
                "Renseignez l’adresse du commanditaire."
            );
            return;
        }

        if (!form.installationAddress.trim()) {
            setError(
                "Renseignez l’adresse de l’installation."
            );
            return;
        }

        if (!form.boilerLocation.trim()) {
            setError(
                "Renseignez le local où se trouve la chaudière."
            );
            return;
        }

        setSubmitting(true);
        setError("");
        setSuccess("");

        try {
            const response = await fetch(
                "/api/interventions?resource=boiler-certificates",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization:
                            `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        interventionId: form.interventionId,
                        customer: {
                            name: form.customerName.trim(),
                            address: form.customerAddress.trim(),
                        },
                        installation: {
                            address:
                                form.installationAddress.trim(),
                            boilerLocation:
                                form.boilerLocation.trim(),
                        },
                    }),
                }
            );

            const result =
                await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(
                    result?.error ||
                    "Le brouillon n’a pas pu être créé."
                );
            }

            const certificate = result?.certificate;

            if (certificate?.id) {
                setCertificates((currentCertificates) => {
                    const filtered =
                        currentCertificates.filter(
                            (item) =>
                                item.id !== certificate.id
                        );

                    return [certificate, ...filtered];
                });
            }

            setSuccess(
                result?.alreadyExists
                    ? "Le brouillon existait déjà."
                    : "Brouillon de l’attestation créé."
            );

            setForm(EMPTY_FORM);
            setFormOpen(false);
        } catch (submitError) {
            setError(
                submitError?.message ||
                "Le brouillon n’a pas pu être créé."
            );
        } finally {
            setSubmitting(false);
        }
    }
    async function handleSaveDetails(event) {
        event.preventDefault();

        if (savingDetails) return;

        if (!session?.access_token) {
            setError(
                "Votre session a expiré. Reconnectez-vous."
            );
            return;
        }

        if (!detailsForm.certificateId) {
            setError("Le brouillon sélectionné est invalide.");
            return;
        }

        setSavingDetails(true);
        setError("");
        setSuccess("");

        try {
            const response = await fetch(
                "/api/interventions?resource=boiler-certificates",
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization:
                            `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        ...detailsForm,
                        measuringInstruments:
                            detailsForm.measuringInstruments
                                .split("\n")
                                .map((item) => item.trim())
                                .filter(Boolean),
                    }),
                }
            );

            const result =
                await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(
                    result?.error ||
                    "Le brouillon n’a pas pu être enregistré."
                );
            }

            const certificate = result?.certificate;

            if (certificate?.id) {
                setCertificates((currentCertificates) =>
                    currentCertificates.map((item) =>
                        item.id === certificate.id
                            ? certificate
                            : item
                    )
                );
            }

            setSuccess("Brouillon enregistré.");
            setEditingCertificateId("");
            setDetailsForm(EMPTY_DETAILS_FORM);
        } catch (saveError) {
            setError(
                saveError?.message ||
                "Le brouillon n’a pas pu être enregistré."
            );
        } finally {
            setSavingDetails(false);
        }
    }
    if (
        !loading &&
        eligibleInterventions.length === 0 &&
        certificates.length === 0
    ) {
        return null;
    }

    return (
        <section
            className="pro-dashboard-grid"
            aria-labelledby="boiler-certificate-title"
        >
            <article
                className="pro-dashboard-card pro-equipment-card"
                style={{ gridColumn: "1 / -1" }}
            >
                <div>
                    <span
                        className="pro-dashboard-icon"
                        aria-hidden="true"
                    >
                        📋
                    </span>

                    <h2 id="boiler-certificate-title">
                        Attestations d’entretien chaudière
                    </h2>

                    <p>
                        Une attestation réglementaire distincte est
                        conservée pour chaque chaudière entretenue.
                    </p>
                </div>

                {loading && (
                    <p className="pro-form-notice" role="status">
                        Chargement des attestations…
                    </p>
                )}

                {success && (
                    <p className="pro-form-success" role="status">
                        {success}
                    </p>
                )}

                {error && (
                    <p className="pro-form-error" role="alert">
                        {error}
                    </p>
                )}

                {!loading &&
                    availableInterventions.length > 0 &&
                    !formOpen && (
                        <button
                            className="pro-primary-button"
                            type="button"
                            onClick={openForm}
                        >
                            Préparer une attestation
                        </button>
                    )}

                {formOpen && (
                    <form
                        className="pro-form pro-equipment-form"
                        onSubmit={handleSubmit}
                        aria-busy={submitting}
                    >
                        <label>
                            <span>Intervention d’entretien *</span>

                            <select
                                name="interventionId"
                                value={form.interventionId}
                                onChange={handleChange}
                                disabled={submitting}
                                required
                            >
                                <option value="">
                                    Sélectionner une intervention
                                </option>

                                {availableInterventions.map(
                                    (intervention) => {
                                        const equipment =
                                            equipmentById[
                                            intervention.equipmentId
                                            ];

                                        return (
                                            <option
                                                key={intervention.id}
                                                value={intervention.id}
                                            >
                                                {equipment
                                                    ? `${equipment.brand} ${equipment.model} — ${equipment.serial_number}`
                                                    : intervention.carnetPassId}
                                                {" — "}
                                                {formatDate(
                                                    intervention.interventionAt
                                                )}
                                            </option>
                                        );
                                    }
                                )}
                            </select>
                        </label>

                        <label>
                            <span>Nom du commanditaire *</span>

                            <input
                                type="text"
                                name="customerName"
                                value={form.customerName}
                                onChange={handleChange}
                                maxLength={200}
                                disabled={submitting}
                                required
                            />
                        </label>

                        <label>
                            <span>Adresse du commanditaire *</span>

                            <textarea
                                name="customerAddress"
                                value={form.customerAddress}
                                onChange={handleChange}
                                maxLength={500}
                                rows={3}
                                disabled={submitting}
                                required
                            />
                        </label>

                        <label>
                            <span>Adresse de l’installation *</span>

                            <textarea
                                name="installationAddress"
                                value={form.installationAddress}
                                onChange={handleChange}
                                maxLength={500}
                                rows={3}
                                disabled={submitting}
                                required
                            />
                        </label>

                        <label>
                            <span>Local de la chaudière *</span>

                            <input
                                type="text"
                                name="boilerLocation"
                                value={form.boilerLocation}
                                onChange={handleChange}
                                placeholder="Exemple : cuisine, sous-sol, chaufferie"
                                maxLength={200}
                                disabled={submitting}
                                required
                            />
                        </label>

                        <p className="pro-form-notice">
                            Cette étape crée uniquement un brouillon.
                            L’attestation ne sera pas encore émise.
                        </p>

                        <div className="pro-form-row">
                            <button
                                className="pro-primary-button"
                                type="submit"
                                disabled={submitting}
                            >
                                {submitting
                                    ? "Création du brouillon…"
                                    : "Créer le brouillon"}
                            </button>

                            <button
                                className="pro-action-card-button"
                                type="button"
                                disabled={submitting}
                                onClick={() => {
                                    setFormOpen(false);
                                    setForm(EMPTY_FORM);
                                    setError("");
                                }}
                            >
                                Annuler
                            </button>
                        </div>
                    </form>
                )}

                {certificates.length > 0 && (
                    <ul className="pro-regulatory-list">
                        {certificates.map((certificate) => (
                            <li key={certificate.id}>
                                <span>
                                    {certificate.equipmentSnapshot?.brand}{" "}
                                    {certificate.equipmentSnapshot?.model}
                                </span>

                                <strong>
                                    {certificate.status === "issued"
                                        ? "Attestation émise"
                                        : "Brouillon à compléter"}
                                </strong>
                                {certificate.status === "draft" && (
                                    <button
                                        className="pro-action-card-button"
                                        type="button"
                                        onClick={() => openDetailsForm(certificate)}
                                        disabled={savingDetails}
                                    >
                                        Compléter le brouillon
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {editingCertificateId && (
                    <form
                        className="pro-form pro-equipment-form"
                        onSubmit={handleSaveDetails}
                        aria-busy={savingDetails}
                    >
                        <h3>Compléter l’attestation</h3>

                        <label>
                            <span>Énergie de la chaudière</span>
                            <select
                                name="boilerEnergy"
                                value={detailsForm.boilerEnergy}
                                onChange={handleDetailsChange}
                                disabled={savingDetails}
                            >
                                <option value="">Sélectionner</option>
                                <option value="natural_gas">Gaz naturel</option>
                                <option value="propane">Propane</option>
                                <option value="fuel_oil">Fioul domestique</option>
                                <option value="wood">Bois</option>
                                <option value="other">Autre</option>
                            </select>
                        </label>

                        <label>
                            <span>Type d’évacuation des fumées</span>
                            <select
                                name="flueExhaustType"
                                value={detailsForm.flueExhaustType}
                                onChange={handleDetailsChange}
                                disabled={savingDetails}
                            >
                                <option value="">Sélectionner</option>
                                <option value="chimney">Conduit de cheminée</option>
                                <option value="sealed">
                                    Ventouse / circuit étanche
                                </option>
                                <option value="vmc_gas">VMC gaz</option>
                                <option value="other">Autre</option>
                            </select>
                        </label>

                        <label>
                            <span>Date de mise en service</span>
                            <input
                                type="date"
                                name="commissioningDate"
                                value={detailsForm.commissioningDate}
                                onChange={handleDetailsChange}
                                disabled={savingDetails}
                            />
                        </label>

                        <label>
                            <span>Puissance nominale (kW)</span>
                            <input
                                type="number"
                                name="nominalPowerKw"
                                value={detailsForm.nominalPowerKw}
                                onChange={handleDetailsChange}
                                min="0"
                                step="0.01"
                                disabled={savingDetails}
                            />
                        </label>

                        <label>
                            <span>Date du précédent entretien</span>
                            <input
                                type="date"
                                name="previousMaintenanceDate"
                                value={detailsForm.previousMaintenanceDate}
                                onChange={handleDetailsChange}
                                disabled={savingDetails}
                            />
                        </label>

                        <label>
                            <span>Date du précédent ramonage</span>
                            <input
                                type="date"
                                name="previousChimneySweepingDate"
                                value={detailsForm.previousChimneySweepingDate}
                                onChange={handleDetailsChange}
                                disabled={savingDetails}
                            />
                        </label>

                        <fieldset>
                            <legend>Points contrôlés</legend>

                            {CONTROLLED_POINT_OPTIONS.map((point) => (
                                <label key={point}>
                                    <input
                                        type="checkbox"
                                        checked={detailsForm.controlledPoints.includes(
                                            point
                                        )}
                                        onChange={() => toggleControlledPoint(point)}
                                        disabled={savingDetails}
                                    />
                                    <span>{point}</span>
                                </label>
                            ))}
                        </fieldset>

                        <label>
                            <span>
                                Appareils de mesure utilisés
                                (un appareil par ligne)
                            </span>
                            <textarea
                                name="measuringInstruments"
                                value={detailsForm.measuringInstruments}
                                onChange={handleDetailsChange}
                                rows={4}
                                maxLength={2_000}
                                placeholder={
                                    "Analyseur de combustion TESTO 300\nDétecteur CO TESTO 317-3"
                                }
                                disabled={savingDetails}
                            />
                        </label>

                        <label>
                            <span>Monoxyde de carbone ambiant (ppm)</span>
                            <input
                                type="number"
                                name="ambientCoPpm"
                                value={detailsForm.ambientCoPpm}
                                onChange={handleDetailsChange}
                                min="0"
                                step="0.01"
                                disabled={savingDetails}
                            />
                        </label>

                        <label>
                            <span>Rendement de la chaudière (%)</span>
                            <input
                                type="number"
                                name="boilerEfficiencyPercent"
                                value={detailsForm.boilerEfficiencyPercent}
                                onChange={handleDetailsChange}
                                min="0"
                                max="100"
                                step="0.01"
                                disabled={savingDetails}
                            />
                        </label>

                        <label>
                            <span>Rendement de référence (%)</span>
                            <input
                                type="number"
                                name="referenceEfficiencyPercent"
                                value={detailsForm.referenceEfficiencyPercent}
                                onChange={handleDetailsChange}
                                min="0"
                                max="100"
                                step="0.01"
                                disabled={savingDetails}
                            />
                        </label>

                        <label>
                            <span>Classe énergétique de la chaudière</span>
                            <select
                                name="boilerEnergyClass"
                                value={detailsForm.boilerEnergyClass}
                                onChange={handleDetailsChange}
                                disabled={savingDetails}
                            >
                                <option value="">Non renseignée</option>
                                <option value="A+++">A+++</option>
                                <option value="A++">A++</option>
                                <option value="A+">A+</option>
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                                <option value="D">D</option>
                                <option value="E">E</option>
                                <option value="F">F</option>
                                <option value="G">G</option>
                            </select>
                        </label>

                        <label>
                            <span>Conseils de bon usage</span>
                            <textarea
                                name="adviceGoodUse"
                                value={detailsForm.adviceGoodUse}
                                onChange={handleDetailsChange}
                                rows={3}
                                maxLength={2_000}
                                disabled={savingDetails}
                            />
                        </label>

                        <label>
                            <span>Améliorations possibles</span>
                            <textarea
                                name="adviceImprovements"
                                value={detailsForm.adviceImprovements}
                                onChange={handleDetailsChange}
                                rows={3}
                                maxLength={2_000}
                                disabled={savingDetails}
                            />
                        </label>

                        <label>
                            <span>Conseils de remplacement</span>
                            <textarea
                                name="adviceReplacement"
                                value={detailsForm.adviceReplacement}
                                onChange={handleDetailsChange}
                                rows={3}
                                maxLength={2_000}
                                disabled={savingDetails}
                            />
                        </label>

                        <p className="pro-form-notice">
                            Le niveau de risque lié au monoxyde de carbone est
                            calculé automatiquement à partir de la mesure saisie.
                        </p>

                        <div className="pro-form-row">
                            <button
                                className="pro-primary-button"
                                type="submit"
                                disabled={savingDetails}
                            >
                                {savingDetails
                                    ? "Enregistrement…"
                                    : "Enregistrer le brouillon"}
                            </button>

                            <button
                                className="pro-action-card-button"
                                type="button"
                                disabled={savingDetails}
                                onClick={() => {
                                    setEditingCertificateId("");
                                    setDetailsForm(EMPTY_DETAILS_FORM);
                                    setError("");
                                }}
                            >
                                Annuler
                            </button>
                        </div>
                    </form>
                )}
            </article>
        </section>
    );
}
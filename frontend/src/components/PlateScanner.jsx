import { useRef, useState } from "react";
import { devisRequest, compressPlate } from "../services/shibaDevisService";
import { PLATE_FIELDS, EQUIPMENT_TYPES } from "../../shared/plate-scan.js";
import { loadEquipmentKnowledge } from "../services/equipmentKnowledge";
const labels = {
  brand: "Marque",
  model: "Modèle commercial",
  productReference: "Référence fabricant",
  serialNumber: "Numéro de série privé",
  manufactureYear: "Année de fabrication",
  equipmentType: "Type d’équipement",
};
const typeLabels = {
  boiler: "Chaudière",
  heat_pump: "Pompe à chaleur",
  air_conditioning: "Climatisation",
  water_heater: "Chauffe-eau",
  vmc: "Ventilation",
  rooftop: "Rooftop",
  other: "Autre",
};
export default function PlateScanner({ onConfirm, disabled = false, initialOpen = false }) {
  const [photo, setPhoto] = useState(null),
    [analysis, setAnalysis] = useState(null),
    [values, setValues] = useState({}),
    [candidateId, setCandidateId] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retain, setRetain] = useState(false),
    [open, setOpen] = useState(initialOpen);
  const fileRef = useRef(null);
  async function choose(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setAnalysis(null);
    setPhoto(null);
    setValues({});
    setCandidateId("");
    setRetain(false);
    setBusy(true);
    try {
      setPhoto(await compressPlate(file));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }
  async function analyze() {
    setError("");
    setBusy(true);
    try {
      const result = await devisRequest("/api/plate-scan", {
        body: { action: "analyze", image: photo.dataUrl },
      });
      setAnalysis(result);
      setValues(
        Object.fromEntries(
          Object.entries(result.fields).map(([k, v]) => [k, v.value]),
        ),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function candidate(id) {
    setCandidateId(id);
    const c = analysis.candidates.find((x) => x.equipmentId === id);
    if (c) {
      setBusy(true);
      let equipmentType = "";
      try {
        const knowledge = await loadEquipmentKnowledge(c);
        const category = knowledge?.data?.identity?.productType || "";
        if (category.startsWith("chaudiere")) equipmentType = "boiler";
        else if (category.startsWith("pompe_a_chaleur")) equipmentType = "heat_pump";
        else if (category.startsWith("climatisation")) equipmentType = "air_conditioning";
      } catch { setError("Le type du modèle n’a pas pu être chargé. Précisez-le manuellement."); }
      setValues((v) => ({
        ...v,
        brand: c.brand,
        model: c.model,
        productReference: c.manufacturerReference,
        equipmentType: equipmentType || v.equipmentType,
      }));
      setBusy(false);
    }
  }
  return (
    <section className="devis-panel" aria-label="Scanner la plaque">
      <button
        type="button"
        className="devis-secondary"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        Photographier la plaque signalétique
      </button>
      {open && (
        <>
          <p>
            Photographiez la plaque signalétique entière, nette et sans reflet, avec la marque et les références lisibles. L’image compressée est envoyée à
            CarnetPass puis à OpenAI pour extraction. La photo n’est pas
            conservée par CarnetPass sauf choix explicite après enregistrement.
            Le numéro de série reste privé.
          </p>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={choose}
            disabled={busy}
            aria-label="Prendre une photo ou importer la plaque"
          />
          <button type="button" className="devis-button" disabled={busy || disabled} onClick={() => fileRef.current?.click()}>
            {photo ? "Changer la photo" : "Prendre une photo ou choisir une image"}
          </button>
          <p>
            Vous pouvez aussi remplir la fiche manuellement, sans utiliser le scan.
          </p>
          {photo && (
            <>
              <p role="status">Photo chargée. Lancez l’analyse, puis vérifiez les informations proposées.</p>
              <img
                src={photo.dataUrl}
                alt="Aperçu de la plaque à analyser"
                style={{
                  maxWidth: "100%",
                  maxHeight: 280,
                  objectFit: "contain",
                }}
              />
              <div className="devis-actions">
                <button type="button" className="devis-button" disabled={busy || disabled} onClick={analyze}>
                  {busy ? "Analyse…" : "Analyser la plaque"}
                </button>
                <button
                  type="button"
                  className="devis-secondary"
                  disabled={busy}
                  onClick={() => {
                    setPhoto(null);
                    setAnalysis(null);
                    setValues({});
                    setRetain(false);
                  }}
                >
                  Recommencer
                </button>
              </div>
            </>
          )}
          {error && <p role="alert">{error}</p>}
          {analysis && (
            <>
              {analysis.founderTest && <p role="status">Test fondateur : scan autorisé pour votre entreprise sans validation du SIRET. L’équipement enregistré reste une donnée réelle de production.</p>}
              <p>
                Lecture incertaine à contrôler. Les valeurs absentes restent
                vides ; aucune année n’est déduite du numéro de série.
              </p>
              {analysis.candidates.length > 0 && (
                <label>
                  Correspondances du catalogue à confirmer
                  <select
                    value={candidateId}
                    disabled={busy}
                    onChange={(e) => candidate(e.target.value)}
                  >
                    <option value="">Ne rattacher aucun modèle</option>
                    {analysis.candidates.map((c) => (
                      <option key={c.equipmentId} value={c.equipmentId}>
                        {c.brand} {c.model} — {c.manufacturerReference}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!analysis.candidates.length && (
                <p>
                  Aucune correspondance trouvée avec les informations lues. Vous pouvez compléter les champs et créer la fiche sans notice associée.
                </p>
              )}
              <div className="devis-grid">
                {PLATE_FIELDS.map((field) => (
                  <label className="devis-field" key={field}>
                    <span>{labels[field]}</span>
                    {field === "equipmentType" ? (
                      <select
                        value={values[field] || ""}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [field]: e.target.value }))
                        }
                      >
                        <option value="">À préciser</option>
                        {EQUIPMENT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {typeLabels[t]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={values[field] || ""}
                        maxLength={field === "serialNumber" ? 128 : 100}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [field]: e.target.value }))
                        }
                      />
                    )}
                    <small>
                      {analysis.fields[field].evidence ||
                        "Non lu sur la plaque ; saisie manuelle possible."}
                    </small>
                  </label>
                ))}
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={retain}
                  onChange={(e) => setRetain(e.target.checked)}
                />{" "}
                Conserver la photo dans les pièces jointes privées après
                enregistrement de l’équipement.
              </label>
              <button
                type="button"
                className="devis-button"
                disabled={
                  busy || !values.brand?.trim() || !values.model?.trim()
                }
                onClick={() => {
                  onConfirm({
                    fields: values,
                    ticket: analysis.ticket,
                    candidateId,
                    photo: retain ? photo.file : null,
                  });
                  setOpen(false);
                  setPhoto(null);
                  setAnalysis(null);
                }}
              >
                J’ai vérifié les champs : préremplir la fiche
              </button>
              <p>
                Cette action n’enregistre pas l’équipement. Vérifiez la fiche
                puis confirmez son enregistrement.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { CLIMATE_FIELDS, FLUID_FIELDS } from "../../server/lib/thermodynamic-document-schema.js";
import ThermodynamicSignature from "./ThermodynamicSignature.jsx";
import "./ThermodynamicDocuments.css";

const KINDS = [
  { id: "climate_maintenance", label: "Fiche d'entretien clim/PAC" },
  { id: "fluids_15497_04", label: "Fiche fluides (rubriques CERFA 15497*04)" },
];
const labelFor = (kind) => KINDS.find((item) => item.id === kind)?.label || kind;
const FIELD_OPTIONS = {
  fluidCategory: ["CFC", "HCFC", "HFC", "PFC", "HFO", "Autre"],
  operationNature: ["Assemblage", "Mise en service", "Modification", "Maintenance", "Contrôle d'étanchéité périodique", "Contrôle d'étanchéité non périodique", "Démantèlement", "Autre"],
  permanentDetector: ["Oui", "Non"], leaksFound: ["Oui", "Non"],
  frequencyNoDetector: ["3 mois", "6 mois", "12 mois", "24 mois", "Sans objet"],
  frequencyWithDetector: ["3 mois", "6 mois", "12 mois", "24 mois", "Sans objet"],
};
const NUMERIC_FIELDS = new Set(["chargeKg", "co2Equivalent", "chargedTotalKg", "virginKg", "recycledKg", "regeneratedKg", "recoveredTotalKg", "treatmentKg", "reuseKg"]);
const DATE_FIELDS = new Set(["visitDate", "operationDate", "detectorCheckedAt", "nextVisit"]);

export default function ThermodynamicDocuments({ equipment, interventions, session, company, onDocumentsChange }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("");
  const [interventionId, setInterventionId] = useState("");
  const [formData, setFormData] = useState({});
  const [operatorSignature, setOperatorSignature] = useState({ name: "", strokes: [], accepted: false });
  const [holderSignature, setHolderSignature] = useState({ name: "", strokes: [], accepted: false });
  const [pdfUrl, setPdfUrl] = useState("");

  const confirmed = useMemo(() => interventions.filter((item) => item.polygonState === "confirmed"), [interventions]);
  useEffect(() => {
    if (!session?.access_token) return;
    let active = true;
    fetch(`/api/thermodynamic-documents?equipmentId=${encodeURIComponent(equipment.id)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Chargement impossible.");
      return result.documents || [];
    }).then((items) => { if (active) { setDocuments(items); onDocumentsChange?.(items); } })
      .catch((failure) => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [equipment.id, session?.access_token, onDocumentsChange]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  function openForm(nextKind, item = null, selectedId = "") {
    const targetId = selectedId || item?.intervention_id || confirmed[0]?.id || "";
    const draft = item || documents.find((document) => document.kind === nextKind
      && document.intervention_id === targetId && document.status === "draft");
    setKind(nextKind); setInterventionId(targetId);
    setFormData(draft?.form_data || {
      operatorName: company?.name || "", operatorSiret: company?.siret || "",
      technicianName: "", equipmentIdentification: `${equipment.brand} ${equipment.model}`,
      operationDate: new Date().toISOString().slice(0, 10), visitDate: new Date().toISOString().slice(0, 10),
    });
    setOperatorSignature(draft?.operator_signature || { name: "", strokes: [], accepted: false });
    setHolderSignature(draft?.holder_signature || { name: "", strokes: [], accepted: false });
    setError(""); setMessage("");
  }
  function updateField(key, value) {
    setFormData((current) => ({ ...current, [key]: value }));
    setOperatorSignature((current) => ({ ...current, strokes: [], accepted: false }));
    setHolderSignature((current) => ({ ...current, strokes: [], accepted: false }));
  }

  async function save(action) {
    if (!interventionId) { setError("Choisissez une intervention confirmée."); return; }
    if (!session?.access_token) { setError("Reconnectez-vous pour enregistrer le document."); return; }
    if (action === "issue" && !window.confirm("Émettre définitivement ce document signé ? Il ne pourra plus être modifié.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/thermodynamic-documents", {
        method: action === "issue" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ kind, interventionId, formData, action,
          operatorSignature: action === "issue" ? operatorSignature : undefined,
          holderSignature: action === "issue" ? holderSignature : undefined }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Enregistrement impossible.");
      const next = [result.document, ...documents.filter((item) => item.id !== result.document.id)];
      setDocuments(next);
      onDocumentsChange?.(next);
      setMessage(action === "issue" ? "Document signé et émis. Vous pouvez consulter son PDF." : "Brouillon enregistré.");
      if (action === "issue") setKind("");
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function openPdf(item) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/thermodynamic-documents?id=${encodeURIComponent(item.id)}&format=pdf`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || "PDF indisponible."); }
      setPdfUrl(URL.createObjectURL(await response.blob()));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  const fields = kind === "fluids_15497_04" ? FLUID_FIELDS : CLIMATE_FIELDS;
  const groups = fields.reduce((result, field) => {
    const section = /^\[(\d+)\]/.exec(field[1])?.[1] || "Entretien";
    const group = result.find((item) => item.section === section);
    if (group) group.fields.push(field);
    else result.push({ section, fields: [field] });
    return result;
  }, []);
  return <section className="thermo-documents" aria-labelledby="thermo-documents-title">
    <h3 id="thermo-documents-title">Attestations climatisation / PAC</h3>
    <p>Renseignez la fiche sur le terrain, puis faites signer le technicien et le détenteur sur cet appareil. Une intervention CarnetPass confirmée est nécessaire.</p>
    {kind === "fluids_15497_04" && <p className="thermo-documents__notice">La saisie reprend les rubriques du CERFA 15497*04. Vérifiez le <a href="https://entreprendre.service-public.gouv.fr/vosdroits/R43122" target="_blank" rel="noreferrer">formulaire officiel et sa notice</a> avant émission. Le PDF généré par CarnetPass est une fiche numérique, pas le PDF XFA officiel ; un BSFF Trackdéchets reste distinct.</p>}
    {loading && <p role="status">Chargement des documents…</p>}
    {error && <p role="alert" className="pro-form-error">{error}</p>}
    {message && <p role="status" className="pro-form-success">{message}</p>}
    {!loading && <>
      {documents.length > 0 && <div className="thermo-documents__list">
        {documents.map((item) => <article key={item.id}>
          <strong>{labelFor(item.kind)}</strong>
          <span>{item.status === "issued" ? "Émis et verrouillé" : "Brouillon"}</span>
          <div>{item.status === "issued"
            ? <button type="button" disabled={busy} onClick={() => openPdf(item)}>Consulter le PDF signé</button>
            : <button type="button" onClick={() => openForm(item.kind, item)}>Reprendre le brouillon</button>}</div>
        </article>)}
      </div>}
      {confirmed.length === 0 ? <p className="thermo-documents__notice">Enregistrez d'abord une intervention, puis attendez la confirmation Polygon avant de préparer une fiche.</p>
        : <div className="thermo-documents__actions">{KINDS.map((item) => <button type="button" key={item.id} onClick={() => openForm(item.id)}>{item.label}</button>)}</div>}
      {kind && <div className="thermo-documents__form">
        <h4>{labelFor(kind)}</h4>
        <label>Intervention liée
          <select value={interventionId} onChange={(event) => openForm(kind, null, event.target.value)}>
            {confirmed.map((item) => <option key={item.id} value={item.id}>{new Date(item.interventionAt).toLocaleDateString("fr-FR")} - {item.workPerformed?.slice(0, 80)}</option>)}
          </select>
        </label>
        {groups.map((group) => <details className="thermo-documents__group" key={group.section} open={group.section === "Entretien" || ["1", "2", "3", "4"].includes(group.section)}>
          <summary>{group.section === "Entretien" ? "Contrôles et compte rendu" : `Rubrique ${group.section}`}</summary>
          <div className="thermo-documents__fields">{group.fields.map(([key, label]) => <label key={key}>{label}
            {FIELD_OPTIONS[key] ? <select value={formData[key] || ""} onChange={(event) => updateField(key, event.target.value)}>
              <option value="">Choisir…</option>{FIELD_OPTIONS[key].map((option) => <option key={option}>{option}</option>)}
            </select> : DATE_FIELDS.has(key) ? <input type="date" value={formData[key] || ""} onChange={(event) => updateField(key, event.target.value)} />
              : NUMERIC_FIELDS.has(key) ? <input type="number" min="0" step="0.01" inputMode="decimal" value={formData[key] || ""} onChange={(event) => updateField(key, event.target.value)} />
                : <textarea rows={key.includes("Observation") || key.includes("work") || key.includes("leak") ? 3 : 1}
                  value={formData[key] || ""} maxLength={2000}
                  onChange={(event) => updateField(key, event.target.value)} />}
          </label>)}</div>
        </details>)}
        <ThermodynamicSignature label="Signature de l'opérateur / technicien" value={operatorSignature} onChange={setOperatorSignature} />
        <ThermodynamicSignature label="Signature du détenteur / client" value={holderSignature} onChange={setHolderSignature} />
        <div className="thermo-documents__actions">
          <button type="button" disabled={busy} onClick={() => save("save")}>Enregistrer le brouillon</button>
          <button type="button" disabled={busy} onClick={() => save("issue")}>Émettre le document signé</button>
          <button type="button" onClick={() => setKind("")}>Fermer</button>
        </div>
      </div>}
      {pdfUrl && <div className="thermo-documents__preview"><a href={pdfUrl} download="fiche-carnetpass.pdf">Télécharger le PDF</a>
        <button type="button" onClick={() => setPdfUrl("")}>Fermer</button>
        <iframe src={pdfUrl} title="Document réglementaire signé" /></div>}
    </>}
  </section>;
}

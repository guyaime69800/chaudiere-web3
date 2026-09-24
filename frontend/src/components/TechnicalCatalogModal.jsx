import { useEffect, useRef, useState } from "react";
import shibaTechnicien from "../assets/carnetpass-shiba-technicien.png";
import { getEquipmentDocumentLibrary } from "../services/equipmentKnowledge";
import DocumentPreviewModal from "./DocumentPreviewModal";
import "./TechnicalCatalogModal.css";

const CATEGORIES = [
  { id: "boiler", label: "Chaudières" },
  { id: "heat_pump_indoor", label: "PAC · Unités intérieures", catalogType: "heat_pump" },
  { id: "heat_pump_outdoor", label: "PAC · Unités extérieures", catalogType: "heat_pump" },
  { id: "air_conditioning_indoor", label: "Clim · Unités intérieures", catalogType: "air_conditioning" },
  { id: "air_conditioning_outdoor", label: "Clim · Unités extérieures", catalogType: "air_conditioning" },
  { id: "burner", label: "Brûleurs" },
  { id: "water_heater", label: "Chauffe-bains" },
  { id: "regulation", label: "Régulations" },
  { id: "heat_pump_water_heater", label: "Chauffe-eau thermodynamiques" },
  { id: "vmc", label: "VMC" },
];
// Marques à parcourir. Les modèles et documents restent indépendants de cette liste.
const BOILER_BRANDS = ["ACV", "Ariston", "Atlantic", "Atlantic Solutions Chaufferie", "Auer", "Bosch", "Brotje", "Buderus", "Bulex", "Chaffoteaux", "Chappée", "Daikin", "De Dietrich", "Deville", "Domusa Teknik", "ELCO", "ELM Leblanc", "Ferroli", "Frisquet", "Fröling", "Geminox", "Ideal Standard", "NIBE", "Oertli", "OKOFEN", "PERGE", "Remeha", "Riello", "ROTEX", "Saunier Duval", "Styx", "UNICAL", "Vaillant", "VERGNE", "Viessmann", "Weishaupt", "Wolf"];
const PAC_BRANDS = ["ACV", "AERMEC", "Airwell", "ALDES", "Altech", "AO Smith", "Ariston", "Atlantic", "Auer", "Bosch", "Buderus", "Bulex", "Carrier", "Chaffoteaux", "Chappée", "CIAT", "Daikin", "De Dietrich", "Domusa Teknik", "Frisquet", "Geminox", "HEIWA", "Hitachi", "LG", "MIDEA", "Mitsubishi Electric", "Mitsubishi Heavy Industries", "NIBE", "Oertli", "Pacific", "Panasonic", "PERGE", "Remeha", "ROTEX", "Samsung", "Saunier Duval", "Stiebel Eltron", "Technibel", "Thermor", "Toshiba", "Vaillant", "Viessmann", "Weishaupt", "Wolf"];
const CLIM_BRANDS = ["AERMEC", "Airwell", "Altech", "Ariston", "Atlantic", "Bosch", "Bulex", "Carrier", "Chappée", "CIAT", "Daikin", "De Dietrich", "General", "Gree", "HEIWA", "Hitachi", "LENNOX", "LG", "MIDEA", "Mitsubishi Electric", "Mitsubishi Heavy Industries", "NIBE", "Panasonic", "Remeha", "Samsung", "Saunier Duval", "Technibel", "Thermor", "Toshiba", "VALSON Electric", "Viessmann"];
const CATEGORY_BRANDS = {
  boiler: BOILER_BRANDS,
  heat_pump_indoor: PAC_BRANDS,
  heat_pump_outdoor: [...PAC_BRANDS, "Trane"],
  air_conditioning_indoor: CLIM_BRANDS,
  air_conditioning_outdoor: CLIM_BRANDS,
  burner: ["ACV", "Atlantic", "Bentone", "Bosch", "Brotje", "Buderus", "Chappée", "Cuenod", "De Dietrich", "Deville", "Domusa Teknik", "ELCO", "Geminox", "Ideal Standard", "NIBE", "Oertli", "Riello", "Viessmann", "Weishaupt", "Wolf"],
  water_heater: ["ACV", "Altech", "AO Smith", "Ariston", "Atlantic", "Auer", "Bosch", "Bulex", "Chaffoteaux", "ELM Leblanc", "Frisquet", "Geminox", "MIDEA", "NIBE", "Panasonic", "Remeha", "Samsung", "Saunier Duval", "Styx", "Thermor", "Vaillant", "Viessmann", "Wolf"],
  regulation: ["ACV", "Airwell", "Altech", "Atlantic", "Auer", "Buderus", "Bulex", "Chaffoteaux", "Chappée", "Daikin", "De Dietrich", "DELTA DORE", "ELM Leblanc", "Frisquet", "Geminox", "General", "Hitachi", "Mitsubishi Electric", "Netatmo", "NIBE", "Oertli", "Panasonic", "Remeha", "Samsung", "Saunier Duval", "Stiebel Eltron", "Thermor", "Toshiba", "Vaillant", "Viessmann", "Weishaupt", "Wolf"],
  heat_pump_water_heater: ["ACV", "Airwell", "ALDES", "Altech", "AO Smith", "Ariston", "Atlantic", "Auer", "Bosch", "Bulex", "Chaffoteaux", "Chappée", "Daikin", "De Dietrich", "ELM Leblanc", "Hitachi", "LG", "MIDEA", "Mitsubishi Electric", "NIBE", "Oertli", "Saunier Duval", "Thermor"],
};
const normalize = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr");

export default function TechnicalCatalogModal({ open, onClose, catalog = [], session, initialMode = "catalog", initialQuestion = "" }) {
  if (!open) return null;
  return <TechnicalCatalogContent onClose={onClose} catalog={catalog} session={session} initialMode={initialMode} initialQuestion={initialQuestion} />;
}

function TechnicalCatalogContent({ onClose, catalog, session, initialMode, initialQuestion }) {
  const [step, setStep] = useState(initialMode === "assistant" ? "assistant-picker" : "category");
  const [type, setType] = useState("");
  const [brand, setBrand] = useState("");
  const [query, setQuery] = useState("");
  const [model, setModel] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentsBusy, setDocumentsBusy] = useState(false);
  const [documentsError, setDocumentsError] = useState("");
  const [previewDocument, setPreviewDocument] = useState(null);
  const [question, setQuestion] = useState(initialQuestion);
  const [assistantOrigin, setAssistantOrigin] = useState(false);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const documentRequest = useRef(0);
  const aiRequest = useRef(0);

  useEffect(() => () => { documentRequest.current += 1; aiRequest.current += 1; }, []);

  const entries = Array.isArray(catalog) ? catalog : [];
  const category = CATEGORIES.find((item) => item.id === type);
  // Une entrée PAC/clim ne rejoint une unité que si sa position est renseignée.
  const categoryEntries = entries.filter((item) => item.type === type ||
    (category?.catalogType === item.type && item.unitPosition === type.split("_").at(-1)));
  const names = [...(CATEGORY_BRANDS[type] || [])];
  for (const item of categoryEntries) {
    if (item.brand && !names.some((name) => normalize(name) === normalize(item.brand))) names.push(item.brand);
  }
  const brands = names.map((name) => ({ name, count: categoryEntries.filter((item) => normalize(item.brand) === normalize(name)).length }));
  const models = categoryEntries.filter((item) => normalize(item.brand) === normalize(brand)
    && (!normalize(query) || normalize([item.model, item.variant, item.manufacturerReference].join(" ")).includes(normalize(query))));

  function clearModel({ preserveQuestion = false } = {}) {
    documentRequest.current += 1; aiRequest.current += 1;
    setModel(null); setDocuments([]); setDocumentsBusy(false); setDocumentsError("");
    setPreviewDocument(null); if (!preserveQuestion) setQuestion(""); setAnswer(""); setBusy(false); setError("");
  }
  function toCategory() { clearModel(); setType(""); setBrand(""); setQuery(""); setStep("category"); }
  function toBrands() { clearModel(); setBrand(""); setQuery(""); setStep("brand"); }
  function toModels() { clearModel(); setStep("models"); }
  function toAssistantPicker() { clearModel({ preserveQuestion: true }); setQuery(""); setStep("assistant-picker"); }

  async function selectModel(item, fromAssistant = false) {
    clearModel({ preserveQuestion: fromAssistant });
    const request = ++documentRequest.current;
    setAssistantOrigin(fromAssistant); setModel(item); setStep(fromAssistant ? "assistant" : "model"); setDocumentsBusy(true);
    try {
      const library = await getEquipmentDocumentLibrary(item.equipmentId);
      if (request === documentRequest.current) setDocuments(Array.isArray(library?.documents) ? library.documents : []);
    } catch (loadError) {
      if (request === documentRequest.current) {
        console.error("Chargement des documents impossible :", loadError);
        setDocumentsError("La documentation est momentanément indisponible.");
      }
    } finally { if (request === documentRequest.current) setDocumentsBusy(false); }
  }

  async function askShiba(event) {
    event.preventDefault();
    if (!question.trim() || !model?.equipmentId || !documents.length || documentsBusy || busy) return;
    const request = ++aiRequest.current;
    setBusy(true); setError(""); setAnswer("");
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ equipmentId: model.equipmentId, question: question.trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result?.ok) throw new Error(result?.message || result?.error || "Réponse indisponible.");
      if (request === aiRequest.current) setAnswer(result.answer || "Aucune réponse reçue.");
    } catch (requestError) {
      if (request === aiRequest.current) setError(requestError.message || "Réponse indisponible.");
    } finally { if (request === aiRequest.current) setBusy(false); }
  }

  return (
    <div className="technical-catalog-overlay" role="presentation" onMouseDown={onClose}>
      <section className="technical-catalog-modal" role="dialog" aria-modal="true" aria-labelledby="technical-catalog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="technical-catalog-header">
          <div><span className="technical-catalog-kicker">OUTIL TECHNIQUE</span><h2 id="technical-catalog-title">{step === "assistant-picker" ? "Posez une question à Shiba Bot" : "Catalogue technique"}</h2></div>
          <button type="button" className="technical-catalog-close" onClick={onClose} aria-label="Fermer">×</button>
        </header>
        <div className="technical-catalog-content">
          {step === "category" && <><h3>Choisissez un équipement</h3><div className="technical-catalog-category-grid">
            {CATEGORIES.map((item) => <button key={item.id} type="button" className="technical-catalog-category" onClick={() => { setType(item.id); setStep("brand"); }}><strong>{item.label}</strong><span>Voir les marques ›</span></button>)}
          </div></>}
          {step === "assistant-picker" && <section className="technical-catalog-pick-assistant" aria-label="Choisir le modèle pour Shiba Bot">
            <button type="button" className="technical-catalog-back" onClick={toCategory}>← Parcourir le catalogue</button>
            <div className="technical-catalog-assistant-heading"><img src={shibaTechnicien} alt="" /><p>Shiba Bot répond à partir des documents du modèle que vous choisissez. Les modèles disponibles s’enrichissent progressivement.</p></div>
            <label className="technical-catalog-search" htmlFor="technical-catalog-picker-question">Votre question<textarea id="technical-catalog-picker-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ex. Que signifie le code défaut F28 ?" rows={3} /></label>
            <label className="technical-catalog-search" htmlFor="technical-catalog-picker-model">Rechercher un modèle<input id="technical-catalog-picker-model" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Marque, modèle ou référence" /></label>
            <div className="technical-catalog-list">{entries.filter((item) => item.equipmentId && (!normalize(query) || normalize([item.brand, item.model, item.variant, item.manufacturerReference].join(" ")).includes(normalize(query)))).map((item) => <button key={item.equipmentId} type="button" className="technical-catalog-row" onClick={() => selectModel(item, true)}><strong>{item.brand} · {item.model}{item.variant ? ` · ${item.variant}` : ""}<small>{item.manufacturerReference}</small></strong><span aria-hidden="true">›</span></button>)}</div>
            {!entries.length && <p className="technical-catalog-empty">Les documents constructeur seront ajoutés progressivement.</p>}
          </section>}
          {step === "brand" && <><div className="technical-catalog-band"><button type="button" onClick={toCategory} aria-label="Retour aux catégories">‹</button><h3>{category?.label}</h3></div>
            {brands.length === 0 ? <p className="technical-catalog-empty">Les marques de cette catégorie seront ajoutées progressivement.</p> : <div className="technical-catalog-list">
              {brands.sort((a, b) => a.name.localeCompare(b.name, "fr")).map(({ name, count }) => <button key={name} type="button" className="technical-catalog-row" onClick={() => { setBrand(name); setStep("models"); }}><strong>{name}</strong><span>{count ? `${count} modèle${count > 1 ? "s" : ""}` : "À compléter"} <span aria-hidden="true">›</span></span></button>)}
            </div>}
          </>}
          {step === "models" && <><div className="technical-catalog-band"><button type="button" onClick={toBrands} aria-label="Retour aux marques">‹</button><h3>{brand}</h3></div>
            <label className="technical-catalog-search">Rechercher un modèle ou une référence<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom du modèle, référence…" autoFocus /></label>
            {models.length === 0 ? <p className="technical-catalog-empty">{query ? "Aucun modèle ne correspond à cette recherche." : "Les modèles seront ajoutés progressivement. La marque est déjà référencée."}</p> : <div className="technical-catalog-list">
              {models.map((item) => <button key={item.equipmentId || item.manufacturerReference || `${item.brand}-${item.model}`} type="button" className="technical-catalog-row" onClick={() => selectModel(item)}><strong>{item.model}{item.variant ? ` · ${item.variant}` : ""}<small>{item.manufacturerReference || ""}</small></strong><span aria-hidden="true">›</span></button>)}
            </div>}
          </>}
          {model && ["model", "documents", "assistant"].includes(step) && <>
            <div className="technical-catalog-model-heading"><div><span className="technical-catalog-kicker">{model.brand}</span><h3>{model.model}{model.variant ? ` · ${model.variant}` : ""}</h3><p>Réf. produit : {model.manufacturerReference || "non renseignée"}</p></div>{step === "model" && <button type="button" className="technical-catalog-back" onClick={assistantOrigin ? toAssistantPicker : toModels}>← {assistantOrigin ? "Choisir un autre modèle" : "Tous les modèles"}</button>}</div>
            {step === "model" && <>
              {documentsBusy && <p role="status">Vérification de la documentation…</p>}
              {documentsError && <p role="alert" className="technical-catalog-error">{documentsError}</p>}
              {!documentsBusy && !documentsError && !documents.length && <p className="technical-catalog-empty">La documentation reste à intégrer pour ce modèle. Shiba Bot sera disponible avec des sources vérifiées.</p>}
              {!!documents.length && <div className="technical-catalog-grid">
                <button type="button" className="technical-catalog-card" onClick={() => setStep("documents")}><strong>Documents constructeur</strong><span>{documents.length} document{documents.length > 1 ? "s" : ""} disponible{documents.length > 1 ? "s" : ""} →</span></button>
                <button type="button" className="technical-catalog-card" onClick={() => setStep("assistant")}><strong>🤖 Interroger Shiba Bot</strong><span>Posez votre question sur ce modèle →</span></button>
              </div>}
            </>}
            {step === "documents" && <section aria-label={`Documentation ${model.brand} ${model.model}`}>
              <button type="button" className="technical-catalog-back" onClick={() => setStep("model")}>← Retour au modèle</button><h4>Documents constructeur</h4>
              <div className="technical-catalog-document-list">{documents.map((item) => <article key={item.documentId}>
                <div><strong>{item.title}</strong><small>{item.sourceName || model.brand} · {item.documentCode || item.manufacturerReference || model.manufacturerReference}{item.pageCount ? ` · ${item.pageCount} pages` : ""}</small></div>
                <button type="button" onClick={() => setPreviewDocument(item)}>Consulter</button>
              </article>)}</div>
            </section>}
            {step === "assistant" && <section className="technical-catalog-assistant" aria-label="Shiba Bot">
              <button type="button" className="technical-catalog-back" onClick={assistantOrigin ? toAssistantPicker : () => setStep("model")}>← {assistantOrigin ? "Choisir un autre modèle" : "Retour au modèle"}</button>
              <div className="technical-catalog-assistant-heading"><img src={shibaTechnicien} alt="" /><div><h4>Shiba Bot</h4><p>Posez une question précise. Vérifiez les références dans les documents constructeur.</p></div></div>
              {documentsBusy && <p role="status">Vérification de la documentation…</p>}
              {documentsError && <p role="alert" className="technical-catalog-error">{documentsError}</p>}
              {!documentsBusy && !documentsError && !documents.length && <p className="technical-catalog-empty">Ce modèle n’a pas encore de documents vérifiés. Choisissez un autre modèle.</p>}
              {!!documents.length && <form onSubmit={askShiba}><label htmlFor="technical-catalog-question">Votre question</label><textarea id="technical-catalog-question" value={question} onChange={(event) => { setQuestion(event.target.value); setAnswer(""); setError(""); }} placeholder="Ex. Quel est le code défaut F28 sur ce modèle ?" rows={4} autoFocus /><button type="submit" disabled={!question.trim() || documentsBusy || busy}>{busy ? "Recherche…" : "Interroger Shiba Bot"}</button></form>}
              {error && <p role="alert" className="technical-catalog-error">{error}</p>}
              {answer && <div className="technical-catalog-answer" aria-live="polite"><strong>Réponse de Shiba Bot</strong><p>{answer}</p></div>}
            </section>}
          </>}
        </div>
        <footer className="technical-catalog-footer">Cette recherche ne crée aucun équipement.</footer>
      </section>
      <DocumentPreviewModal open={Boolean(previewDocument)} onOpenChange={(isOpen) => { if (!isOpen) setPreviewDocument(null); }} eyebrow="DOCUMENT CONSTRUCTEUR" title={previewDocument?.title || "Document technique"} subtitle={`${previewDocument?.sourceName || model?.brand || "Constructeur"} · ${model?.model || ""}`} documentUrl={previewDocument?.documentUrl || ""} fileName={`${previewDocument?.documentCode || previewDocument?.documentId || "document"}.pdf`} />
    </div>
  );
}

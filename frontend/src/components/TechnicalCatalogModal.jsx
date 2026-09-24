import { useEffect, useRef, useState } from "react";
import shibaTechnicien from "../assets/carnetpass-shiba-technicien.png";
import { getEquipmentDocumentLibrary } from "../services/equipmentKnowledge";
import DocumentPreviewModal from "./DocumentPreviewModal";
import "./TechnicalCatalogModal.css";

const CATEGORIES = [
  { id: "boiler", label: "Chaudières" },
  { id: "heat_pump", label: "Pompes à chaleur" },
  { id: "air_conditioning", label: "Climatisations" },
  { id: "vmc", label: "VMC" },
];
// Repères visuels : aucun modèle ou document n'est inventé pour ces marques.
const BOILER_BRANDS = ["Saunier Duval", "Atlantic", "Chaffoteaux", "De Dietrich", "Frisquet", "Vaillant", "Viessmann"];
const normalize = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr");

export default function TechnicalCatalogModal({ open, onClose, catalog = [], session }) {
  if (!open) return null;
  return <TechnicalCatalogContent onClose={onClose} catalog={catalog} session={session} />;
}

function TechnicalCatalogContent({ onClose, catalog, session }) {
  const [step, setStep] = useState("category");
  const [type, setType] = useState("");
  const [brand, setBrand] = useState("");
  const [query, setQuery] = useState("");
  const [model, setModel] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentsBusy, setDocumentsBusy] = useState(false);
  const [documentsError, setDocumentsError] = useState("");
  const [previewDocument, setPreviewDocument] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const documentRequest = useRef(0);
  const aiRequest = useRef(0);

  useEffect(() => () => { documentRequest.current += 1; aiRequest.current += 1; }, []);

  const entries = Array.isArray(catalog) ? catalog : [];
  const category = CATEGORIES.find((item) => item.id === type);
  const categoryEntries = entries.filter((item) => item.type === type);
  const names = type === "boiler" ? [...BOILER_BRANDS] : [];
  for (const item of categoryEntries) {
    if (item.brand && !names.some((name) => normalize(name) === normalize(item.brand))) names.push(item.brand);
  }
  const brands = names.map((name) => ({ name, count: categoryEntries.filter((item) => normalize(item.brand) === normalize(name)).length }));
  const models = categoryEntries.filter((item) => normalize(item.brand) === normalize(brand)
    && (!normalize(query) || normalize([item.model, item.variant, item.manufacturerReference].join(" ")).includes(normalize(query))));

  function clearModel() {
    documentRequest.current += 1; aiRequest.current += 1;
    setModel(null); setDocuments([]); setDocumentsBusy(false); setDocumentsError("");
    setPreviewDocument(null); setQuestion(""); setAnswer(""); setBusy(false); setError("");
  }
  function toCategory() { clearModel(); setType(""); setBrand(""); setQuery(""); setStep("category"); }
  function toBrands() { clearModel(); setBrand(""); setQuery(""); setStep("brand"); }
  function toModels() { clearModel(); setStep("models"); }

  async function selectModel(item) {
    clearModel();
    const request = ++documentRequest.current;
    setModel(item); setStep("model"); setDocumentsBusy(true);
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
    if (!question.trim() || !model?.equipmentId || !documents.length || busy) return;
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
          <div><span className="technical-catalog-kicker">OUTIL TECHNIQUE</span><h2 id="technical-catalog-title">Catalogue technique</h2><p>Retrouvez un modèle sans créer de CarnetPass.</p></div>
          <button type="button" className="technical-catalog-close" onClick={onClose} aria-label="Fermer">×</button>
        </header>
        <nav className="technical-catalog-path" aria-label="Parcours du catalogue">
          <button type="button" onClick={toCategory} aria-current={step === "category" ? "step" : undefined}>Catégorie</button>
          {type && <><span aria-hidden="true">›</span><button type="button" onClick={toBrands} aria-current={step === "brand" ? "step" : undefined}>{category?.label}</button></>}
          {brand && <><span aria-hidden="true">›</span><button type="button" onClick={toModels} aria-current={step === "models" ? "step" : undefined}>{brand}</button></>}
          {model && <><span aria-hidden="true">›</span><span>{model.model}</span></>}
        </nav>
        <div className="technical-catalog-content">
          {step === "category" && <><h3>Choisissez un équipement</h3><div className="technical-catalog-grid">
            {CATEGORIES.map((item) => <button key={item.id} type="button" className="technical-catalog-card" onClick={() => { setType(item.id); setStep("brand"); }}><strong>{item.label}</strong><span>Explorer les marques →</span></button>)}
          </div></>}
          {step === "brand" && <><h3>Choisissez une marque · {category?.label}</h3>
            {brands.length === 0 ? <p className="technical-catalog-empty">Aucune marque renseignée pour cette catégorie.</p> : <div className="technical-catalog-grid">
              {brands.map(({ name, count }) => <button key={name} type="button" className="technical-catalog-card" onClick={() => { setBrand(name); setStep("models"); }}><strong>{name}</strong><span>{count ? `${count} modèle${count > 1 ? "s" : ""} au catalogue` : "Modèles à compléter"}</span></button>)}
            </div>}
          </>}
          {step === "models" && <><h3>Modèles {brand}</h3>
            <label className="technical-catalog-search">Rechercher un modèle ou une référence<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom du modèle, référence…" autoFocus /></label>
            {models.length === 0 ? <p className="technical-catalog-empty">{query ? "Aucun modèle ne correspond à cette recherche." : "Les modèles de cette marque seront ajoutés progressivement."}</p> : <div className="technical-catalog-models">
              {models.map((item) => <button key={item.equipmentId || item.manufacturerReference || `${item.brand}-${item.model}`} type="button" className="technical-catalog-card" onClick={() => selectModel(item)}><strong>{item.model}{item.variant ? ` · ${item.variant}` : ""}</strong><span>Réf. produit : {item.manufacturerReference || "non renseignée"}</span><span className="technical-catalog-link">Voir le modèle →</span></button>)}
            </div>}
          </>}
          {model && ["model", "documents", "assistant"].includes(step) && <>
            <div className="technical-catalog-model-heading"><div><span className="technical-catalog-kicker">{model.brand}</span><h3>{model.model}{model.variant ? ` · ${model.variant}` : ""}</h3><p>Réf. produit : {model.manufacturerReference || "non renseignée"}</p></div><button type="button" className="technical-catalog-back" onClick={toModels}>← Tous les modèles</button></div>
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
              <button type="button" className="technical-catalog-back" onClick={() => setStep("model")}>← Retour au modèle</button>
              <div className="technical-catalog-assistant-heading"><img src={shibaTechnicien} alt="" /><div><h4>Shiba Bot</h4><p>Posez une question précise. Vérifiez les références dans les documents constructeur.</p></div></div>
              <form onSubmit={askShiba}><label htmlFor="technical-catalog-question">Votre question</label><textarea id="technical-catalog-question" value={question} onChange={(event) => { setQuestion(event.target.value); setAnswer(""); setError(""); }} placeholder="Ex. Quel est le code défaut F28 sur ce modèle ?" rows={4} autoFocus /><button type="submit" disabled={!question.trim() || busy}>{busy ? "Recherche…" : "Demander à l’IA"}</button></form>
              {error && <p role="alert" className="technical-catalog-error">{error}</p>}
              {answer && <div className="technical-catalog-answer" aria-live="polite"><strong>Réponse de Shiba Bot</strong><p>{answer}</p></div>}
            </section>}
          </>}
        </div>
        <footer className="technical-catalog-footer">Cette recherche ne crée aucun équipement. Le CarnetPass est créé uniquement depuis le parcours d’un appareil réel.</footer>
      </section>
      <DocumentPreviewModal open={Boolean(previewDocument)} onOpenChange={(isOpen) => { if (!isOpen) setPreviewDocument(null); }} eyebrow="DOCUMENT CONSTRUCTEUR" title={previewDocument?.title || "Document technique"} subtitle={`${previewDocument?.sourceName || model?.brand || "Constructeur"} · ${model?.model || ""}`} documentUrl={previewDocument?.documentUrl || ""} fileName={`${previewDocument?.documentCode || previewDocument?.documentId || "document"}.pdf`} />
    </div>
  );
}

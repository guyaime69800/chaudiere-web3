import { useMemo, useState } from "react";
import shibaTechnicien from "../assets/carnetpass-shiba-technicien.png";
import { getEquipmentDocumentLibrary } from "../services/equipmentKnowledge";
import DocumentPreviewModal from "./DocumentPreviewModal";
import "./TechnicalCatalogModal.css";

export default function TechnicalCatalogModal({ open, onClose, catalog = [], session }) {
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [selectedModel, setSelectedModel] = useState(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [documentModel, setDocumentModel] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentsBusy, setDocumentsBusy] = useState(false);
  const [documentsError, setDocumentsError] = useState("");
  const [previewDocument, setPreviewDocument] = useState(null);

  async function showDocuments(item) {
    setDocumentModel(item);
    setDocuments([]);
    setDocumentsError("");
    setDocumentsBusy(true);
    try {
      const library = await getEquipmentDocumentLibrary(item.equipmentId);
      setDocuments(library.documents);
    } catch (loadError) {
      console.error("Chargement des documents impossible :", loadError);
      setDocumentsError("La documentation est momentanément indisponible.");
    } finally {
      setDocumentsBusy(false);
    }
  }

  async function askShiba(event) {
    event.preventDefault();
    if (!question.trim() || !selectedModel || busy) return;
    setBusy(true); setError(""); setAnswer("");
    try {
      const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify({ equipmentId: selectedModel.equipmentId, question: question.trim() }) });
      const result = await response.json();
      if (!response.ok || !result?.ok) throw new Error(result?.message || result?.error || "Réponse indisponible.");
      setAnswer(result.answer || "Aucune réponse reçue.");
    } catch (requestError) { setError(requestError.message || "Réponse indisponible."); }
    finally { setBusy(false); }
  }

  const results = useMemo(() => {
    const text = query.trim().toLowerCase();
    return catalog.filter((item) => {
      const matchesType = type === "all" || item.type === type;
      const haystack = [item.brand, item.model, item.variant, item.manufacturerReference]
        .filter(Boolean).join(" ").toLowerCase();
      return matchesType && (!text || haystack.includes(text));
    });
  }, [catalog, query, type]);

  if (!open) return null;

  return (
    <div className="technical-catalog-overlay" role="presentation" onMouseDown={onClose}>
      <section className="technical-catalog-modal" role="dialog" aria-modal="true" aria-labelledby="technical-catalog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="technical-catalog-header">
          <div><span className="technical-catalog-kicker">OUTIL TECHNIQUE</span><h2 id="technical-catalog-title">Catalogue technique</h2><p>Recherchez un modèle sans créer de CarnetPass.</p></div>
          <button type="button" className="technical-catalog-close" onClick={onClose} aria-label="Fermer">×</button>
        </header>
        <div className="technical-catalog-filters">
          <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Type d’équipement">
            <option value="all">Tous les équipements</option><option value="boiler">Chaudières</option><option value="heat_pump">Pompes à chaleur</option><option value="air_conditioning">Climatisations</option><option value="vmc">VMC</option>
          </select>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Marque, modèle ou référence…" aria-label="Rechercher un modèle" autoFocus />
        </div>
        <div className="technical-catalog-body">
          <div className="technical-catalog-results">
            {results.length === 0 ? <p className="technical-catalog-empty">Aucun modèle trouvé dans le catalogue actuel.</p> : results.map((item) => (
              <article className="technical-catalog-item" key={item.equipmentId || item.manufacturerReference}>
                <div><strong>{item.brand}</strong><h3>{item.model}{item.variant ? ` · ${item.variant}` : ""}</h3><small>Réf. produit : {item.manufacturerReference || "non renseignée"}</small></div>
                <div className="technical-catalog-actions"><button type="button" onClick={() => { setSelectedModel(item); setQuestion(`Trouve les références et les pages de la vue éclatée pour le modèle ${item.brand} ${item.model}.`); setAnswer(""); setError(""); }}>🤖 Interroger Shiba Bot</button><button type="button" className="technical-catalog-secondary" onClick={() => showDocuments(item)}>Voir la documentation</button></div>
              </article>
            ))}
          </div>
          <aside className="technical-catalog-shiba"><img src={shibaTechnicien} alt="Shiba Bot technicien" /><strong>Shiba Bot</strong><p>{selectedModel ? `${selectedModel.brand} ${selectedModel.model}` : "Sélectionnez un modèle pour commencer."}</p><form onSubmit={askShiba}><textarea value={question} onChange={(event) => { setQuestion(event.target.value); setAnswer(""); setError(""); }} placeholder="Ex. Quelle est la référence du capteur ?" rows={4} /><button type="submit" disabled={!question.trim() || !selectedModel || busy}>{busy ? "Recherche…" : "Demander à l’IA"}</button></form>{error && <p role="alert" className="technical-catalog-error">{error}</p>}{answer && <div className="technical-catalog-answer">{answer}</div>}</aside>
        </div>
        {documentModel && (
          <section className="technical-catalog-documents" aria-label={`Documentation ${documentModel.brand} ${documentModel.model}`}>
            <div className="technical-catalog-documents-heading">
              <div><strong>Documents constructeur</strong><p>{documentModel.brand} {documentModel.model} · Réf. {documentModel.manufacturerReference}</p></div>
              <button type="button" onClick={() => { setDocumentModel(null); setPreviewDocument(null); }}>Fermer les documents</button>
            </div>
            {documentsBusy && <p role="status">Chargement des documents…</p>}
            {documentsError && <p role="alert">{documentsError}</p>}
            {!documentsBusy && !documentsError && documents.length === 0 && <p>Aucun document disponible pour ce modèle.</p>}
            {documents.length > 0 && <div className="technical-catalog-document-list">{documents.map((item) => (
              <article key={item.documentId}>
                <div><strong>{item.title}</strong><small>{item.sourceName || documentModel.brand} · {item.documentCode || item.manufacturerReference || documentModel.manufacturerReference}{item.pageCount ? ` · ${item.pageCount} pages` : ""}</small></div>
                <button type="button" onClick={() => setPreviewDocument(item)}>Consulter</button>
              </article>
            ))}</div>}
          </section>
        )}
        <footer className="technical-catalog-footer">Cette recherche ne crée aucun équipement. Le CarnetPass est créé uniquement depuis le parcours d’un appareil réel.</footer>
      </section>
      <DocumentPreviewModal
        open={Boolean(previewDocument)}
        onOpenChange={(isOpen) => { if (!isOpen) setPreviewDocument(null); }}
        eyebrow="DOCUMENT CONSTRUCTEUR"
        title={previewDocument?.title || "Document technique"}
        subtitle={`${previewDocument?.sourceName || documentModel?.brand || "Constructeur"} · ${documentModel?.model || ""}`}
        documentUrl={previewDocument?.documentUrl || ""}
        fileName={`${previewDocument?.documentCode || previewDocument?.documentId || "document"}.pdf`}
      />
    </div>
  );
}

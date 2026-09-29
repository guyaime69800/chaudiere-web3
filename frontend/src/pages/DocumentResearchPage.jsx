import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "./DocumentResearchPage.css";

export default function DocumentResearchPage() {
  const { session, user } = useAuth();
  const [brand, setBrand] = useState("De Dietrich");
  const [model, setModel] = useState("MCR 2 24");
  const [reference, setReference] = useState("7841749");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function search(event) {
    event.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch("/api/document-research", {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.access_token || ""}`, "Content-Type": "application/json" },
          body: JSON.stringify({ brand, model, reference }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Recherche indisponible.");
        setResult(data);
      } finally { clearTimeout(timeout); }
    } catch (failure) {
      setError(failure.name === "AbortError" ? "La recherche a dépassé 10 secondes." : failure.message);
    } finally { setLoading(false); }
  }

  if (user?.email?.toLowerCase() !== "contact@carnetpass.fr") return <main className="document-research"><p>Accès réservé à l’administration CarnetPass.</p></main>;

  return <main className="document-research">
    <Link to="/espace-pro">← Retour à mon espace</Link>
    <h1>Recherche documentaire interne</h1>
    <p>Prototype Preview : un seul modèle pilote. Les résultats sont des pistes à vérifier, jamais des documents approuvés. Aucun PDF n’est téléchargé, stocké ou indexé par cette page.</p>
    <form onSubmit={search}>
      <label>Marque<input required maxLength={100} value={brand} onChange={(event) => setBrand(event.target.value)} /></label>
      <label>Modèle exact<input required maxLength={100} value={model} onChange={(event) => setModel(event.target.value)} /></label>
      <label>Référence constructeur exacte<input required maxLength={100} value={reference} onChange={(event) => setReference(event.target.value)} /></label>
      <button disabled={loading}>{loading ? "Recherche…" : "Rechercher"}</button>
    </form>
    {error && <p role="alert" className="document-research__warning">{error}</p>}
    {result && !result.supported && <p role="status">Ce premier prototype ne couvre que {result.pilot.brand} {result.pilot.model}, réf. {result.pilot.reference}. Aucun résultat n’est validé pour votre saisie.</p>}
    {result?.supported && <>
      <h2>Sources publiques du fabricant à examiner</h2>
      <p>Correspondance à confirmer sur chaque PDF. Un modèle cité sans sa référence exacte ne suffit pas pour l’approuver.</p>
      <div className="document-research__results">{result.results.map((item) => <article key={item.pdfUrl}>
        <h3>{item.title}</h3>
        <dl>
          <dt>Éditeur</dt><dd>{item.publisher}</dd>
          <dt>Type</dt><dd>{item.documentType}</dd>
          <dt>Modèle repéré</dt><dd>{item.modelFound}</dd>
          <dt>Référence repérée</dt><dd>{item.referenceFound || "Non repérée"}</dd>
          <dt>Langue / date</dt><dd>{item.language} / {item.date || "Inconnue"}</dd>
          <dt>Confiance</dt><dd>{item.matchConfidence === "high" ? "Élevée" : "À vérifier"} — {item.matchReason}</dd>
          <dt>Déjà présent</dt><dd>{item.duplicateOf || "Aucun doublon identifié par code documentaire"}</dd>
          <dt>Droits</dt><dd>Non vérifiés : aucune copie ou indexation autorisée par ce résultat.</dd>
        </dl>
        <p className="document-research__warning">{item.variantWarning}</p>
        <p><a href={item.sourcePageUrl} target="_blank" rel="noreferrer">Page source du fabricant</a> · <a href={item.pdfUrl} target="_blank" rel="noreferrer">Ouvrir le PDF chez le fabricant</a></p>
      </article>)}</div>
      <h2>Documents déjà dans CarnetPass</h2>
      <ul>{result.existing.map((item) => <li key={item.documentId}>{item.title} — {item.documentType} {item.documentCode ? `(${item.documentCode})` : ""}</li>)}</ul>
      <h2>Recherche manuelle complémentaire</h2>
      <ul>{result.manualSources.map((item) => <li key={item.publisher}><strong>{item.publisher} :</strong> {item.instruction}</li>)}</ul>
      <p>Après vérification humaine du PDF, de la variante et des droits d’utilisation, utiliser le processus d’import documentaire existant puis contrôler les citations de Shiba.</p>
    </>}
  </main>;
}

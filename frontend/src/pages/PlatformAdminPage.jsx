import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { uploadPresigned } from "@vercel/blob/client";
import { useAuth } from "../hooks/useAuth";
import "./PlatformAdminPage.css";

const catalogCategories = [
  ["boiler", "Chaudières"], ["heat_pump_indoor", "PAC · unités intérieures"],
  ["heat_pump_outdoor", "PAC · unités extérieures"],
  ["air_conditioning_indoor", "Clim · unités intérieures"],
  ["air_conditioning_outdoor", "Clim · unités extérieures"], ["burner", "Brûleurs"],
  ["water_heater", "Chauffe-bains"], ["regulation", "Régulations"],
  ["heat_pump_water_heater", "Chauffe-eau thermodynamiques"], ["vmc", "VMC"],
];

async function request(token, body, search = "", companyId = "") {
  const params = new URLSearchParams({ search });
  if (companyId) params.set("companyId", companyId);
  const response = await fetch(`/api/platform-admin${body ? "" : `?${params}`}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message || "Service indisponible.");
  return result;
}

export default function PlatformAdminPage() {
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [contractEnd, setContractEnd] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [seatLimit, setSeatLimit] = useState(1);
  const [technicianEmail, setTechnicianEmail] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [documentFile, setDocumentFile] = useState(null);
  const documentFileInput = useRef(null);
  const [manufacturer, setManufacturer] = useState("");
  const [modelReference, setModelReference] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [newHotlinePhone, setNewHotlinePhone] = useState("");
  const [documents, setDocuments] = useState([]);
  const [publicationReady, setPublicationReady] = useState(false);
  const [hotlineReady, setHotlineReady] = useState(false);
  const [hotlineInputs, setHotlineInputs] = useState({});
  const [aliasInputs, setAliasInputs] = useState({});
  const [documentNotice, setDocumentNotice] = useState(null);
  const [entryNotices, setEntryNotices] = useState({});
  function setEntryNotice(id, action, text, kind = "success") {
    setEntryNotices((previous) => ({ ...previous, [`${id}:${action}`]: { text, kind } }));
  }
  const [reviewCategories, setReviewCategories] = useState({});
  const [distributionConfirmed, setDistributionConfirmed] = useState({});
  const environmentName = data?.environment;
  const loadDocuments = useCallback(async () => {
    const response = await fetch("/api/platform-admin-documents", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "Documents indisponibles.");
    setDocuments(result.documents || []);
    setPublicationReady(result.publicationReady === true);
    setHotlineReady(result.hotlineReady === true);
    return result.documents || [];
  }, [session.access_token]);
  const load = useCallback(async () => {
    const result = await request(session.access_token, null, search, selected);
    setData(result);
    setError("");
  }, [session.access_token, search, selected]);

  useEffect(() => {
    let active = true;
    request(session.access_token, null, search, selected)
      .then((result) => { if (active) { setData(result); setError(""); } })
      .catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [session.access_token, search, selected]);

  useEffect(() => {
    if (!["preview", "production"].includes(environmentName)) return;
    let active = true;
    fetch("/api/platform-admin-documents", { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (active && result) { setDocuments(result.documents || []); setPublicationReady(result.publicationReady === true); setHotlineReady(result.hotlineReady === true); } })
      .catch(() => {});
    return () => { active = false; };
  }, [session.access_token, environmentName]);

  async function importDocument(event) {
    event.preventDefault();
    if (!documentFile) {
      setDocumentNotice({ text: "Choisissez un fichier PDF avant de le déposer.", kind: "error" }); return;
    }
    if (documentFile.type !== "application/pdf" && !documentFile.name.toLowerCase().endsWith(".pdf")) {
      setDocumentNotice({ text: "Le fichier sélectionné doit être un PDF.", kind: "error" }); return;
    }
    if (!documentFile.size || documentFile.size > 30 * 1024 * 1024) {
      setDocumentNotice({ text: `Ce PDF pèse ${(documentFile.size / 1024 / 1024).toFixed(1)} Mo. La limite est de 30 Mo ; utilisez une version compressée avant de réessayer.`, kind: "error" }); return;
    }
    if (newHotlinePhone.trim() && (!/^[+0-9(). -]{6,32}$/.test(newHotlinePhone.trim())
      || (newHotlinePhone.match(/\d/g) || []).length < 6)) {
      setDocumentNotice({ text: "Indiquez un numéro de hotline valide.", kind: "error" }); return;
    }
    setBusy(true); setError(""); setMessage("");
    setDocumentNotice({ text: "Envoi du PDF en cours…", kind: "progress" });
    try {
      const pathname = `platform-documents/${crypto.randomUUID()}.pdf`;
      await uploadPresigned(pathname, documentFile, {
        access: "private", handleUploadUrl: "/api/platform-admin-documents",
        clientPayload: JSON.stringify({ accessToken: session.access_token, manufacturer, modelReference,
          title: documentTitle, hotlinePhone: newHotlinePhone.trim(), filename: documentFile.name }),
      });
      setDocumentNotice({ text: "PDF envoyé. Vérification de son enregistrement…", kind: "progress" });
      setDocumentFile(null);
      if (documentFileInput.current) documentFileInput.current.value = "";
      setNewHotlinePhone("");
      let recorded = false;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const entries = await loadDocuments();
        if (entries.some((entry) => entry.blob_pathname === pathname)) { recorded = true; break; }
      }
      setDocumentNotice(recorded
        ? { text: "PDF enregistré dans Documents à valider. Validez-le pour lancer son indexation Shiba.", kind: "success" }
        : { text: "PDF envoyé, mais son enregistrement n’est pas encore confirmé. Cliquez sur Actualiser la liste dans quelques instants.", kind: "progress" });
    } catch (cause) { setDocumentNotice({ text: cause.message || "Import impossible.", kind: "error" }); }
    finally { setBusy(false); }
  }

  async function downloadDocument(entry) {
    setError("");
    try {
      const response = await fetch(`/api/platform-admin-documents?id=${encodeURIComponent(entry.id)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error("Téléchargement impossible.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = entry.original_filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (cause) { setError(cause.message); }
  }

  async function reviewDocument(entry, action) {
    const category = reviewCategories[entry.id] || entry.catalog_category;
    if (["approve", "publish-imported"].includes(action) && (!category || !distributionConfirmed[entry.id])) {
      setError("Choisissez une catégorie et confirmez le droit de diffuser ce PDF.");
      return;
    }
    if (!window.confirm(["approve", "publish-imported"].includes(action)
      ? `Publier ${entry.title} pour tous les comptes CarnetPass ?`
      : `Rejeter ${entry.title} ?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/platform-admin-documents", {
        method: "PATCH", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, action, category, distributionConfirmed: distributionConfirmed[entry.id] === true }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Validation impossible.");
      setMessage(["approve", "publish-imported"].includes(action)
        ? result.indexStatus === "ready" ? "Document publié et prêt pour Shiba."
          : `Document publié ; indexation Shiba : ${result.indexStatus === "needs_ocr" ? "OCR nécessaire" : result.indexStatus === "failed" ? "échec, réessayez dans l'archive" : result.indexStatus === "pending" ? "migration Preview à appliquer" : "en cours"}.`
        : "Document rejeté.");
      await loadDocuments();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function saveHotline(entry) {
    const phone = hotlineInputs[entry.id] ?? entry.hotline_phone ?? "";
    setBusy(true); setError(""); setMessage("");
    setEntryNotice(entry.id, "hotline", "Enregistrement de la hotline…", "progress");
    try {
      const response = await fetch("/api/platform-admin-documents", {
        method: "PATCH", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, action: "set-hotline", phone }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Hotline indisponible.");
      const entries = await loadDocuments();
      if ((entries.find((item) => item.id === entry.id)?.hotline_phone || "") !== phone.trim()) {
        throw new Error("La hotline n’a pas pu être confirmée dans le catalogue.");
      }
      setEntryNotice(entry.id, "hotline", phone.trim()
        ? `Hotline enregistrée dans le catalogue : ${phone.trim()}.`
        : "Hotline supprimée du catalogue.");
      setHotlineInputs((previous) => { const next = { ...previous }; delete next[entry.id]; return next; });
    } catch (cause) { setEntryNotice(entry.id, "hotline", cause.message, "error"); }
    finally { setBusy(false); }
  }

  async function indexDocument(entry) {
    setBusy(true);
    setEntryNotice(entry.id, "index", "Indexation en cours : lecture du PDF et préparation des pages…", "progress");
    try {
      const response = await fetch("/api/platform-admin-documents", {
        method: "PATCH", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, action: "index" }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Indexation impossible.");
      setEntryNotice(entry.id, "index", result.indexStatus === "ready"
        ? "Document prêt pour Shiba."
        : result.indexStatus === "indexing" ? "L'indexation est encore en cours. Réessayez dans quelques minutes."
        : result.indexStatus === "needs_ocr" ? "Ce PDF est scanné : un OCR est nécessaire avant son indexation."
          : result.indexError || "Indexation non terminée.", result.indexStatus === "ready" ? "success" : result.indexStatus === "indexing" ? "progress" : "error");
      await loadDocuments();
    } catch (cause) { setEntryNotice(entry.id, "index", cause.message, "error"); }
    finally { setBusy(false); }
  }

  async function saveAliases(entry) {
    const aliases = aliasInputs[entry.id] ?? (entry.model_aliases || []).join(", ");
    setBusy(true); setError(""); setMessage("");
    setEntryNotice(entry.id, "aliases", "Enregistrement des références…", "progress");
    try {
      const response = await fetch("/api/platform-admin-documents", {
        method: "PATCH", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, action: "set-aliases", aliases }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Références indisponibles.");
      await loadDocuments();
      setEntryNotice(entry.id, "aliases", "Références enregistrées dans le catalogue.");
      setAliasInputs((previous) => { const next = { ...previous }; delete next[entry.id]; return next; });
    } catch (cause) { setEntryNotice(entry.id, "aliases", cause.message, "error"); }
    finally { setBusy(false); }
  }

  async function act(body) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await request(session.access_token, body);
      setMessage(result.message);
      await load();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  const company = data?.selectedCompanyId === selected
    ? data.companies?.find((entry) => entry.id === selected)
    : null;
  const pendingCount = documents.filter((entry) => entry.status === "pending_review").length;
  const pendingDocuments = documents.filter((entry) => entry.status === "pending_review");
  const archivedDocuments = documents.filter((entry) => entry.status !== "pending_review");
  const archivedModels = Object.values(archivedDocuments.reduce((groups, entry) => {
    const key = `${entry.manufacturer || ""}\u0000${entry.model_reference || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!groups[key]) groups[key] = { manufacturer: entry.manufacturer, reference: entry.model_reference, entries: [] };
    groups[key].entries.push(entry);
    return groups;
  }, {}));
  function renderDocument(entry) {
    const awaitingPublication = data.environment === "production" && entry.status === "approved"
      && entry.distribution_confirmed_at == null;
    const category = reviewCategories[entry.id] || entry.catalog_category || "";
    const content = <>
      <p className="platform-admin-document-name"><strong>{entry.manufacturer} · {entry.model_reference}</strong> · {entry.title} <span>({awaitingPublication ? "En attente de diffusion" : entry.status === "approved" ? "Publié" : entry.status === "rejected" ? "Rejeté" : "À valider"})</span></p>
      <p className="platform-admin-document-filename">{entry.original_filename}</p>
      <button type="button" onClick={() => downloadDocument(entry)}>Télécharger le PDF</button>
      {entry.status === "approved" && <div className="platform-admin-document-index">
        <p>Shiba : {entry.rag_status === "ready" ? "prêt" : entry.rag_status === "needs_ocr" ? "OCR nécessaire" : entry.rag_status === "failed" ? "échec de l'indexation" : entry.rag_status === "indexing" ? "indexation en cours" : "à indexer"}{entry.rag_error ? ` — ${entry.rag_error}` : ""}</p>
        {entry.rag_status !== "ready" && entry.rag_status !== "needs_ocr" && <button type="button" disabled={busy} onClick={() => indexDocument(entry)}>{entry.rag_status === "indexing" ? "Vérifier ou relancer l'indexation" : "Indexer pour Shiba"}</button>}
        {entryNotices[`${entry.id}:index`] && <p role={entryNotices[`${entry.id}:index`].kind === "error" ? "alert" : "status"} className={`platform-admin-inline-${entryNotices[`${entry.id}:index`].kind}`}>{entryNotices[`${entry.id}:index`].text}</p>}
      </div>}
      {hotlineReady && entry.status === "approved" && <div>
        <label>Hotline <input type="tel" value={hotlineInputs[entry.id] ?? entry.hotline_phone ?? ""} onChange={(event) => setHotlineInputs((previous) => ({ ...previous, [entry.id]: event.target.value }))} placeholder="Numéro de téléphone" maxLength={32} /></label>
        <button type="button" disabled={busy} onClick={() => saveHotline(entry)}>Enregistrer la hotline</button>
        {entryNotices[`${entry.id}:hotline`] && <p role={entryNotices[`${entry.id}:hotline`].kind === "error" ? "alert" : "status"} className={`platform-admin-inline-${entryNotices[`${entry.id}:hotline`].kind}`}>{entryNotices[`${entry.id}:hotline`].text}</p>}
        <label>Autres références couvertes par le PDF <input value={aliasInputs[entry.id] ?? (entry.model_aliases || []).join(", ")} onChange={(event) => setAliasInputs((previous) => ({ ...previous, [entry.id]: event.target.value }))} placeholder="Autre référence du modèle" maxLength={1620} /></label>
        <button type="button" disabled={busy} onClick={() => saveAliases(entry)}>Enregistrer les références</button>
        {entryNotices[`${entry.id}:aliases`] && <p role={entryNotices[`${entry.id}:aliases`].kind === "error" ? "alert" : "status"} className={`platform-admin-inline-${entryNotices[`${entry.id}:aliases`].kind}`}>{entryNotices[`${entry.id}:aliases`].text}</p>}
      </div>}
      {publicationReady && entry.status === "pending_review" && <div>
        <label>Catégorie du catalogue <select value={reviewCategories[entry.id] || ""} onChange={(event) => setReviewCategories((previous) => ({ ...previous, [entry.id]: event.target.value }))}>
          <option value="">Choisir une catégorie</option>
          {catalogCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label><input type="checkbox" checked={distributionConfirmed[entry.id] === true} onChange={(event) => setDistributionConfirmed((previous) => ({ ...previous, [entry.id]: event.target.checked }))} /> J’ai vérifié la référence et le droit de diffuser ce PDF à tous les comptes CarnetPass.</label>
        <button type="button" disabled={busy || !reviewCategories[entry.id] || !distributionConfirmed[entry.id]} onClick={() => reviewDocument(entry, "approve")}>Valider et publier</button>
        <button type="button" disabled={busy} onClick={() => reviewDocument(entry, "reject")}>Rejeter</button>
      </div>}
      {publicationReady && awaitingPublication && <div>
        <p>Fiche transférée : le PDF reste invisible tant que sa diffusion n'est pas confirmée.</p>
        <label>Catégorie du catalogue <select value={category} onChange={(event) => setReviewCategories((previous) => ({ ...previous, [entry.id]: event.target.value }))}>
          <option value="">Choisir une catégorie</option>
          {catalogCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label><input type="checkbox" checked={distributionConfirmed[entry.id] === true} onChange={(event) => setDistributionConfirmed((previous) => ({ ...previous, [entry.id]: event.target.checked }))} /> J'ai vérifié la référence et le droit de diffuser ce PDF aux professionnels CarnetPass.</label>
        <button type="button" disabled={busy || !category || !distributionConfirmed[entry.id] || entry.rag_status !== "ready"} onClick={() => reviewDocument(entry, "publish-imported")}>Confirmer la diffusion</button>
      </div>}
    </>;
    return <li key={entry.id} className="platform-admin-document-item">
      {entry.status === "pending_review" ? content : <details><summary>{entry.manufacturer} · {entry.model_reference} · {entry.title} ({awaitingPublication ? "En attente de diffusion" : entry.status === "approved" ? "Publié" : "Rejeté"})</summary>{content}</details>}
    </li>;
  }
  return <main className="platform-admin">
    <Link to="/espace-pro">← Retour à CarnetPass</Link>
    <h1>Administration CarnetPass</h1>
    {data?.environment === "preview" && <p className="platform-admin-environment-preview">Environnement de test (Preview) : les modifications effectuées ici ne changent pas les données de production.</p>}
    {data?.environment === "production" && <p className="platform-admin-environment-production">Production — données réelles : chaque modification concerne les clients. Vérifiez le contrat, le règlement et l'entreprise avant de confirmer une action.</p>}
    {error && <p role="alert" className="platform-admin-error">{error}</p>}
    {message && <p role="status" className="platform-admin-success">{message}</p>}
    {data && <>
      <section><h2>Entreprises</h2>
        <form onSubmit={(event) => { event.preventDefault(); load().catch((cause) => setError(cause.message)); }}>
          <label>Rechercher par nom <input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={80} /></label>
          <button type="submit">Rechercher</button>
        </form>
        <ul>{data.companies.map((entry) => <li key={entry.id}>
          <button type="button" onClick={() => { setSelected(entry.id); setSeatLimit(entry.subscriptions?.enterprise_seat_limit || 1); }} aria-pressed={selected === entry.id}>
            {entry.name} · {entry.siret || "SIRET absent"} · créée le {new Date(entry.created_at).toLocaleDateString("fr-FR")} · réf. {entry.id.slice(0, 8)} · {entry.subscriptions?.plan || "sans formule"} / {entry.subscriptions?.status || "—"}
          </button>
        </li>)}</ul>
      </section>
      {selected && data.selectedCompanyId !== selected && <p role="status">Chargement de la fiche entreprise…</p>}
      {company && <section><h2>{company.name}</h2>
        <p>Référence entreprise : {company.id}</p>
        {data.memberLoadError && <p role="alert" className="platform-admin-error">La liste de l’équipe est momentanément indisponible. L’activation est bloquée par sécurité. <button type="button" onClick={() => load().catch((cause) => setError(cause.message))}>Réessayer</button></p>}
        {(!/^\d{14}$/.test(company.siret || "") || company.company_verifications?.status !== "approved") && <p role="status">Avant d’activer l’offre Entreprise, le responsable doit enregistrer son SIRET et faire valider l’entreprise dans son espace professionnel. Vérifiez ensuite le contrat et le règlement.</p>}
        <p>Vérification : {company.company_verifications?.status || "inconnue"}. Formule : {company.subscriptions?.plan || "—"}.
          Échéance : {company.subscriptions?.current_period_end ? new Date(company.subscriptions.current_period_end).toLocaleDateString("fr-FR") : "aucune"}.
          Comptes : {data.memberCount}/{company.subscriptions?.enterprise_seat_limit || "non défini"} (responsable compris).</p>
        <form onSubmit={(event) => { event.preventDefault();
          if (window.confirm(`Activer Entreprise pour ${company.name} jusqu'au ${contractEnd} ?`)) {
            act({ action: "activate", companyId: selected, contractEnd: new Date(`${contractEnd}T23:59:59`).toISOString(), paymentReference, seatLimit, note });
          }
        }}>
          <label>Fin du contrat <input type="date" required value={contractEnd} onChange={(event) => setContractEnd(event.target.value)} /></label>
          <label>Référence du règlement vérifié <input required minLength={3} maxLength={120} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></label>
          <label>Comptes prévus au contrat, responsable compris <input type="number" min={Math.max(1, data.memberCount)} max="10000" required value={seatLimit} onChange={(event) => setSeatLimit(event.target.value)} /></label>
          <label>Note interne <textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></label>
          <button disabled={busy || data.memberLoadError || !/^\d{14}$/.test(company.siret || "") || company.company_verifications?.status !== "approved"} type="submit">Activer Entreprise</button>
          <button disabled={busy || company.subscriptions?.plan !== "enterprise" || company.subscriptions?.status !== "active"}
            type="button" onClick={() => { if (window.confirm(`Suspendre l'accès de ${company.name} ?`)) act({ action: "suspend", companyId: selected, note }); }}>Suspendre</button>
          <button disabled={busy || company.subscriptions?.plan !== "enterprise" || company.subscriptions?.status !== "active"}
            type="button" onClick={() => { if (window.confirm(`Fixer ${seatLimit} comptes pour ${company.name} ?`)) act({ action: "set-seats", companyId: selected, seatLimit, note }); }}>Modifier le nombre de comptes</button>
        </form>
        {company.subscriptions?.plan === "enterprise" && company.subscriptions?.status === "active" && <div>
          <h3>Techniciens de l'entreprise</h3>
          <p>Le technicien doit avoir créé et confirmé son compte CarnetPass. Il ne peut appartenir à une autre entreprise.</p>
          <form onSubmit={(event) => { event.preventDefault(); if (window.confirm(`Ajouter ${technicianEmail} à ${company.name} ?`)) act({ action: "add-technician", companyId: selected, email: technicianEmail, note }); }}>
            <label>E-mail du technicien <input type="email" required value={technicianEmail} onChange={(event) => setTechnicianEmail(event.target.value)} /></label>
            <button disabled={busy || data.memberLoadError || data.memberCount >= company.subscriptions?.enterprise_seat_limit}>Ajouter ce technicien</button>
          </form>
          <ul>{data.members.map((member) => <li key={member.user_id}>
            {member.email || member.user_id} · {member.role}
            {member.role === "technician" && member.email && <button type="button" disabled={busy}
              onClick={() => { if (window.confirm(`Retirer ${member.email} de ${company.name} ?`)) act({ action: "remove-technician", companyId: selected, email: member.email, note }); }}>Retirer</button>}
          </li>)}</ul>
          {data.memberCount > data.members.length && <p>Seuls les 100 premiers membres sont affichés.</p>}
        </div>}
      </section>}
      <section><h2>Historique récent</h2><ul>{data.events.map((event, index) => <li key={`${event.created_at}-${index}`}>
        {new Date(event.created_at).toLocaleString("fr-FR")} · {event.action} · {data.companies.find((entry) => entry.id === event.company_id)?.name || event.company_id} · {event.payment_reference || "sans référence"}
      </li>)}</ul></section>
      {(["preview", "production"].includes(data.environment)) && <section><h2>Importer un document technique</h2>
        <p>Le PDF reste privé et en attente de validation. Sa publication lance l'indexation pour Shiba ; un document scanné peut nécessiter un OCR.</p>
        {!publicationReady && <p>La publication attend l’activation du catalogue dans cette base.</p>}
        <form onSubmit={importDocument}>
          <label>Fabricant <input required minLength={2} maxLength={120} value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} /></label>
          <label>Référence exacte du modèle <input required minLength={2} maxLength={160} value={modelReference} onChange={(event) => setModelReference(event.target.value)} /></label>
          <label>Titre du document <input required minLength={2} maxLength={200} value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} /></label>
          <label>Hotline <input type="tel" value={newHotlinePhone} onChange={(event) => setNewHotlinePhone(event.target.value)} placeholder="Numéro de téléphone (facultatif)" maxLength={32} /></label>
          <label>Fichier PDF, 30 Mo maximum <input ref={documentFileInput} type="file" accept="application/pdf,.pdf" required onChange={(event) => { setDocumentFile(event.target.files?.[0] || null); setDocumentNotice(null); }} /></label>
          <button disabled={busy} type="submit">Déposer le document</button>
          <button disabled={busy} type="button" onClick={() => loadDocuments().catch((cause) => setError(cause.message))}>Actualiser la liste</button>
        </form>
        {documentNotice && <p role={documentNotice.kind === "error" ? "alert" : "status"} className={`platform-admin-inline-${documentNotice.kind}`}>{documentNotice.text}</p>}
        <div className="platform-admin-document-queue"><h3>Documents à valider ({pendingCount})</h3>
          {pendingCount ? <ul>{pendingDocuments.map(renderDocument)}</ul> : <p>Aucun document en attente. Les PDF publiés restent disponibles dans le catalogue technique.</p>}
        </div>
        {!!archivedDocuments.length && <details className="platform-admin-document-archive"><summary>Archives des modèles ({archivedModels.length}) · {archivedDocuments.length} document(s)</summary>
          <ul>{archivedModels.map((group) => <li key={`${group.manufacturer}:${group.reference}`} className="platform-admin-document-item">
            <details><summary>{group.manufacturer} · {group.reference} ({group.entries.length} document{group.entries.length > 1 ? "s" : ""})</summary>
              <ul>{group.entries.map(renderDocument)}</ul>
            </details>
          </li>)}</ul>
        </details>}
      </section>}
      {data.role === "founder" && <section><h2>Collaborateurs internes</h2>
        <p>Le collaborateur doit déjà avoir créé et confirmé son compte CarnetPass. Seul le fondateur peut accorder ou retirer ce rôle.</p>
        <form onSubmit={(event) => { event.preventDefault(); act({ action: "add-collaborator", email }); }}>
          <label>E-mail du collaborateur <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <button disabled={busy}>Autoriser</button>
          <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Retirer l'accès interne de ${email} ?`)) act({ action: "remove-collaborator", email }); }}>Retirer</button>
        </form>
        <p>{data.collaborators.length} compte(s) interne(s) autorisé(s).</p>
      </section>}
    </>}
  </main>;
}

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { uploadPresigned } from "@vercel/blob/client";
import { useAuth } from "../hooks/useAuth";
import "./PlatformAdminPage.css";

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
  const [manufacturer, setManufacturer] = useState("");
  const [modelReference, setModelReference] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [documents, setDocuments] = useState([]);
  const loadDocuments = useCallback(async () => {
    const response = await fetch("/api/platform-admin-documents", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "Documents indisponibles.");
    setDocuments(result.documents || []);
  }, [session.access_token]);
  const load = useCallback(async () => {
    const result = await request(session.access_token, null, search, selected);
    setData(result);
  }, [session.access_token, search, selected]);

  useEffect(() => {
    let active = true;
    request(session.access_token, null, search, selected)
      .then((result) => { if (active) setData(result); })
      .catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [session.access_token, search, selected]);

  useEffect(() => {
    let active = true;
    fetch("/api/platform-admin-documents", { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (active && result) setDocuments(result.documents || []); })
      .catch(() => {});
    return () => { active = false; };
  }, [session.access_token]);

  async function importDocument(event) {
    event.preventDefault();
    if (!documentFile || documentFile.type !== "application/pdf" || documentFile.size > 10 * 1024 * 1024) {
      setError("Sélectionnez un PDF de 10 Mo maximum."); return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      await uploadPresigned(`platform-documents/${crypto.randomUUID()}.pdf`, documentFile, {
        access: "private", handleUploadUrl: "/api/platform-admin-documents",
        clientPayload: JSON.stringify({ accessToken: session.access_token, manufacturer, modelReference,
          title: documentTitle, filename: documentFile.name }),
      });
      setMessage("PDF déposé. La validation et l'indexation dans le catalogue restent à effectuer.");
      setDocumentFile(null);
      window.setTimeout(() => loadDocuments().catch(() => {}), 1500);
    } catch (cause) { setError(cause.message || "Import impossible."); }
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

  async function act(body) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await request(session.access_token, body);
      setMessage(result.message);
      await load();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  const company = data?.companies?.find((entry) => entry.id === selected);
  return <main className="platform-admin">
    <Link to="/espace-pro">← Retour à CarnetPass</Link>
    <h1>Administration CarnetPass</h1>
    <p>Accès interne en Preview. Vérifiez le règlement et le contrat avant d'activer une entreprise ou de modifier son équipe.</p>
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
            {entry.name} · {entry.siret || "SIRET absent"} · {entry.subscriptions?.plan || "sans formule"} / {entry.subscriptions?.status || "—"}
          </button>
        </li>)}</ul>
      </section>
      {company && <section><h2>{company.name}</h2>
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
          <button disabled={busy || company.company_verifications?.status !== "approved"} type="submit">Activer Entreprise</button>
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
            <button disabled={busy || data.memberCount >= company.subscriptions?.enterprise_seat_limit}>Ajouter ce technicien</button>
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
      <section><h2>Importer une notice technique</h2>
        <p>Le PDF reste privé et en attente de validation. Son dépôt ne le rend pas encore disponible dans le catalogue ou dans l'assistant.</p>
        <form onSubmit={importDocument}>
          <label>Fabricant <input required minLength={2} maxLength={120} value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} /></label>
          <label>Référence exacte du modèle <input required minLength={2} maxLength={160} value={modelReference} onChange={(event) => setModelReference(event.target.value)} /></label>
          <label>Titre du document <input required minLength={2} maxLength={200} value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} /></label>
          <label>Fichier PDF, 10 Mo maximum <input type="file" accept="application/pdf,.pdf" required onChange={(event) => setDocumentFile(event.target.files?.[0] || null)} /></label>
          <button disabled={busy} type="submit">Déposer le document</button>
          <button disabled={busy} type="button" onClick={() => loadDocuments().catch((cause) => setError(cause.message))}>Actualiser la liste</button>
        </form>
        <ul>{documents.map((entry) => <li key={entry.id}>
          {entry.manufacturer} · {entry.model_reference} · {entry.title} · {entry.original_filename} · En attente de validation
          <button type="button" onClick={() => downloadDocument(entry)}>Télécharger</button>
        </li>)}</ul>
      </section>
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

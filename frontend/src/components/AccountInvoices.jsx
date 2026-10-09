import { useEffect, useState } from "react";
import { getBillingInvoices } from "../services/billingService";

const statuses = { paid: "Payée", open: "À régler", void: "Annulée", uncollectible: "Non recouvrée" };
const total = (invoice) => {
  try { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: invoice.currency }).format(invoice.total / 100); }
  catch { return "Montant indisponible"; }
};

export default function AccountInvoices({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    getBillingInvoices(token, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) { setData(result); setError(""); }
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token]);

  async function load(more = false) {
    setLoading(true); setError("");
    try {
      const result = await getBillingInvoices(token, { after: more ? data.nextCursor : undefined });
      setData((previous) => ({ ...result, invoices: more
        ? [...previous.invoices, ...result.invoices.filter((item) => !previous.invoices.some((old) => old.id === item.id))] : result.invoices }));
    } catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  }

  return <div className="account-invoices">
    {data?.testMode && <p className="account-invoices-test">Factures de test : aucun paiement réel.</p>}
    {loading && <p role="status">Chargement des factures…</p>}
    {error && <p className="account-settings-error" role="alert">{error}</p>}
    {data && !data.invoices.length && !loading && !error && <p>Aucune facture disponible pour votre entreprise pour le moment.</p>}
    {!!data?.invoices.length && <ul className="account-invoices-list">{data.invoices.map((invoice) => <li key={invoice.id}>
      <strong>{invoice.number}</strong>
      <span>{new Date(invoice.created * 1000).toLocaleDateString("fr-FR")} · {statuses[invoice.status] || invoice.status} · {total(invoice)} TTC</span>
      <div className="account-invoices-links">
        {invoice.viewUrl && <a href={invoice.viewUrl} target="_blank" rel="noopener noreferrer" aria-label={`Consulter la facture ${invoice.number}`}>Consulter</a>}
        {invoice.pdfUrl && <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" aria-label={`Télécharger le PDF de la facture ${invoice.number}`}>Télécharger le PDF</a>}
        {!invoice.viewUrl && !invoice.pdfUrl && <span>Document en cours de préparation.</span>}
      </div>
    </li>)}</ul>}
    <button type="button" className="account-settings-secondary" disabled={loading} onClick={() => load()}>{error ? "Réessayer" : "Actualiser les factures"}</button>
    {data?.hasMore && <button type="button" className="account-settings-secondary" disabled={loading} onClick={() => load(true)}>Afficher les factures précédentes</button>}
  </div>;
}

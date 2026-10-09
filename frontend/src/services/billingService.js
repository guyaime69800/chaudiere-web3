export async function startBilling(token, action, plan) {
  const response = await fetch("/api/billing", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, plan }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.url) {
    const message = result?.message || "Paiement test indisponible.";
    throw new Error(result?.diagnostic ? `${message} (code ${result.diagnostic})` : message);
  }
  return result.url;
}

export async function sendTestBillingConfirmation(token) {
  const response = await fetch("/api/billing", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "email-confirmation" }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message || "Confirmation de test indisponible.");
  return result.message;
}

export async function getBillingInvoices(token, { after, signal } = {}) {
  const query = new URLSearchParams({ action: "invoices", ...(after ? { after } : {}) });
  const response = await fetch(`/api/billing?${query}`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(result?.invoices)) throw new Error(result?.message || "Factures momentanément indisponibles.");
  return result;
}

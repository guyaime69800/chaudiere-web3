export function stripePaymentUrl(value, hostname = 'checkout.stripe.com') {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== hostname || url.port || url.username || url.password) throw Error('Lien de paiement invalide.');
  return url.href;
}

export async function getLivePurchaseStatus(signal) {
  const response = await fetch('/api/billing?action=purchase-status', { cache: 'no-store', signal });
  if (!response.ok) return { available: false, seatsAvailable: false };
  const result = await response.json();
  return { available: result.available === true, seatsAvailable: result.seatsAvailable === true };
}

const pendingAttempts = new Map();
export function purchaseRequestId(userId, kind) {
  const key = `carnetpass-purchase:${userId}:${kind}`;
  let requestId = pendingAttempts.get(key);
  try { requestId ||= window.sessionStorage.getItem(key); } catch { /* memory preserves retries when storage is disabled */ }
  if (!/^[0-9a-f-]{36}$/i.test(requestId || '')) requestId = crypto.randomUUID();
  pendingAttempts.set(key, requestId);
  try { window.sessionStorage.setItem(key, requestId); } catch { /* storage may be disabled */ }
  return { requestId, complete() { pendingAttempts.delete(key); try { window.sessionStorage.removeItem(key); } catch { /* optional storage */ } } };
}

export async function startBilling(token, action, plan, terms, requestId = crypto.randomUUID()) {
  const response = await fetch("/api/billing", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, plan, terms, requestId }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.url) {
    const message = result?.message || "Paiement indisponible.";
    throw new Error(result?.diagnostic ? `${message} (code ${result.diagnostic})` : message);
  }
  return stripePaymentUrl(result.url, action === 'portal' ? 'billing.stripe.com' : 'checkout.stripe.com');
}

export async function liveBillingPortal(token, { statusOnly = false, signal } = {}) {
  const response = await fetch(`/api/billing?action=${statusOnly ? 'portal-status' : 'portal'}`, {
    method: statusOnly ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}` }, signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message || 'Portail indisponible.');
  if (statusOnly) return result?.available === true;
  const url = new URL(result?.url);
  if (url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com' || url.username || url.password || url.port) throw new Error('Portail indisponible.');
  return url.href;
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

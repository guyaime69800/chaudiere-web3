import { stripePaymentUrl } from './billingService.js';
export async function startShibaRecharge(token, euros, terms, requestId = crypto.randomUUID()) {
  const response = await fetch("/api/shiba-recharge", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ euros, terms, requestId }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.url) {
    const diagnostic = /^[A-Z_]+$/.test(result?.diagnostic || "") ? ` (code : ${result.diagnostic})` : "";
    throw new Error(`${result?.error || result?.message || "Recharge indisponible."}${diagnostic}`);
  }
  return stripePaymentUrl(result.url);
}

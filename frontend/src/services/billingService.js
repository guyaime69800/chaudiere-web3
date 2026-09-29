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

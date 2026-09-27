export async function startBilling(token, action, plan) {
  const response = await fetch("/api/billing", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, plan }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.url) throw new Error(result?.message || "Paiement test indisponible.");
  return result.url;
}

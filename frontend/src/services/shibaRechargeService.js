export async function startShibaRecharge(token, euros) {
  const response = await fetch("/api/shiba-recharge", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ euros }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.url) {
    const diagnostic = /^[A-Z_]+$/.test(result?.diagnostic || "") ? ` (code : ${result.diagnostic})` : "";
    throw new Error(`${result?.error || "Recharge test indisponible."}${diagnostic}`);
  }
  return result.url;
}

import { requireVerifiedCompany } from "./lib/require-verified-company.js";
import { createRechargeCheckout, rechargePack, rechargeReturnOrigin, rechargeStripeAvailable } from "./lib/shiba-recharge-stripe.js";

async function readRechargeAmount(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 8192) throw new Error("BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  return Number(JSON.parse(Buffer.concat(chunks).toString("utf8"))?.euros);
}

export default async function shibaRechargeHandler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ error: "Méthode non autorisée." });
  if (!rechargeStripeAvailable()) return response.status(503).json({ error: "Recharge test indisponible." });
  let euros;
  try {
    euros = await readRechargeAmount(request);
  } catch {
    return response.status(400).json({ error: "Requête de recharge invalide." });
  }
  if (!rechargePack(euros)) return response.status(400).json({ error: "Pack de recharge invalide." });
  const professional = await requireVerifiedCompany(request, response);
  if (!professional) return;
  try {
    const checkout = await createRechargeCheckout(professional, euros, rechargeReturnOrigin(request));
    if (!checkout?.url?.startsWith("https://checkout.stripe.com/")) throw new Error("Invalid checkout URL");
    return response.status(200).json({ url: checkout.url });
  } catch (error) {
    console.error("Stripe recharge checkout failed", error);
    return response.status(503).json({
      error: "Recharge test momentanément indisponible.",
      diagnostic: /^[A-Z_]+$/.test(error?.code || "") ? error.code : undefined,
    });
  }
}

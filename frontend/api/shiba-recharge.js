import { requireVerifiedCompany } from "../server/lib/require-verified-company.js";
import { createRechargeCheckout, rechargePack, rechargeStripeAvailable } from "../server/lib/shiba-recharge-stripe.js";

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ error: "Méthode non autorisée." });
  if (!rechargeStripeAvailable()) return response.status(503).json({ error: "Recharge test indisponible." });
  const professional = await requireVerifiedCompany(request, response);
  if (!professional) return;
  const euros = Number(request.body?.euros);
  if (!rechargePack(euros)) return response.status(400).json({ error: "Pack de recharge invalide." });
  try {
    const checkout = await createRechargeCheckout(professional, euros);
    if (!checkout?.url?.startsWith("https://checkout.stripe.com/")) throw new Error("Invalid checkout URL");
    return response.status(200).json({ url: checkout.url });
  } catch (error) {
    console.error("Stripe recharge checkout failed", error);
    return response.status(503).json({ error: "Recharge test momentanément indisponible." });
  }
}

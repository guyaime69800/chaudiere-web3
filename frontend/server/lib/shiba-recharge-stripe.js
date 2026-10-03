import { grantShibaRecharge } from "./shiba-quota.js";

const PACKS = Object.freeze({
  10: Object.freeze({ priceId: "price_1UMRFn8Wefijgtt2dDH6RuiH", cents: 1000, credits: 100 }),
  20: Object.freeze({ priceId: "price_1UMRGc8Wefijgtt2I1X5h7zt", cents: 2000, credits: 200 }),
});
const TEST_TAX_RATE = "txr_1UL13C8Wefijgtt2XG8pN2le";
const SOURCE = "carnetpass_shiba_recharge_v1";

export function rechargePack(euros) {
  return PACKS[euros] || null;
}

export function validateRechargePrice(price, pack, { requireActive = true } = {}) {
  return Boolean(pack && price && !price.livemode && (!requireActive || price.active) && price.id === pack.priceId
    && price.currency === "eur" && price.type === "one_time" && price.recurring === null
    && price.unit_amount === pack.cents && price.tax_behavior === "inclusive");
}

export function rechargeConfigurationIssue(price, rate, pack) {
  if (!price || price.id !== pack?.priceId || price.livemode) return "PRICE_ID_OR_MODE";
  if (!price.active || price.currency !== "eur" || price.type !== "one_time"
    || price.recurring !== null || price.unit_amount !== pack.cents) return "PRICE_DETAILS";
  if (price.tax_behavior !== "inclusive") return "PRICE_TAX_BEHAVIOR";
  if (!rate || rate.livemode || !rate.active) return "TAX_RATE_OR_MODE";
  if (!rate.inclusive || rate.percentage !== 20) return "TAX_RATE_DETAILS";
  if (rate.country !== "FR") return "TAX_RATE_COUNTRY";
  return null;
}

export function validatePaidRecharge(session, lines) {
  const pack = rechargePack(Number(session?.metadata?.euros));
  const line = lines?.data?.[0];
  if (!pack || !session?.id?.startsWith("cs_test_") || session.livemode || session.mode !== "payment"
    || session.status !== "complete" || session.payment_status !== "paid"
    || session.currency !== "eur" || session.amount_total !== pack.cents
    || session.metadata?.source !== SOURCE || session.client_reference_id !== session.metadata?.company_id
    || !/^[a-f0-9-]{36}$/i.test(session.metadata?.company_id || "")
    || !/^[a-f0-9-]{36}$/i.test(session.metadata?.user_id || "")
    || lines?.has_more || lines?.data?.length !== 1 || line?.quantity !== 1
    || !validateRechargePrice(line?.price, pack, { requireActive: false })) return null;
  return {
    companyId: session.metadata.company_id,
    userId: session.metadata.user_id,
    credits: pack.credits,
    sessionId: session.id,
  };
}

function testKey() {
  return process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
}

export function rechargeStripeAvailable() {
  return process.env.VERCEL_ENV === "preview" && testKey()?.startsWith("sk_test_")
    && process.env.STRIPE_TEST_WEBHOOK_SECRET?.startsWith("whsec_")
    && Boolean(process.env.UPSTASH_REDIS_REST_KV_REST_API_URL)
    && Boolean(process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN);
}

export async function rechargeStripe(path, params, method = "GET") {
  if (!rechargeStripeAvailable()) throw new Error("Preview recharge unavailable");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${testKey()}`,
      ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Stripe unavailable");
  return data;
}

export async function createRechargeCheckout(professional, euros) {
  const pack = rechargePack(euros);
  if (!pack || !professional?.email) throw new Error("Invalid recharge request");
  const [price, rate] = await Promise.all([
    rechargeStripe(`prices/${pack.priceId}`),
    rechargeStripe(`tax_rates/${TEST_TAX_RATE}`),
  ]);
  const issue = rechargeConfigurationIssue(price, rate, pack);
  if (issue) {
    const error = new Error(`Invalid Preview price or tax: ${issue}`);
    error.code = issue;
    throw error;
  }
  return rechargeStripe("checkout/sessions", {
    mode: "payment",
    "payment_method_types[0]": "card",
    "line_items[0][price]": pack.priceId,
    "line_items[0][quantity]": "1",
    "line_items[0][tax_rates][0]": TEST_TAX_RATE,
    customer_email: professional.email,
    client_reference_id: professional.companyId,
    "metadata[source]": SOURCE,
    "metadata[company_id]": professional.companyId,
    "metadata[user_id]": professional.userId,
    "metadata[euros]": String(euros),
    success_url: "https://test.carnetpass.fr/espace-pro?recharge=retour",
    cancel_url: "https://test.carnetpass.fr/espace-pro?recharge=annule",
  }, "POST");
}

export async function fulfillRechargeSession(sessionId, options = {}) {
  if (!/^cs_test_[A-Za-z0-9]+$/.test(sessionId || "")) return null;
  const request = options.stripe || rechargeStripe;
  const [session, lines] = await Promise.all([
    request(`checkout/sessions/${sessionId}`),
    request(`checkout/sessions/${sessionId}/line_items?limit=2`),
  ]);
  const grant = validatePaidRecharge(session, lines);
  if (!grant) return null;
  return grantShibaRecharge(grant, grant.credits, grant.sessionId, { redis: options.redis });
}

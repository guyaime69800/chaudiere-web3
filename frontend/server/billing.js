import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PRICES = {
  pro: "price_1UKQZc8Wefijgtt2dZlvPFUy",
  team: "price_1UKQc18Wefijgtt2gcXNK8tY",
};
const priceToPlan = Object.fromEntries(Object.entries(PRICES).map(([plan, price]) => [price, plan]));
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const stripeTestKey = () => process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

function send(res, status, message, extra = {}) {
  return res.status(status).json({ ok: status < 400, message, ...extra });
}

async function stripe(path, params, method = "POST") {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeTestKey()}`,
      ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Stripe indisponible.");
  return data;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  if (raw.length > 262144) throw new Error("BODY_TOO_LARGE");
  return raw;
}

function verifiedEvent(raw, header, secret) {
  const parts = Object.fromEntries(String(header || "").split(",").map((part) => part.split("=", 2)));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return null;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw.toString("utf8")}`).digest("hex");
  const signatures = String(header || "").split(",").filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!signatures.some((signature) => /^[a-f0-9]{64}$/i.test(signature)
    && timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex")))) return null;
  return JSON.parse(raw.toString("utf8"));
}

async function syncSubscription(admin, stripeSubscription) {
  const id = stripeSubscription.id;
  const customer = typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : stripeSubscription.customer?.id;
  const price = stripeSubscription.items?.data?.[0]?.price?.id;
  const plan = priceToPlan[price];
  if (!customer || !plan) return;
  const { data: row, error } = await admin.from("stripe_test_subscriptions")
    .select("company_id, stripe_subscription_id").eq("stripe_customer_id", customer).maybeSingle();
  if (error) throw error;
  if (!row || (row.stripe_subscription_id && row.stripe_subscription_id !== id)) return;
  const live = stripeSubscription.status === "active" || stripeSubscription.status === "trialing";
  if (!row.stripe_subscription_id && !live) return;
  const status = live ? stripeSubscription.status : stripeSubscription.status === "past_due" ? "past_due" : "canceled";
  const periodEnd = stripeSubscription.items?.data?.[0]?.current_period_end || stripeSubscription.current_period_end;
  const { error: updateError } = await admin.from("stripe_test_subscriptions").update({
    plan,
    status,
    stripe_subscription_id: id,
    stripe_price_id: price,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: Boolean(stripeSubscription.cancel_at_period_end),
    updated_at: new Date().toISOString(),
  }).eq("company_id", row.company_id);
  if (updateError) throw updateError;
}

export default async function billingHandler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return send(res, 405, "Méthode non autorisée.");
  if (process.env.VERCEL_ENV !== "preview" || !stripeTestKey()?.startsWith("sk_test_")) {
    return send(res, 503, "Paiement test indisponible.");
  }
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !publicKey || !secretKey) return send(res, 503, "Configuration indisponible.");
  const admin = createClient(supabaseUrl, secretKey, options);

  if (req.query?.webhook === "1") {
    if (!process.env.STRIPE_TEST_WEBHOOK_SECRET?.startsWith("whsec_")) return send(res, 503, "Webhook indisponible.");
    let event;
    try { event = verifiedEvent(await readBody(req), req.headers["stripe-signature"], process.env.STRIPE_TEST_WEBHOOK_SECRET); }
    catch { return send(res, 400, "Événement invalide."); }
    if (!event || event.livemode) return send(res, 400, "Signature invalide.");
    try {
      if (event.type === "checkout.session.completed" && event.data.object.mode === "subscription") {
        const id = event.data.object.subscription;
        if (typeof id === "string") await syncSubscription(admin, await stripe(`subscriptions/${encodeURIComponent(id)}`, null, "GET"));
      } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
        const id = event.data.object.id;
        const subscription = event.type === "customer.subscription.deleted"
          ? event.data.object : await stripe(`subscriptions/${encodeURIComponent(id)}`, null, "GET");
        await syncSubscription(admin, subscription);
      }
      return send(res, 200, "Événement reçu.");
    } catch (error) {
      console.error("Stripe webhook sync failed", error);
      return send(res, 503, "Synchronisation indisponible.");
    }
  }

  let body;
  try { body = JSON.parse((await readBody(req)).toString("utf8")); }
  catch { return send(res, 400, "Requête invalide."); }
  const token = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "")?.[1];
  if (!token || token.length > 16384) return send(res, 401, "Reconnectez-vous.");
  const auth = createClient(supabaseUrl, publicKey, options);
  const { data: { user }, error: authError } = await auth.auth.getUser(token);
  if (authError || !user?.email_confirmed_at) return send(res, 401, "Reconnectez-vous.");
  const { data: memberships, error: memberError } = await admin.from("company_members")
    .select("company_id, role").eq("user_id", user.id).limit(2);
  if (memberError || memberships?.length !== 1 || !["owner", "admin"].includes(memberships[0].role)) {
    return send(res, 403, "Seul le responsable d'une entreprise peut gérer sa formule.");
  }
  const companyId = memberships[0].company_id;
  const { data: current, error: currentError } = await admin.from("stripe_test_subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, status").eq("company_id", companyId).maybeSingle();
  if (currentError) return send(res, 503, "Abonnement indisponible.");
  try {
    let customerId = current?.stripe_customer_id;
    if (!customerId && body.action === "checkout" && PRICES[body.plan]) {
      const customer = await stripe("customers", { email: user.email, "metadata[company_id]": companyId });
      customerId = customer.id;
      const { error: saveError } = await admin.from("stripe_test_subscriptions")
        .upsert({ company_id: companyId, stripe_customer_id: customerId }, { onConflict: "company_id", ignoreDuplicates: true });
      if (saveError) throw saveError;
      const { data: saved, error: readError } = await admin.from("stripe_test_subscriptions")
        .select("stripe_customer_id").eq("company_id", companyId).single();
      if (readError || !saved?.stripe_customer_id) throw readError || new Error("Stripe customer not saved");
      customerId = saved.stripe_customer_id;
    }
    if ((body.action === "portal" || (body.action === "checkout" && current?.stripe_subscription_id && current.status !== "canceled"))
      && customerId && current?.stripe_subscription_id) {
      const portal = await stripe("billing_portal/sessions", {
        customer: customerId, return_url: "https://test.carnetpass.fr/parametres-compte#formule",
      });
      return send(res, 200, "Portail prêt.", { url: portal.url });
    }
    if (body.action === "checkout" && PRICES[body.plan] && customerId
      && (!current?.stripe_subscription_id || current.status === "canceled")) {
      if (current?.stripe_subscription_id) {
        const { error: resetError } = await admin.from("stripe_test_subscriptions")
          .update({ stripe_subscription_id: null }).eq("company_id", companyId).eq("status", "canceled");
        if (resetError) throw resetError;
      }
      const checkout = await stripe("checkout/sessions", {
        mode: "subscription", customer: customerId,
        "line_items[0][price]": PRICES[body.plan], "line_items[0][quantity]": "1",
        client_reference_id: companyId,
        success_url: "https://test.carnetpass.fr/parametres-compte?paiement=retour#formule",
        cancel_url: "https://test.carnetpass.fr/tarifs?paiement=annule",
      });
      return send(res, 200, "Paiement test prêt.", { url: checkout.url });
    }
    return send(res, 409, "Utilisez le portail Stripe pour modifier un abonnement existant.");
  } catch (error) {
    console.error("Stripe billing failed", error);
    return send(res, 503, "Stripe est momentanément indisponible.");
  }
}

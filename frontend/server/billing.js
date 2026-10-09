import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { fulfillRechargeSession } from "./lib/shiba-recharge-stripe.js";
import invoicesHandler from "./billing-invoices.js";

const PRICES = {
  pro: "price_1UL0nM8Wefijgtt281qKbtMQ",
  team: "price_1UL0xE8Wefijgtt2ctj3Go8V",
};
const LEGACY_PRICES = {
  pro: "price_1UKQZc8Wefijgtt2dZlvPFUy",
  team: "price_1UKQc18Wefijgtt2gcXNK8tY",
};
const TEST_TAX_RATE = "txr_1UL13C8Wefijgtt2XG8pN2le";
const priceToPlan = Object.fromEntries([LEGACY_PRICES, PRICES]
  .flatMap((prices) => Object.entries(prices).map(([plan, price]) => [price, plan])));
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const stripeTestKey = () => process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
const portalReturnUrl = "https://test.carnetpass.fr/parametres-compte#formule";
const portalConfigMarker = "carnetpass_preview_single_plan_v3";

export function hasBillingSiret(siret) {
  return typeof siret === "string" && /^\d{14}$/.test(siret);
}

export function isNewPreviewPlan(plan) {
  return plan === "pro";
}

function send(res, status, message, extra = {}) {
  return res.status(status).json({ ok: status < 400, message, ...extra });
}

async function stripe(path, params, method = "POST") {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    signal: AbortSignal.timeout(10000),
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

async function validateTestTaxRate() {
  const rate = await stripe(`tax_rates/${encodeURIComponent(TEST_TAX_RATE)}`, null, "GET");
  if (rate.livemode || !rate.active || !rate.inclusive || rate.percentage !== 20 || rate.country !== "FR") {
    throw new Error("Invalid Preview tax rate");
  }
}

async function validateTestPrice(plan) {
  const price = await stripe(`prices/${encodeURIComponent(PRICES[plan])}`, null, "GET");
  const expected = plan === "pro" ? 2800 : 3800;
  if (price.livemode || !price.active || price.currency !== "eur"
    || price.unit_amount !== expected || price.recurring?.interval !== "month"
    || price.tax_behavior === "exclusive") throw new Error("Invalid Preview price");
  return price;
}

async function testPortalConfiguration() {
  const configurations = await stripe("billing_portal/configurations?limit=100", null, "GET");
  const existing = configurations.data?.find((configuration) => configuration.active
    && configuration.metadata?.carnetpass_preview === portalConfigMarker
    && configuration.features?.invoice_history?.enabled);
  if (existing) return existing.id;

  const pro = await validateTestPrice("pro");
  const configuration = await stripe("billing_portal/configurations", {
    "metadata[carnetpass_preview]": portalConfigMarker,
    "features[invoice_history][enabled]": "true",
    "features[customer_update][enabled]": "true",
    "features[customer_update][allowed_updates][0]": "name",
    "features[customer_update][allowed_updates][1]": "address",
    "features[customer_update][allowed_updates][2]": "tax_id",
    "features[payment_method_update][enabled]": "true",
    "features[subscription_cancel][enabled]": "true",
    "features[subscription_cancel][mode]": "at_period_end",
    "features[subscription_update][enabled]": "true",
    "features[subscription_update][default_allowed_updates][0]": "price",
    "features[subscription_update][proration_behavior]": "always_invoice",
    "features[subscription_update][products][0][product]": pro.product,
    "features[subscription_update][products][0][prices][0]": PRICES.pro,
  });
  return configuration.id;
}

export function planChangeParams(customerId, subscription, itemId, plan, configuration) {
  return {
    customer: customerId,
    configuration,
    return_url: portalReturnUrl,
    "flow_data[type]": "subscription_update_confirm",
    "flow_data[subscription_update_confirm][subscription]": subscription,
    "flow_data[subscription_update_confirm][items][0][id]": itemId,
    "flow_data[subscription_update_confirm][items][0][price]": PRICES[plan],
    "flow_data[subscription_update_confirm][items][0][quantity]": "1",
  };
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

async function sendTestInvoiceEmail(admin, invoice) {
  const customer = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription
    : invoice.parent?.subscription_details?.subscription;
  if (!customer || !subscriptionId || invoice.status !== "paid" || invoice.livemode
    || invoice.currency !== "eur" || !process.env.RESEND_API_KEY) return false;
  const { data: row, error } = await admin.from("stripe_test_subscriptions")
    .select("stripe_subscription_id, plan").eq("stripe_customer_id", customer).maybeSingle();
  if (error) throw error;
  if (row?.stripe_subscription_id !== subscriptionId || !["pro", "team"].includes(row.plan)) return false;
  const stripeCustomer = await stripe(`customers/${encodeURIComponent(customer)}`, null, "GET");
  const email = stripeCustomer.email;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const plan = row.plan === "team" ? "Équipe" : "Pro";
  const amount = (invoice.amount_paid / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  const lines = [
    "TEST INTERNE CARNETPASS — aucun paiement réel n'a été prélevé.",
    "",
    `Votre facture de test CarnetPass ${plan} a été payée : ${amount}.`,
    `Numéro de facture : ${invoice.number || invoice.id}`,
    invoice.hosted_invoice_url ? `Consulter la facture sur Stripe : ${invoice.hosted_invoice_url}` : "",
    "",
    "Cet essai Stripe ne modifie pas encore les droits de votre compte CarnetPass.",
    "Retrouvez votre abonnement de test dans les paramètres du compte sur https://test.carnetpass.fr.",
  ].filter(Boolean);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `carnetpass-test-invoice-${invoice.id}`,
    },
    body: JSON.stringify({
      from: process.env.ENTERPRISE_QUOTE_FROM_EMAIL || "CarnetPass <contact@carnetpass.fr>",
      to: [email],
      subject: `CarnetPass — confirmation de votre facture de test ${plan}`,
      text: lines.join("\n"),
    }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}`);
  return true;
}

export default async function billingHandler(req, res) {
  if (req.query?.action === "invoices" && req.query?.webhook !== "1") return invoicesHandler(req, res);
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
      if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)
        && event.data.object.mode === "payment") {
        const result = await fulfillRechargeSession(event.data.object.id);
        if (result?.granted) return send(res, 200, "Crédits test attribués.");
      } else if (event.type === "checkout.session.completed" && event.data.object.mode === "subscription") {
        const id = event.data.object.subscription;
        if (typeof id === "string") await syncSubscription(admin, await stripe(`subscriptions/${encodeURIComponent(id)}`, null, "GET"));
      } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
        const id = event.data.object.id;
        const subscription = event.type === "customer.subscription.deleted"
          ? event.data.object : await stripe(`subscriptions/${encodeURIComponent(id)}`, null, "GET");
        await syncSubscription(admin, subscription);
      } else if (event.type === "invoice.paid") {
        const invoice = await stripe(`invoices/${encodeURIComponent(event.data.object.id)}`, null, "GET");
        const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription
          : invoice.parent?.subscription_details?.subscription;
        if (typeof subscriptionId === "string") {
          await syncSubscription(admin, await stripe(`subscriptions/${encodeURIComponent(subscriptionId)}`, null, "GET"));
        }
        if (await sendTestInvoiceEmail(admin, invoice)) return send(res, 200, "Confirmation de test envoyée.");
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
  if (memberError) {
    console.error("Stripe membership lookup failed", { code: memberError.code, message: memberError.message });
    return send(res, 503, "Impossible de vérifier votre entreprise. Réessayez plus tard.", {
      diagnostic: memberError.code || "UNKNOWN",
    });
  }
  if (memberships?.length !== 1) {
    return send(res, 409, "Aucune entreprise unique n'est associée à ce compte. Contactez CarnetPass.");
  }
  if (!["owner", "admin"].includes(memberships[0].role)) {
    return send(res, 403, "Seul le responsable d'une entreprise peut gérer sa formule.");
  }
  if (body.action === "checkout" && !isNewPreviewPlan(body.plan)) {
    return send(res, 400, "Seule la formule professionnelle est proposée pour un nouvel abonnement de test.");
  }
  const companyId = memberships[0].company_id;
  const { data: access, error: accessError } = await admin.from("subscriptions")
    .select("plan, status").eq("company_id", companyId).single();
  if (accessError) return send(res, 503, "Formule indisponible.");
  if (body.action === "checkout") {
    const { data: company, error: companyError } = await admin.from("companies")
      .select("siret").eq("id", companyId).single();
    if (companyError) return send(res, 503, "Impossible de vérifier le SIRET de l'entreprise.");
    if (!hasBillingSiret(company.siret)) {
      return send(res, 409, "Renseignez le SIRET de l'entreprise (14 chiffres) avant de choisir une formule payante.");
    }
  }
  if (body.action === "checkout" && access.plan === "enterprise" && access.status === "active") {
    return send(res, 409, "Votre accès Entreprise est géré par CarnetPass. Contactez l'équipe pour modifier votre contrat.");
  }
  const { data: current, error: currentError } = await admin.from("stripe_test_subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, status").eq("company_id", companyId).maybeSingle();
  if (currentError) return send(res, 503, "Abonnement indisponible.");
  try {
    if (body.action === "email-confirmation" && current?.stripe_customer_id && current?.stripe_subscription_id) {
      const subscription = await stripe(`subscriptions/${encodeURIComponent(current.stripe_subscription_id)}`, null, "GET");
      if (subscription.customer !== current.stripe_customer_id || !subscription.latest_invoice) {
        return send(res, 409, "Aucune facture de test à confirmer.");
      }
      const invoiceId = typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice.id;
      const invoice = await stripe(`invoices/${encodeURIComponent(invoiceId)}`, null, "GET");
      if (!(await sendTestInvoiceEmail(admin, invoice))) {
        return send(res, 409, "Facture de test non payée ou envoi non configuré.");
      }
      return send(res, 200, "Confirmation de test envoyée par e-mail.");
    }
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
    if (body.action === "checkout" && PRICES[body.plan] && customerId
      && current?.stripe_subscription_id && current.status !== "canceled") {
      await validateTestTaxRate();
      await validateTestPrice(body.plan);
      const subscription = await stripe(`subscriptions/${encodeURIComponent(current.stripe_subscription_id)}`, null, "GET");
      const item = subscription.items?.data?.[0];
      if (subscription.customer !== customerId || subscription.items?.data?.length !== 1
        || !priceToPlan[item?.price?.id]
        || !["active", "trialing"].includes(subscription.status)) {
        return send(res, 409, "Cet abonnement ne peut pas être modifié depuis le parcours de test.");
      }
      if (item.price.id === PRICES[body.plan]) {
        return send(res, 409, "Vous utilisez déjà cette formule de test.");
      }
      if (!subscription.default_tax_rates?.some((rate) => rate.id === TEST_TAX_RATE || rate === TEST_TAX_RATE)) {
        return send(res, 409, "Cet ancien abonnement test ne comporte pas la TVA. Consultez ses factures dans le portail ; un changement de formule demande une migration fiscale préalable.");
      }
      const portal = await stripe("billing_portal/sessions",
        planChangeParams(customerId, subscription.id, item.id, body.plan, await testPortalConfiguration()));
      return send(res, 200, "Changement de formule prêt.", { url: portal.url });
    }
    if (body.action === "portal" && customerId && current?.stripe_subscription_id) {
      const portal = await stripe("billing_portal/sessions", {
        customer: customerId, return_url: portalReturnUrl,
        configuration: await testPortalConfiguration(),
      });
      return send(res, 200, "Portail prêt.", { url: portal.url });
    }
    if (body.action === "checkout" && PRICES[body.plan] && customerId
      && (!current?.stripe_subscription_id || current.status === "canceled")) {
      await validateTestTaxRate();
      await validateTestPrice(body.plan);
      if (current?.stripe_subscription_id) {
        const { error: resetError } = await admin.from("stripe_test_subscriptions")
          .update({ stripe_subscription_id: null }).eq("company_id", companyId).eq("status", "canceled");
        if (resetError) throw resetError;
      }
      const checkout = await stripe("checkout/sessions", {
        mode: "subscription", customer: customerId,
        "line_items[0][price]": PRICES[body.plan], "line_items[0][quantity]": "1",
        "subscription_data[default_tax_rates][0]": TEST_TAX_RATE,
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

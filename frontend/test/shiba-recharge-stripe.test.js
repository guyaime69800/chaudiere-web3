import assert from "node:assert/strict";
import test from "node:test";
import { COMMERCIAL_TERMS_VERSION } from '../shared/commercial-terms.js';

process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ||= "https://example.invalid";
process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ||= "test-only";

const { createRechargeCheckout, fulfillRechargeSession, rechargeConfigurationIssue, rechargePack, rechargeReturnOrigin, rechargeStripeAvailable, validatePaidRecharge, validateRechargePrice } =
  await import("../server/lib/shiba-recharge-stripe.js");

const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function paidCheckout(euros = 10) {
  const pack = rechargePack(euros);
  return {
    session: {
      id: "cs_test_purchase123", livemode: false, mode: "payment", status: "complete",
      payment_status: "paid", currency: "eur", amount_total: pack.cents,
      client_reference_id: companyId,
      metadata: { source: "carnetpass_shiba_recharge_v1", company_id: companyId, user_id: userId, euros: String(euros) },
    },
    lines: { has_more: false, data: [{ quantity: 1, price: {
      id: pack.priceId, livemode: false, active: true, currency: "eur", type: "one_time",
      recurring: null, unit_amount: pack.cents, tax_behavior: "inclusive",
    } }] },
  };
}

function fakeRedis() {
  const values = new Map();
  return { values, async eval(_script, [balanceKey, sessionKey], [credits]) {
    if (values.has(sessionKey)) return [0, values.get(balanceKey) || 0];
    const balance = (values.get(balanceKey) || 0) + credits;
    values.set(balanceKey, balance);
    values.set(sessionKey, 1);
    return [1, balance];
  } };
}

test("les packs correspondent aux deux prix Stripe ponctuels", () => {
  assert.equal(rechargePack(10).priceId, "price_1UMRFn8Wefijgtt2dDH6RuiH");
  assert.equal(rechargePack(20).priceId, "price_1UMRGc8Wefijgtt2I1X5h7zt");
  assert.equal(rechargePack(30), null);
  const { session, lines } = paidCheckout();
  assert.equal(validateRechargePrice(lines.data[0].price, rechargePack(10)), true);
  assert.equal(validatePaidRecharge(session, lines).credits, 100);
  assert.equal(validatePaidRecharge(paidCheckout(20).session, paidCheckout(20).lines).credits, 200);
});

test("le diagnostic valide le prix sans taux de TVA", () => {
  const pack = rechargePack(10);
  const price = paidCheckout().lines.data[0].price;
  assert.equal(rechargeConfigurationIssue(price, pack), null);
  assert.equal(rechargeConfigurationIssue({ ...price, tax_behavior: "unspecified" }, pack), null);
  assert.equal(rechargeConfigurationIssue({ ...price, tax_behavior: "exclusive" }, pack), "PRICE_TAX_BEHAVIOR");
  assert.equal(rechargeConfigurationIssue({ ...price, unit_amount: 900 }, pack), "PRICE_DETAILS");
});

test("la recharge Stripe ne s'ouvre jamais en production", () => {
  const before = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "production";
    assert.equal(rechargeStripeAvailable(), false);
  } finally {
    if (before === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = before;
  }
});

test("le retour Stripe garde le domaine Preview connecté sans redirection externe", () => {
  const host = "chaudiere-web3-ciwpbds0k-chaudiere-web3.vercel.app";
  assert.equal(rechargeReturnOrigin({ headers: { host, origin: `https://${host}` } }), `https://${host}`);
  const renamedHost = "carnetpass-ciwpbds0k-chaudiere-web3.vercel.app";
  assert.equal(rechargeReturnOrigin({ headers: { host: renamedHost, origin: `https://${renamedHost}` } }), `https://${renamedHost}`);
  assert.equal(rechargeReturnOrigin({ headers: { host: "test.carnetpass.fr", origin: "https://test.carnetpass.fr" } }), "https://test.carnetpass.fr");
  assert.throws(() => rechargeReturnOrigin({ headers: { host, origin: "https://evil.example" } }), { code: "RETURN_ORIGIN" });
  assert.throws(() => rechargeReturnOrigin({ headers: { host: "carnetpass.fr", origin: "https://carnetpass.fr" } }), { code: "RETURN_ORIGIN" });
});

test("Checkout test ne collecte aucune TVA", async () => {
  const names = ["VERCEL_ENV", "STRIPE_TEST_SECRET_KEY", "STRIPE_TEST_WEBHOOK_SECRET",
    "UPSTASH_REDIS_REST_KV_REST_API_URL", "UPSTASH_REDIS_REST_KV_REST_API_TOKEN"];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const beforeFetch = globalThis.fetch;
  const calls = [];
  try {
    Object.assign(process.env, {
      VERCEL_ENV: "preview", STRIPE_TEST_SECRET_KEY: "sk_test_fake", STRIPE_TEST_WEBHOOK_SECRET: "whsec_fake",
      UPSTASH_REDIS_REST_KV_REST_API_URL: "https://example.invalid", UPSTASH_REDIS_REST_KV_REST_API_TOKEN: "fake",
    });
    const pack = rechargePack(10);
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      const data = url.includes("/prices/") ? {
        id: pack.priceId, livemode: false, active: true, currency: "eur", type: "one_time",
        recurring: null, unit_amount: pack.cents, tax_behavior: "unspecified",
      } : url.includes("/tax_rates/") ? {
        livemode: false, active: true, inclusive: true, percentage: 20, country: "FR",
      } : { url: "https://checkout.stripe.com/test" };
      return { ok: true, json: async () => data };
    };
    const returnOrigin = "https://chaudiere-web3-ciwpbds0k-chaudiere-web3.vercel.app";
    await createRechargeCheckout({ companyId, userId, email: "test@example.com" }, 10, returnOrigin);
    assert.equal(calls.length, 2);
    const posted = new URLSearchParams(calls[1].init.body);
    assert.equal(posted.get("mode"), "payment");
    assert.equal(posted.get("metadata[cgv_version]"), COMMERCIAL_TERMS_VERSION);
    assert.equal(posted.get("metadata[cgv_user_id]"), userId);
    assert.equal(posted.get("consent_collection[terms_of_service]"), "required");
    assert.equal(posted.get("line_items[0][price]"), pack.priceId);
    assert.equal(posted.get("line_items[0][tax_rates][0]"), null);
    assert.equal(posted.get("automatic_tax[enabled]"), "false");
    assert.equal(posted.get("invoice_creation[invoice_data][footer]"), "TVA non applicable, article 293 B du CGI");
    assert.equal(posted.get("success_url"), `${returnOrigin}/espace-pro?recharge=retour`);
    assert.equal(posted.get("cancel_url"), `${returnOrigin}/espace-pro?recharge=annule`);
    assert.equal(posted.get("metadata[user_id]"), userId);
    assert.equal(posted.get("metadata[company_id]"), companyId);
    assert.equal(posted.get("metadata[credits]"), "100");
    assert.equal(posted.get("payment_intent_data[description]"), "Recharge CarnetPass - 100 crédits IA");
    assert.equal(posted.get("payment_intent_data[metadata][credits]"), "100");
    calls.length = 0;
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => url.includes("/prices/")
        ? { id: pack.priceId, livemode: false, active: true, currency: "eur", type: "one_time",
          recurring: null, unit_amount: pack.cents, tax_behavior: "exclusive" }
        : { livemode: false, active: true, inclusive: true, percentage: 20, country: "FR" } };
    };
    await assert.rejects(createRechargeCheckout({ companyId, userId, email: "test@example.com" }, 10),
      { code: "PRICE_TAX_BEHAVIOR" });
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = beforeFetch;
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});

test("un paiement non confirmé, un autre prix ou une autre TVA n'attribue aucun crédit", () => {
  const { session, lines } = paidCheckout();
  assert.equal(validatePaidRecharge({ ...session, payment_status: "unpaid" }, lines), null);
  assert.equal(validatePaidRecharge({ ...session, status: "open" }, lines), null);
  assert.equal(validatePaidRecharge({ ...session, amount_total: 1100 }, lines), null);
  assert.equal(validatePaidRecharge(session, { ...lines, data: [{ ...lines.data[0], price: { ...lines.data[0].price, id: "price_other" } }] }), null);
  assert.equal(validatePaidRecharge(session, { ...lines, data: [{ ...lines.data[0], price: { ...lines.data[0].price, tax_behavior: "exclusive" } }] }), null);
  assert.equal(validatePaidRecharge(session, { ...lines, data: [{ ...lines.data[0], price: { ...lines.data[0].price, tax_behavior: "unspecified" } }] }).credits, 100);
});

test("le webhook ajoute une recharge payée une fois, même si Stripe renvoie la session", async () => {
  const { session, lines } = paidCheckout();
  const redis = fakeRedis();
  const stripe = async (path) => path.includes("line_items") ? lines : session;
  assert.deepEqual(await fulfillRechargeSession(session.id, { stripe, redis }), { granted: true, bonusRemaining: 100 });
  assert.deepEqual(await fulfillRechargeSession(session.id, { stripe, redis }), { granted: false, bonusRemaining: 100 });
  assert.equal(redis.values.size, 2);
});

test("a new checkout cannot grant credits without confirmed Stripe terms consent", () => {
  const { session, lines } = paidCheckout();
  const checkout = { ...session, metadata: { ...session.metadata, cgv_version: "2026-10-12.1" } };
  assert.equal(validatePaidRecharge(checkout, lines), null);
  assert.equal(validatePaidRecharge({ ...checkout, consent: { terms_of_service: "accepted" } }, lines).credits, 100);
});

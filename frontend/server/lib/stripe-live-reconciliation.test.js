import test from 'node:test';
import assert from 'node:assert/strict';
import { creditPaymentEffect, subscriptionPaymentEffect, creditRefundEffect, createLiveStripeReader, reconcileLiveReceipt } from './stripe-live-reconciliation.js';
import { productionPrices } from './stripe-production-catalog.js';
const now = Date.parse('2026-10-21T12:00:00Z');
const end = Math.floor(now / 1000) + 86400;
const binding = { company_id: 'company', customer_id: 'cus_expected', account_id: 'acct_expected' };
const order = { id: 'order', kind: 'recharge100', company_id: 'company', session_id: 'cs_live_example', terms_version: 'v1', terms_sha256: 'hash' };
function price(name) {
  const config = productionPrices[name];
  return { id: config.id, livemode: true, active: true, currency: 'eur', unit_amount: config.amount,
    billing_scheme: 'per_unit', tax_behavior: 'unspecified', type: config.interval ? 'recurring' : 'one_time',
    recurring: config.interval ? { interval: 'month', interval_count: 1, usage_type: 'licensed' } : null,
    metadata: name === 'additionalAccount' ? { carnetpass_additional_accounts: 'v1' } : {},
    product: { id: 'prod_expected', active: true, livemode: true } };
}
function recharge() {
  return { session: { id: order.session_id, livemode: true, mode: 'payment', status: 'complete', payment_status: 'paid',
    customer: binding.customer_id, currency: 'eur', amount_subtotal: 1000, amount_total: 1000,
    total_details: { amount_discount: 0, amount_tax: 0, amount_shipping: 0 }, consent: { terms_of_service: 'accepted' },
    metadata: { carnetpass_order_id: order.id, cgv_version: 'v1', cgv_sha256: 'hash' }, payment_intent: 'pi_example' },
  lines: { has_more: false, data: [{ quantity: 1, amount_total: 1000, price: price('recharge100') }] },
  intent: { id: 'pi_example', livemode: true, status: 'succeeded', customer: binding.customer_id,
    amount_received: 1000, currency: 'eur', latest_charge: { paid: true, livemode: true, amount_refunded: 0, disputed: false } } };
}
function subscription() {
  return { id: 'sub_example', livemode: true, customer: binding.customer_id, status: 'active',
    items: { has_more: false, data: [{ quantity: 1, price: price('pro'), current_period_end: end },
      { quantity: 2, price: price('additionalAccount'), current_period_end: end }] },
    latest_invoice: { livemode: true, status: 'paid', amount_remaining: 0, customer: binding.customer_id,
      currency: 'eur', parent: { subscription_details: { subscription: 'sub_example' } },
      amount_paid: 6800, total: 6800, total_taxes: [], total_discount_amounts: [],
      lines: { has_more: false, data: [{ pricing: { price_details: { price: productionPrices.pro.id } }, quantity: 1, amount: 2800, period: { end } },
        { pricing: { price_details: { price: productionPrices.additionalAccount.id } }, quantity: 2, amount: 4000, period: { end } }] } } };
}

test('only the stored order and fully settled live recharge produce a credit effect', () => {
  const { session, lines, intent } = recharge();
  assert.equal(creditPaymentEffect(session, lines, intent, order, binding).kind, 'credits');
  for (const patch of [{ customer: 'cus_foreign' }, { amount_total: 999 }, { payment_status: 'unpaid' },
    { livemode: false }, { consent: null }, { metadata: { carnetpass_order_id: 'attacker' } }, { amount_subtotal: 1200 }]) {
    assert.throws(() => creditPaymentEffect({ ...session, ...patch }, lines, intent, order, binding));
  }
  assert.throws(() => creditPaymentEffect(session, { ...lines, has_more: true }, intent, order, binding));
  assert.throws(() => creditPaymentEffect(session, lines, { ...intent, latest_charge: { ...intent.latest_charge, amount_refunded: 10 } }, order, binding));
  assert.throws(() => creditPaymentEffect(session, lines, { ...intent, latest_charge: { ...intent.latest_charge, disputed: true } }, order, binding));
});

test('settled subscription grants exact paid seats; pending or unpaid seats do not grant access', () => {
  const sub = subscription();
  const state = { subscription_id: sub.id };
  const effect = subscriptionPaymentEffect(sub, binding, state, null, now);
  assert.equal(effect.seats, 2);
  assert.equal(effect.paid_until, new Date(end * 1000).toISOString());
  for (const patch of [{ pending_update: {} }, { customer: 'cus_foreign' }, { livemode: false },
    { latest_invoice: { ...sub.latest_invoice, status: 'open' } },
    { latest_invoice: { ...sub.latest_invoice, total_taxes: [{ amount: 10 }] } }]) {
    assert.throws(() => subscriptionPaymentEffect({ ...sub, ...patch }, binding, state, null, now));
  }
  const missingSeatProof = structuredClone(sub);
  missingSeatProof.latest_invoice.lines.data.pop();
  assert.throws(() => subscriptionPaymentEffect(missingSeatProof, binding, state, null, now));
  assert.throws(() => subscriptionPaymentEffect(sub, binding, {}, null, now), 'new subscriptions require an order');
});

test('latest cancellation and past-due state deny paid rights even if an old invoice is paid', () => {
  for (const status of ['canceled', 'unpaid', 'past_due', 'incomplete_expired']) {
    const sub = { ...subscription(), status };
    const effect = subscriptionPaymentEffect(sub, binding, { subscription_id: sub.id }, null, now);
    assert.notEqual(effect.status, 'active');
    assert.equal(effect.seats, 0);
  }
  assert.throws(() => subscriptionPaymentEffect(subscription(), binding, { subscription_id: 'sub_other' }, null, now));
});

test('classic and flexible portal cancellations retain only paid access until the cancellation date', () => {
  const sub = subscription();
  const state = { subscription_id: sub.id };
  for (const cancellation of [{ cancel_at_period_end: true }, { cancel_at_period_end: false, cancel_at: end }]) {
    const effect = subscriptionPaymentEffect({ ...sub, ...cancellation }, binding, state, null, now);
    assert.equal(effect.status, 'active');
    assert.equal(effect.cancellation_at, new Date(end * 1000).toISOString());
    assert.equal(effect.paid_until, effect.cancellation_at);
  }
  const earlier = subscriptionPaymentEffect({ ...sub, cancel_at: end - 3600 }, binding, state, null, now);
  assert.equal(earlier.paid_until, new Date((end - 3600) * 1000).toISOString());
  assert.equal(subscriptionPaymentEffect(sub, binding, state, null, now).cancellation_at, null, 'resumption clears the date');
  assert.equal(subscriptionPaymentEffect({ ...sub, status: 'canceled', cancel_at: end }, binding, state, null, now).cancellation_at, null);
  for (const cancel_at of ['tomorrow', -1, now / 1000 - 1]) {
    assert.throws(() => subscriptionPaymentEffect({ ...sub, cancel_at }, binding, state, null, now));
  }
});

test('refund and dispute revoke credits proportionally without inventing new balance', () => {
  const purchase = { payment_intent_id: 'pi_example', credits: 100 };
  const charge = { livemode: true, customer: binding.customer_id, payment_intent: 'pi_example',
    currency: 'eur', amount: 1000, amount_refunded: 251, disputed: false };
  assert.equal(creditRefundEffect(charge, purchase, binding).revoked_credits, 26);
  assert.equal(creditRefundEffect({ ...charge, disputed: true }, purchase, binding).revoked_credits, 100);
  assert.throws(() => creditRefundEffect({ ...charge, customer: 'cus_other' }, purchase, binding));
});

test('Stripe reader sends only GET and a pinned API version; failures never expose secret or response body', async () => {
  const secret = 'rk_live_PRIVATE';
  const reader = createLiveStripeReader({ STRIPE_SECRET_KEY: secret }, async (_, init) => {
    assert.equal(init.method, 'GET');
    assert.equal(init.headers['Stripe-Version'], '2026-08-26.dahlia');
    return { ok: false, json: async () => ({ message: secret }) };
  });
  await assert.rejects(reader('prices'), (error) => !error.message.includes(secret));
});

test('already applied event does not refetch Stripe or apply rights again', async () => {
  const db = { from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { processing_status: 'processed' } }) }) };
  const result = await reconcileLiveReceipt(db, () => { throw new Error('must not fetch'); }, { account_id: 'acct_expected', event_id: 'evt_example' });
  assert.equal(result, 'duplicate');
});

test('an old invoice notification uses the current canceled subscription after acquiring the company lease', async () => {
  let claimed = false;
  let applied;
  const db = { from(table) { const filters = {}; return {
    select() { return this; }, eq(key, value) { filters[key] = value; return this; },
    async maybeSingle() {
      if (table === 'stripe_live_event_inbox') return { data: { processing_status: 'pending' } };
      if (table === 'stripe_live_company_state') return { data: { company_id: binding.company_id, subscription_id: 'sub_example' } };
      if (table === 'stripe_live_customers') return { data: binding };
      throw new Error('Unexpected table');
    },
  }; }, async rpc(name, params) {
    if (name === 'claim_stripe_live_company') { claimed = true; return { data: 'lease' }; }
    assert.equal(name, 'apply_stripe_live_effect'); applied = params.p_effect; return { data: 'processed' };
  } };
  const stripe = async (path) => {
    if (path.startsWith('invoices/')) return subscription().latest_invoice;
    assert.equal(claimed, true, 'authoritative snapshot must be fetched inside the lease');
    return { ...subscription(), status: 'canceled' };
  };
  assert.equal(await reconcileLiveReceipt(db, stripe, { account_id: binding.account_id, event_id: 'evt_old',
    event_type: 'invoice.paid', object_id: 'in_old' }, now), 'processed');
  assert.equal(applied.status, 'canceled');
  assert.equal(applied.seats, 0);
});

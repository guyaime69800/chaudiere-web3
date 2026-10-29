import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { seatUpdateParams } from '../server/billing-live-seats.js';
const key = process.env.CARNETPASS_ADMIN_TEST_STRIPE_KEY;
if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key || '')) throw Error('This contract check accepts TEST keys only');
const run = process.env.VERCEL_DEPLOYMENT_ID || randomUUID();
const marker = 'paris2_seat_contract_test_v1';
let subscriptionId;
async function stripe(path, params, method = params ? 'POST' : 'GET', tag = path.replace(/[^a-z0-9]/gi, '-')) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, { method,
    headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': '2026-08-26.dahlia',
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(method !== 'GET' ? { 'Idempotency-Key': `carnetpass-contract-${run}-${tag}` } : {}) },
    body: params ? new URLSearchParams(params) : undefined, signal: AbortSignal.timeout(15000) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw Error(`Stripe TEST contract ${tag}: HTTP ${response.status}, ${result?.error?.code || result?.error?.type || 'unknown'} (${result?.error?.param || 'no parameter'})`);
  assert.notEqual(result?.livemode, true, 'live responses are forbidden'); return result;
}
try {
  const product = await stripe('products', { name: 'CarnetPass — vérification technique TEST des places', 'metadata[carnetpass_contract]': marker }, 'POST', 'product');
  assert.equal(product.livemode, false);
  const basePrice = await stripe('prices', { product: product.id, currency: 'eur', unit_amount: '2800', tax_behavior: 'inclusive',
    'recurring[interval]': 'month', 'metadata[carnetpass_contract]': marker }, 'POST', 'base-price');
  const extraPrice = await stripe('prices', { product: product.id, currency: 'eur', unit_amount: '2000', tax_behavior: 'inclusive',
    'recurring[interval]': 'month', 'metadata[carnetpass_contract]': marker }, 'POST', 'extra-price');
  assert.equal(basePrice.livemode, false); assert.equal(extraPrice.livemode, false);
  const customer = await stripe('customers', { name: 'Client fictif — contrat TEST des places', payment_method: 'pm_card_visa',
    'invoice_settings[default_payment_method]': 'pm_card_visa', 'metadata[carnetpass_contract]': marker }, 'POST', 'customer');
  assert.equal(customer.livemode, false);
  const sub = await stripe('subscriptions', { customer: customer.id, 'items[0][price]': basePrice.id, 'items[0][quantity]': '1',
    'items[1][price]': extraPrice.id, 'items[1][quantity]': '1', payment_behavior: 'error_if_incomplete',
    'expand[0]': 'latest_invoice', 'metadata[carnetpass_contract]': marker }, 'POST', 'subscription');
  subscriptionId = sub.id;
  assert.equal(sub.livemode, false); assert.equal(sub.status, 'active'); assert.equal(sub.latest_invoice.status, 'paid');
  const extra = sub.items.data.find(item => item.price.id === extraPrice.id);
  const base = sub.items.data.find(item => item.price.id === basePrice.id);
  const end = base.current_period_end || sub.current_period_end;
  const prorationDate = Math.floor(Date.now() / 1000);
  const update = seatUpdateParams({ extra }, 2);
  const previewParams = { customer: customer.id, subscription: sub.id,
    'subscription_details[proration_date]': String(prorationDate), 'subscription_details[proration_behavior]': 'always_invoice' };
  for (const [name, value] of Object.entries(update)) if (name.startsWith('items[')) previewParams['subscription_details[' + name.replace('items[', 'items][')] = value;
  const preview = await stripe('invoices/create_preview', previewParams, 'POST', 'preview');
  assert.equal(preview.livemode, false); assert.equal(preview.currency, 'eur'); assert.equal(preview.lines.has_more, false);
  const prorata = preview.lines.data.filter(line => line.parent?.subscription_item_details?.proration === true || line.proration === true)
    .reduce((sum, line) => sum + line.amount, 0);
  assert.ok(Number.isSafeInteger(prorata) && prorata >= 0);
  update.proration_date = String(prorationDate);
  const increased = await stripe(`subscriptions/${sub.id}`, update, 'POST', 'increase');
  assert.equal(increased.livemode, false); assert.equal(increased.items.data.find(item => item.price.id === extraPrice.id).quantity, 2);
  assert.equal(increased.latest_invoice.status, 'paid'); assert.equal(increased.latest_invoice.total, prorata);
  const schedule = await stripe('subscription_schedules', { from_subscription: sub.id }, 'POST', 'schedule-create');
  assert.equal(schedule.livemode, false); assert.equal(schedule.status, 'active');
  const params = { end_behavior: 'release', proration_behavior: 'none', 'metadata[carnetpass_contract]': marker,
    'phases[0][start_date]': String(schedule.current_phase.start_date), 'phases[0][end_date]': String(end),
    'phases[0][proration_behavior]': 'none', 'phases[1][proration_behavior]': 'none',
    'phases[1][duration][interval]': 'month', 'phases[1][duration][interval_count]': '1' };
  for (const phase of [0, 1]) {
    params[`phases[${phase}][items][0][price]`] = basePrice.id; params[`phases[${phase}][items][0][quantity]`] = '1';
    params[`phases[${phase}][items][1][price]`] = extraPrice.id; params[`phases[${phase}][items][1][quantity]`] = phase === 0 ? '2' : '1';
  }
  const scheduled = await stripe(`subscription_schedules/${schedule.id}`, params, 'POST', 'schedule-update');
  assert.equal(scheduled.phases[1].items.find(item => item.price === extraPrice.id).quantity, 1);
  const current = await stripe(`subscriptions/${sub.id}`);
  assert.equal(current.items.data.find(item => item.price.id === extraPrice.id).quantity, 2, 'no immediate reduction');
  assert.equal(current.latest_invoice, increased.latest_invoice.id, 'scheduling creates no new invoice');
  const released = await stripe(`subscription_schedules/${schedule.id}/release`, { preserve_cancel_date: 'false' }, 'POST', 'schedule-release');
  assert.equal(released.status, 'released');
  console.log(JSON.stringify({ stripeSeatContractTest: { mode: 'test', quoteMatchesChargedProrata: true,
    increasePaid: true, reductionScheduledWithoutImmediateCharge: true, reductionReleased: true,
    productionDatabaseContacted: false, realPayment: false } }));
} finally {
  if (subscriptionId) {
    // Only the subscription created in this script is canceled; no customer data is deleted.
    const current = await stripe(`subscriptions/${subscriptionId}`);
    if (current.schedule) {
      const scheduleId = typeof current.schedule === 'string' ? current.schedule : current.schedule.id;
      await stripe(`subscription_schedules/${scheduleId}/release`, { preserve_cancel_date: 'false' }, 'POST', 'cleanup-release');
    }
    const canceled = await stripe(`subscriptions/${subscriptionId}`, null, 'DELETE', 'cleanup-cancel');
    assert.equal(canceled.status, 'canceled'); assert.equal(canceled.livemode, false);
    console.log('Contract TEST subscription canceled: no recurring test billing remains.');
  }
}

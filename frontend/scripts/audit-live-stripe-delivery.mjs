import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { auditProductionCatalog, productionPrices } from '../server/lib/stripe-production-catalog.js';

// Creates one unpublished live Checkout, expires it immediately, and observes Stripe's signed expiration.
// No URL is logged, no card is entered, no customer or subscription is created, no payment is completed.
const env = process.env;
assert.notEqual(env.CARNETPASS_LIVE_BILLING_ENABLED, 'true');
assert.notEqual(env.CARNETPASS_LIVE_SEATS_ENABLED, 'true');
await auditProductionCatalog({ key: env.STRIPE_SECRET_KEY, expectedAccount: env.STRIPE_EXPECTED_ACCOUNT_ID });
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
for (const table of ['stripe_live_customers', 'stripe_live_orders', 'stripe_live_event_inbox']) {
  const result = await db.from(table).select('*', { count: 'exact', head: true });
  if (result.error || result.count !== 0) throw Error('Empty baseline required for the no-payment delivery check');
}
const unsigned = await fetch('https://www.carnetpass.fr/api/stripe-webhook', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
assert.equal(unsigned.status, 400); await unsigned.body?.cancel();
const run = env.VERCEL_DEPLOYMENT_ID || randomUUID();
let sessionId, expired = false;
async function stripe(path, params, tag = 'request') {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, { method: params ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': '2026-08-26.dahlia',
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `carnetpass-delivery-check-${run}-${tag}` } : {}) },
    body: params ? new URLSearchParams(params) : undefined, signal: AbortSignal.timeout(15000) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw Error(`Stripe delivery check HTTP ${response.status} (${result?.error?.code || result?.error?.type || 'unknown'})`);
  assert.notEqual(result?.livemode, false); return result;
}
try {
  const session = await stripe('checkout/sessions', { mode: 'subscription', 'line_items[0][price]': productionPrices.pro.id,
    'line_items[0][quantity]': '1', 'payment_method_types[0]': 'card', 'automatic_tax[enabled]': 'false',
    success_url: 'https://www.carnetpass.fr/parametres-compte?paiement=retour',
    cancel_url: 'https://www.carnetpass.fr/parametres-compte?paiement=annule',
    'metadata[carnetpass_technical_check]': 'webhook_expiration_no_payment_v1' }, 'create');
  assert.match(session.id, /^cs_live_[A-Za-z0-9]+$/); sessionId = session.id;
  assert.equal(session.livemode, true); assert.equal(session.status, 'open');
  assert.equal(session.customer, null); assert.equal(session.subscription, null); assert.equal(session.payment_intent, null);
  const closed = await stripe(`checkout/sessions/${sessionId}/expire`, {}, 'expire');
  assert.equal(closed.status, 'expired'); assert.equal(closed.payment_status, 'unpaid');
  assert.equal(closed.customer, null); assert.equal(closed.subscription, null); expired = true;
  console.log('Unpublished technical Checkout immediately expired: no payment, customer or subscription.');
  let receipt;
  for (let attempt = 0; attempt < 90; attempt++) {
    const result = await db.from('stripe_live_event_inbox').select('event_id,event_type,processing_status,attempt_count')
      .eq('account_id', env.STRIPE_EXPECTED_ACCOUNT_ID).eq('object_id', sessionId).eq('event_type', 'checkout.session.expired').limit(2);
    if (result.error) throw Error('Webhook receipt lookup unavailable');
    assert.ok(result.data.length <= 1);
    if (result.data[0]) { receipt = result.data[0]; break; }
    if (attempt % 15 === 0) console.log('Waiting for Stripe expiration delivery…');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(receipt, 'Stripe expiration was not received; check destination deliveries before opening purchases');
  assert.equal(receipt.processing_status, 'pending'); // No server-created order exists: no entitlement can be granted.
  const cron = await fetch('https://www.carnetpass.fr/api/stripe-webhook?reconcile=1', {
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` }, signal: AbortSignal.timeout(15000) });
  assert.equal(cron.status, 200);
  const batch = await cron.json(); assert.equal(batch.processed, 0); assert.equal(batch.review, 0);
  const updated = await db.from('stripe_live_event_inbox').select('attempt_count,processing_status').eq('event_id', receipt.event_id).single();
  assert.equal(updated.error, null); assert.ok(updated.data.attempt_count >= 1); assert.equal(updated.data.processing_status, 'pending');
  for (const table of ['stripe_live_customers', 'stripe_live_orders', 'stripe_live_credit_purchases']) {
    const result = await db.from(table).select('*', { count: 'exact', head: true });
    assert.equal(result.error, null); assert.equal(result.count, 0);
  }
  console.log(JSON.stringify({ liveStripeDelivery: { authenticStripeExpirationReceived: true, signedProductionEndpoint: true,
    durableReceipt: true, cronRetryVerified: true, entitlementsGranted: false, realPayment: false,
    technicalEventId: receipt.event_id, technicalSessionId: sessionId } }));
} finally {
  if (sessionId && !expired) {
    const current = await stripe(`checkout/sessions/${sessionId}`);
    if (current.status === 'open') {
      const closed = await stripe(`checkout/sessions/${sessionId}/expire`, {}, 'expire');
      assert.equal(closed.status, 'expired');
    }
  }
}

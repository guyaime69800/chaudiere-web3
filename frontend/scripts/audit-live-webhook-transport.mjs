import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const origin = new URL(process.env.CARNETPASS_WEBHOOK_AUDIT_ORIGIN);
assert.equal(origin.protocol, 'https:');
assert.match(origin.hostname, /^carnetpass-[a-z0-9]+-chaudiere-web3\.vercel\.app$/);
assert.ok(!origin.port && !origin.username && !origin.password && origin.pathname === '/');
const env = process.env;
assert.match(env.STRIPE_LIVE_WEBHOOK_SECRET || '', /^whsec_[A-Za-z0-9]+$/);
assert.ok(env.CRON_SECRET);
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
for (const table of ['stripe_live_event_inbox', 'stripe_live_customers', 'stripe_live_orders']) {
  const result = await db.from(table).select('*', { count: 'exact', head: true });
  if (result.error || result.count !== 0) throw Error('Empty live billing baseline required for transport verification');
}
async function post(body, { signed = true, timestamp = Math.floor(Date.now() / 1000), alter = false } = {}) {
  const raw = JSON.stringify(body);
  const signature = createHmac('sha256', env.STRIPE_LIVE_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest('hex');
  const response = await fetch(new URL('/api/stripe-webhook', origin), { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(signed ? { 'Stripe-Signature': `t=${timestamp},v1=${signature}` } : {}) },
    body: alter ? raw + ' ' : raw, signal: AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json() };
}
const event = { id: 'evt_CarnetPassTransport' + randomUUID().replaceAll('-', ''), object: 'event', livemode: true,
  created: Math.floor(Date.now() / 1000), type: 'carnetpass.transport_check', data: { object: { id: 'technical_transport_probe' } } };
assert.equal((await post(event, { signed: false })).status, 400);
assert.equal((await post(event, { alter: true })).status, 400);
assert.equal((await post(event, { timestamp: Math.floor(Date.now() / 1000) - 600 })).status, 400);
assert.equal((await post({ ...event, livemode: false })).status, 400);
assert.equal((await post({ ...event, account: 'acct_CarnetPassForeignProbe' })).status, 400);
const accepted = await post(event);
assert.equal(accepted.status, 200); assert.equal(accepted.body.code, 'EVENT_IGNORED');
const unauthorized = await fetch(new URL('/api/stripe-webhook?reconcile=1', origin));
assert.equal(unauthorized.status, 401); await unauthorized.body?.cancel();
const cron = await fetch(new URL('/api/stripe-webhook?reconcile=1', origin), {
  headers: { Authorization: `Bearer ${env.CRON_SECRET}` }, signal: AbortSignal.timeout(15000) });
assert.equal(cron.status, 200); assert.deepEqual(await cron.json(), { ok: true, processed: 0, review: 0, deferred: 0 });
const after = await db.from('stripe_live_event_inbox').select('*', { count: 'exact', head: true });
assert.equal(after.error, null); assert.equal(after.count, 0);
console.log(JSON.stringify({ liveWebhookTransport: { signedRawBodyAccepted: true, tamperingAndStaleAndTestAndForeignRejected: true,
  cronAuthenticated: true, emptyQueueProcessed: true, receiptCreated: false, realPayment: false } }));

import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHmac } from 'node:crypto';
import { createLiveWebhookHandler, verifyLiveStripeEvent, liveEventReceipt } from './stripe-live-webhook.js';

const now = 1792512000000;
const secret = 'whsec_fake';
const account = 'acct_expected';
const env = { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main',
  VITE_SUPABASE_URL: 'https://tsyukqcyfxcrjrhopvpv.supabase.co',
  CARNETPASS_STRIPE_LIVE_WEBHOOK_ENABLED: 'true', STRIPE_LIVE_WEBHOOK_SECRET: secret,
  STRIPE_EXPECTED_ACCOUNT_ID: account, SUPABASE_SECRET_KEY: 'fake' };
const event = { object: 'event', id: 'evt_example', livemode: true, created: now / 1000,
  type: 'invoice.paid', api_version: 'version', data: { object: { id: 'in_example', customer_email: 'private@example.invalid' } } };
function signature(raw, timestamp = now / 1000) {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex')}`;
}
async function call({ body = event, config = env, db = async () => ({ rpc: async () => ({ data: 'recorded' }) }), sig, method = 'POST', query, authorization, processReceipt, runBatch } = {}) {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const req = Readable.from([raw]);
  req.method = method;
  req.headers = { 'stripe-signature': sig ?? signature(raw) };
  req.query = query;
  if (authorization) req.headers.authorization = authorization;
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } };
  await createLiveWebhookHandler({ env: config, database: db, processReceipt, runBatch, now: () => now })(req, res);
  return res;
}

test('signed live event is durably acknowledged and private payload is not stored', async () => {
  let receipt;
  const res = await call({ db: async () => ({ rpc: async (name, input) => {
    assert.equal(name, 'record_stripe_live_event'); receipt = input.receipt; return { data: 'recorded' };
  } }) });
  assert.equal(res.statusCode, 200);
  assert.equal(receipt.object_id, 'in_example');
  assert.ok(!JSON.stringify(receipt).includes('private@'));
});

test('processing remains separately gated and a processing failure requests a retry after durable receipt', async () => {
  let calls = 0;
  const processReceipt = async () => { calls++; throw new Error('private'); };
  assert.equal((await call({ processReceipt })).statusCode, 200);
  assert.equal(calls, 0);
  assert.equal((await call({ config: { ...env, CARNETPASS_STRIPE_LIVE_PROCESSING_ENABLED: 'true' }, processReceipt })).statusCode, 503);
  assert.equal(calls, 1);
});

test('cron requires its own exact bearer, GET and enabled processing', async () => {
  const config = { ...env, CRON_SECRET: 'cron-private', CARNETPASS_STRIPE_LIVE_PROCESSING_ENABLED: 'true' };
  const common = { config, query: { reconcile: '1' }, method: 'GET', runBatch: async () => ({ processed: 0 }) };
  assert.equal((await call(common)).statusCode, 401);
  assert.equal((await call({ ...common, authorization: 'Bearer wrong' })).statusCode, 401);
  assert.equal((await call({ ...common, authorization: 'Bearer cron-private' })).statusCode, 200);
  assert.equal((await call({ ...common, method: 'POST', authorization: 'Bearer cron-private' })).statusCode, 405);
});

test('retries acknowledge duplicate without granting rights', async () => {
  const res = await call({ db: async () => ({ rpc: async () => ({ data: 'duplicate' }) }) });
  assert.equal(res.body.code, 'EVENT_ALREADY_RECORDED');
});

test('database failures are retried by Stripe rather than acknowledged', async () => {
  for (const db of [async () => { throw new Error('private'); },
    async () => ({ rpc: async () => ({ error: { message: 'private' } }) }),
    async () => ({ rpc: async () => ({ data: null }) })]) {
    const res = await call({ db });
    assert.equal(res.statusCode, 503);
    assert.ok(!JSON.stringify(res.body).includes('private'));
  }
});

test('invalid signatures, stale timestamps, test events and foreign accounts cannot access database', async () => {
  let calls = 0;
  const db = async () => { calls++; throw new Error('must not run'); };
  for (const options of [{ sig: 't=123,v1=bad' }, { sig: signature(Buffer.from(JSON.stringify(event)), now / 1000 - 301) },
    { body: { ...event, livemode: false } }, { body: { ...event, account: 'acct_other' } },
    { body: { ...event, context: 'connected_account_context' } }, { body: Buffer.alloc(262145) }]) {
    assert.equal((await call({ ...options, db })).statusCode, 400);
  }
  assert.equal(calls, 0);
});

test('disabled, preview and wrong database environments fail closed', async () => {
  for (const patch of [{ CARNETPASS_STRIPE_LIVE_WEBHOOK_ENABLED: '' }, { VERCEL_ENV: 'preview' },
    { VERCEL_GIT_COMMIT_REF: 'other' }, { VITE_SUPABASE_URL: 'https://preview.supabase.co' }, { STRIPE_LIVE_WEBHOOK_SECRET: '' }]) {
    assert.equal((await call({ config: { ...env, ...patch } })).statusCode, 503);
  }
  assert.equal((await call({ method: 'GET' })).statusCode, 405);
});

test('signature rotation accepts a matching v1; altered body and duplicate timestamps are rejected', () => {
  const raw = Buffer.from(JSON.stringify(event));
  assert.equal(verifyLiveStripeEvent(raw, `${signature(raw)},v1=${'0'.repeat(64)}`, secret, account, now).id, event.id);
  assert.throws(() => verifyLiveStripeEvent(Buffer.from('{}'), signature(raw), secret, account, now));
  assert.throws(() => verifyLiveStripeEvent(raw, `${signature(raw)},t=${now / 1000}`, secret, account, now));
});

test('unknown signed events are ignored, supported events always retain stable receipt identity', async () => {
  assert.equal((await call({ body: { ...event, type: 'unknown.event' } })).body.code, 'EVENT_IGNORED');
  assert.deepEqual(liveEventReceipt(event, account), liveEventReceipt(event, account));
});

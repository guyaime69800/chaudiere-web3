import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveSeatsHandler } from './billing-live-seats.js';
import { productionPrices } from './lib/stripe-production-catalog.js';
import { COMMERCIAL_TERMS_VERSION } from '../shared/commercial-terms.js';

const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const colleague = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const changeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const env = { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main', VITE_SUPABASE_URL: 'https://tsyukqcyfxcrjrhopvpv.supabase.co',
  SUPABASE_SECRET_KEY: 'private', VITE_SUPABASE_PUBLISHABLE_KEY: 'public', STRIPE_SECRET_KEY: 'rk_live_private',
  STRIPE_LIVE_WEBHOOK_SECRET: 'whsec_private', STRIPE_EXPECTED_ACCOUNT_ID: 'acct_expected',
  CARNETPASS_LIVE_BILLING_ENABLED: 'true', CARNETPASS_STRIPE_LIVE_WEBHOOK_ENABLED: 'true',
  CARNETPASS_STRIPE_LIVE_PROCESSING_ENABLED: 'true', CARNETPASS_LIVE_SEATS_ENABLED: 'true' };
const terms = { accepted: true, version: COMMERCIAL_TERMS_VERSION };
function price(name) { const config = productionPrices[name]; return { id: config.id, active: true, livemode: true, currency: 'eur',
  unit_amount: config.amount, type: 'recurring', billing_scheme: 'per_unit', tax_behavior: 'unspecified',
  recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' }, metadata: name === 'additionalAccount' ? { carnetpass_additional_accounts: 'v1' } : {},
  product: { id: 'prod_expected', active: true, livemode: true } }; }
function fixture({ quantity = 0, role = 'admin' } = {}) {
  const end = Math.floor(Date.now() / 1000) + 86400 * 15;
  const store = {
    company_members: [{ company_id: 'company', user_id: actor, role }],
    subscriptions: [{ company_id: 'company', plan: 'pro', status: 'active', stripe_live_managed: true, current_period_end: new Date(end * 1000).toISOString() }],
    stripe_live_customers: [{ company_id: 'company', customer_id: 'cus_expected', account_id: 'acct_expected' }],
    stripe_live_company_state: [{ company_id: 'company', subscription_id: 'sub_expected' }],
    stripe_live_seat_changes: [], pro_account_assignments: [{ company_id: 'company', user_id: colleague }],
  };
  const db = { from(table) {
    const filters = []; let mode = 'select', payload;
    const query = { select() { return this; }, eq(key, value) { filters.push(row => row[key] === value); return this; },
      in(key, values) { filters.push(row => values.includes(row[key])); return this; }, limit() { return this; },
      update(data) { mode = 'update'; payload = data; return this; }, insert(data) { mode = 'insert'; payload = data; return this; },
      async execute(single) {
        const rows = store[table].filter(row => filters.every(check => check(row)));
        if (mode === 'insert') { store[table].push(structuredClone(payload)); return { data: null }; }
        if (mode === 'update') { rows.forEach(row => Object.assign(row, payload)); return { data: null }; }
        return { data: structuredClone(single ? rows[0] || null : rows) };
      }, maybeSingle() { return this.execute(true); }, then(resolve, reject) { return this.execute(false).then(resolve, reject); } };
    return query;
  }, rpc: async () => ({ data: 'lease' }) };
  const auth = { auth: { getUser: async () => ({ data: { user: { id: actor, email_confirmed_at: '2026-10-21', factors: [{ status: 'verified' }] } } }) } };
  const sub = { id: 'sub_expected', customer: 'cus_expected', status: 'active', livemode: true, collection_method: 'charge_automatically',
    items: { has_more: false, data: [{ id: 'si_base', quantity: 1, price: price('pro'), current_period_end: end }] } };
  if (quantity) sub.items.data.push({ id: 'si_extra', quantity, price: price('additionalAccount'), current_period_end: end });
  let previewAmount = 1000;
  const posts = [];
  const schedule = { id: 'sub_sched_owned', livemode: true, customer: 'cus_expected', subscription: sub.id, status: 'active',
    current_phase: { start_date: end - 86400 * 30 }, metadata: {} };
  const request = async (url, init) => {
    const path = url.replace('https://api.stripe.com/v1/', '');
    const params = init.body ? Object.fromEntries(init.body) : null;
    if (params) posts.push({ path, params, key: init.headers['Idempotency-Key'] });
    if (path === 'account') return Response.json({ id: 'acct_expected' });
    if (path.startsWith('subscriptions/sub_expected?')) return Response.json(sub);
    if (path === 'customers/cus_expected') return Response.json({ id: 'cus_expected', livemode: true, balance: 0 });
    if (path === 'invoices/create_preview') return Response.json({ customer: 'cus_expected', livemode: true, currency: 'eur',
      lines: { has_more: false, data: [{ amount: previewAmount, pricing: { price_details: { price: productionPrices.additionalAccount.id } }, parent: { subscription_item_details: { proration: true } } }] } });
    if (path === 'subscriptions/sub_expected') {
      assert.equal(store.stripe_live_seat_changes[0].status, 'applying', 'persist consent and operation before charge');
      assert.ok(store.stripe_live_seat_changes[0].accepted_at);
      return Response.json({ ...sub, latest_invoice: { id: 'in_expected' } });
    }
    if (path === 'invoices/in_expected') return Response.json({ livemode: true, customer: 'cus_expected', hosted_invoice_url: 'https://invoice.stripe.com/owned' });
    if (path === 'subscription_schedules') { sub.schedule = schedule.id; return Response.json(schedule); }
    if (path === 'subscription_schedules/sub_sched_owned/release') return Response.json({ ...schedule, status: 'released' });
    if (path === 'subscription_schedules/sub_sched_owned') { if (params) schedule.metadata.carnetpass_seat_change = params['metadata[carnetpass_seat_change]']; return Response.json(schedule); }
    throw Error('Unexpected request ' + path);
  };
  const handler = createLiveSeatsHandler({ env, clientFactory: (_, key) => key === 'public' ? auth : db, request, rateLimiter: async () => {} });
  async function call(action, body) {
    const jwt = 'a.' + Buffer.from(JSON.stringify({ sub: actor, aal: 'aal2' })).toString('base64url') + '.b';
    const res = { setHeader() {}, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    await handler({ method: action === 'additional-status' ? 'GET' : 'POST', query: { action }, headers: { authorization: 'Bearer ' + jwt },
      body: { requestId: changeId, terms, ...body } }, res); return res;
  }
  return { call, store, sub, posts, changeAmount(value) { previewAmount = value; } };
}
test('seat changes fail closed without the dedicated switch', async () => {
  const handler = createLiveSeatsHandler({ env: { ...env, CARNETPASS_LIVE_SEATS_ENABLED: '' }, clientFactory() { throw Error('No database access expected'); } });
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json() {} };
  await handler({ method: 'POST' }, res); assert.equal(res.code, 503);
});
test('seat increase displays the real prorata before charging, persists consent and reuses the invoice', async () => {
  const f = fixture();
  const quote = await f.call('additional-quote', { quantity: 2 });
  assert.equal(quote.statusCode, 200); assert.equal(quote.body.quote.immediateAmountCents, 1000);
  assert.equal(f.posts.filter(row => row.path.startsWith('subscriptions/')).length, 0);
  assert.equal((await f.call('additional-update', { terms: { accepted: false } })).statusCode, 400);
  const applied = await f.call('additional-update'); assert.equal(applied.statusCode, 200); assert.equal(applied.body.url, 'https://invoice.stripe.com/owned');
  assert.equal((await f.call('additional-update')).statusCode, 200);
  const updates = f.posts.filter(row => row.path === 'subscriptions/sub_expected');
  assert.equal(updates.length, 1); assert.equal(updates[0].params.payment_behavior, 'pending_if_incomplete');
  assert.equal(updates[0].params['items[0][quantity]'], '2');
  assert.equal(f.store.stripe_live_seat_changes[0].status, 'awaiting_payment', 'no direct capacity grant');
});
test('changed amount, foreign colleagues and a technician are refused before financial writes', async () => {
  const f = fixture(); await f.call('additional-quote', { quantity: 2 }); f.changeAmount(1001);
  assert.equal((await f.call('additional-update')).statusCode, 409);
  assert.equal(f.posts.filter(row => row.path === 'subscriptions/sub_expected').length, 0);
  const reduced = fixture({ quantity: 2 });
  assert.equal((await reduced.call('additional-quote', { quantity: 1, retainedMembers: [actor] })).statusCode, 409);
  const technician = fixture({ role: 'technician' }); assert.equal((await technician.call('additional-quote', { quantity: 1 })).statusCode, 403);
});
test('reduction schedules the next paid phase with no immediate change; it can be canceled', async () => {
  const f = fixture({ quantity: 2 });
  assert.equal((await f.call('additional-quote', { quantity: 1, retainedMembers: [colleague] })).body.quote.immediateAmountCents, 0);
  const result = await f.call('additional-update'); assert.equal(result.statusCode, 200); assert.equal(result.body.change.status, 'scheduled');
  assert.equal(f.posts.filter(row => row.path === 'subscriptions/sub_expected').length, 0);
  const schedule = f.posts.find(row => row.path === 'subscription_schedules/sub_sched_owned');
  assert.equal(schedule.params['phases[0][items][1][quantity]'], '2');
  assert.equal(schedule.params['phases[1][items][1][quantity]'], '1');
  assert.equal(schedule.params.proration_behavior, 'none');
  assert.equal((await f.call('additional-cancel')).statusCode, 200);
  assert.equal(f.store.stripe_live_seat_changes[0].status, 'canceled');
});

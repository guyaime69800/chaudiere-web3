import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveBillingHandler, liveCheckoutEnabled } from './billing-live.js';
import { COMMERCIAL_TERMS_VERSION } from '../shared/commercial-terms.js';
import { productionPrices } from './lib/stripe-production-catalog.js';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const requestId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const env = { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main', VITE_SUPABASE_URL: 'https://tsyukqcyfxcrjrhopvpv.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'public', SUPABASE_SECRET_KEY: 'private', STRIPE_SECRET_KEY: 'rk_live_private',
  STRIPE_EXPECTED_ACCOUNT_ID: 'acct_expected', STRIPE_LIVE_WEBHOOK_SECRET: 'whsec_private',
  CARNETPASS_LIVE_BILLING_ENABLED: 'true', CARNETPASS_STRIPE_LIVE_PROCESSING_ENABLED: 'true', CARNETPASS_STRIPE_LIVE_WEBHOOK_ENABLED: 'true' };
function fixture({ role = 'admin', approved = true, saveFailure = false, canceledPrevious = false, oldStripeStatus = 'canceled' } = {}) {
  const store = {
    company_members: [{ company_id: 'company', user_id: userId, role }],
    companies: [{ id: 'company', siret: '12345678901234', is_demo: false,
      company_verifications: { status: approved ? 'approved' : 'pending', verified_siret: '12345678901234', verified_at: '2026-10-21' } }],
    subscriptions: [{ company_id: 'company', plan: 'free', status: 'active' }],
    stripe_live_customers: [{ company_id: 'company', customer_id: 'cus_expected', account_id: 'acct_expected' }],
    stripe_live_company_state: [{ company_id: 'company', subscription_id: null }], stripe_live_orders: [],
  };
  if (canceledPrevious) {
    store.subscriptions[0] = { company_id: 'company', plan: 'pro', status: 'canceled', stripe_live_managed: true };
    store.stripe_live_company_state[0].subscription_id = 'sub_old';
    store.stripe_live_orders.push({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', company_id: 'company', user_id: userId, kind: 'pro', session_id: 'cs_live_old' });
  }
  let failSave = saveFailure;
  const database = {
    from(table) {
      const filters = [];
      let mode = 'select', payload, max;
      const query = { select() { return this; }, eq(key, value) { filters.push((row) => row[key] === value); return this; },
        order() { return this; }, limit(n) { max = n; return this; },
        insert(data) { mode = 'insert'; payload = data; return this; },
        update(data) { mode = 'update'; payload = data; return this; },
        async execute(single) {
          const rows = (store[table] || []).filter((row) => filters.every((f) => f(row)));
          if (mode === 'insert') {
            store[table].push({ ...payload, created_at: '2026-10-21T12:00:00Z' }); return { data: null };
          }
          if (mode === 'update') {
            if (table === 'stripe_live_orders' && failSave) { failSave = false; return { error: { message: 'write failure' } }; }
            rows.forEach((row) => Object.assign(row, payload)); return { data: null };
          }
          return { data: single ? rows[0] || null : rows.slice(0, max || rows.length) };
        },
        maybeSingle() { return this.execute(true); },
        then(resolve, reject) { return this.execute(false).then(resolve, reject); },
      };
      return query;
    },
    rpc: async () => ({ data: 'lease' }),
  };
  const auth = { auth: { getUser: async () => ({ data: { user: { id: userId, email_confirmed_at: '2026-10-21', factors: [{ status: 'verified' }] } } }) } };
  const posts = [];
  const session = { id: 'cs_live_example', livemode: true, customer: 'cus_expected', status: 'open', url: 'https://checkout.stripe.com/c/pay/example' };
  const request = async (url, init) => {
    let result;
    if (url.endsWith('/account')) result = { id: 'acct_expected', charges_enabled: true, payouts_enabled: true };
    else if (url.includes('/prices/')) result = { id: productionPrices.pro.id, livemode: true, active: true,
      currency: 'eur', unit_amount: 2800, billing_scheme: 'per_unit', type: 'recurring', tax_behavior: 'unspecified',
      recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' }, product: { active: true, livemode: true } };
    else if (url.endsWith('/checkout/sessions') && init.method === 'POST') {
      assert.ok(store.stripe_live_orders.some(row => row.id === requestId), 'order must be durable before Stripe creation');
      posts.push(init); result = session;
    } else if (url.endsWith('/checkout/sessions/cs_live_example')) result = session;
    else if (url.endsWith('/subscriptions/sub_old')) result = { id: 'sub_old', livemode: true, customer: 'cus_expected', status: oldStripeStatus };
    else if (url.endsWith('/checkout/sessions/cs_live_old')) result = { id: 'cs_live_old', livemode: true, customer: 'cus_expected', status: 'complete', subscription: 'sub_old' };
    else throw new Error('Unexpected Stripe request');
    return { ok: true, json: async () => result };
  };
  const handler = createLiveBillingHandler({ env, clientFactory: (_, key) => key === 'public' ? auth : database,
    request, rateLimiter: async () => {} });
  async function call(body = {}) {
    const claims = Buffer.from(JSON.stringify({ sub: userId, aal: 'aal2' })).toString('base64url');
    const req = { method: 'POST', headers: { authorization: `Bearer x.${claims}.x` }, body: {
      action: 'checkout', plan: 'pro', requestId, terms: { accepted: true, version: COMMERCIAL_TERMS_VERSION }, ...body,
    } };
    const res = { setHeader() {}, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
    await handler(req, res); return res;
  }
  return { store, posts, call, session };
}

test('live checkout is closed unless all three independent switches and production configuration agree', async () => {
  for (const field of ['CARNETPASS_LIVE_BILLING_ENABLED', 'CARNETPASS_STRIPE_LIVE_PROCESSING_ENABLED', 'CARNETPASS_STRIPE_LIVE_WEBHOOK_ENABLED']) {
    assert.equal(liveCheckoutEnabled({ ...env, [field]: 'false' }), false);
  }
  let called = false;
  const handler = createLiveBillingHandler({ env: { ...env, CARNETPASS_LIVE_BILLING_ENABLED: '' }, request: () => { called = true; } });
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json() {} };
  await handler({ method: 'POST' }, res);
  assert.equal(res.code, 503); assert.equal(called, false);
});

test('unverified company and technician cannot start a Pro purchase', async () => {
  for (const settings of [{ role: 'technician' }, { approved: false }]) {
    const f = fixture(settings); assert.equal((await f.call()).statusCode, 403); assert.equal(f.posts.length, 0);
  }
});

test('purchase availability is server-controlled and reveals no customer data', async () => {
  for (const enabled of [false, true]) {
    const handler = createLiveBillingHandler({ env: { ...env, CARNETPASS_LIVE_BILLING_ENABLED: String(enabled) }, clientFactory() { throw Error('status must not access customer data'); } });
    const res = { setHeader() {}, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } };
    await handler({ method: 'GET', query: { action: 'purchase-status' } }, res);
    assert.equal(res.code, 200); assert.equal(res.body.available, enabled); assert.equal(res.body.seatsAvailable, false);
  }
});

test('a reused Checkout URL still requires the stored live customer and fixed Stripe host', async () => {
  const f = fixture(); await f.call(); f.session.url = 'https://attacker.invalid/';
  assert.equal((await f.call()).statusCode, 503);
  f.session.url = 'https://checkout.stripe.com/valid'; f.session.customer = 'cus_foreign';
  assert.equal((await f.call()).statusCode, 503);
});

test('new Pro checkout requires both local and Stripe confirmation of the old cancellation', async () => {
  const closed = fixture({ canceledPrevious: true });
  assert.equal((await closed.call()).statusCode, 200); assert.equal(closed.posts.length, 1);
  const stillActive = fixture({ canceledPrevious: true, oldStripeStatus: 'active' });
  assert.equal((await stillActive.call()).statusCode, 409); assert.equal(stillActive.posts.length, 0);
});

test('Checkout creation stores its order first, uses one stable idempotency key and reuses the open session', async () => {
  const f = fixture();
  assert.equal((await f.call()).statusCode, 200);
  assert.equal((await f.call()).statusCode, 200);
  assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].headers['Idempotency-Key'], `carnetpass-live-order-${requestId}`);
  assert.equal(f.store.stripe_live_orders[0].session_id, 'cs_live_example');
  assert.equal(f.posts[0].body.get('metadata[carnetpass_order_id]'), requestId);
  assert.equal(f.posts[0].body.get('line_items[0][price]'), productionPrices.pro.id);
});

test('retry after persistence failure reuses the same Stripe idempotency key', async () => {
  const f = fixture({ saveFailure: true });
  assert.equal((await f.call()).statusCode, 503);
  assert.equal((await f.call()).statusCode, 200);
  assert.equal(f.posts.length, 2);
  assert.equal(f.posts[0].headers['Idempotency-Key'], f.posts[1].headers['Idempotency-Key']);
  assert.equal(f.store.stripe_live_orders.length, 1);
});

test('terms and malformed request identifiers are rejected before any Stripe call', async () => {
  const f = fixture();
  assert.equal((await f.call({ terms: { accepted: false } })).statusCode, 400);
  assert.equal((await f.call({ requestId: 'invalid' })).statusCode, 400);
  assert.equal(f.posts.length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivePortalHandler, livePortalEnabled, validatePortalConfiguration } from './billing-live-portal.js';

const env = { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main', VITE_SUPABASE_URL: 'https://tsyukqcyfxcrjrhopvpv.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'public', SUPABASE_SECRET_KEY: 'private', STRIPE_SECRET_KEY: 'rk_live_private',
  STRIPE_EXPECTED_ACCOUNT_ID: 'acct_expected', STRIPE_LIVE_WEBHOOK_SECRET: 'whsec_private',
  CARNETPASS_STRIPE_LIVE_PORTAL_ENABLED: 'true', CARNETPASS_STRIPE_LIVE_PROCESSING_ENABLED: 'true', CARNETPASS_STRIPE_LIVE_WEBHOOK_ENABLED: 'true' };
const configuration = { id: 'bpc_default', active: true, is_default: true, livemode: true,
  default_return_url: 'https://www.carnetpass.fr/parametres-compte', login_page: { enabled: false },
  features: { invoice_history: { enabled: true }, payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end' }, subscription_update: { enabled: false } } };
test('portal has its own closed gate and requires working reconciliation', () => {
  assert.equal(livePortalEnabled(env), true);
  assert.equal(livePortalEnabled({ ...env, CARNETPASS_STRIPE_LIVE_PORTAL_ENABLED: '' }), false);
  assert.equal(livePortalEnabled({ ...env, CARNETPASS_STRIPE_LIVE_PROCESSING_ENABLED: '' }), false);
  assert.equal(livePortalEnabled({ ...env, VERCEL_ENV: 'preview' }), false);
  assert.throws(() => validatePortalConfiguration({ ...configuration, features: { ...configuration.features, subscription_cancel: { enabled: true, mode: 'immediately' } } }));
});
test('portal binds the verified responsible user to the stored company customer', async () => {
  let role = 'owner', customer = 'cus_owned', customerMode = true, target = 'https://billing.stripe.com/p/session/test';
  const calls = [];
  const handler = createLivePortalHandler({ env, clientFactory(_url, key) {
    if (key === 'public') return { auth: { getUser: async () => ({ data: { user: { id: 'user', email_confirmed_at: '2026-01-01' } } }) } };
    return { from(table) { return { select() { return this; }, eq(field, value) {
      assert.equal(value, field === 'user_id' ? 'user' : 'company'); return this;
    }, limit: async () => ({ data: [{ company_id: 'company', role }] }),
    maybeSingle: async () => ({ data: table === 'platform_admins' ? null : { account_id: 'acct_expected', customer_id: customer } }) }; } };
  }, async request(url, options) {
    const path = url.replace('https://api.stripe.com/v1/', ''); calls.push(path);
    if (path === 'account') return Response.json({ id: 'acct_expected' });
    if (path === 'customers/cus_owned') return Response.json({ id: customer, livemode: customerMode });
    if (path.startsWith('billing_portal/configurations?')) return Response.json({ data: [configuration] });
    assert.equal(path, 'billing_portal/sessions');
    assert.equal(options.body.get('customer'), 'cus_owned');
    assert.equal(options.body.get('return_url'), configuration.default_return_url);
    return Response.json({ customer, livemode: true, configuration: configuration.id, url: target });
  } });
  async function run(action = 'portal', auth = true) {
    const token = `header.${Buffer.from(JSON.stringify({ sub: 'user', aal: 'aal2' })).toString('base64url')}.signature`;
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ method: action === 'portal-status' ? 'GET' : 'POST', query: { action, customer: 'cus_foreign' },
      headers: auth ? { authorization: `Bearer ${token}` } : {} }, res); return res;
  }
  assert.equal((await run('portal', false)).code, 401);
  role = 'technician'; assert.equal((await run()).code, 403); assert.equal(calls.length, 0);
  role = 'owner'; customer = null; assert.deepEqual((await run('portal-status')).body, { available: false });
  customer = 'cus_owned'; assert.equal((await run()).code, 200);
  assert.equal(calls.filter((path) => path === 'billing_portal/sessions').length, 1);
  customerMode = false; assert.equal((await run()).code, 503);
  customerMode = true; target = 'https://attacker.example/session'; assert.equal((await run()).code, 503);
});

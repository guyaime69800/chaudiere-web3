import test from 'node:test';
import assert from 'node:assert/strict';
import { testStripeAction, verifyTestPrice } from './admin-test-stripe.js';
import { COMMERCIAL_TERMS_VERSION } from '../../shared/commercial-terms.js';
const marker = 'paris2_admin_test_v1';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const price = { id: 'price_test', active: true, livemode: false, lookup_key: 'carnetpass_paris2_admin_test_pro_v1', metadata: { carnetpass_admin_test: marker },
  currency: 'eur', unit_amount: 2800, recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } };
test('live keys and live price responses are refused before a test payment', async () => {
  let called = false;
  await assert.rejects(testStripeAction({ action: 'checkout' }, { env: { CARNETPASS_ADMIN_TEST_STRIPE_KEY: 'sk_live_fake' },
    command: async () => { called = true; }, request: async () => { called = true; } }));
  assert.equal(called, false);
  assert.throws(() => verifyTestPrice({ ...price, livemode: true }));
});
test('test checkout persists binding and idempotency before Stripe, then scopes paid rights and portal', async () => {
  let state = {}, paid = false, canceled = false, scopeMismatch = false, foreignUrl = false, flexibleCancellation = false;
  const calls = [];
  const command = async (action, token, data) => {
    calls.push(action);
    if (action === 'claim_billing') return { token: requestId, workspaceId, data: state };
    if (action === 'save_billing') { assert.equal(token, requestId); state = { ...data }; }
  };
  const env = { CARNETPASS_ADMIN_TEST_STRIPE_KEY: 'sk_test_fake' };
  const metadata = { carnetpass_admin_test: marker, workspace_id: workspaceId };
  const request = async (url, options) => {
    const path = url.replace('https://api.stripe.com/v1/', ''); calls.push(path);
    assert.equal(options.headers.Authorization, 'Bearer sk_test_fake');
    if (path === 'account') return Response.json({ id: 'acct_test' });
    if (path.startsWith('prices?')) return Response.json({ data: [price] });
    if (path === 'customers') return Response.json({ id: 'cus_test', livemode: false });
    if (path === 'checkout/sessions') {
      assert.equal(state.customerId, 'cus_test'); assert.equal(state.pendingRequest, requestId);
      assert.equal(options.headers['Idempotency-Key'], `carnetpass-test-checkout-${workspaceId}-${requestId}`);
      return Response.json({ id: 'cs_test_owned', customer: 'cus_test', livemode: false, url: 'https://checkout.stripe.com/test' });
    }
    if (path === 'checkout/sessions/cs_test_owned') return Response.json({ id: 'cs_test_owned', customer: scopeMismatch ? 'cus_foreign' : 'cus_test', livemode: false, metadata,
      mode: 'subscription', status: paid ? 'complete' : 'open', payment_status: paid ? 'paid' : 'unpaid', amount_total: 2800, currency: 'eur', subscription: paid ? 'sub_test' : null,
      url: 'https://checkout.stripe.com/test' });
    if (path.startsWith('subscriptions/sub_test')) return Response.json({ id: 'sub_test', customer: 'cus_test', livemode: false, metadata, status: canceled ? 'canceled' : 'active',
      items: { data: [{ quantity: 1, price, current_period_end: Math.floor(Date.now() / 1000) + 86400 }] },
      latest_invoice: { customer: 'cus_test', livemode: false, status: 'paid', amount_paid: 2800, currency: 'eur' },
      cancel_at_period_end: !flexibleCancellation, cancel_at: flexibleCancellation ? Math.floor(Date.now() / 1000) + 86400 : null });
    if (path === 'customers/cus_test') return Response.json({ id: 'cus_test', livemode: false, metadata });
    if (path.startsWith('billing_portal/configurations?')) return Response.json({ data: [{ id: 'bpc_test', active: true, livemode: false, metadata: { carnetpass_admin_test: marker },
      default_return_url: 'https://www.carnetpass.fr/retour-facturation?test=1', features: { subscription_cancel: { mode: 'at_period_end', enabled: true }, subscription_update: { enabled: false } } }] });
    if (path === 'billing_portal/sessions') return Response.json({ customer: 'cus_test', livemode: false, configuration: 'bpc_test', url: foreignUrl ? 'https://attacker.invalid' : 'https://billing.stripe.com/test' });
    throw Error('Unexpected Stripe request');
  };
  const run = body => testStripeAction(body, { command, env, user: { email: 'founder@example.invalid' }, request });
  assert.equal((await run({ action: 'checkout', requestId, terms: { accepted: true, version: COMMERCIAL_TERMS_VERSION } })).url, 'https://checkout.stripe.com/test');
  await run({ action: 'sync-billing' }); assert.equal(state.status, 'pending');
  paid = true; await run({ action: 'sync-billing' }); assert.equal(state.status, 'active'); assert.equal(state.cancelAtPeriodEnd, true);
  flexibleCancellation = true; await run({ action: 'sync-billing' }); assert.equal(state.status, 'active'); assert.equal(state.cancelAtPeriodEnd, true);
  assert.equal((await run({ action: 'portal' })).url, 'https://billing.stripe.com/test');
  canceled = true; await run({ action: 'sync-billing' }); assert.equal(state.status, 'canceled'); assert.equal(state.cancelAtPeriodEnd, false);
  scopeMismatch = true; await assert.rejects(run({ action: 'sync-billing' })); scopeMismatch = false;
  foreignUrl = true; await assert.rejects(run({ action: 'portal' }));
  assert.equal(calls.at(-1), 'release_billing');
});

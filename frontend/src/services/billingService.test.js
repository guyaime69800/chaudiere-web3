import test from 'node:test';
import assert from 'node:assert/strict';
import { getLivePurchaseStatus, purchaseRequestId, startBilling, stripePaymentUrl } from './billingService.js';
import { startShibaRecharge } from './shibaRechargeService.js';

test('interrupted attempts keep their identifiers per user and product; successful redirects clear them', () => {
  const originalWindow = globalThis.window;
  const storage = new Map();
  globalThis.window = { sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
  try {
    const first = purchaseRequestId('user', 'pro');
    assert.equal(purchaseRequestId('user', 'pro').requestId, first.requestId);
    assert.notEqual(purchaseRequestId('other', 'pro').requestId, first.requestId);
    assert.notEqual(purchaseRequestId('user', 'recharge-10').requestId, first.requestId);
    first.complete(); assert.notEqual(purchaseRequestId('user', 'pro').requestId, first.requestId);
  } finally { globalThis.window = originalWindow; }
});
test('server availability fails closed and checkout/recharge preserve the same request ID', async () => {
  const originalFetch = globalThis.fetch;
  const bodies = [];
  try {
    globalThis.fetch = async () => Response.json({}, { status: 503 });
    assert.deepEqual(await getLivePurchaseStatus(), { available: false, seatsAvailable: false });
    globalThis.fetch = async (_, init) => { bodies.push(JSON.parse(init.body)); return Response.json({ url: 'https://checkout.stripe.com/owned' }); };
    const requestId = '11111111-1111-4111-8111-111111111111';
    await startBilling('token', 'checkout', 'pro', { accepted: true }, requestId);
    await startShibaRecharge('token', 10, { accepted: true }, requestId);
    assert.equal(bodies[0].requestId, requestId); assert.equal(bodies[1].requestId, requestId);
    for (const url of ['https://evil.invalid', 'http://checkout.stripe.com', 'https://name@checkout.stripe.com', 'https://checkout.stripe.com:444']) assert.throws(() => stripePaymentUrl(url));
  } finally { globalThis.fetch = originalFetch; }
});

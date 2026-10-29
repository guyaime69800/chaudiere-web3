import test from 'node:test';
import assert from 'node:assert/strict';
import { auditProductionCatalog, productionPrices, validateProductionPrice } from './stripe-production-catalog.js';

function price(name) {
  const config = productionPrices[name];
  return { id: config.id, active: true, livemode: true, currency: 'eur', unit_amount: config.amount,
    billing_scheme: 'per_unit', tax_behavior: 'unspecified', type: config.interval ? 'recurring' : 'one_time',
    recurring: config.interval ? { interval: 'month', interval_count: 1, usage_type: 'licensed' } : null,
    metadata: name === 'additionalAccount' ? { carnetpass_additional_accounts: 'v1' } : {},
    product: { id: name === 'additionalAccount' ? 'prod_pro' : `prod_${name}`, active: true, livemode: true } };
}

test('the four agreed live prices match the recorded amounts and periods', () => {
  for (const name of Object.keys(productionPrices)) assert.equal(validateProductionPrice(name, price(name)), true);
});

test('rejects test mode, wrong prices, inactive products, metered billing and exclusive taxes', () => {
  for (const patch of [{ livemode: false }, { id: 'price_other' }, { unit_amount: 3800 },
    { active: false }, { currency: 'usd' }, { tax_behavior: 'exclusive' },
    { recurring: { interval: 'month', interval_count: 12, usage_type: 'licensed' } },
    { recurring: { interval: 'month', interval_count: 1, usage_type: 'metered' } },
    { product: { active: false, livemode: true } }, { product: 'prod_unexpanded' }]) {
    assert.throws(() => validateProductionPrice('pro', { ...price('pro'), ...patch }));
  }
  assert.throws(() => validateProductionPrice('additionalAccount', { ...price('additionalAccount'), metadata: {} }));
  assert.throws(() => validateProductionPrice('recharge100', { ...price('recharge100'), type: 'recurring' }));
});

function mockStripe({ wrongAccount = false, enabled = true } = {}) {
  const calls = [];
  return { calls, fetcher: async (url, options) => {
    calls.push({ url, method: options.method });
    if (url.endsWith('/account')) return { ok: true, json: async () => ({
      id: wrongAccount ? 'acct_wrong' : 'acct_expected', charges_enabled: enabled,
      payouts_enabled: true, details_submitted: true,
    }) };
    const name = Object.keys(productionPrices).find((key) => url.includes(productionPrices[key].id));
    return { ok: true, json: async () => price(name) };
  } };
}

test('audit only reads Stripe and does not enable payments', async () => {
  const mock = mockStripe();
  const result = await auditProductionCatalog({ key: 'sk_live_dummy', expectedAccount: 'acct_expected', fetcher: mock.fetcher });
  assert.equal(result.paymentsEnabled, false);
  assert.equal(result.invoiceTaxVerificationRequired, true);
  assert.equal(mock.calls.length, 5);
  assert.ok(mock.calls.every((call) => call.method === 'GET'));
});

test('wrong account and incomplete activation stop before reading prices', async () => {
  for (const settings of [{ wrongAccount: true }, { enabled: false }]) {
    const mock = mockStripe(settings);
    await assert.rejects(auditProductionCatalog({ key: 'sk_live_dummy', expectedAccount: 'acct_expected', fetcher: mock.fetcher }));
    assert.equal(mock.calls.length, 1);
  }
});

test('missing or test credentials never make a network request', async () => {
  let calls = 0;
  for (const key of [undefined, 'sk_test_dummy', 'rk_test_dummy', 'pk_live_dummy']) {
    await assert.rejects(auditProductionCatalog({ key, expectedAccount: 'acct_expected', fetcher: () => { calls++; } }));
  }
  assert.equal(calls, 0);
});

test('restricted live credentials can audit the catalog without writes', async () => {
  const mock = mockStripe();
  const result = await auditProductionCatalog({ key: 'rk_live_dummy', expectedAccount: 'acct_expected', fetcher: mock.fetcher });
  assert.equal(result.ok, true);
  assert.ok(mock.calls.every((call) => call.method === 'GET'));
});

test('network and HTTP errors never disclose provider bodies or credentials', async () => {
  const secret = 'sk_live_PRIVATE';
  for (const fetcher of [async () => { throw new Error(secret); },
    async () => ({ ok: false, status: 401, json: async () => ({ error: secret }) })]) {
    await assert.rejects(auditProductionCatalog({ key: secret, expectedAccount: 'acct_expected', fetcher }),
      (error) => !error.message.includes(secret));
  }
});

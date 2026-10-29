import test from 'node:test';
import assert from 'node:assert/strict';
import { adminServiceHealth, openAIProblem, recordOpenAIHealth } from '../server/lib/admin-service-health.js';
import { getPolygonBalanceStatus } from '../server/lib/polygon-wallet-health.js';

test('POL : seuils exacts, lecture seule et panne distinguée du solde nul', async () => {
  assert.equal(getPolygonBalanceStatus(100000000000000000n), 'critical');
  assert.equal(getPolygonBalanceStatus(300000000000000000n), 'warning');
  assert.equal(getPolygonBalanceStatus(301000000000000000n), 'healthy');
  for (const state of ['healthy', 'warning', 'critical']) {
    const health = await adminServiceHealth({ env: {}, polygonCheck: async () => ({ chainId: 137, serverAuthorized: true, paused: false, balancePol: '0.3', balanceStatus: state }) });
    assert.equal(health.polygon.state, state); assert.equal(health.openai.state, 'missing');
    assert.equal(health.polygon.serverWalletAddress, undefined);
  }
  const health = await adminServiceHealth({ env: {}, polygonCheck: async () => { throw Error('secret RPC'); } });
  assert.equal(health.polygon.state, 'unavailable');
  assert.equal(JSON.stringify(health).includes('secret'), false);
});

test('OpenAI : facturation, débit et clé sont séparés ; erreurs nettoyées avant stockage', async () => {
  assert.equal(openAIProblem({ code: 'credit_balance_exhausted', status: 429 }), 'billing');
  assert.equal(openAIProblem({ code: 'insufficient_quota', status: 429 }), 'billing');
  assert.equal(openAIProblem({ status: 429 }), 'rate_limit');
  assert.equal(openAIProblem({ status: 401 }), 'authentication');
  assert.equal(openAIProblem(Error('erreur application')), null);
  let stored;
  const redis = { set: async (_key, value) => { stored = value; }, get: async () => stored };
  await recordOpenAIHealth({ code: 'insufficient_quota', message: 'prompt secret', apiKey: 'secret' }, redis);
  assert.deepEqual(Object.keys(stored).sort(), ['at', 'state']);
  let health = await adminServiceHealth({ env: { OPENAI_API_KEY: 'secret' }, redis, polygonCheck: async () => { throw Error(); } });
  assert.equal(health.openai.state, 'billing'); assert.equal(health.openai.balanceAvailable, false);
  await recordOpenAIHealth(null, redis);
  health = await adminServiceHealth({ env: { OPENAI_API_KEY: 'secret' }, redis, polygonCheck: async () => { throw Error(); } });
  assert.equal(health.openai.state, 'success');
  assert.equal(JSON.stringify(health).includes('secret'), false);
  await recordOpenAIHealth(null, { set: async () => { throw Error(); } });
});

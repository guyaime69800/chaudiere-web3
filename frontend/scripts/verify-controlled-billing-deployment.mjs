import assert from 'node:assert/strict';
const origin = new URL(process.argv[2]);
assert.equal(origin.protocol, 'https:');
assert.match(origin.hostname, /^(?:www\.carnetpass\.fr|carnetpass-[a-z0-9]+-chaudiere-web3\.vercel\.app)$/);
for (const [path, method, expected] of [
  ['/espace-pro', 'GET', 503],
  ['/api/billing?action=purchase-status', 'GET', 503],
  ['/api/billing?action=portal-status', 'GET', 503],
  ['/api/billing', 'POST', 503],
  ['/api/shiba-recharge', 'POST', 503],
  ['/api/billing?action=additional-update', 'POST', 503],
  ['/api/platform-admin?security=1', 'GET', 401],
  ['/api/platform-catalog-documents', 'GET', 503],
  ['/api/stripe-webhook', 'POST', 400],
  ['/api/stripe-webhook?reconcile=1', 'GET', 401],
]) {
  const response = await fetch(new URL(path, origin), { method, signal: AbortSignal.timeout(15000),
    ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}) });
  assert.equal(response.status, expected, path);
  if (expected === 503 && path.startsWith('/api/')) assert.deepEqual(await response.json(), { ok: false, error: 'Maintenance en cours.' });
  else await response.body?.cancel();
  console.log(`${method} ${path}: ${expected}`);
}
console.log('Anonymous access remains closed; signed webhook endpoint active. No financial operation performed.');

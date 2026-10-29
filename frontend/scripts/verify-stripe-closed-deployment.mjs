import assert from 'node:assert/strict';
const origin = new URL(process.argv[2]);
const receiverEnabled = process.argv.includes('--receiver-enabled');
assert.equal(origin.protocol, 'https:');
assert.match(origin.hostname, /^carnetpass-[a-z0-9]+-chaudiere-web3\.vercel\.app$/);
const checks = [
  ['/api/billing?action=portal', 'POST', 503],
  ['/api/billing', 'POST', 503], ['/api/shiba-recharge', 'POST', 503],
  ['/api/billing?action=additional-quote', 'POST', 503],
  ['/api/stripe-webhook', 'POST', receiverEnabled ? 400 : 503, receiverEnabled ? 'INVALID_STRIPE_EVENT' : 'LIVE_WEBHOOK_UNAVAILABLE'],
  ['/api/stripe-webhook?reconcile=1', 'GET', 401, 'UNAUTHORIZED'],
  ['/api/platform-admin?security=1', 'GET', 401],
];
const portalStatus = await fetch(new URL('/api/billing?action=portal-status', origin));
if (portalStatus.status === 503) assert.deepEqual(await portalStatus.json(), { ok: false, error: 'Maintenance en cours.' });
else {
  assert.equal(portalStatus.status, 200);
  assert.deepEqual(await portalStatus.json(), { available: false });
}
console.log('Live portal remains disabled.');
const purchaseStatus = await fetch(new URL('/api/billing?action=purchase-status', origin));
if (purchaseStatus.status === 503) assert.deepEqual(await purchaseStatus.json(), { ok: false, error: 'Maintenance en cours.' });
else {
  assert.equal(purchaseStatus.status, 200);
  const status = await purchaseStatus.json();
  assert.equal(status.available, false); assert.equal(status.seatsAvailable, false);
}
console.log('Purchases and seat changes remain disabled.');
for (const [path, method, status, code] of checks) {
  const response = await fetch(new URL(path, origin), { method, signal: AbortSignal.timeout(15000),
    ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}) });
  assert.equal(response.status, status, path);
  if (code) assert.equal((await response.json()).code, code, path);
  else await response.body?.cancel();
  console.log(`${method} ${path}: ${status}`);
}
for (const [path, status] of [['/', 200], ['/espace-pro', 503]]) {
  const response = await fetch(`https://www.carnetpass.fr${path}`, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, status, `public ${path}`);
  await response.body?.cancel();
  console.log(`Public ${path}: ${status}`);
}

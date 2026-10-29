import assert from 'node:assert/strict';
const origin = new URL(process.argv[2] || 'https://www.carnetpass.fr');
assert.match(origin.hostname, /^(?:www\.carnetpass\.fr|carnetpass-[a-z0-9]+-chaudiere-web3\.vercel\.app)$/);
assert.equal(origin.protocol, 'https:');
for (const [path, expected] of [
  ['/', 200], ['/espace-pro', 200],
  ['/api/billing?action=purchase-status', 200],
  ['/api/billing?action=portal-status', 401],
  ['/api/platform-admin?scope=service-health', 401],
  ['/api/maintenance-control', 401],
  ['/api/equipment-attachments', 401],
  ['/api/stripe-webhook?reconcile=1', 401],
]) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, expected, path);
  if (path.includes('purchase-status')) {
    const status = await response.json();
    assert.equal(status.available, true);
    assert.equal(status.seatsAvailable, true);
  } else await response.body?.cancel();
  console.log(`${path}: ${expected}`);
}
console.log('Public opening verified; anonymous private access refused. No purchase or upload performed.');

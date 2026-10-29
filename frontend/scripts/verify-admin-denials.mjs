import assert from 'node:assert/strict';
const origin = 'https://www.carnetpass.fr';
for (const headers of [{}, { Authorization: 'Bearer invalid-audit-token' },
  { Cookie: 'role=founder; carnetpass_role=founder; carnetpass_maintenance_access=' + 'a'.repeat(64) }]) {
  for (const [path, method] of [['/api/maintenance-control', 'GET'], ['/api/maintenance-control', 'POST'],
    ['/api/platform-admin', 'GET'], ['/api/platform-admin', 'POST'], ['/api/aid-admin', 'GET']]) {
    const response = await fetch(origin + path, { method, headers: { ...headers, 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(15000) });
    assert.ok([401, 403].includes(response.status), `${method} ${path}: ${response.status}`);
    await response.body?.cancel();
    console.log(`${method} ${path}: denied ${response.status}`);
  }
}
console.log('Anonymous, invalid token and forged role cookies denied; no authenticated operation performed.');

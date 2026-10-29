import test from 'node:test';
import assert from 'node:assert/strict';
import { adminBillingHealth } from './admin-billing-health.js';
function database(count, fail = false) {
  return { from() { return { select() { return this; }, eq() { return this; }, in() { return this; }, lt() { return this; },
    then(resolve) { resolve(fail ? { error: 'unavailable' } : { count }); } }; } };
}
test('billing monitoring distinguishes no incident, warnings and unavailable evidence', async () => {
  assert.equal((await adminBillingHealth(database(0))).state, 'healthy');
  const warning = await adminBillingHealth(database(2));
  assert.equal(warning.state, 'warning'); assert.equal(warning.overdueSubscriptions, 2);
  assert.deepEqual(await adminBillingHealth(database(0, true)), { state: 'unavailable' });
});

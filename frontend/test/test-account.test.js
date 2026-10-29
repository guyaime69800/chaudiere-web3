import test from 'node:test';
import assert from 'node:assert/strict';
import { openIsolatedTestAccount, testAccountConfiguration } from '../server/lib/test-account.js';
import { assertDatabaseIsolation, PRODUCTION_SUPABASE_URL, TEST_SUPABASE_URL } from '../shared/test-environment.js';

test('Paris 2 test workspace uses verified actor and its private RPC, without a second auth identity', async () => {
  const env = { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main', VITE_SUPABASE_URL: PRODUCTION_SUPABASE_URL };
  const user = { id: 'verified-founder', email: 'founder@example.invalid', email_confirmed_at: '2026-10-21' };
  let calls = 0;
  const database = { async rpc(name, params) {
    calls++; assert.equal(name, 'open_admin_test_workspace'); assert.deepEqual(params, { p_actor: user.id });
    return { data: { id: 'workspace', environment: 'test' } };
  } };
  assert.equal(testAccountConfiguration(env), true);
  assert.equal((await openIsolatedTestAccount({ env, user, database })).environment, 'test');
  await assert.rejects(openIsolatedTestAccount({ env: { ...env, VERCEL_ENV: 'preview' }, user, database }));
  await assert.rejects(openIsolatedTestAccount({ env, user: { ...user, email_confirmed_at: null }, database }));
  assert.equal(calls, 1);
  assert.throws(() => assertDatabaseIsolation({ VERCEL_ENV: 'preview', VITE_SUPABASE_URL: PRODUCTION_SUPABASE_URL }));
  assert.throws(() => assertDatabaseIsolation({ VERCEL_ENV: 'production', VITE_SUPABASE_URL: TEST_SUPABASE_URL }));
});

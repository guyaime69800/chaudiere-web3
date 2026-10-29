import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.CARNETPASS_SQL_TEST_MODULE);
const db = new PGlite();
try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
  await db.exec(await readFile(new URL('../supabase/migrations/20261020164021_stripe_live_event_inbox.sql', import.meta.url), 'utf8'));
  const receipt = { account_id: 'acct_expected', event_id: 'evt_example', event_type: 'invoice.paid',
    object_id: 'in_example', event_created: 1792512000, identity_hash: 'f'.repeat(64) };
  async function rpc(value) {
    return (await db.query('select public.record_stripe_live_event($1::jsonb) as result', [JSON.stringify(value)])).rows[0].result;
  }
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(rpc(receipt), /permission denied/);
    await assert.rejects(db.query('select * from public.stripe_live_event_inbox'), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  assert.equal(await rpc(receipt), 'recorded');
  assert.equal(await rpc(receipt), 'duplicate');
  await assert.rejects(rpc({ ...receipt, identity_hash: 'a'.repeat(64) }), /Conflicting event identity/);
  await assert.rejects(rpc({ ...receipt, event_id: null }), /null value/);
  await assert.rejects(rpc({}), /Invalid receipt/);
  assert.equal((await db.query('select count(*)::int as n from public.stripe_live_event_inbox')).rows[0].n, 1);
  assert.equal((await db.query('select processing_status from public.stripe_live_event_inbox')).rows[0].processing_status, 'pending');
  console.log('SQL verified: private journal, service-only RPC, durable duplicate detection, conflicting identity rejected, no rights granted.');
} finally { await db.close(); }

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.CARNETPASS_SQL_TEST_MODULE);
const db = new PGlite();
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create table public.platform_admins(user_id uuid,role text);
    create table public.companies(id uuid primary key,is_demo boolean,name text,created_by uuid);
    create table public.subscriptions(company_id uuid,status text,current_period_end timestamptz,updated_at timestamptz);
    create function public.ensure_founder_test_company() returns void language sql as 'select';
    grant usage on schema public to service_role;grant select on public.platform_admins to service_role;
    insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
    insert into public.platform_admins values('11111111-1111-4111-8111-111111111111','founder');`);
  await db.exec(await readFile(new URL('../supabase-production/migrations/20261021121652_isolate_founder_tests.sql', import.meta.url), 'utf8'));
  for (const role of ['anon', 'authenticated']) {
    const result = await db.query(`select has_schema_privilege('${role}','carnetpass_test','usage') as schema_access,
      has_function_privilege('${role}','public.open_admin_test_workspace(uuid)','execute') as rpc,
      has_function_privilege('${role}','public.ensure_founder_test_company()','execute') as legacy`);
    assert.deepEqual(result.rows[0], { schema_access: false, rpc: false, legacy: false });
  }
  await db.exec('set role service_role');
  const first = await db.query(`select public.open_admin_test_workspace('11111111-1111-4111-8111-111111111111') as workspace`);
  const second = await db.query(`select public.open_admin_test_workspace('11111111-1111-4111-8111-111111111111') as workspace`);
  assert.deepEqual(first.rows, second.rows);
  await assert.rejects(db.query(`select public.open_admin_test_workspace('22222222-2222-4222-8222-222222222222')`));
  await db.exec('reset role');
  await db.exec(await readFile(new URL('../supabase-production/migrations/20261021123257_admin_test_workflows.sql', import.meta.url), 'utf8'));
  await db.exec(`insert into public.platform_admins values('22222222-2222-4222-8222-222222222222','founder');set role service_role;`);
  await db.query(`select public.open_admin_test_workspace('22222222-2222-4222-8222-222222222222')`);
  const founder = '11111111-1111-4111-8111-111111111111';
  const otherFounder = '22222222-2222-4222-8222-222222222222';
  const record = '33333333-3333-4333-8333-333333333333';
  const command = async (actor, action, id = null, data = {}) => (await db.query(
    'select public.admin_test_command($1,$2,$3,$4) as result', [actor, action, id, JSON.stringify(data)])).rows[0].result;
  await command(founder, 'save_equipment', record, { brand: 'Test' });
  assert.equal((await command(founder, 'save_equipment', record, { brand: 'Retry' })).data.brand, 'Test');
  await assert.rejects(command(otherFounder, 'get', record));
  assert.equal((await command(otherFounder, 'snapshot')).records.length, 0);
  const lease = await command(founder, 'claim_billing');
  await assert.rejects(command(founder, 'claim_billing'));
  await assert.rejects(command(otherFounder, 'save_billing', lease.token, { status: 'active' }));
  await command(founder, 'save_billing', lease.token, { status: 'pending' });
  await command(founder, 'release_billing', lease.token);
  const next = await command(founder, 'claim_billing');
  assert.notEqual(next.token, lease.token);
  await assert.rejects(command(founder, 'save_billing', lease.token, { status: 'active' }));
  await command(founder, 'release_billing', next.token);
  await db.exec('reset role');
  for (const role of ['anon', 'authenticated']) {
    const result = await db.query(`select has_function_privilege('${role}','public.admin_test_command(uuid,text,uuid,jsonb)','execute') as allowed`);
    assert.equal(result.rows[0].allowed, false);
  }
  console.log('Private schema, caller grants, founder ownership and idempotent workspace verified.');
  console.log('Equipment retries, cross-workspace isolation and fenced billing leases verified.');
} finally { await db.close(); }

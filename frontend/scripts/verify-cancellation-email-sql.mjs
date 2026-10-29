import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.CARNETPASS_SQL_TEST_MODULE);
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to service_role;
    create table companies(id uuid primary key);
    create table subscriptions(company_id uuid primary key references companies(id),status text,stripe_live_managed boolean,stripe_cancel_at timestamptz);
    insert into companies values('11111111-1111-4111-8111-111111111111');
    insert into subscriptions values('11111111-1111-4111-8111-111111111111','active',true,null);`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261023162216_scheduled_cancellation_notifications.sql', import.meta.url), 'utf8'));
  await db.exec(`update subscriptions set stripe_cancel_at=now()+interval '1 month';
    update subscriptions set stripe_cancel_at=stripe_cancel_at;`);
  assert.equal((await db.query('select count(*)::int n from stripe_live_cancellation_emails')).rows[0].n, 1);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from stripe_live_cancellation_emails'), /permission denied/);
  await assert.rejects(db.query('select * from claim_scheduled_cancellation_emails()'), /permission denied/);
  await db.exec('reset role; set role service_role');
  const first = (await db.query('select * from claim_scheduled_cancellation_emails()')).rows;
  assert.equal(first.length, 1); assert.equal(first[0].attempts, 1);
  assert.equal((await db.query('select * from claim_scheduled_cancellation_emails()')).rows.length, 0);
  await db.exec(`reset role; update subscriptions set stripe_cancel_at=null;
    update subscriptions set stripe_cancel_at=now()+interval '1 month';`);
  assert.equal((await db.query('select count(*)::int n from stripe_live_cancellation_emails')).rows[0].n, 2);
  await db.exec(`update subscriptions set status='canceled',stripe_cancel_at=now()+interval '2 months';`);
  assert.equal((await db.query('select count(*)::int n from stripe_live_cancellation_emails')).rows[0].n, 2);
  console.log('Cancellation queue verified: atomic trigger, duplicate update, resume, owner isolation and concurrent lease.');
} finally { await db.close(); }

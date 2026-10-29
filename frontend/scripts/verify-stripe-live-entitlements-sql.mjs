import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyLiveWebhookSqlFlow } from './verify-stripe-live-webhook-sql-flow.mjs';
const { PGlite } = await import(process.env.CARNETPASS_SQL_TEST_MODULE);
const db = new PGlite();
const company = '11111111-1111-4111-8111-111111111111';
const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const proOrder = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const creditOrder = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
let number = 0;
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;
    create schema auth;create table auth.users(id uuid primary key);create table public.companies(id uuid primary key);
    create table public.company_members(company_id uuid,user_id uuid,role text,primary key(company_id,user_id));
    create table public.pro_account_assignments(company_id uuid,user_id uuid,primary key(company_id,user_id),foreign key(company_id,user_id) references public.company_members(company_id,user_id) on delete cascade);
    create table public.pro_account_invitations(company_id uuid,expires_at timestamptz,used_at timestamptz);
    create type public.subscription_status as enum('active','trialing','past_due','canceled');
    create table public.subscriptions(company_id uuid primary key,plan text,status public.subscription_status,current_period_end timestamptz,stripe_customer_id text,updated_at timestamptz);
    create table public.pro_additional_accounts(company_id uuid primary key,quantity integer,paid_until timestamptz,billing_environment text,updated_at timestamptz);
    grant select,insert,update,delete on public.subscriptions,public.pro_additional_accounts,public.company_members,public.pro_account_assignments,public.pro_account_invitations to service_role;`);
  for (const name of ['20261020164021_stripe_live_event_inbox.sql', '20261021102225_stripe_live_entitlements.sql', '20261021141150_stripe_live_scheduled_cancellation.sql', '20261021143658_stripe_live_seat_changes.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  }
  await db.exec(`insert into companies values('${company}');insert into auth.users values('${user}');
    insert into company_members values('${company}','${user}','admin');insert into subscriptions(company_id,plan,status) values('${company}','free','active');
    insert into stripe_live_customers(company_id,account_id,customer_id) values('${company}','acct_expected','cus_example');
    insert into stripe_live_orders(id,company_id,user_id,kind,session_id,terms_version,terms_sha256)
      values('${proOrder}','${company}','${user}','pro','cs_live_pro','v1',repeat('a',64)),
      ('${creditOrder}','${company}','${user}','recharge100','cs_live_credits','v1',repeat('a',64));`);
  async function rpc(name, args = [], values = []) {
    return (await db.query(`select public.${name}(${args.join(',')}) as result`, values)).rows[0].result;
  }
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(rpc('claim_stripe_live_company', ['$1'], [company]), /permission denied/);
    await assert.rejects(db.query('select * from public.stripe_live_credit_balances'), /permission denied/);
    await assert.rejects(db.query('select * from public.stripe_live_seat_changes'), /permission denied/);
    await assert.rejects(rpc('reserve_stripe_live_credit', ['$1','$2','$3'], [company,user,proOrder]), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  async function receipt() {
    const eventId = `evt_case${++number}`;
    await rpc('record_stripe_live_event', ['$1::jsonb'], [JSON.stringify({ account_id: 'acct_expected', event_id: eventId,
      event_type: 'invoice.paid', object_id: 'in_example', event_created: 1792512000, identity_hash: 'f'.repeat(64) })]);
    return eventId;
  }
  const claim = () => rpc('claim_stripe_live_company', ['$1'], [company]);
  const apply = (token, event, effect) => rpc('apply_stripe_live_effect', ['$1','$2','$3','$4::jsonb'], [company,token,event,JSON.stringify(effect)]);
  const balance = async () => (await db.query('select balance from public.stripe_live_credit_balances')).rows[0]?.balance;
  const subscription = { kind: 'subscription', customer_id: 'cus_example', subscription_id: 'sub_example', order_id: proOrder,
    status: 'active', seats: 2, paid_until: '2030-01-01T00:00:00Z' };
  let event = await receipt();
  let token = await claim();
  assert.equal(await claim(), null, 'concurrent worker must wait');
  await assert.rejects(apply('dddddddd-dddd-4ddd-8ddd-dddddddddddd', event, subscription), /Lease expired/);
  assert.equal(await apply(token,event,subscription), 'processed');
  assert.equal((await db.query('select quantity from pro_additional_accounts')).rows[0].quantity, 2);
  assert.equal((await db.query('select stripe_live_managed from subscriptions')).rows[0].stripe_live_managed, true);

  const credit = { kind: 'credits', customer_id: 'cus_example', order_id: creditOrder,
    session_id: 'cs_live_credits', payment_intent_id: 'pi_example' };
  event = await receipt(); token = await claim();
  assert.equal(await apply(token,event,credit), 'processed');
  assert.equal(await balance(),100);
  assert.equal(await apply(await claim(),event,credit),'duplicate');
  assert.equal(await apply(await claim(),await receipt(),credit),'processed');
  assert.equal(await balance(),100,'two distinct Stripe events for one purchase grant only once');
  const reservation = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  assert.equal((await rpc('reserve_stripe_live_credit',['$1','$2','$3'],[company,user,reservation])).allowed,true);
  await rpc('reserve_stripe_live_credit',['$1','$2','$3'],[company,user,reservation]);
  assert.equal(await balance(),99);
  await rpc('refund_stripe_live_credit',['$1'],[reservation]);
  await rpc('refund_stripe_live_credit',['$1'],[reservation]);
  assert.equal(await balance(),100,'failed question refund is idempotent');
  await apply(await claim(),await receipt(),{kind:'refund',customer_id:'cus_example',payment_intent_id:'pi_example',revoked_credits:50});
  await apply(await claim(),await receipt(),{kind:'refund',customer_id:'cus_example',payment_intent_id:'pi_example',revoked_credits:20});
  assert.equal(await balance(),50,'older refund event cannot restore credits');
  await db.exec('update stripe_live_credit_balances set balance=0');
  await apply(await claim(),await receipt(),{kind:'refund',customer_id:'cus_example',payment_intent_id:'pi_example',revoked_credits:100});
  assert.equal(await balance(),-50,'spent refunded credits retain debt');
  assert.equal((await rpc('reserve_stripe_live_credit',['$1','$2','$3'],[company,user,'ffffffff-ffff-4fff-8fff-ffffffffffff'])).allowed,false);

  event=await receipt();token=await claim();
  await assert.rejects(apply(token,event,{...subscription,customer_id:'cus_foreign'}),/Customer mismatch/);
  assert.equal((await db.query('select processing_status from stripe_live_event_inbox where event_id=$1',[event])).rows[0].processing_status,'pending');
  assert.equal((await db.query('select quantity from pro_additional_accounts')).rows[0].quantity,2,'failed transaction preserves existing rights');
  await db.exec('reset role');
  await db.exec("update stripe_live_company_state set lease_until=now()-interval '1 second'");
  await db.exec('set role service_role');
  const replacement=await claim();
  await assert.rejects(apply(token,event,subscription),/Lease expired/);
  await apply(replacement,event,{...subscription,status:'canceled',seats:0,paid_until:'2020-01-01T00:00:00Z'});
  assert.equal((await db.query('select status from subscriptions')).rows[0].status,'canceled');
  console.log('SQL verified: service-only rights, atomic application, duplicate payment/event, fenced leases, concurrent claim, durable credits, idempotent refund and refund debt.');
  await db.exec(`reset role;
    insert into auth.users values('66666666-6666-4666-8666-666666666666'),('77777777-7777-4777-8777-777777777777');
    insert into company_members values('${company}','66666666-6666-4666-8666-666666666666','technician'),('${company}','77777777-7777-4777-8777-777777777777','technician');
    insert into pro_account_assignments values('${company}','66666666-6666-4666-8666-666666666666'),('${company}','77777777-7777-4777-8777-777777777777');
    insert into pro_account_invitations values('${company}',now()+interval '1 day',null);
    insert into stripe_live_seat_changes(id,company_id,user_id,subscription_id,quantity,previous_quantity,retained_members,immediate_amount,effective_at,proration_date,fingerprint,stripe_params,terms_version,terms_sha256,status)
      values('88888888-8888-4888-8888-888888888888','${company}','${user}','sub_example',1,2,array['77777777-7777-4777-8777-777777777777']::uuid[],0,now()-interval '1 second',1,repeat('f',64),'{}','v1',repeat('a',64),'scheduled');
    set role service_role;`);
  await apply(await claim(), await receipt(), {...subscription,seats:1});
  assert.deepEqual((await db.query('select user_id from pro_account_assignments')).rows.map(row=>row.user_id),['77777777-7777-4777-8777-777777777777']);
  assert.equal((await db.query("select status from stripe_live_seat_changes where id='88888888-8888-4888-8888-888888888888'")).rows[0].status,'applied');
  assert.equal((await db.query('select expires_at<=now() as expired from pro_account_invitations')).rows[0].expired,true);
  assert.equal((await db.query('select count(*)::int as n from company_members where user_id=$1',[user])).rows[0].n,1,'the main account is retained');
  console.log('SQL verified: a paid seat reduction retains exactly the selected colleague, keeps the main account and expires outstanding invitations.');
  await verifyLiveWebhookSqlFlow(db);
} finally { await db.close(); }

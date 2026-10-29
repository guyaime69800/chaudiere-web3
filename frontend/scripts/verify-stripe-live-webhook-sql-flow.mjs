import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { createLiveWebhookHandler } from '../server/lib/stripe-live-webhook.js';
import { reconcileLiveReceipt } from '../server/lib/stripe-live-reconciliation.js';
import { productionPrices } from '../server/lib/stripe-production-catalog.js';

// The real HTTP handler, reconciliation and SQL migrations run together in local Postgres.
// Only Stripe's GET responses are fixtures. No network or production data is used.
export async function verifyLiveWebhookSqlFlow(pg) {
  const company = '33333333-3333-4333-8333-333333333333';
  const otherCompany = '44444444-4444-4444-8444-444444444444';
  const order = '55555555-5555-4555-8555-555555555555';
  const now = Date.now();
  const end = Math.floor(now / 1000) + 86400 * 30;
  const secret = 'whsec_' + randomBytes(32).toString('hex');
  await pg.exec(`reset role;
    insert into companies values('${company}'),('${otherCompany}');
    insert into subscriptions(company_id,plan,status) values('${company}','free','active'),('${otherCompany}','free','active');
    insert into stripe_live_customers(company_id,account_id,customer_id) values('${company}','acct_expected','cus_flow');
    insert into stripe_live_orders(id,company_id,kind,session_id,terms_version,terms_sha256)
      values('${order}','${company}','pro','cs_live_flow','v1',repeat('a',64));
    set role service_role;`);
  const allowedTables = new Set(['stripe_live_event_inbox', 'stripe_live_orders', 'stripe_live_customers', 'stripe_live_company_state']);
  const sql = {
    async rpc(name, params) {
      const contracts = { record_stripe_live_event: ['receipt'], claim_stripe_live_company: ['p_company'],
        apply_stripe_live_effect: ['p_company', 'p_token', 'p_event', 'p_effect'] };
      const names = contracts[name]; assert.ok(names, name);
      const values = names.map(key => typeof params[key] === 'object' ? JSON.stringify(params[key]) : params[key]);
      try {
        const result = await pg.query(`select public.${name}(${values.map((_, i) => '$' + (i + 1)).join(',')}) as result`, values);
        return { data: result.rows[0].result, error: null };
      } catch (error) { return { data: null, error }; }
    },
    from(table) {
      assert.ok(allowedTables.has(table), table);
      const filters = [];
      return { select() { return this; }, eq(key, value) { assert.match(key, /^[a-z_]+$/); filters.push([key, value]); return this; },
        async maybeSingle() {
          const result = await pg.query(`select * from public.${table} where ${filters.map(([key], i) => key + '=$' + (i + 1)).join(' and ')}`,
            filters.map(([, value]) => value));
          assert.ok(result.rows.length <= 1);
          return { data: result.rows[0] || null, error: null };
        } };
    },
  };
  const price = { id: productionPrices.pro.id, livemode: true, active: true, currency: 'eur', unit_amount: 2800,
    billing_scheme: 'per_unit', type: 'recurring', tax_behavior: 'unspecified',
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
    product: { id: 'prod_flow', active: true, livemode: true } };
  let currentSubscription = { id: 'sub_flow', livemode: true, customer: 'cus_flow', status: 'active',
    items: { has_more: false, data: [{ quantity: 1, price, current_period_end: end }] },
    latest_invoice: { livemode: true, status: 'paid', amount_remaining: 0, customer: 'cus_flow', currency: 'eur',
      parent: { subscription_details: { subscription: 'sub_flow' } }, amount_paid: 2800, total: 2800,
      lines: { has_more: false, data: [{ pricing: { price_details: { price: price.id } }, quantity: 1, amount: 2800, period: { end } }] } } };
  let reads = 0, failStripe = false, previousSubscription = null, activeOrder = order, activeCheckout = 'cs_live_flow';
  const stripe = async path => {
    reads++;
    if (failStripe) throw Error('Simulated Stripe outage');
    if (path.startsWith('checkout/sessions/')) return { id: activeCheckout, livemode: true, customer: 'cus_flow',
      mode: 'subscription', status: 'complete', payment_status: 'paid', subscription: currentSubscription.id,
      consent: { terms_of_service: 'accepted' }, metadata: { carnetpass_order_id: activeOrder, cgv_version: 'v1', cgv_sha256: 'a'.repeat(64) } };
    if (path.startsWith('subscriptions/')) return structuredClone(previousSubscription && path.split('?')[0] === 'subscriptions/sub_flow' ? previousSubscription : currentSubscription);
    if (path.startsWith('invoices/')) return structuredClone(currentSubscription.latest_invoice);
    throw Error('Unexpected fixture request');
  };
  const handler = createLiveWebhookHandler({ env: { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main',
    VITE_SUPABASE_URL: 'https://tsyukqcyfxcrjrhopvpv.supabase.co', SUPABASE_SECRET_KEY: 'local-placeholder',
    CARNETPASS_STRIPE_LIVE_WEBHOOK_ENABLED: 'true', CARNETPASS_STRIPE_LIVE_PROCESSING_ENABLED: 'true',
    STRIPE_EXPECTED_ACCOUNT_ID: 'acct_expected', STRIPE_LIVE_WEBHOOK_SECRET: secret },
  database: () => sql, processReceipt: (db, receipt, clock) => reconcileLiveReceipt(db, stripe, receipt, clock), now: () => now });
  const event = (name, type = 'customer.subscription.updated', object = 'sub_flow') => ({
    id: 'evt_flow' + name, object: 'event', livemode: true, created: Math.floor(now / 1000),
    type, data: { object: { id: object } }, api_version: '2026-08-26.dahlia' });
  async function deliver(payload, validSignature = true) {
    const raw = Buffer.from(JSON.stringify(payload));
    const timestamp = Math.floor(now / 1000);
    const signature = createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex');
    const req = Readable.from([raw]); req.method = 'POST'; req.query = {};
    req.headers = { 'stripe-signature': `t=${timestamp},v1=${validSignature ? signature : '0'.repeat(64)}` };
    const res = { setHeader() {}, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    await handler(req, res); return res;
  }
  const stored = async () => (await pg.query('select plan,status,current_period_end,stripe_cancel_at,stripe_live_managed from subscriptions where company_id=$1', [company])).rows[0];
  assert.equal((await deliver({ ...event('WrongMode'), livemode: false })).statusCode, 400);
  assert.equal((await deliver(event('BadSignature'), false)).statusCode, 400);
  assert.equal((await stored()).plan, 'free');
  const checkout = event('Paid', 'checkout.session.completed', 'cs_live_flow');
  assert.equal((await deliver(checkout)).statusCode, 200);
  assert.equal((await stored()).plan, 'pro'); assert.equal((await stored()).status, 'active');
  assert.equal((await stored()).stripe_live_managed, true);
  const count = reads;
  assert.equal((await deliver(checkout)).statusCode, 200); assert.equal(reads, count, 'duplicate cannot reapply rights');
  currentSubscription.cancel_at_period_end = false; currentSubscription.cancel_at = end;
  assert.equal((await deliver(event('CancelScheduled'))).statusCode, 200);
  assert.equal(Date.parse((await stored()).stripe_cancel_at), end * 1000);
  assert.equal((await stored()).status, 'active', 'paid period remains accessible');
  currentSubscription.cancel_at = null;
  assert.equal((await deliver(event('Resume'))).statusCode, 200);
  assert.equal((await stored()).stripe_cancel_at, null);
  failStripe = true;
  const retry = event('Retry');
  assert.equal((await deliver(retry)).statusCode, 503);
  assert.equal((await pg.query('select processing_status from stripe_live_event_inbox where event_id=$1', [retry.id])).rows[0].processing_status, 'pending');
  assert.equal((await stored()).status, 'active');
  await pg.exec(`update stripe_live_company_state set lease_until=now()-interval '1 second' where company_id='${company}'`);
  failStripe = false;
  assert.equal((await deliver(retry)).statusCode, 200, 'durable notification can be retried after the lease');
  currentSubscription.customer = 'cus_foreign';
  const foreign = event('Foreign');
  assert.equal((await deliver(foreign)).statusCode, 503);
  assert.equal((await stored()).status, 'active', 'foreign customer cannot change existing rights');
  await pg.exec(`update stripe_live_company_state set lease_until=now()-interval '1 second' where company_id='${company}'`);
  currentSubscription.customer = 'cus_flow'; currentSubscription.status = 'canceled'; currentSubscription.cancel_at = end;
  assert.equal((await deliver(event('Canceled'))).statusCode, 200);
  assert.equal((await stored()).status, 'canceled'); assert.equal((await stored()).stripe_cancel_at, null);
  assert.equal((await deliver(event('OldInvoice', 'invoice.paid', 'in_old'))).statusCode, 200);
  assert.equal((await stored()).status, 'canceled', 'old paid invoice must not reactivate a canceled subscription');
  previousSubscription = structuredClone(currentSubscription);
  activeOrder = '99999999-9999-4999-8999-999999999999'; activeCheckout = 'cs_live_return';
  await pg.query(`insert into stripe_live_orders(id,company_id,kind,session_id,terms_version,terms_sha256)
    values($1,$2,'pro',$3,'v1',repeat('a',64))`, [activeOrder, company, activeCheckout]);
  currentSubscription.id = 'sub_return'; currentSubscription.status = 'active'; currentSubscription.cancel_at = null;
  currentSubscription.latest_invoice.parent.subscription_details.subscription = currentSubscription.id;
  assert.equal((await deliver(event('NewPaidSubscription', 'checkout.session.completed', activeCheckout))).statusCode, 200);
  assert.equal((await stored()).status, 'active');
  assert.equal((await pg.query('select subscription_id from stripe_live_company_state where company_id=$1',[company])).rows[0].subscription_id,'sub_return');
  assert.equal((await pg.query('select plan from subscriptions where company_id=$1', [otherCompany])).rows[0].plan, 'free');
  console.log('Full webhook SQL flow verified: signature and mode, paid rights, duplicates, flexible cancellation, resumption, outage retry, tenant isolation, stale invoice and a new paid subscription after cancellation. No network contacted.');
}

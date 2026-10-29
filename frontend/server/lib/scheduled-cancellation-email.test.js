import test from 'node:test';
import assert from 'node:assert/strict';
import { cancellationEmail, sendScheduledCancellationEmails } from './scheduled-cancellation-email.js';
const cancel = Math.floor(Date.now() / 1000) + 86400;
const row = { cancel_at: new Date(cancel * 1000).toISOString() };
const customer = { id: 'cus_owned', livemode: true, email: 'client@example.invalid' };
const sub = { status: 'active', livemode: true, customer: 'cus_owned', cancel_at: cancel };
test('scheduled cancellation gives end date and no renewal without survey or secret URL', () => {
  const message = cancellationEmail(row, sub, customer);
  assert.match(message.text, /ne sera pas renouvelé/);
  assert.match(message.text, /heure de Paris/);
  assert.doesNotMatch(message.text, /questionnaire|commentaire|cus_owned/);
  assert.deepEqual(message.to, [customer.email]);
});
test('resumed, actually canceled, test or foreign customer never gets scheduled email', () => {
  for (const change of [{ cancel_at: null }, { status: 'canceled' }, { livemode: false }, { customer: 'cus_foreign' }]) {
    assert.equal(cancellationEmail(row, { ...sub, ...change }, customer), null);
  }
  assert.equal(cancellationEmail({ cancel_at: new Date((cancel + 1) * 1000).toISOString() }, sub, customer), null);
});
test('worker uses durable identity, records success, retries failure and suppresses resumed cancellation', async () => {
  let status, calls = 0, fail = false, resumed = false;
  const job = { ...row, id: 'job', company_id: 'company', lease_token: 'lease', attempts: 1, created_at: new Date().toISOString() };
  const db = { rpc: async () => ({ data: [job] }), from(table) {
    return { select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: table === 'stripe_live_company_state' ? { subscription_id: 'sub_owned' } : { customer_id: 'cus_owned', account_id: 'acct_owned' } }),
      update(value) { status = value.status; return { eq() { return this; }, then(resolve) { resolve({ error: null }); } }; } };
  } };
  const stripe = async path => path.startsWith('subscriptions/') ? { ...sub, cancel_at: resumed ? null : cancel } : customer;
  const options = { env: { RESEND_API_KEY: 'fixture', STRIPE_EXPECTED_ACCOUNT_ID: 'acct_owned' }, request: async (_url, request) => {
    calls++; assert.equal(request.headers['Idempotency-Key'], 'scheduled-cancellation-job');
    assert.deepEqual(JSON.parse(request.body).to, [customer.email]);
    return { ok: !fail };
  } };
  assert.equal((await sendScheduledCancellationEmails(db, stripe, options)).sent, 1); assert.equal(status, 'sent');
  fail = true; await sendScheduledCancellationEmails(db, stripe, options); assert.equal(status, 'pending');
  resumed = true; await sendScheduledCancellationEmails(db, stripe, options); assert.equal(status, 'skipped'); assert.equal(calls, 2);
  job.created_at = new Date(Date.now() - 24 * 3600000).toISOString();
  await sendScheduledCancellationEmails(db, stripe, options); assert.equal(status, 'review'); assert.equal(calls, 2);
});

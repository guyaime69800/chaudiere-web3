import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceRefunds } from './invoice-refunds.js';
const invoice = { id: 'in_owned', customer: 'cus_owned', status: 'paid', total: 2800, currency: 'eur' };
function evidence(amount, customer = 'cus_owned') {
  return { has_more: false, data: [{ invoice: 'in_owned', livemode: true, status: 'paid', amount_paid: 2800,
    payment: { type: 'payment_intent', payment_intent: { id: 'pi_owned', livemode: true, customer,
      latest_charge: { id: 'ch_owned', payment_intent: 'pi_owned', customer, livemode: true,
        currency: 'eur', amount: 2800, amount_refunded: amount } } } }] };
}
test('paid invoices retain their accounting status with separate full/partial refund evidence', async () => {
  for (const [amount, status] of [[0, 'none'], [1000, 'partial'], [2800, 'full']]) {
    assert.deepEqual(await invoiceRefunds(invoice, async () => evidence(amount), false), { refundedAmount: amount, refundStatus: status });
  }
  assert.equal(invoice.status, 'paid');
});
test('refund evidence rejects another customer, wrong environment and truncated payments', async () => {
  await assert.rejects(invoiceRefunds(invoice, async () => evidence(2800, 'cus_other'), false));
  await assert.rejects(invoiceRefunds(invoice, async () => evidence(2800), true));
  await assert.rejects(invoiceRefunds(invoice, async () => ({ ...evidence(2800), has_more: true }), false));
  await assert.rejects(invoiceRefunds(invoice, async () => ({ data: [], has_more: false }), false));
  const split = evidence(2800); split.data[0].amount_paid = 500;
  await assert.rejects(invoiceRefunds(invoice, async () => split, false));
});

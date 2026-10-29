const id = value => typeof value === 'string' ? value : value?.id;

// Read payment evidence, not invoice.status: a refunded invoice remains paid.
export async function invoiceRefunds(invoice, read, testMode) {
  if (invoice.status !== 'paid' || invoice.total <= 0) return { refundedAmount: 0, refundStatus: 'none' };
  const payments = await read(`invoice_payments?${new URLSearchParams({ invoice: invoice.id, limit: '100',
    'expand[]': 'data.payment.payment_intent.latest_charge' })}`);
  if (!Array.isArray(payments.data) || payments.has_more !== false) throw Error('Incomplete invoice payments');
  let refundedAmount = 0;
  const seen = new Set();
  for (const payment of payments.data) {
    if (id(payment.invoice) !== invoice.id || payment.livemode !== !testMode) throw Error('Payment scope mismatch');
    if (payment.status !== 'paid') continue;
    const intent = payment.payment?.payment_intent;
    const charge = intent?.latest_charge;
    if (payment.payment?.type !== 'payment_intent' || !charge || typeof charge !== 'object'
      || intent.livemode !== !testMode || id(intent.customer) !== id(invoice.customer)
      || charge.livemode !== !testMode || id(charge.customer) !== id(invoice.customer)
      || id(charge.payment_intent) !== intent.id || charge.currency !== invoice.currency
      || !Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0
      || charge.amount_refunded > charge.amount) throw Error('Refund evidence unavailable');
    // Split/partially allocated payments require an explicit allocation review.
    if (payment.amount_paid !== charge.amount) throw Error('Split payment refund requires review');
    if (!seen.has(charge.id)) { refundedAmount += charge.amount_refunded; seen.add(charge.id); }
  }
  if (!payments.data.length) throw Error('Invoice payment evidence unavailable');
  return { refundedAmount, refundStatus: refundedAmount === 0 ? 'none'
    : refundedAmount >= invoice.total ? 'full' : 'partial' };
}

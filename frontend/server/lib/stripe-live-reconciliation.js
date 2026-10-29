import { productionPrices, validateProductionPrice } from './stripe-production-catalog.js';

const id = (value) => typeof value === 'string' ? value : value?.id;
const must = (condition) => { if (!condition) throw new Error('Stripe payment requires review'); };
const date = (seconds) => { must(Number.isSafeInteger(seconds) && seconds > 0); return new Date(seconds * 1000).toISOString(); };

export function creditPaymentEffect(session, lines, intent, order, binding) {
  const expected = productionPrices[order.kind];
  must(expected && ['recharge100', 'recharge200'].includes(order.kind));
  must(session.id === order.session_id && session.livemode === true && session.mode === 'payment'
    && session.status === 'complete' && session.payment_status === 'paid'
    && id(session.customer) === binding.customer_id && session.currency === 'eur'
    && session.amount_total === expected.amount && session.amount_subtotal === expected.amount
    && session.total_details?.amount_discount === 0 && session.total_details?.amount_tax === 0
    && session.total_details?.amount_shipping === 0 && session.consent?.terms_of_service === 'accepted');
  must(session.metadata?.carnetpass_order_id === order.id
    && session.metadata?.cgv_version === order.terms_version
    && session.metadata?.cgv_sha256 === order.terms_sha256);
  must(lines.has_more === false && lines.data?.length === 1);
  const line = lines.data[0];
  validateProductionPrice(order.kind, line.price);
  must(line.quantity === 1 && line.amount_total === expected.amount);
  must(intent.id === id(session.payment_intent) && intent.livemode === true && intent.status === 'succeeded'
    && id(intent.customer) === binding.customer_id && intent.amount_received === expected.amount
    && intent.currency === 'eur' && intent.latest_charge?.paid === true
    && intent.latest_charge.livemode === true && intent.latest_charge.amount_refunded === 0
    && intent.latest_charge.disputed === false);
  return { kind: 'credits', customer_id: binding.customer_id, order_id: order.id,
    session_id: session.id, payment_intent_id: intent.id };
}

export function subscriptionPaymentEffect(sub, binding, state, order, now = Date.now()) {
  must(sub.livemode === true && id(sub.customer) === binding.customer_id && /^sub_[A-Za-z0-9]+$/.test(sub.id));
  must(!state.subscription_id || state.subscription_id === sub.id);
  const items = sub.items;
  must(items?.has_more === false && items.data?.length >= 1 && items.data.length <= 2);
  const base = items.data.find((item) => item.price?.id === productionPrices.pro.id);
  const extra = items.data.find((item) => item.price?.id === productionPrices.additionalAccount.id);
  must(base && base.quantity === 1 && items.data.every((item) => item === base || item === extra));
  validateProductionPrice('pro', base.price);
  if (extra) validateProductionPrice('additionalAccount', extra.price);
  must(!extra || (Number.isSafeInteger(extra.quantity) && extra.quantity > 0));
  const end = base.current_period_end || sub.current_period_end;
  // The portal uses cancel_at in flexible mode, and the legacy flag in classic mode.
  let cancellationAt = null;
  if (sub.cancel_at != null) cancellationAt = date(sub.cancel_at);
  else if (sub.cancel_at_period_end === true) cancellationAt = date(end);
  const seats = extra?.quantity || 0;
  if (!state.subscription_id) must(order?.kind === 'pro' && order.company_id === binding.company_id);
  const common = { kind: 'subscription', customer_id: binding.customer_id, subscription_id: sub.id,
    order_id: order?.id || null, cancellation_at: cancellationAt };
  if (['canceled', 'unpaid', 'incomplete_expired', 'paused'].includes(sub.status)) {
    return { ...common, cancellation_at: null, status: 'canceled', seats: 0, paid_until: new Date(now).toISOString() };
  }
  if (sub.status === 'past_due') {
    return { ...common, status: 'past_due', seats: 0, paid_until: state.paid_until || new Date(now).toISOString() };
  }
  must(sub.status === 'active' && !sub.pending_update && !sub.automatic_tax?.enabled
    && !sub.default_tax_rates?.length && !sub.discount && !sub.discounts?.length);
  const invoice = sub.latest_invoice;
  must(invoice && typeof invoice === 'object' && invoice.livemode === true
    && invoice.status === 'paid' && invoice.amount_remaining === 0 && !invoice.paid_out_of_band
    && id(invoice.customer) === binding.customer_id && invoice.currency === 'eur'
    && id(invoice.subscription || invoice.parent?.subscription_details?.subscription) === sub.id
    && invoice.amount_paid === invoice.total && invoice.amount_paid > 0
    && !invoice.total_discount_amounts?.length && !(invoice.total_taxes || invoice.total_tax_amounts || []).some((tax) => tax.amount)
    && invoice.lines?.has_more === false);
  const covers = (item, name) => invoice.lines.data.some((line) => {
    const price = id(line.price) || line.pricing?.price_details?.price;
    return price === productionPrices[name].id && line.quantity === item.quantity
      && line.period?.end >= end && line.amount > 0;
  });
  // Proration invoices do not prove a new base period: retain its previously paid bound.
  must(covers(base, 'pro') || Date.parse(state.paid_until || '') >= end * 1000);
  must(!extra || ((extra.current_period_end || end) === end && covers(extra, 'additionalAccount')));
  must(invoice.lines.data.every((line) => [productionPrices.pro.id, productionPrices.additionalAccount.id]
    .includes(id(line.price) || line.pricing?.price_details?.price)));
  const accessEnd = cancellationAt ? Math.min(end * 1000, Date.parse(cancellationAt)) : end * 1000;
  must(accessEnd > now);
  return { ...common, status: 'active', seats, paid_until: date(accessEnd / 1000) };
}

export function creditRefundEffect(charge, purchase, binding) {
  must(charge.livemode === true && id(charge.customer) === binding.customer_id
    && id(charge.payment_intent) === purchase.payment_intent_id && charge.currency === 'eur'
    && Number.isSafeInteger(charge.amount_refunded) && charge.amount_refunded >= 0
    && charge.amount === purchase.credits * 10);
  return { kind: 'refund', customer_id: binding.customer_id, payment_intent_id: purchase.payment_intent_id,
    revoked_credits: charge.disputed ? purchase.credits : Math.min(purchase.credits, Math.ceil(charge.amount_refunded / 10)) };
}

export function createLiveStripeReader(env = process.env, request = fetch) {
  return async (path) => {
    must(/^(?:sk|rk)_live_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY || ''));
    let response;
    try { response = await request(`https://api.stripe.com/v1/${path}`, {
      method: 'GET', signal: AbortSignal.timeout(10000), headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': '2026-08-26.dahlia',
      },
    }); } catch { throw new Error('Stripe read unavailable'); }
    if (!response.ok) throw new Error('Stripe read unavailable');
    try { return await response.json(); } catch { throw new Error('Stripe read unavailable'); }
  };
}

async function one(query) {
  const result = await query.maybeSingle();
  if (result.error) throw new Error('Billing storage unavailable');
  return result.data;
}

export async function reconcileLiveReceipt(db, stripe, receipt, now = Date.now()) {
  // A prior successful transaction already includes both the rights and the receipt.
  const stored = await one(db.from('stripe_live_event_inbox').select('processing_status')
    .eq('account_id', receipt.account_id).eq('event_id', receipt.event_id));
  if (!stored) throw new Error('Receipt missing');
  if (stored.processing_status === 'processed') return 'duplicate';
  let order, subscriptionId, sessionId, chargeId, object;
  if (receipt.event_type.startsWith('checkout.session.')) {
    sessionId = receipt.object_id;
    order = await one(db.from('stripe_live_orders').select('*').eq('session_id', sessionId));
  } else if (receipt.event_type.startsWith('customer.subscription.')) {
    subscriptionId = receipt.object_id;
  } else if (receipt.event_type.startsWith('invoice.')) {
    object = await stripe(`invoices/${encodeURIComponent(receipt.object_id)}`);
    subscriptionId = id(object.subscription || object.parent?.subscription_details?.subscription);
  } else if (receipt.event_type === 'charge.refunded') chargeId = receipt.object_id;
  else if (receipt.event_type.startsWith('charge.dispute.')) {
    object = await stripe(`disputes/${encodeURIComponent(receipt.object_id)}`);
    chargeId = id(object.charge);
  }
  let state = subscriptionId ? await one(db.from('stripe_live_company_state').select('*').eq('subscription_id', subscriptionId)) : null;
  if (chargeId) object = await stripe(`charges/${encodeURIComponent(chargeId)}`);
  const binding = order || state
    ? await one(db.from('stripe_live_customers').select('*').eq('company_id', (order || state).company_id))
    : object?.customer ? await one(db.from('stripe_live_customers').select('*').eq('customer_id', id(object.customer))) : null;
  // A webhook cannot invent a customer/company binding. Keep unbound receipts pending for replay.
  if (!binding || binding.account_id !== receipt.account_id) return 'pending';
  const lease = await db.rpc('claim_stripe_live_company', { p_company: binding.company_id });
  if (lease.error || !lease.data) throw new Error('Reconciliation busy');
  state = await one(db.from('stripe_live_company_state').select('*').eq('company_id', binding.company_id));
  let effect;
  if (sessionId) {
    const session = await stripe(`checkout/sessions/${encodeURIComponent(sessionId)}`);
    if (order.kind === 'pro') {
      must(session.livemode === true && id(session.customer) === binding.customer_id
        && session.consent?.terms_of_service === 'accepted' && session.metadata?.carnetpass_order_id === order.id
        && session.metadata?.cgv_version === order.terms_version
        && session.metadata?.cgv_sha256 === order.terms_sha256
        && session.status === 'complete' && session.payment_status === 'paid' && session.mode === 'subscription');
      subscriptionId = id(session.subscription);
    } else {
      const lines = await stripe(`checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=100&expand%5B%5D=data.price.product`);
      const intent = await stripe(`payment_intents/${encodeURIComponent(id(session.payment_intent))}?expand%5B%5D=latest_charge`);
      effect = creditPaymentEffect(session, lines, intent, order, binding);
    }
  }
  if (subscriptionId) {
    const snapshot = await stripe(`subscriptions/${encodeURIComponent(subscriptionId)}?expand%5B%5D=items.data.price.product&expand%5B%5D=latest_invoice`);
    let entitlementState = state;
    if (order?.kind === 'pro' && sessionId && state.subscription_id && state.subscription_id !== subscriptionId) {
      const previous = await stripe(`subscriptions/${encodeURIComponent(state.subscription_id)}`);
      must(previous.id === state.subscription_id && previous.livemode === true && id(previous.customer) === binding.customer_id && previous.status === 'canceled');
      // SQL independently requires the old local subscription to be canceled and a new stored order.
      entitlementState = { ...state, subscription_id: null };
    }
    effect = subscriptionPaymentEffect(snapshot, binding, entitlementState, order, now);
  } else if (chargeId) {
    const charge = await stripe(`charges/${encodeURIComponent(chargeId)}`);
    const purchase = await one(db.from('stripe_live_credit_purchases').select('*').eq('payment_intent_id', id(charge.payment_intent)));
    effect = purchase ? creditRefundEffect(charge, purchase, binding) : { kind: 'review', customer_id: binding.customer_id };
  }
  if (!effect) effect = { kind: 'review', customer_id: binding.customer_id };
  const applied = await db.rpc('apply_stripe_live_effect', { p_company: binding.company_id, p_token: lease.data,
    p_event: receipt.event_id, p_effect: effect });
  if (applied.error || !['processed', 'duplicate', 'review'].includes(applied.data)) throw new Error('Reconciliation failed');
  return applied.data;
}

export async function runLiveReconciliationBatch(db, stripe, now = Date.now()) {
  const { data, error } = await db.from('stripe_live_event_inbox').select('*')
    .eq('processing_status', 'pending').lte('next_attempt_at', new Date(now).toISOString())
    .order('next_attempt_at').order('received_at').limit(10);
  if (error) throw new Error('Billing queue unavailable');
  const counts = { processed: 0, review: 0, deferred: 0 };
  for (const receipt of data || []) {
    let result;
    try { result = await reconcileLiveReceipt(db, stripe, receipt, now); }
    catch { result = 'pending'; }
    if (['processed', 'duplicate'].includes(result)) counts.processed++;
    else if (result === 'review') counts.review++;
    else {
      counts.deferred++;
      const update = await db.from('stripe_live_event_inbox').update({
        next_attempt_at: new Date(now + 300000).toISOString(), attempt_count: receipt.attempt_count + 1,
      }).eq('account_id', receipt.account_id).eq('event_id', receipt.event_id).eq('processing_status', 'pending');
      if (update.error) throw new Error('Billing retry unavailable');
    }
  }
  return counts;
}

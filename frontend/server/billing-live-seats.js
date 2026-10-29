import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { accountMfaAccessError } from './lib/mfa-access.js';
import { readDevisBody, rateRequest } from './lib/devis-security.js';
import { liveCheckoutEnabled } from './billing-live.js';
import { productionPrices, validateProductionPrice } from './lib/stripe-production-catalog.js';
import { acceptedCommercialTerms, COMMERCIAL_TERMS_VERSION, COMMERCIAL_TERMS_SHA256 } from '../shared/commercial-terms.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const id = value => typeof value === 'string' ? value : value?.id;
const requireValue = (ok, message = 'Cette opération nécessite une vérification. Contactez le support.') => {
  if (!ok) throw Error(message);
};
async function one(query) { const result = await query.maybeSingle(); if (result.error) throw Error('Stockage indisponible.'); return result.data; }
export function liveSeatsEnabled(env) { return liveCheckoutEnabled(env) && env.CARNETPASS_LIVE_SEATS_ENABLED === 'true'; }
export function seatSubscription(sub, customer) {
  requireValue(sub.livemode === true && id(sub.customer) === customer && sub.status === 'active'
    && sub.collection_method === 'charge_automatically' && !sub.automatic_tax?.enabled
    && !sub.default_tax_rates?.length && !sub.discount && !sub.discounts?.length
    && !sub.cancel_at && !sub.cancel_at_period_end && !sub.pause_collection);
  requireValue(sub.items?.has_more === false && sub.items.data.length >= 1 && sub.items.data.length <= 2);
  const base = sub.items.data.find(item => item.price?.id === productionPrices.pro.id);
  const extra = sub.items.data.find(item => item.price?.id === productionPrices.additionalAccount.id);
  requireValue(base?.quantity === 1 && sub.items.data.every(item => item === base || item === extra));
  validateProductionPrice('pro', base.price);
  if (extra) { validateProductionPrice('additionalAccount', extra.price); requireValue(Number.isSafeInteger(extra.quantity) && extra.quantity > 0); }
  const end = base.current_period_end || sub.current_period_end;
  requireValue(Number.isSafeInteger(end) && end * 1000 > Date.now() && (!extra || (extra.current_period_end || end) === end));
  return { base, extra, end, quantity: extra?.quantity || 0 };
}
export function seatUpdateParams(snapshot, quantity) {
  const params = { payment_behavior: 'pending_if_incomplete', proration_behavior: 'always_invoice', 'expand[0]': 'latest_invoice' };
  if (snapshot.extra) { params['items[0][id]'] = snapshot.extra.id; params['items[0][quantity]'] = String(quantity); }
  else { params['items[0][price]'] = productionPrices.additionalAccount.id; params['items[0][quantity]'] = String(quantity); }
  return params;
}
export function seatPreviewAmount(preview, customer) {
  requireValue(preview.livemode === true && id(preview.customer) === customer && preview.currency === 'eur'
    && preview.lines?.has_more === false && !preview.total_discount_amounts?.length
    && !(preview.total_taxes || preview.total_tax_amounts || []).some(tax => tax.amount)
    && !preview.starting_balance && !preview.lines.data.some(line => line.parent?.invoice_item_details));
  for (const line of preview.lines.data) requireValue([productionPrices.pro.id, productionPrices.additionalAccount.id]
    .includes(id(line.price) || line.pricing?.price_details?.price));
  const amount = preview.lines.data.filter(line => line.parent?.subscription_item_details?.proration === true || line.proration === true)
    .reduce((sum, line) => sum + line.amount, 0);
  requireValue(Number.isSafeInteger(amount) && amount >= 0);
  return amount;
}
const fingerprint = (sub, snapshot) => createHash('sha256').update(JSON.stringify({ id: sub.id, end: snapshot.end,
  items: sub.items.data.map(item => [item.id, item.price.id, item.quantity]).sort(), schedule: id(sub.schedule) || null })).digest('hex');
function summary(change) {
  return change ? { id: change.id, quantity: change.quantity, previousQuantity: change.previous_quantity,
    immediateAmountCents: change.immediate_amount, totalMonthlyEuros: 28 + change.quantity * 20,
    nextRenewal: change.effective_at, status: change.status, retainedMembers: change.retained_members || [] } : null;
}
export function createLiveSeatsHandler({ env = process.env, clientFactory = createClient, request = fetch, rateLimiter = rateRequest } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const send = (status, message, extra = {}) => res.status(status).json({ message, ...extra });
    if (!liveSeatsEnabled(env)) return send(503, 'Les modifications de places ne sont pas ouvertes.');
    const action = req.query?.action;
    if (req.method !== (action === 'additional-status' ? 'GET' : 'POST')) return send(405, 'Méthode non autorisée.');
    const token = /^Bearer ([^\s]{1,16384})$/i.exec(req.headers?.authorization || '')?.[1];
    if (!token) return send(401, 'Reconnectez-vous.');
    let db, companyId, lease;
    const stripe = async (path, params, key) => {
      const response = await request(`https://api.stripe.com/v1/${path}`, { method: params ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': '2026-08-26.dahlia',
          ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': key } : {}) },
        body: params ? new URLSearchParams(params) : undefined, signal: AbortSignal.timeout(10000) });
      requireValue(response.ok, 'Stripe est momentanément indisponible. Reprenez cette opération sans en créer une nouvelle.');
      const result = await response.json(); requireValue(result.livemode !== false); return result;
    };
    try {
      db = clientFactory(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, options);
      const auth = clientFactory(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
      const { data, error } = await auth.auth.getUser(token);
      const user = data?.user;
      if (error || !user?.email_confirmed_at || user.is_anonymous) return send(401, 'Reconnectez-vous.');
      const mfa = await accountMfaAccessError(user, token, db); if (mfa) return send(mfa.status, mfa.message);
      const members = await db.from('company_members').select('company_id,role').eq('user_id', user.id).limit(2);
      requireValue(!members.error && members.data?.length === 1);
      if (!['owner', 'admin'].includes(members.data[0].role)) return send(403, 'Seul le responsable peut modifier les places.');
      companyId = members.data[0].company_id;
      const pending = await db.from('stripe_live_seat_changes').select('*').eq('company_id', companyId)
        .in('status', ['applying', 'awaiting_payment', 'scheduled']).limit(2);
      requireValue(!pending.error && pending.data.length <= 1);
      if (action === 'additional-status') return send(200, '', { change: summary(pending.data[0]) });
      await rateLimiter(req, 'live-seat-change', user.id, 20);
      const body = await readDevisBody(req, 8192);
      if (!uuid.test(body.requestId || '') || (action !== 'additional-quote' && !acceptedCommercialTerms(body.terms))) return send(400, 'Acceptez les CGV et vérifiez votre demande.');
      const claimed = await db.rpc('claim_stripe_live_company', { p_company: companyId });
      if (claimed.error || !claimed.data) return send(409, 'Une opération est déjà en cours. Réessayez.');
      lease = claimed.data;
      const binding = await one(db.from('stripe_live_customers').select('*').eq('company_id', companyId));
      const state = await one(db.from('stripe_live_company_state').select('*').eq('company_id', companyId));
      const local = await one(db.from('subscriptions').select('plan,status,stripe_live_managed,current_period_end').eq('company_id', companyId));
      requireValue(binding?.account_id === env.STRIPE_EXPECTED_ACCOUNT_ID && /^cus_[A-Za-z0-9]+$/.test(binding.customer_id || '')
        && /^sub_[A-Za-z0-9]+$/.test(state?.subscription_id || '') && local?.stripe_live_managed
        && local.plan === 'pro' && local.status === 'active' && Date.parse(local.current_period_end) > Date.now());
      const account = await stripe('account'); requireValue(account.id === binding.account_id);
      const sub = await stripe(`subscriptions/${state.subscription_id}?expand[]=items.data.price.product`);
      requireValue(sub.id === state.subscription_id);
      const snapshot = seatSubscription(sub, binding.customer_id);
      const existing = await one(db.from('stripe_live_seat_changes').select('*').eq('id', body.requestId).eq('company_id', companyId));
      const update = async (change, values, expectedStatus) => {
        const query = db.from('stripe_live_seat_changes').update(values).eq('id', change.id).eq('company_id', companyId);
        const saved = await (expectedStatus ? query.eq('status', expectedStatus) : query);
        requireValue(!saved.error, 'La sauvegarde est indisponible. Reprenez la même opération.');
      };
      const invoiceResult = async change => {
        if (!change.invoice_id) return send(200, 'Modification enregistrée. Les places seront confirmées après le paiement.', { change: summary(change) });
        const invoice = await stripe(`invoices/${change.invoice_id}`);
        requireValue(invoice.livemode === true && id(invoice.customer) === binding.customer_id);
        let url;
        if (invoice.hosted_invoice_url) {
          const parsed = new URL(invoice.hosted_invoice_url);
          requireValue(parsed.protocol === 'https:' && parsed.hostname === 'invoice.stripe.com' && !parsed.port && !parsed.username && !parsed.password);
          url = parsed.href;
        }
        return send(200, 'La capacité est mise à jour uniquement après confirmation du paiement.', { change: summary(change), url });
      };
      if (action === 'additional-quote') {
        if (pending.data.length) return send(409, 'Terminez ou annulez la modification déjà en cours.');
        if (existing) return send(200, '', { quote: summary(existing) });
        requireValue(!sub.pending_update && !sub.schedule);
        requireValue(Number.isSafeInteger(body.quantity) && body.quantity >= 0 && body.quantity <= 100 && body.quantity !== snapshot.quantity, 'Choisissez entre 0 et 100 comptes supplémentaires.');
        const reduction = body.quantity < snapshot.quantity;
        const keep = reduction ? body.retainedMembers : [];
        requireValue(Array.isArray(keep) && keep.length <= body.quantity && new Set(keep).size === keep.length && keep.every(value => uuid.test(value)), 'Vérifiez les collaborateurs à conserver.');
        const assigned = await db.from('pro_account_assignments').select('user_id').eq('company_id', companyId);
        requireValue(!assigned.error && keep.every(value => assigned.data.some(row => row.user_id === value)));
        const customer = await stripe(`customers/${binding.customer_id}`);
        requireValue(customer.id === binding.customer_id && customer.livemode === true && !customer.deleted
          && !customer.balance && !customer.discount && !customer.discounts?.length);
        let amount = 0;
        const prorationDate = Math.floor(Date.now() / 1000);
        const params = reduction ? {} : seatUpdateParams(snapshot, body.quantity);
        if (!reduction) {
          const previewParams = { customer: binding.customer_id, subscription: sub.id,
            'subscription_details[proration_date]': String(prorationDate), 'subscription_details[proration_behavior]': 'always_invoice' };
          for (const [key, value] of Object.entries(params)) if (key.startsWith('items[')) previewParams['subscription_details[' + key.replace('items[', 'items][')] = value;
          amount = seatPreviewAmount(await stripe('invoices/create_preview', previewParams, `carnetpass-seat-preview-${body.requestId}-${lease}`), binding.customer_id);
          params.proration_date = String(prorationDate);
        }
        const change = { id: body.requestId, company_id: companyId, user_id: user.id, subscription_id: sub.id,
          quantity: body.quantity, previous_quantity: snapshot.quantity, retained_members: keep, immediate_amount: amount,
          effective_at: new Date(snapshot.end * 1000).toISOString(), proration_date: prorationDate, fingerprint: fingerprint(sub, snapshot),
          stripe_params: params, terms_version: COMMERCIAL_TERMS_VERSION, terms_sha256: COMMERCIAL_TERMS_SHA256, status: 'quoted' };
        const inserted = await db.from('stripe_live_seat_changes').insert(change); requireValue(!inserted.error);
        return send(200, 'Récapitulatif prêt, aucun paiement déclenché.', { quote: summary(change) });
      }
      requireValue(existing && existing.user_id === user.id && existing.subscription_id === sub.id, 'Récapitulatif introuvable.');
      if (action === 'additional-cancel') {
        requireValue(existing.status === 'scheduled' && /^sub_sched_[A-Za-z0-9]+$/.test(existing.schedule_id));
        const schedule = await stripe(`subscription_schedules/${existing.schedule_id}`);
        requireValue(schedule.livemode === true && id(schedule.customer) === binding.customer_id
          && id(schedule.subscription) === sub.id && schedule.metadata?.carnetpass_seat_change === existing.id
          && Date.parse(existing.effective_at) > Date.now());
        const released = await stripe(`subscription_schedules/${existing.schedule_id}/release`, { preserve_cancel_date: 'false' }, `carnetpass-seat-release-${existing.id}`);
        requireValue(released.status === 'released'); await update(existing, { status: 'canceled' });
        return send(200, 'La réduction programmée est annulée.');
      }
      requireValue(action === 'additional-update');
      if (existing.status === 'awaiting_payment' || existing.status === 'applied') return invoiceResult(existing);
      if (existing.status === 'scheduled') return send(200, 'Réduction déjà programmée.', { change: summary(existing) });
      requireValue(['quoted', 'applying'].includes(existing.status) && existing.terms_version === COMMERCIAL_TERMS_VERSION
        && existing.terms_sha256 === COMMERCIAL_TERMS_SHA256);
      if (existing.status === 'quoted') {
        requireValue(Math.abs(Date.now() / 1000 - existing.proration_date) <= 300
          && fingerprint(sub, snapshot) === existing.fingerprint && !sub.pending_update && !sub.schedule, 'Ce récapitulatif a expiré ou l’abonnement a changé. Recalculez-le.');
        const conflict = await db.from('stripe_live_seat_changes').select('id').eq('company_id', companyId).in('status', ['applying', 'awaiting_payment', 'scheduled']).limit(1);
        requireValue(!conflict.error && !conflict.data.length, 'Une autre modification est déjà en cours.');
        const customer = await stripe(`customers/${binding.customer_id}`);
        requireValue(customer.livemode === true && customer.id === binding.customer_id && !customer.balance && !customer.discount && !customer.discounts?.length);
        if (existing.quantity > existing.previous_quantity) {
          const previewParams = { customer: binding.customer_id, subscription: sub.id,
            'subscription_details[proration_date]': String(existing.proration_date), 'subscription_details[proration_behavior]': 'always_invoice' };
          for (const [key, value] of Object.entries(existing.stripe_params)) if (key.startsWith('items[')) previewParams['subscription_details[' + key.replace('items[', 'items][')] = value;
          const preview = await stripe('invoices/create_preview', previewParams, `carnetpass-seat-recheck-${existing.id}-${lease}`);
          requireValue(seatPreviewAmount(preview, binding.customer_id) === existing.immediate_amount, 'Le montant a changé. Recalculez le récapitulatif avant de payer.');
        }
        const assigned = await db.from('pro_account_assignments').select('user_id').eq('company_id', companyId);
        requireValue(!assigned.error && existing.retained_members.every(value => assigned.data.some(row => row.user_id === value)), 'Les collaborateurs ont changé. Recalculez le récapitulatif.');
        await update(existing, { status: 'applying', accepted_at: new Date().toISOString() }, 'quoted');
      } else requireValue(Date.now() / 1000 - existing.proration_date < 86400, 'Cette opération doit être reprise par le support.');
      if (existing.quantity > existing.previous_quantity) {
        const updated = await stripe(`subscriptions/${sub.id}`, existing.stripe_params, `carnetpass-seat-increase-${existing.id}`);
        requireValue(updated.id === sub.id && updated.livemode === true && id(updated.customer) === binding.customer_id);
        const invoice = updated.latest_invoice;
        requireValue(/^in_[A-Za-z0-9]+$/.test(id(invoice) || ''));
        await update(existing, { invoice_id: id(invoice), status: 'awaiting_payment' }, 'applying');
        return invoiceResult({ ...existing, invoice_id: id(invoice), status: 'awaiting_payment' });
      }
      requireValue(Date.parse(existing.effective_at) > Date.now(), 'L’échéance a changé. Contactez le support.');
      let schedule;
      if (existing.schedule_id) schedule = await stripe(`subscription_schedules/${existing.schedule_id}`);
      else {
        schedule = await stripe('subscription_schedules', { from_subscription: sub.id }, `carnetpass-seat-schedule-create-${existing.id}`);
        requireValue(/^sub_sched_[A-Za-z0-9]+$/.test(schedule.id || '') && (!sub.schedule || id(sub.schedule) === schedule.id));
        await update(existing, { schedule_id: schedule.id });
      }
      requireValue(schedule.livemode === true && id(schedule.customer) === binding.customer_id && id(schedule.subscription) === sub.id && schedule.status === 'active');
      const params = { end_behavior: 'release', proration_behavior: 'none', 'metadata[carnetpass_seat_change]': existing.id,
        'phases[0][start_date]': String(schedule.current_phase.start_date), 'phases[0][end_date]': String(Math.floor(Date.parse(existing.effective_at) / 1000)),
        'phases[0][proration_behavior]': 'none', 'phases[1][proration_behavior]': 'none',
        'phases[1][duration][interval]': 'month', 'phases[1][duration][interval_count]': '1' };
      for (const phase of [0, 1]) {
        params[`phases[${phase}][items][0][price]`] = productionPrices.pro.id;
        params[`phases[${phase}][items][0][quantity]`] = '1';
        const qty = phase === 0 ? existing.previous_quantity : existing.quantity;
        if (qty > 0) { params[`phases[${phase}][items][1][price]`] = productionPrices.additionalAccount.id; params[`phases[${phase}][items][1][quantity]`] = String(qty); }
      }
      const updated = await stripe(`subscription_schedules/${schedule.id}`, params, `carnetpass-seat-schedule-update-${existing.id}`);
      requireValue(updated.id === schedule.id && updated.livemode === true && id(updated.customer) === binding.customer_id);
      await update(existing, { status: 'scheduled' }, 'applying');
      return send(200, 'Réduction programmée à la prochaine échéance. Aucun accès n’est retiré aujourd’hui.', { change: summary({ ...existing, status: 'scheduled' }) });
    } catch (error) { return send(409, error.message?.startsWith('Stockage') ? 'Le récapitulatif est indisponible. Réessayez.' : error.message || 'Modification indisponible.'); }
    finally {
      if (lease && db) try { await db.from('stripe_live_company_state').update({ lease_token: null, lease_until: null }).eq('company_id', companyId).eq('lease_token', lease); } catch { /* expires naturally */ }
    }
  };
}
export default createLiveSeatsHandler();

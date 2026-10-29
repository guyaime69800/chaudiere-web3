import { createClient } from '@supabase/supabase-js';
import { accountMfaAccessError } from './lib/mfa-access.js';
import { readDevisBody, rateRequest } from './lib/devis-security.js';
import { additionalAccountAccess } from './lib/additional-account-access.js';
import { productionPrices, validateProductionPrice } from './lib/stripe-production-catalog.js';
import { acceptedCommercialTerms, commercialTermsMetadata, COMMERCIAL_TERMS_VERSION, COMMERCIAL_TERMS_SHA256 } from '../shared/commercial-terms.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const origin = 'https://www.carnetpass.fr';
const options = { auth: { persistSession: false, autoRefreshToken: false } };
function checkoutUrl(session, customer) {
  if (session.livemode !== true || !/^cs_live_[A-Za-z0-9]+$/.test(session.id || '') || session.customer !== customer) throw Error('Checkout mismatch');
  const url = new URL(session.url);
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.username || url.password || url.port) throw Error('Checkout URL mismatch');
  return url.href;
}
export function liveCheckoutEnabled(env = process.env) {
  return env.VERCEL_ENV === 'production' && env.VERCEL_GIT_COMMIT_REF === 'main'
    && env.VITE_SUPABASE_URL === 'https://tsyukqcyfxcrjrhopvpv.supabase.co'
    && env.CARNETPASS_LIVE_BILLING_ENABLED === 'true'
    && env.CARNETPASS_STRIPE_LIVE_PROCESSING_ENABLED === 'true'
    && env.CARNETPASS_STRIPE_LIVE_WEBHOOK_ENABLED === 'true'
    && /^(?:sk|rk)_live_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY || '')
    && /^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_LIVE_WEBHOOK_SECRET || '')
    && /^acct_[A-Za-z0-9]+$/.test(env.STRIPE_EXPECTED_ACCOUNT_ID || '')
    && Boolean(env.SUPABASE_SECRET_KEY && env.VITE_SUPABASE_PUBLISHABLE_KEY);
}
async function row(query) {
  const result = await query.maybeSingle();
  if (result.error) throw new Error('Storage unavailable');
  return result.data;
}
export function createLiveBillingHandler({ env = process.env, clientFactory = createClient, request = fetch, rateLimiter = rateRequest } = {}) {
  return async (req, res, { recharge = false } = {}) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const send = (status, message, extra = {}) => res.status(status).json({ ok: status < 400, message, ...extra });
    if (req.query?.action === 'purchase-status') {
      if (req.method !== 'GET') return send(405, 'Méthode non autorisée.');
      return send(200, '', { available: liveCheckoutEnabled(env), seatsAvailable: liveCheckoutEnabled(env) && env.CARNETPASS_LIVE_SEATS_ENABLED === 'true' });
    }
    if (!liveCheckoutEnabled(env)) return send(503, 'Les achats ne sont pas ouverts.');
    if (req.method !== 'POST') return send(405, 'Méthode non autorisée.');
    const bearer = /^Bearer ([^\s]{1,16384})$/i.exec(req.headers?.authorization || '')?.[1];
    if (!bearer) return send(401, 'Reconnectez-vous.');
    let lease, companyId, db;
    async function stripe(path, params, idempotencyKey) {
      let response;
      try { response = await request(`https://api.stripe.com/v1/${path}`, {
        method: params ? 'POST' : 'GET', signal: AbortSignal.timeout(10000), headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': '2026-08-26.dahlia',
          ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': idempotencyKey } : {}),
        }, body: params ? new URLSearchParams(params) : undefined,
      }); } catch { throw new Error('Stripe unavailable'); }
      if (!response.ok) throw new Error('Stripe unavailable');
      return response.json();
    }
    try {
      let body;
      try { body = await readDevisBody(req, 8192); } catch { return send(400, 'Requête invalide.'); }
      const kind = recharge ? (body.euros === 10 ? 'recharge100' : body.euros === 20 ? 'recharge200' : null)
        : body.action === 'checkout' && body.plan === 'pro' ? 'pro' : null;
      if (!kind || !uuid.test(body.requestId || '') || !acceptedCommercialTerms(body.terms)) return send(400, 'Vérifiez la commande et acceptez les CGV en vigueur.');
      db = clientFactory(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, options);
      const auth = clientFactory(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
      const { data, error } = await auth.auth.getUser(bearer);
      const user = data?.user;
      if (error || !user?.email_confirmed_at || user.is_anonymous) return send(401, 'Reconnectez-vous.');
      const mfa = await accountMfaAccessError(user, bearer, db);
      if (mfa) return send(mfa.status, mfa.message);
      await rateLimiter(req, 'live-billing', user.id, 20);
      const members = await db.from('company_members').select('company_id,role').eq('user_id', user.id).limit(2);
      if (members.error || members.data?.length !== 1) return send(409, 'Entreprise non déterminée.');
      const member = members.data[0];
      companyId = member.company_id;
      if (kind === 'pro' && !['admin', 'owner'].includes(member.role)) return send(403, 'Achat réservé au responsable.');
      const company = await row(db.from('companies').select('siret,is_demo,company_verifications(status,verified_siret,verified_at)').eq('id', companyId));
      const verification = Array.isArray(company?.company_verifications) ? company.company_verifications[0] : company?.company_verifications;
      if (company?.is_demo || !/^\d{14}$/.test(company?.siret || '') || verification?.status !== 'approved'
        || verification.verified_siret !== company.siret || !verification.verified_at) return send(403, 'Entreprise vérifiée requise.');
      const subscription = await row(db.from('subscriptions').select('plan,status,current_period_end,stripe_live_managed,stripe_customer_id').eq('company_id', companyId));
      if (!subscription || subscription.plan === 'enterprise') return send(409, 'Cette formule nécessite un accompagnement.');
      const active = subscription.plan === 'pro' && subscription.status === 'active'
        && (!subscription.stripe_live_managed || Date.parse(subscription.current_period_end || '') > Date.now());
      if (kind === 'pro' && active) return send(409, 'Un abonnement est déjà actif.');
      if (kind !== 'pro' && !active) return send(409, 'Un abonnement Pro actif est requis pour acheter des crédits.');
      if (kind !== 'pro') {
        const entitlement = await additionalAccountAccess(db, { companyId, userId: user.id }, 'production');
        if (entitlement.expired || (!entitlement.additionalAccount && !['admin', 'owner'].includes(member.role))) {
          return send(403, 'La place de ce compte doit être active avant un achat.');
        }
      }
      const account = await stripe('account');
      if (account.id !== env.STRIPE_EXPECTED_ACCOUNT_ID || !account.charges_enabled || !account.payouts_enabled) throw new Error('Account mismatch');
      const price = await stripe(`prices/${productionPrices[kind].id}?expand%5B%5D=product`);
      validateProductionPrice(kind, price);
      let binding = await row(db.from('stripe_live_customers').select('*').eq('company_id', companyId));
      if (!binding) {
        const customer = await stripe('customers', { 'metadata[carnetpass_company_id]': companyId }, `carnetpass-live-customer-${companyId}`);
        if (!/^cus_[A-Za-z0-9]+$/.test(customer.id || '') || customer.livemode !== true) throw new Error('Customer mismatch');
        const inserted = await db.from('stripe_live_customers').upsert({ company_id: companyId, account_id: account.id, customer_id: customer.id },
          { onConflict: 'company_id', ignoreDuplicates: true });
        if (inserted.error) throw new Error('Customer persistence failed');
        binding = await row(db.from('stripe_live_customers').select('*').eq('company_id', companyId));
      }
      if (binding?.account_id !== account.id || (subscription.stripe_customer_id && subscription.stripe_customer_id !== binding.customer_id)) throw new Error('Customer mismatch');
      const claimed = await db.rpc('claim_stripe_live_company', { p_company: companyId });
      if (claimed.error || !claimed.data) return send(409, 'Une opération est en cours. Réessayez.');
      lease = claimed.data;
      if (kind === 'pro') {
        const state = await row(db.from('stripe_live_company_state').select('subscription_id').eq('company_id', companyId));
        if (state?.subscription_id) {
          if (subscription.status !== 'canceled') return send(409, 'Un abonnement existe déjà. Attendez sa synchronisation ou utilisez son portail.');
          const previous = await stripe(`subscriptions/${encodeURIComponent(state.subscription_id)}`);
          if (previous.id !== state.subscription_id || previous.livemode !== true || previous.customer !== binding.customer_id
            || previous.status !== 'canceled') return send(409, 'La fin du précédent abonnement doit être confirmée avant une nouvelle souscription.');
        }
        const recent = await db.from('stripe_live_orders').select('id,session_id').eq('company_id', companyId).eq('kind', 'pro')
          .order('created_at', { ascending: false }).limit(1);
        if (recent.error) throw new Error('Storage unavailable');
        if (recent.data?.[0] && !recent.data[0].session_id && recent.data[0].id !== body.requestId) {
          return send(409, 'Une commande existe déjà. Reprenez-la avant de créer un autre paiement.');
        }
        if (recent.data?.[0]?.session_id) {
          const session = await stripe(`checkout/sessions/${encodeURIComponent(recent.data[0].session_id)}`);
          if (session.status === 'open' && session.url) return send(200, 'Paiement en attente.', { url: checkoutUrl(session, binding.customer_id) });
          if (session.status === 'complete' && !(subscription.status === 'canceled' && state?.subscription_id
            && session.subscription === state.subscription_id)) return send(409, 'Votre paiement est en cours de synchronisation.');
        }
      }
      let order = await row(db.from('stripe_live_orders').select('*').eq('id', body.requestId));
      if (!order) {
        const inserted = await db.from('stripe_live_orders').insert({ id: body.requestId, company_id: companyId, user_id: user.id,
          kind, terms_version: COMMERCIAL_TERMS_VERSION, terms_sha256: COMMERCIAL_TERMS_SHA256 });
        if (inserted.error) throw new Error('Order persistence failed');
        order = await row(db.from('stripe_live_orders').select('*').eq('id', body.requestId));
      }
      if (order?.company_id !== companyId || order.user_id !== user.id || order.kind !== kind
        || order.terms_version !== COMMERCIAL_TERMS_VERSION || order.terms_sha256 !== COMMERCIAL_TERMS_SHA256) throw new Error('Order mismatch');
      if (order.session_id) {
        const session = await stripe(`checkout/sessions/${encodeURIComponent(order.session_id)}`);
        if (session.status !== 'open' || !session.url) return send(409, 'Cette commande a déjà été traitée ou a expiré.');
        return send(200, 'Paiement prêt.', { url: checkoutUrl(session, binding.customer_id) });
      }
      const params = { mode: kind === 'pro' ? 'subscription' : 'payment', customer: binding.customer_id,
        'line_items[0][price]': productionPrices[kind].id, 'line_items[0][quantity]': '1',
        'payment_method_types[0]': 'card', 'automatic_tax[enabled]': 'false',
        success_url: `${origin}/parametres-compte?paiement=retour`, cancel_url: `${origin}/parametres-compte?paiement=annule`,
        client_reference_id: order.id, 'metadata[carnetpass_order_id]': order.id,
        ...commercialTermsMetadata(user.id, companyId, order.created_at) };
      if (kind !== 'pro') Object.assign(params, { 'invoice_creation[enabled]': 'true',
        'invoice_creation[invoice_data][footer]': 'TVA non applicable, article 293 B du CGI.' });
      const session = await stripe('checkout/sessions', params, `carnetpass-live-order-${order.id}`);
      const url = checkoutUrl(session, binding.customer_id);
      const saved = await db.from('stripe_live_orders').update({ session_id: session.id }).eq('id', order.id).eq('company_id', companyId);
      if (saved.error) throw new Error('Checkout persistence failed');
      return send(200, 'Paiement prêt.', { url });
    } catch { return send(503, 'Paiement momentanément indisponible. Aucun accès ne sera attribué avant confirmation.'); }
    finally {
      if (lease && db) {
        try { await db.from('stripe_live_company_state').update({ lease_token: null, lease_until: null }).eq('company_id', companyId).eq('lease_token', lease); }
        catch { /* A failed release expires naturally; rights still require the live lease. */ }
      }
    }
  };
}
export default createLiveBillingHandler();

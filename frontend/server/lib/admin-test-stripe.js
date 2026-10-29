import { acceptedCommercialTerms } from '../../shared/commercial-terms.js';
import { fail } from './devis-security.js';

const returnUrl = 'https://www.carnetpass.fr/retour-facturation?test=1';
const lookupKey = 'carnetpass_paris2_admin_test_pro_v1';
const marker = 'paris2_admin_test_v1';
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const testStripeConfigured = env => /^(sk|rk)_test_[A-Za-z0-9]+$/.test(env.CARNETPASS_ADMIN_TEST_STRIPE_KEY || '');
export function testStripeUrl(value, hostname) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== hostname || url.port || url.username || url.password) throw Error('Invalid Stripe URL');
  return url.href;
}
export function verifyTestPrice(price) {
  if (!/^price_[A-Za-z0-9]+$/.test(price.id || '') || price.lookup_key !== lookupKey || price.metadata?.carnetpass_admin_test !== marker
    || price.livemode !== false || !price.active || price.currency !== 'eur' || price.unit_amount !== 2800
    || price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1 || price.recurring.usage_type !== 'licensed'
    || price.tax_behavior === 'exclusive') throw fail(503, 'Le tarif Stripe de test doit être vérifié.');
}
export async function testStripeAction(body, { command, env, user, request = fetch }) {
  // No fallback to STRIPE_SECRET_KEY. A live credential can never reach fetch.
  if (!testStripeConfigured(env)) throw fail(503, 'La clé Stripe de test est indisponible. Les paiements réels restent fermés.');
  if (body.action === 'checkout' && (!acceptedCommercialTerms(body.terms) || !idPattern.test(body.requestId))) throw fail(400, 'Acceptez les CGV et relancez le paiement de test.');
  const lease = await command('claim_billing');
  let state = { ...lease.data };
  const workspaceId = lease.workspaceId;
  const save = async () => command('save_billing', lease.token, state);
  async function stripe(path, params, idempotency) {
    const response = await request(`https://api.stripe.com/v1/${path}`, { method: params ? 'POST' : 'GET',
      signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${env.CARNETPASS_ADMIN_TEST_STRIPE_KEY}`,
        'Stripe-Version': '2026-08-26.dahlia', ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': idempotency } : {}) },
      body: params ? new URLSearchParams(params) : undefined });
    if (!response.ok) throw fail(503, 'Stripe test indisponible. Réessayez sans saisir de carte réelle.');
    const result = await response.json();
    if (result.livemode === true) throw Error('Live response forbidden');
    return result;
  }
  const checkCustomer = result => {
    if (result.customer !== state.customerId || result.livemode !== false) throw Error('Test customer scope mismatch');
  };
  async function session() {
    if (!/^cs_test_[A-Za-z0-9]+$/.test(state.sessionId || '')) throw fail(409, 'Aucun paiement de test à vérifier.');
    const found = await stripe(`checkout/sessions/${state.sessionId}`);
    checkCustomer(found);
    if (found.metadata?.carnetpass_admin_test !== marker || found.metadata?.workspace_id !== workspaceId || found.mode !== 'subscription') throw Error('Session scope mismatch');
    return found;
  }
  async function synchronize() {
    const checkout = await session();
    if (checkout.status !== 'complete' || checkout.payment_status !== 'paid') {
      state.status = checkout.status === 'expired' ? 'expired' : 'pending'; await save(); return checkout;
    }
    if (checkout.amount_total !== 2800 || checkout.currency !== 'eur' || !/^sub_[A-Za-z0-9]+$/.test(checkout.subscription || '')) throw Error('Checkout mismatch');
    const sub = await stripe(`subscriptions/${checkout.subscription}?expand[]=latest_invoice`);
    checkCustomer(sub);
    const items = sub.items?.data;
    const invoice = sub.latest_invoice;
    if (items?.length !== 1 || items[0].price?.id !== state.priceId || items[0].price?.livemode !== false || items[0].quantity !== 1
      || sub.metadata?.carnetpass_admin_test !== marker || sub.metadata?.workspace_id !== workspaceId) throw Error('Subscription mismatch');
    const end = items[0].current_period_end || sub.current_period_end;
    const paid = invoice?.livemode === false && invoice.customer === state.customerId && invoice.status === 'paid'
      && invoice.amount_paid === 2800 && invoice.currency === 'eur';
    state = { ...state, subscriptionId: sub.id, status: paid && ['active', 'trialing'].includes(sub.status) && end * 1000 > Date.now() ? 'active' : sub.status === 'canceled' ? 'canceled' : 'unpaid',
      // Flexible billing schedules portal cancellations with cancel_at instead of the legacy flag.
      paidUntil: paid && end ? new Date(end * 1000).toISOString() : null,
      cancelAtPeriodEnd: sub.status !== 'canceled' && (sub.cancel_at_period_end === true
        || (Number.isSafeInteger(sub.cancel_at) && sub.cancel_at > 0 && sub.cancel_at === end)) };
    await save(); return checkout;
  }
  try {
    const account = await stripe('account');
    if (!/^acct_[A-Za-z0-9]+$/.test(account.id || '') || (state.accountId && state.accountId !== account.id)) throw Error('Test account mismatch');
    state.accountId = account.id;
    if (body.action === 'checkout') {
      const prices = await stripe(`prices?active=true&lookup_keys[]=${lookupKey}&limit=2`);
      if (!Array.isArray(prices.data) || prices.data.length > 1 || prices.has_more) throw Error('Ambiguous test price');
      let price = prices.data[0];
      if (!price) {
        const product = await stripe('products', { name: 'CarnetPass Pro — TEST privé Paris 2', 'metadata[carnetpass_admin_test]': marker }, 'carnetpass-admin-test-product-v1');
        if (!/^prod_[A-Za-z0-9]+$/.test(product.id || '') || product.livemode !== false) throw Error('Invalid test product');
        price = await stripe('prices', { product: product.id, unit_amount: '2800', currency: 'eur', tax_behavior: 'inclusive', 'recurring[interval]': 'month',
          lookup_key: lookupKey, 'metadata[carnetpass_admin_test]': marker }, 'carnetpass-admin-test-price-v1');
      }
      verifyTestPrice(price);
      if (state.priceId && state.priceId !== price.id) throw Error('Test price changed');
      state.priceId = price.id;
      if (state.sessionId) {
        const previous = await synchronize();
        if (previous.status === 'open') return { url: testStripeUrl(previous.url, 'checkout.stripe.com') };
        if (state.subscriptionId && state.status !== 'canceled') throw fail(409, 'Un abonnement de test existe déjà. Utilisez son portail pour le gérer.');
        if (state.status === 'canceled') { delete state.subscriptionId; delete state.sessionId; }
      }
      if (!state.customerId) {
        const customer = await stripe('customers', { email: user.email, name: 'CarnetPass — compte de test privé',
          'metadata[carnetpass_admin_test]': marker, 'metadata[workspace_id]': workspaceId }, `carnetpass-test-customer-${workspaceId}`);
        if (!/^cus_[A-Za-z0-9]+$/.test(customer.id || '') || customer.livemode !== false) throw Error('Invalid test customer');
        state.customerId = customer.id; await save();
      }
      state.pendingRequest ||= body.requestId; await save();
      const checkout = await stripe('checkout/sessions', { mode: 'subscription', customer: state.customerId,
        'line_items[0][price]': state.priceId, 'line_items[0][quantity]': '1', 'payment_method_types[0]': 'card',
        'automatic_tax[enabled]': 'false', 'allow_promotion_codes': 'false', locale: 'fr',
        'metadata[carnetpass_admin_test]': marker, 'metadata[workspace_id]': workspaceId,
        'subscription_data[metadata][carnetpass_admin_test]': marker, 'subscription_data[metadata][workspace_id]': workspaceId,
        success_url: returnUrl, cancel_url: returnUrl }, `carnetpass-test-checkout-${workspaceId}-${state.pendingRequest}`);
      checkCustomer(checkout);
      if (!/^cs_test_[A-Za-z0-9]+$/.test(checkout.id || '')) throw Error('Invalid test session');
      const url = testStripeUrl(checkout.url, 'checkout.stripe.com');
      state = { ...state, sessionId: checkout.id, status: 'pending' }; delete state.pendingRequest; await save();
      return { url };
    }
    if (body.action === 'sync-billing') { await synchronize(); return { status: state.status, paidUntil: state.paidUntil, cancelAtPeriodEnd: state.cancelAtPeriodEnd }; }
    if (!/^cus_[A-Za-z0-9]+$/.test(state.customerId || '')) throw fail(409, 'Créez d’abord un paiement de test.');
    const customer = await stripe(`customers/${state.customerId}`);
    if (customer.id !== state.customerId || customer.deleted || customer.livemode !== false
      || customer.metadata?.workspace_id !== workspaceId || customer.metadata?.carnetpass_admin_test !== marker) throw Error('Customer binding mismatch');
    if (body.action === 'invoices') {
      const list = await stripe(`invoices?customer=${state.customerId}&limit=20`);
      if (!Array.isArray(list.data)) throw Error('Invalid invoices');
      list.data.forEach(checkCustomer);
      return { invoices: list.data.filter(item => item.status !== 'draft').map(item => ({ id: item.id, number: item.number || item.id, total: item.total,
        currency: item.currency, status: item.status, url: item.hosted_invoice_url ? testStripeUrl(item.hosted_invoice_url, 'invoice.stripe.com') : null })) };
    }
    if (body.action === 'portal') {
      const configs = await stripe('billing_portal/configurations?active=true&limit=100');
      let config = configs.data?.find(item => item.livemode === false && item.metadata?.carnetpass_admin_test === marker && item.default_return_url === returnUrl);
      if (!config) config = await stripe('billing_portal/configurations', { default_return_url: returnUrl,
        'metadata[carnetpass_admin_test]': marker, 'business_profile[headline]': 'CarnetPass — portail de test, aucun paiement réel',
        'business_profile[terms_of_service_url]': 'https://www.carnetpass.fr/conditions-utilisation',
        'business_profile[privacy_policy_url]': 'https://www.carnetpass.fr/confidentialite',
        'features[invoice_history][enabled]': 'true', 'features[payment_method_update][enabled]': 'true',
        'features[subscription_cancel][enabled]': 'true', 'features[subscription_cancel][mode]': 'at_period_end',
        'features[subscription_update][enabled]': 'false', 'login_page[enabled]': 'false' }, `carnetpass-admin-test-portal-${marker}-return-v2`);
      if (!/^bpc_[A-Za-z0-9]+$/.test(config.id || '') || !config.active || config.livemode !== false
        || config.features?.subscription_cancel?.mode !== 'at_period_end' || !config.features?.subscription_cancel?.enabled
        || config.features?.subscription_update?.enabled !== false || config.default_return_url !== returnUrl) throw Error('Invalid test portal configuration');
      const portal = await stripe('billing_portal/sessions', { customer: state.customerId, configuration: config.id, return_url: returnUrl, locale: 'fr' }, `carnetpass-test-portal-${workspaceId}-${lease.token}`);
      checkCustomer(portal);
      if (portal.configuration !== config.id) throw Error('Portal mismatch');
      return { url: testStripeUrl(portal.url, 'billing.stripe.com') };
    }
    throw fail(400, 'Action Stripe de test inconnue.');
  } finally { await command('release_billing', lease.token).catch(() => {}); }
}

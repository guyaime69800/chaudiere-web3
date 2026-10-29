import { testStripeConfigured, verifyTestPrice } from '../server/lib/admin-test-stripe.js';
if (!testStripeConfigured(process.env)) throw Error('Dedicated Stripe TEST key required; live keys refused');
for (const resource of ['account', 'customers?limit=1', 'subscriptions?limit=1', 'invoices?limit=1', 'checkout/sessions?limit=1', 'billing_portal/configurations?limit=1', 'prices?active=true&lookup_keys[]=carnetpass_paris2_admin_test_pro_v1&limit=2']) {
  const response = await fetch(`https://api.stripe.com/v1/${resource}`, { headers: { Authorization: `Bearer ${process.env.CARNETPASS_ADMIN_TEST_STRIPE_KEY}`, 'Stripe-Version': '2026-08-26.dahlia' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error(`Stripe TEST ${resource.split('?')[0]} HTTP ${response.status}`);
  const result = await response.json();
  if (result.livemode === true || result.data?.some(item => item.livemode !== false)) throw Error('Unexpected live data');
  if (resource.startsWith('prices?')) result.data.forEach(verifyTestPrice);
  console.log(`Read-only Stripe TEST audit: ${resource.split('?')[0]} OK`);
}

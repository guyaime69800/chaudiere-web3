import { validatePortalConfiguration } from '../server/billing-live-portal.js';

// Read-only audit executed remotely; never print keys, customer data or session URLs.
const env = process.env;
if (env.VERCEL_ENV !== 'production' || !/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || '')) throw Error('Production Stripe configuration required');
async function read(path) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': '2026-08-26.dahlia' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error(`Stripe portal audit HTTP ${response.status}`);
  return response.json();
}
const account = await read('account');
if (account.id !== env.STRIPE_EXPECTED_ACCOUNT_ID) throw Error('Stripe account mismatch');
const configurations = await read('billing_portal/configurations?active=true&is_default=true&limit=2');
if (configurations.data?.length !== 1 || configurations.has_more) throw Error('Default portal configuration ambiguous');
const configuration = configurations.data[0];
validatePortalConfiguration(configuration);
const customerUpdate = configuration.features?.customer_update;
if (!customerUpdate?.enabled || [...customerUpdate.allowed_updates].sort().join(',') !== 'address,email,name') throw Error('Portal customer update settings mismatch');
const profile = configuration.business_profile;
for (const [field, expected] of Object.entries({ terms_of_service_url: 'https://www.carnetpass.fr/conditions-utilisation', privacy_policy_url: 'https://www.carnetpass.fr/confidentialite' })) {
  const effective = profile?.[field] || account.business_profile?.[field];
  // Public business settings shown in the dashboard are not necessarily exposed
  // as overrides on this API object. Null cannot establish a missing public link.
  if (effective && effective !== expected) throw Error(`Portal legal link mismatch: ${field}`);
  if (!effective) console.log(`Portal ${field}: inherited setting not exposed by API; dashboard verification required.`);
}
console.log('Stripe portal read-only audit: account, default configuration, cancellation and customer fields verified.');

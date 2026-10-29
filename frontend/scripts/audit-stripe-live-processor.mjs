import { auditProductionCatalog } from '../server/lib/stripe-production-catalog.js';

// Only GET requests. Never print object bodies, identifiers or credentials.
await auditProductionCatalog({ key: process.env.STRIPE_SECRET_KEY, expectedAccount: process.env.STRIPE_EXPECTED_ACCOUNT_ID });
const scopes = [
  ['Payment Intents', 'payment_intents'], ['Charges and Refunds', 'charges'],
  ['Payment Disputes', 'disputes'], ['Checkout Sessions', 'checkout/sessions'],
  ['Subscriptions', 'subscriptions'], ['Invoices', 'invoices'],
  ['Subscription schedules', 'subscription_schedules'],
];
const scopeChecks = [];
for (const [resource, path] of scopes) {
  try {
    const response = await fetch(`https://api.stripe.com/v1/${path}?limit=1`, {
      method: 'GET', signal: AbortSignal.timeout(10000), headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Stripe-Version': '2026-08-26.dahlia',
      },
    });
    await response.body?.cancel();
    scopeChecks.push({ resource, readable: response.ok, httpStatus: response.status });
  } catch { scopeChecks.push({ resource, readable: false, connectionError: true }); }
}
console.log(JSON.stringify({ stripeProcessorReadAudit: scopeChecks,
  readPermissionsReady: scopeChecks.every((scope) => scope.readable), purchasesEnabled: false }));

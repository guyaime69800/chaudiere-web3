import { auditProductionCatalog } from '../server/lib/stripe-production-catalog.js';

// Read-only: never prints API credentials, account details, or Stripe response bodies.
try {
  const result = await auditProductionCatalog({
    key: process.env.STRIPE_SECRET_KEY,
    expectedAccount: process.env.STRIPE_EXPECTED_ACCOUNT_ID,
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

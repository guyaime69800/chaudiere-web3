// Opt-in server-side audit. Never send Stripe credentials into frontend assets.
if (process.env.CARNETPASS_SECURITY_READONLY_AUDIT_20261026 === '1') await import('./security-services-readonly-20261026.mjs');
if (process.env.CARNETPASS_PREOPENING_MAIL_TEST_20261024 === '1') await import('./audit-preopening-mail-20261024.mjs');
if (process.env.CARNETPASS_CANCELLATION_NOTIFICATION_AUDIT === '1') await import('./audit-cancellation-notifications.mjs');
if (process.env.CARNETPASS_INVOICE_REFUND_AUDIT === '1') await import('./audit-invoice-refund.mjs');
if (process.env.CARNETPASS_ADMIN_SERVICE_HEALTH_AUDIT === '1') await import('./audit-admin-service-health.mjs');
if (process.env.CARNETPASS_CONTROLLED_BILLING_AUDIT === '1') await import('./audit-controlled-billing.mjs');
if (process.env.CARNETPASS_WEBHOOK_TRANSPORT_AUDIT === '1') await import('./audit-live-webhook-transport.mjs');
if (process.env.CARNETPASS_LIVE_STRIPE_DELIVERY_AUDIT === '1') await import('./audit-live-stripe-delivery.mjs');
if (process.env.CARNETPASS_ADMIN_TEST_RETURN_AUDIT === '1') await import('./audit-admin-test-return.mjs');
if (process.env.CARNETPASS_STRIPE_SEAT_PERMISSION_AUDIT === '1') await import('./audit-stripe-seat-permissions.mjs');
if (process.env.CARNETPASS_STRIPE_SEAT_CONTRACT_TEST === '1') await import('./audit-stripe-seat-contract-test.mjs');
if (process.env.CARNETPASS_ADMIN_TEST_AUDIT === '1') await import('./audit-admin-test-stripe.mjs');
if (process.env.CARNETPASS_STRIPE_PORTAL_AUDIT === '1') await import('./audit-stripe-live-portal.mjs');
if (process.env.CARNETPASS_STRIPE_CATALOG_AUDIT === '1') {
  if (process.env.VERCEL_ENV !== 'production') {
    console.error('Stripe production audit requires the production environment.');
    process.exitCode = 1;
  } else {
    await import('./audit-stripe-production.mjs');
  }
}
if (process.env.CARNETPASS_STRIPE_PROCESSOR_AUDIT === '1') {
  if (process.env.VERCEL_ENV !== 'production') {
    console.error('Stripe processor audit requires the production environment.');
    process.exitCode = 1;
  } else {
    await import('./audit-stripe-live-processor.mjs');
  }
}

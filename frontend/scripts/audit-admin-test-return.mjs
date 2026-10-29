import { createClient } from '@supabase/supabase-js';
import { testStripeConfigured } from '../server/lib/admin-test-stripe.js';
if (!testStripeConfigured(process.env)) throw Error('Stripe TEST key required');
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const operators = await db.from('platform_admins').select('user_id').eq('role', 'founder').limit(2);
if (operators.error || operators.data?.length !== 1) throw Error('Founder scope unavailable');
const snapshot = await db.rpc('admin_test_command', { p_actor: operators.data[0].user_id, p_action: 'snapshot' });
if (snapshot.error) throw Error('Test workspace unavailable');
const state = snapshot.data.billing;
if (!state.sessionId) console.log('Existing private test Checkout: none');
else {
  if (!/^cs_test_[A-Za-z0-9]+$/.test(state.sessionId)) throw Error('Unexpected session mode');
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${state.sessionId}`, {
    headers: { Authorization: `Bearer ${process.env.CARNETPASS_ADMIN_TEST_STRIPE_KEY}`, 'Stripe-Version': '2026-08-26.dahlia' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error(`Existing test Checkout HTTP ${response.status}`);
  const checkout = await response.json();
  if (checkout.id !== state.sessionId || checkout.customer !== state.customerId || checkout.livemode !== false
    || checkout.metadata?.workspace_id !== snapshot.data.id || checkout.metadata?.carnetpass_admin_test !== 'paris2_admin_test_v1') throw Error('Checkout scope mismatch');
  console.log(JSON.stringify({ existingPrivateTestCheckout: { status: checkout.status, paymentStatus: checkout.payment_status,
    amountTotal: checkout.amount_total, currency: checkout.currency }, readOnly: true }));
  if (checkout.subscription) {
    if (!/^sub_[A-Za-z0-9]+$/.test(checkout.subscription)) throw Error('Unexpected subscription');
    const subscriptionResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${checkout.subscription}`, {
      headers: { Authorization: `Bearer ${process.env.CARNETPASS_ADMIN_TEST_STRIPE_KEY}`, 'Stripe-Version': '2026-08-26.dahlia' },
      signal: AbortSignal.timeout(10000),
    });
    if (!subscriptionResponse.ok) throw Error(`Test subscription HTTP ${subscriptionResponse.status}`);
    const subscription = await subscriptionResponse.json();
    if (subscription.livemode !== false || subscription.customer !== state.customerId
      || subscription.metadata?.workspace_id !== snapshot.data.id || subscription.metadata?.carnetpass_admin_test !== 'paris2_admin_test_v1') throw Error('Subscription scope mismatch');
    const end = subscription.items?.data?.[0]?.current_period_end || subscription.current_period_end;
    console.log(JSON.stringify({ existingPrivateTestCancellation: { status: subscription.status,
      legacyPeriodEndFlag: subscription.cancel_at_period_end === true,
      scheduledAtPeriodEnd: Number.isSafeInteger(subscription.cancel_at) && subscription.cancel_at > 0 && subscription.cancel_at === end,
      cancellationDate: Number.isSafeInteger(subscription.cancel_at) && subscription.cancel_at > 0 ? new Date(subscription.cancel_at * 1000).toISOString() : null,
      storedCancellationFlag: state.cancelAtPeriodEnd === true }, readOnly: true }));
  }
}

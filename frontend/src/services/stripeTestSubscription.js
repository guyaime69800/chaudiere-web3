import { supabase } from "./supabaseClient";

export async function getStripeTestSubscription(companyId) {
  if (import.meta.env.VITE_STRIPE_TEST_BILLING_ENABLED !== "true" || !companyId) return null;
  const { data, error } = await supabase.from("stripe_test_subscriptions")
    .select("plan, status, stripe_subscription_id")
    .eq("company_id", companyId).maybeSingle();
  if (error) throw error;
  return data;
}

export function activeStripeTestPlan(subscription) {
  return subscription?.stripe_subscription_id
    && ["active", "trialing"].includes(subscription.status)
    ? subscription.plan : null;
}

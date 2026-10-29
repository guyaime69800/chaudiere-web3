-- Operator review of the exact technical expiration created by audit-live-stripe-delivery.mjs.
-- Its unpublished session was immediately expired, unpaid, with no customer/subscription.
-- Retain the authentic Stripe receipt for audit, but do not retry this intentionally unbound check.
begin;
do $$ begin
  if exists(select 1 from public.stripe_live_orders)
    or exists(select 1 from public.stripe_live_customers) then raise exception 'Expected no live customer orders'; end if;
  update public.stripe_live_event_inbox set processing_status='review',processed_at=coalesce(processed_at,now())
    where account_id='acct_1UKPvi6m8GCMolJN' and event_id='evt_1UT1LN6m8GCMolJNvFLMxk6P'
      and object_id='cs_live_a1GXTVfN7Rnl407ZsZLvfNkYXcbmUNBQs43RNIBLBVMJMwxjoUzD6ySgYK'
      and event_type='checkout.session.expired' and processing_status in ('pending','review');
  if not found then raise exception 'Exact technical receipt not found'; end if;
end $$;
select (select count(*) from public.stripe_live_event_inbox where processing_status='pending') as pending_receipts,
  (select processing_status from public.stripe_live_event_inbox where event_id='evt_1UT1LN6m8GCMolJNvFLMxk6P') as technical_disposition,
  (select attempt_count from public.stripe_live_event_inbox where event_id='evt_1UT1LN6m8GCMolJNvFLMxk6P') as verified_retry_count,
  (select count(*) from public.stripe_live_orders) as live_orders,
  (select count(*) from public.stripe_live_customers) as live_bindings,
  (select count(*) from public.subscriptions where stripe_live_managed) as live_subscriptions,
  (select count(*) from public.stripe_live_credit_purchases) as live_credit_purchases;
commit;

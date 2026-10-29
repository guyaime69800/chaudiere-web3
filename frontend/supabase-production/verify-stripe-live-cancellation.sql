-- Read-only verification: no customer, event or entitlement is written.
begin read only;
select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='subscriptions'
    and column_name='stripe_cancel_at' and data_type='timestamp with time zone') as cancellation_column_ready,
  has_function_privilege('service_role','public.apply_stripe_live_effect(uuid,uuid,text,jsonb)','EXECUTE') as service_can_apply,
  not has_function_privilege('anon','public.apply_stripe_live_effect(uuid,uuid,text,jsonb)','EXECUTE') as anonymous_denied,
  not has_function_privilege('authenticated','public.apply_stripe_live_effect(uuid,uuid,text,jsonb)','EXECUTE') as authenticated_denied,
  not (select prosecdef from pg_proc where oid='public.apply_stripe_live_effect(uuid,uuid,text,jsonb)'::regprocedure) as security_invoker,
  position('stripe_cancel_at=cancellation_time' in pg_get_functiondef('public.apply_stripe_live_effect(uuid,uuid,text,jsonb)'::regprocedure))>0 as cancellation_applied_atomically,
  (select relrowsecurity from pg_class where oid='public.subscriptions'::regclass) as subscription_rls,
  has_column_privilege('authenticated','public.subscriptions','stripe_cancel_at','SELECT') as client_can_read_own_rls_row,
  (select count(*) from public.stripe_live_customers) as live_customer_bindings,
  (select count(*) from public.stripe_live_orders) as live_orders,
  (select count(*) from public.subscriptions where stripe_live_managed) as live_managed_subscriptions;
rollback;

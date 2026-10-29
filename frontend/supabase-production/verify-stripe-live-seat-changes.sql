begin read only;
select
  (select relrowsecurity from pg_class where oid='public.stripe_live_seat_changes'::regclass) as seat_change_rls,
  not has_table_privilege('anon','public.stripe_live_seat_changes','SELECT,INSERT,UPDATE') as anonymous_denied,
  not has_table_privilege('authenticated','public.stripe_live_seat_changes','SELECT,INSERT,UPDATE') as authenticated_denied,
  has_table_privilege('service_role','public.stripe_live_seat_changes','SELECT,INSERT,UPDATE') as service_storage_ready,
  has_table_privilege('service_role','public.company_members','SELECT,DELETE') as service_can_apply_selected_reduction,
  has_table_privilege('service_role','public.pro_account_assignments','SELECT') as service_can_read_assignments,
  has_table_privilege('service_role','public.pro_account_invitations','UPDATE') as service_can_expire_invitations,
  not (select prosecdef from pg_proc where oid='public.apply_stripe_live_effect(uuid,uuid,text,jsonb)'::regprocedure) as security_invoker,
  not has_function_privilege('authenticated','public.apply_stripe_live_effect(uuid,uuid,text,jsonb)','EXECUTE') as client_cannot_grant_rights,
  position('retained_members' in pg_get_functiondef('public.apply_stripe_live_effect(uuid,uuid,text,jsonb)'::regprocedure))>0 as selected_reduction_applied_atomically,
  (select count(*) from public.stripe_live_seat_changes) as seat_changes,
  (select count(*) from public.stripe_live_customers) as live_customer_bindings,
  (select count(*) from public.stripe_live_orders) as live_orders;
rollback;

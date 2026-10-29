begin;
do $$
declare v_actor uuid; v_first jsonb; v_second jsonb; v_id uuid := gen_random_uuid(); v_lease jsonb;
begin
  if has_schema_privilege('authenticated','carnetpass_test','usage')
    or has_schema_privilege('anon','carnetpass_test','usage')
    or has_function_privilege('authenticated','public.open_admin_test_workspace(uuid)','execute')
    or has_function_privilege('anon','public.open_admin_test_workspace(uuid)','execute')
    or has_function_privilege('authenticated','public.ensure_founder_test_company()','execute') then
    raise exception 'Unexpected public test permissions';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'carnetpass_test.admin_workspaces'::regclass) then
    raise exception 'RLS missing';
  end if;
  select user_id into strict v_actor from public.platform_admins where role = 'founder';
  v_first := public.open_admin_test_workspace(v_actor);
  v_second := public.open_admin_test_workspace(v_actor);
  if v_first <> v_second or v_first->>'environment' <> 'test' then raise exception 'Workspace mismatch'; end if;
  if has_function_privilege('authenticated','public.admin_test_command(uuid,text,uuid,jsonb)','execute')
    or has_function_privilege('anon','public.admin_test_command(uuid,text,uuid,jsonb)','execute') then
    raise exception 'Unexpected workflow permissions';
  end if;
  v_first := public.admin_test_command(v_actor,'save_equipment',v_id,'{"brand":"rollback-only-TEST"}'::jsonb);
  v_second := public.admin_test_command(v_actor,'get',v_id);
  if v_first <> v_second then raise exception 'Record scope mismatch'; end if;
  v_lease := public.admin_test_command(v_actor,'claim_billing');
  perform public.admin_test_command(v_actor,'save_billing',(v_lease->>'token')::uuid,'{"status":"rollback-only-TEST"}'::jsonb);
  perform public.admin_test_command(v_actor,'release_billing',(v_lease->>'token')::uuid);
end;
$$;
rollback;
select true as private_workspace_permissions_and_idempotency_verified;

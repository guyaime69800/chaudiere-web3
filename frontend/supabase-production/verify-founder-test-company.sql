begin;
do $$
declare
  v_founder uuid;
  v_first public.companies;
  v_second public.companies;
  v_before integer;
begin
  select user_id into v_founder from public.platform_admins where role = 'founder' limit 1;
  if v_founder is null then raise exception 'Founder missing'; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  begin
    perform public.ensure_founder_test_company();
    raise exception 'Non-founder was allowed';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', v_founder::text, true);
  select count(*) into v_before from public.company_members where user_id = v_founder;
  select * into v_first from public.ensure_founder_test_company();
  select * into v_second from public.ensure_founder_test_company();
  if v_first.id <> v_second.id then raise exception 'Duplicate company'; end if;
  if v_before = 0 and (v_first.is_demo is not true or v_first.siret is not null) then
    raise exception 'Incorrect demo company';
  end if;
  if (select count(*) from public.company_members where user_id = v_founder) <> 1 then
    raise exception 'Incorrect membership';
  end if;
  if v_first.is_demo is true and v_first.name = 'CarnetPass — tests fondateur'
    and not exists (select 1 from public.subscriptions
      where company_id = v_first.id and plan::text = 'enterprise'
        and status::text = 'active' and current_period_end > now()
        and enterprise_seat_limit = 10000) then
    raise exception 'Founder full access missing';
  end if;
end;
$$;
select 'PASS: founder provisioning, idempotence and ordinary account rejection' as result;
rollback;

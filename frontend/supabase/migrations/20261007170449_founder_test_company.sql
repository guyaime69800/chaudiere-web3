begin;

-- Only the authenticated platform founder can provision their own demo company.
-- It does not approve a SIRET, activate a paid plan, or modify client companies.
create or replace function public.ensure_founder_test_company()
returns public.companies
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_company public.companies;
  v_count integer;
begin
  if v_user is null or not exists (
    select 1 from public.platform_admins where user_id = v_user and role = 'founder'
  ) then
    raise exception 'Acces reserve au fondateur.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));
  select count(*) into v_count from public.company_members where user_id = v_user;
  if v_count > 1 then
    raise exception 'Plusieurs entreprises associees au compte.' using errcode = '23514';
  end if;
  if v_count = 1 then
    select c.* into v_company from public.companies c
      join public.company_members m on m.company_id = c.id where m.user_id = v_user;
    return v_company;
  end if;
  insert into public.companies (name, created_by, is_demo)
    values ('CarnetPass — tests fondateur', v_user, true) returning * into v_company;
  insert into public.company_members (company_id, user_id, role)
    values (v_company.id, v_user, 'owner')
    on conflict (company_id, user_id) do update set role = excluded.role;
  insert into public.subscriptions (company_id, plan, status)
    values (v_company.id, 'free', 'active') on conflict (company_id) do nothing;
  return v_company;
end;
$$;
revoke all on function public.ensure_founder_test_company() from public, anon;
grant execute on function public.ensure_founder_test_company() to authenticated;
comment on function public.ensure_founder_test_company()
  is 'Idempotent founder-only demo company provisioning for mobile scan tests.';
commit;

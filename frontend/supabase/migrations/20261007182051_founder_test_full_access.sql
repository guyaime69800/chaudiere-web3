begin;

-- Internal entitlements for the founder's own named demo company only.
-- No Stripe subscription, invoice, payment or SIRET approval is created.
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
  else
    insert into public.companies (name, created_by, is_demo)
      values ('CarnetPass — tests fondateur', v_user, true) returning * into v_company;
    insert into public.company_members (company_id, user_id, role)
      values (v_company.id, v_user, 'owner')
      on conflict (company_id, user_id) do update set role = excluded.role;
    insert into public.subscriptions (company_id, plan, status)
      values (v_company.id, 'free', 'active') on conflict (company_id) do nothing;
  end if;
  if v_company.is_demo is true and v_company.created_by = v_user
    and v_company.name = 'CarnetPass — tests fondateur'
    and not exists (select 1 from public.company_verifications
      where company_id = v_company.id and status::text in ('suspended', 'rejected')) then
    update public.subscriptions set plan = 'enterprise', status = 'active',
      current_period_end = '2099-12-31T23:59:59Z'::timestamptz,
      trial_ends_at = null, enterprise_seat_limit = 10000, updated_at = now()
      where company_id = v_company.id;
  end if;
  return v_company;
end;
$$;
revoke all on function public.ensure_founder_test_company() from public, anon;
grant execute on function public.ensure_founder_test_company() to authenticated;

-- Upgrade the already provisioned founder demo without touching client companies.
update public.subscriptions s set plan = 'enterprise', status = 'active',
  current_period_end = '2099-12-31T23:59:59Z'::timestamptz,
  trial_ends_at = null, enterprise_seat_limit = 10000, updated_at = now()
from public.companies c join public.platform_admins p
  on p.user_id = c.created_by and p.role = 'founder'
where s.company_id = c.id and c.is_demo is true
  and c.name = 'CarnetPass — tests fondateur'
  and exists (select 1 from public.company_members m
    where m.company_id = c.id and m.user_id = p.user_id and m.role::text = 'owner')
  and not exists (select 1 from public.company_verifications v
    where v.company_id = c.id and v.status::text in ('suspended', 'rejected'));
commit;

-- MANUAL TEST ONLY — run in Supabase project "CarnetPass Admin Preview"
-- (project ref bqqzzbwqmiyxcotvqtoc). Never run against production.
-- First, create and confirm a separate test account through the normal UI,
-- then create its company with this EXACT name and without a SIRET:
-- [TEST PREVIEW] Entreprise admin
-- This script does not touch existing Guy Aime companies or charge money.

begin;

do $$
declare
  v_company public.companies%rowtype;
  v_count integer;
begin
  select count(*) into v_count
  from public.companies
  where name = '[TEST PREVIEW] Entreprise admin';
  if v_count <> 1 then
    raise exception 'Exactly one dedicated Preview test company is required; found %', v_count;
  end if;

  select * into v_company
  from public.companies
  where name = '[TEST PREVIEW] Entreprise admin'
  for update;

  if v_company.siret is not null or v_company.is_demo is true
    or v_company.created_at < now() - interval '7 days' then
    raise exception 'The test company must be recent, without SIRET and not in demo mode';
  end if;

  if not exists (
    select 1 from auth.users
    where id = v_company.created_by and email_confirmed_at is not null
  ) then
    raise exception 'A separate confirmed account must own the test company';
  end if;

  if (select count(*) from public.company_members
      where company_id = v_company.id) <> 1
    or not exists (
      select 1 from public.company_members
      where company_id = v_company.id and user_id = v_company.created_by
    ) or exists (
      select 1 from public.company_members
      where user_id = v_company.created_by and company_id <> v_company.id
    ) then
    raise exception 'The test account must belong only to this company';
  end if;

  if not exists (
    select 1 from public.subscriptions
    where company_id = v_company.id and plan::text = 'free'
      and status::text in ('active', 'trialing')
  ) or exists (
    select 1 from public.equipments where company_id = v_company.id
  ) or exists (
    select 1 from public.enterprise_access_events where company_id = v_company.id
  ) or exists (
    select 1 from public.stripe_test_subscriptions where company_id = v_company.id
  ) or exists (
    select 1 from public.company_verifications
    where company_id = v_company.id and status <> 'pending'
  ) then
    raise exception 'The test company must be a new, unused Discovery account';
  end if;

  if exists (select 1 from public.companies where siret = '00000000000000') then
    raise exception 'The synthetic test SIRET is already in use';
  end if;

  update public.companies
  set siret = '00000000000000', updated_at = now()
  where id = v_company.id;

  insert into public.company_verifications
    (company_id, status, verified_siret, verified_at, updated_at)
  values
    (v_company.id, 'approved', '00000000000000', now(), now())
  on conflict (company_id) do update
    set status = 'approved', verified_siret = '00000000000000',
        verified_at = now(), updated_at = now();

  raise notice 'Preview test company prepared: %', v_company.id;
end;
$$;

commit;

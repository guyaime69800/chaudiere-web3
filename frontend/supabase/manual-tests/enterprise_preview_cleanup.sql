-- MANUAL TEST CLEANUP — run only in CarnetPass Admin Preview after the test.
-- Keeps the test company and audit events, but revokes Enterprise access and
-- removes the synthetic SIRET/verification. It never targets a real company.

begin;

do $$
declare
  v_company public.companies%rowtype;
  v_count integer;
begin
  select count(*) into v_count from public.companies
  where name = '[TEST PREVIEW] Entreprise admin'
    and siret = '00000000000000';
  if v_count <> 1 then
    raise exception 'Exactly one prepared Preview test company is required; found %', v_count;
  end if;

  select * into v_company from public.companies
  where name = '[TEST PREVIEW] Entreprise admin'
    and siret = '00000000000000'
  for update;

  if exists (select 1 from public.company_members
             where company_id = v_company.id and user_id <> v_company.created_by) then
    raise exception 'Remove test technicians in the admin UI before cleanup';
  end if;

  update public.subscriptions
  set status = 'canceled', enterprise_seat_limit = null,
      current_period_end = null, updated_at = now()
  where company_id = v_company.id;

  update public.company_verifications
  set status = 'pending', verified_siret = null,
      verified_at = null, updated_at = now()
  where company_id = v_company.id;

  update public.companies
  set siret = null, updated_at = now()
  where id = v_company.id;

  raise notice 'Preview test company deactivated: %', v_company.id;
end;
$$;

commit;

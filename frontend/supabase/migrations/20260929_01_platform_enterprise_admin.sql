begin;

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('founder', 'operator')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table public.enterprise_access_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id),
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('activate', 'suspend')),
  payment_reference text,
  contract_end timestamptz,
  note text,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
alter table public.enterprise_access_events enable row level security;
revoke all on public.platform_admins, public.enterprise_access_events from public, anon, authenticated;
grant select, insert, update, delete on public.platform_admins to service_role;
grant select, insert on public.enterprise_access_events to service_role;
grant usage, select on sequence public.enterprise_access_events_id_seq to service_role;

-- A confirmed founder account must exist before this migration is applied.
do $$
declare v_founder uuid;
begin
  select id into v_founder from auth.users
  where lower(email) = 'contact@carnetpass.fr' and email_confirmed_at is not null;
  if v_founder is null then
    raise exception 'Create and confirm contact@carnetpass.fr before applying platform admin migration';
  end if;
  insert into public.platform_admins(user_id, role) values (v_founder, 'founder');
end;
$$;

create or replace function public.platform_set_enterprise(
  p_actor uuid, p_company uuid, p_action text,
  p_contract_end timestamptz, p_payment_reference text, p_note text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_current public.subscriptions%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
  if not exists (select 1 from public.platform_admins where user_id = p_actor) then raise exception 'Forbidden'; end if;
  if p_action not in ('activate', 'suspend') then raise exception 'Invalid action'; end if;
  select * into v_current from public.subscriptions where company_id = p_company for update;
  if not found then raise exception 'Company subscription missing'; end if;
  if p_action = 'activate' then
    if p_contract_end is null or p_contract_end <= now() or p_contract_end > now() + interval '5 years'
      or length(trim(coalesce(p_payment_reference, ''))) < 3 then raise exception 'Invalid contract or payment reference'; end if;
    if not exists (select 1 from public.companies c
      join public.company_verifications v on v.company_id = c.id
      where c.id = p_company and v.status = 'approved' and v.verified_siret = c.siret
        and v.verified_at is not null and c.is_demo is not true) then
      raise exception 'Company not verified';
    end if;
    if exists (select 1 from public.stripe_test_subscriptions
      where company_id = p_company and status in ('active', 'trialing')) then
      raise exception 'Active Stripe test subscription';
    end if;
    update public.subscriptions set plan = 'enterprise', status = 'active',
      current_period_end = p_contract_end, trial_ends_at = null, updated_at = now()
      where company_id = p_company;
  else
    if v_current.plan::text <> 'enterprise' then raise exception 'Not an Enterprise subscription'; end if;
    update public.subscriptions set status = 'canceled', updated_at = now()
      where company_id = p_company;
  end if;
  insert into public.enterprise_access_events(company_id, actor_id, action, payment_reference, contract_end, note)
    values (p_company, p_actor, p_action, nullif(trim(p_payment_reference), ''), p_contract_end,
      nullif(trim(p_note), ''));
end;
$$;

revoke all on function public.platform_set_enterprise(uuid, uuid, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.platform_set_enterprise(uuid, uuid, text, timestamptz, text, text) to service_role;

create or replace function public.platform_manage_collaborator(
  p_actor uuid, p_email text, p_add boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_target uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
  if not exists (select 1 from public.platform_admins where user_id = p_actor and role = 'founder')
    then raise exception 'Forbidden'; end if;
  select id into v_target from auth.users
    where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;
  if v_target is null or v_target = p_actor then raise exception 'Target unavailable'; end if;
  if p_add then
    insert into public.platform_admins(user_id, role, created_by)
      values (v_target, 'operator', p_actor) on conflict (user_id) do nothing;
  else
    delete from public.platform_admins where user_id = v_target and role = 'operator';
  end if;
  return v_target;
end;
$$;
revoke all on function public.platform_manage_collaborator(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.platform_manage_collaborator(uuid, text, boolean) to service_role;

commit;

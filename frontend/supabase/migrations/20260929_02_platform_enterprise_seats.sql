begin;

alter table public.subscriptions
  add column enterprise_seat_limit integer
  check (enterprise_seat_limit between 1 and 10000);

alter table public.enterprise_access_events
  drop constraint enterprise_access_events_action_check;
alter table public.enterprise_access_events
  add constraint enterprise_access_events_action_check
  check (action in ('activate', 'suspend', 'set_seats', 'add_technician', 'remove_technician'));

alter table public.enterprise_access_events
  add column target_user_id uuid references auth.users(id),
  add column seat_limit integer;

create or replace function public.enforce_enterprise_seat_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_limit integer;
declare v_plan public.subscription_plan;
declare v_count integer;
begin
  select plan, enterprise_seat_limit into v_plan, v_limit
    from public.subscriptions where company_id = new.company_id for update;
  if v_plan = 'enterprise' then
    if v_limit is null then raise exception 'Enterprise seat limit missing'; end if;
    select count(*) into v_count from public.company_members where company_id = new.company_id;
    if v_count >= v_limit then raise exception 'Enterprise seat limit reached'; end if;
  end if;
  return new;
end;
$$;

create trigger enforce_enterprise_seat_limit_before_insert
before insert on public.company_members
for each row execute function public.enforce_enterprise_seat_limit();
revoke all on function public.enforce_enterprise_seat_limit() from public, anon, authenticated;

drop function public.platform_set_enterprise(uuid, uuid, text, timestamptz, text, text);
create function public.platform_set_enterprise(
  p_actor uuid, p_company uuid, p_action text,
  p_contract_end timestamptz, p_payment_reference text, p_note text,
  p_seat_limit integer
) returns void language plpgsql security definer set search_path = '' as $$
declare v_current public.subscriptions%rowtype;
declare v_members integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
  if not exists (select 1 from public.platform_admins where user_id = p_actor) then raise exception 'Forbidden'; end if;
  if p_action not in ('activate', 'suspend', 'set_seats') then raise exception 'Invalid action'; end if;
  select * into v_current from public.subscriptions where company_id = p_company for update;
  if not found then raise exception 'Company subscription missing'; end if;
  select count(*) into v_members from public.company_members where company_id = p_company;
  if p_action in ('activate', 'set_seats') and
      (p_seat_limit is null or p_seat_limit < greatest(v_members, 1) or p_seat_limit > 10000) then
    raise exception 'Invalid seat limit';
  end if;
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
      current_period_end = p_contract_end, trial_ends_at = null,
      enterprise_seat_limit = p_seat_limit, updated_at = now()
      where company_id = p_company;
  elsif p_action = 'set_seats' then
    if v_current.plan::text <> 'enterprise' or v_current.status::text <> 'active'
      or v_current.current_period_end <= now() then raise exception 'Enterprise access inactive'; end if;
    update public.subscriptions set enterprise_seat_limit = p_seat_limit, updated_at = now()
      where company_id = p_company;
  else
    if v_current.plan::text <> 'enterprise' then raise exception 'Not an Enterprise subscription'; end if;
    update public.subscriptions set status = 'canceled', updated_at = now()
      where company_id = p_company;
  end if;
  insert into public.enterprise_access_events(company_id, actor_id, action, payment_reference, contract_end, note, seat_limit)
    values (p_company, p_actor, p_action, nullif(trim(p_payment_reference), ''), p_contract_end,
      nullif(trim(p_note), ''), p_seat_limit);
end;
$$;
revoke all on function public.platform_set_enterprise(uuid, uuid, text, timestamptz, text, text, integer) from public, anon, authenticated;
grant execute on function public.platform_set_enterprise(uuid, uuid, text, timestamptz, text, text, integer) to service_role;

create function public.platform_manage_technician(
  p_actor uuid, p_company uuid, p_email text, p_add boolean, p_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_target uuid;
declare v_subscription public.subscriptions%rowtype;
declare v_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
  if not exists (select 1 from public.platform_admins where user_id = p_actor) then raise exception 'Forbidden'; end if;
  select * into v_subscription from public.subscriptions where company_id = p_company for update;
  if not found or v_subscription.plan::text <> 'enterprise'
    or v_subscription.status::text <> 'active'
    or v_subscription.current_period_end <= now() then raise exception 'Enterprise access inactive'; end if;
  select id into v_target from auth.users
    where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;
  if v_target is null then raise exception 'Confirmed account not found'; end if;
  if p_add then
    if not exists (select 1 from public.profiles where id = v_target) then raise exception 'Profile missing'; end if;
    if exists (select 1 from public.company_members where user_id = v_target) then raise exception 'Account already assigned'; end if;
    select count(*) into v_count from public.company_members where company_id = p_company;
    if v_count >= v_subscription.enterprise_seat_limit then raise exception 'Enterprise seat limit reached'; end if;
    insert into public.company_members(company_id, user_id, role)
      values (p_company, v_target, 'technician');
  else
    delete from public.company_members
      where company_id = p_company and user_id = v_target and role = 'technician';
    if not found then raise exception 'Technician not found'; end if;
  end if;
  insert into public.enterprise_access_events(company_id, actor_id, action, target_user_id, note, seat_limit)
    values (p_company, p_actor, case when p_add then 'add_technician' else 'remove_technician' end,
      v_target, nullif(trim(p_note), ''), v_subscription.enterprise_seat_limit);
  return v_target;
end;
$$;
revoke all on function public.platform_manage_technician(uuid, uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.platform_manage_technician(uuid, uuid, text, boolean, text) to service_role;

commit;

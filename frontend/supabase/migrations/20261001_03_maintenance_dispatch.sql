begin;

create table public.maintenance_reminder_attempts (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.maintenance_reminders(id) on delete cascade,
  reminder_version integer not null,
  claim_id uuid not null unique,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  result text not null default 'claimed' check (result in ('claimed', 'accepted', 'retry', 'failed', 'cancelled')),
  provider_message_id text,
  error_code text
);
create index maintenance_reminder_attempts_reminder_idx
  on public.maintenance_reminder_attempts(reminder_id, attempted_at desc);
alter table public.maintenance_reminder_attempts enable row level security;
revoke all on public.maintenance_reminder_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.maintenance_reminder_attempts to service_role;

-- Atomic claim. A crashed worker may reclaim the same event with the same
-- provider idempotency key (reminder ID + version) during the 24 h retry window.
create function public.claim_due_maintenance_reminders(p_limit integer default 20)
returns setof public.maintenance_reminders
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Lot invalide.' using errcode = '22023';
  end if;
  return query
  with due as (
    select r.id from public.maintenance_reminders r
    join auth.users u on u.id = r.recipient_user_id
      and lower(u.email) = lower(r.recipient_email)
      and u.email_confirmed_at is not null
    join public.equipments e on e.id = r.equipment_id and e.company_id = r.company_id
    join public.company_members m on m.company_id = r.company_id and m.user_id = r.recipient_user_id
    join public.subscriptions s on s.company_id = r.company_id
    join public.companies c on c.id = r.company_id
    left join public.company_verifications v on v.company_id = r.company_id
    where r.status = 'active'
      and r.notification_attempts < 3
      and s.status::text in ('active', 'trialing')
      and (s.plan::text <> 'free' or s.trial_ends_at > now())
      and (s.plan::text <> 'enterprise' or s.current_period_end > now())
      and (
        (c.is_demo is true and coalesce(v.status::text, 'pending') <> 'suspended')
        or (s.plan::text = 'free' and coalesce(v.status::text, 'pending') not in ('suspended', 'rejected'))
        or (v.status::text = 'approved' and v.verified_at is not null
          and v.verified_siret = c.siret and c.siret ~ '^[0-9]{14}$')
      )
      and (
        r.notification_state in ('pending', 'failed')
        or (r.notification_state = 'sending' and r.claimed_at < now() - interval '15 minutes')
      )
      and r.due_on - r.lead_days <= (now() at time zone 'Europe/Paris')::date
      and coalesce(r.next_attempt_at, '-infinity'::timestamptz) <= now()
      and not exists (
        select 1 from public.maintenance_reminder_attempts old_attempt
        where old_attempt.reminder_id = r.id and old_attempt.reminder_version = r.version
          and old_attempt.attempted_at < now() - interval '23 hours'
      )
    order by r.due_on, r.created_at
    limit p_limit for update of r skip locked
  ), claimed as (
    update public.maintenance_reminders r set
      notification_state = 'sending', notification_attempts = r.notification_attempts + 1,
      claim_id = gen_random_uuid(), claimed_at = now(), updated_at = now()
    from due where r.id = due.id returning r.*
  ), attempts as (
    insert into public.maintenance_reminder_attempts(reminder_id, reminder_version, claim_id)
    select c.id, c.version, c.claim_id from claimed c
  )
  select c.* from claimed c;
end;
$$;

create function public.finish_maintenance_reminder_attempt(
  p_claim_id uuid, p_result text, p_provider_message_id text, p_error_code text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if p_result not in ('accepted', 'retry', 'failed', 'cancelled') then
    raise exception 'Résultat invalide.' using errcode = '22023';
  end if;
  update public.maintenance_reminder_attempts a set
    result = p_result, provider_message_id = left(p_provider_message_id, 255),
    error_code = left(p_error_code, 100), completed_at = now()
  where a.claim_id = p_claim_id and a.result = 'claimed';
  get diagnostics v_count = row_count;
  if v_count = 0 then return false; end if;
  update public.maintenance_reminders r set
    notification_state = case p_result
      when 'accepted' then 'accepted'
      when 'retry' then 'failed'
      when 'cancelled' then 'cancelled'
      else 'failed' end,
    next_attempt_at = case when p_result = 'retry' and r.notification_attempts < 3
      then now() + make_interval(hours => power(3, r.notification_attempts - 1)::integer)
      else null end,
    accepted_at = case when p_result = 'accepted' then now() else r.accepted_at end,
    provider_message_id = case when p_result = 'accepted' then left(p_provider_message_id, 255) else r.provider_message_id end,
    last_error = case when p_result in ('retry', 'failed') then left(p_error_code, 100) else null end,
    claim_id = null, claimed_at = null, updated_at = now()
  where r.claim_id = p_claim_id and r.notification_state = 'sending';
  return true;
end;
$$;

revoke all on function public.claim_due_maintenance_reminders(integer) from public, anon, authenticated;
revoke all on function public.finish_maintenance_reminder_attempt(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.claim_due_maintenance_reminders(integer) to service_role;
grant execute on function public.finish_maintenance_reminder_attempt(uuid,text,text,text) to service_role;

commit;

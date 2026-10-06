-- CarnetPass Paris 2 production reminders: apply once in the Supabase SQL Editor.

-- All seven steps run in one transaction. Do not re-run after success.

begin;

-- 20261006000100_maintenance_reminders.sql
-- Private, equipment-scoped reminders. No QR visitor receives write access.
create table public.maintenance_reminders (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipments(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  due_on date not null,
  due_source text not null check (due_source in ('user_selected', 'professional_validated')),
  action_source text not null default 'manual' check (action_source in ('manual', 'shiba')),
  last_maintenance_on date,
  last_maintenance_source text check (last_maintenance_source in ('professional_reported')),
  lead_days integer not null default 30 check (lead_days between 0 and 365),
  timezone text not null default 'Europe/Paris' check (timezone = 'Europe/Paris'),
  status text not null default 'active' check (status in ('active', 'review_required', 'cancelled')),
  confirmation_key uuid not null unique,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  notification_state text not null default 'pending'
    check (notification_state in ('pending', 'sending', 'accepted', 'failed', 'cancelled')),
  notification_attempts integer not null default 0 check (notification_attempts between 0 and 3),
  next_attempt_at timestamptz,
  claim_id uuid,
  claimed_at timestamptz,
  accepted_at timestamptz,
  provider_message_id text,
  last_error text,
  constraint maintenance_reminder_dates check (
    last_maintenance_on is null or last_maintenance_on <= due_on
  ),
  constraint maintenance_reminder_last_source check (
    (last_maintenance_on is null) = (last_maintenance_source is null)
  )
);

create index maintenance_reminders_recipient_idx
  on public.maintenance_reminders(recipient_user_id, created_at desc);
create index maintenance_reminders_equipment_idx
  on public.maintenance_reminders(equipment_id, status);
create unique index maintenance_reminders_no_duplicate_due_idx
  on public.maintenance_reminders(equipment_id, recipient_user_id, due_on)
  where status in ('active', 'review_required');
create index maintenance_reminders_due_idx
  on public.maintenance_reminders(due_on, next_attempt_at)
  where status = 'active' and notification_state in ('pending', 'failed');

alter table public.maintenance_reminders enable row level security;
revoke all on public.maintenance_reminders from public, anon, authenticated;
grant select on public.maintenance_reminders to authenticated;
grant select, insert, update, delete on public.maintenance_reminders to service_role;

create policy "Recipients read only their active company reminders"
on public.maintenance_reminders for select to authenticated
using (
  recipient_user_id = (select auth.uid())
  and public.is_company_member(company_id)
);

create function public.create_maintenance_reminder(
  p_equipment_id uuid,
  p_due_on date,
  p_due_source text,
  p_last_maintenance_on date,
  p_lead_days integer,
  p_confirmation_key uuid,
  p_expected_recipient_email text,
  p_action_source text default 'manual'
)
returns public.maintenance_reminders
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_email text;
  v_reminder public.maintenance_reminders;
begin
  if v_user_id is null or auth.role() is distinct from 'authenticated' then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  select email into v_email from auth.users
  where id = v_user_id and email_confirmed_at is not null;
  if v_email is null then
    raise exception 'Adresse e-mail non confirmée.' using errcode = '42501';
  end if;
  if lower(v_email) is distinct from lower(p_expected_recipient_email) then
    raise exception 'Le destinataire a changé depuis la confirmation.' using errcode = '40001';
  end if;
  select e.company_id into v_company_id from public.equipments e
  where e.id = p_equipment_id;
  if v_company_id is null or not public.is_company_member(v_company_id) then
    raise exception 'Équipement non autorisé.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.subscriptions s where s.company_id = v_company_id
      and s.status::text in ('active', 'trialing')
      and (s.plan::text <> 'free' or s.trial_ends_at > now())
      and (s.plan::text <> 'enterprise' or s.current_period_end > now())
  ) then
    raise exception 'Formule ou essai inactif.' using errcode = '42501';
  end if;
  if p_due_on is null or p_due_on <= (now() at time zone 'Europe/Paris')::date
    or p_due_on > (now() at time zone 'Europe/Paris')::date + 3650
    or p_lead_days is null or p_lead_days not between 0 and 365
    or p_due_source is distinct from 'user_selected'
    or p_action_source not in ('manual', 'shiba')
    or p_confirmation_key is null
    or (p_last_maintenance_on is not null and (
      p_last_maintenance_on > p_due_on
      or p_last_maintenance_on > (now() at time zone 'Europe/Paris')::date
    )) then
    raise exception 'Paramètres du rappel invalides.' using errcode = '22023';
  end if;

  insert into public.maintenance_reminders (
    equipment_id, company_id, recipient_user_id, recipient_email, due_on,
    due_source, last_maintenance_on, last_maintenance_source, lead_days,
    confirmation_key, created_by, action_source
  ) values (
    p_equipment_id, v_company_id, v_user_id, v_email, p_due_on,
    p_due_source, p_last_maintenance_on,
    case when p_last_maintenance_on is null then null else 'professional_reported' end,
    p_lead_days, p_confirmation_key, v_user_id, p_action_source
  )
  on conflict (confirmation_key) do nothing
  returning * into v_reminder;

  if v_reminder.id is null then
    select * into v_reminder from public.maintenance_reminders
    where confirmation_key = p_confirmation_key;
    if v_reminder.recipient_user_id is distinct from v_user_id
      or lower(v_reminder.recipient_email) is distinct from lower(v_email)
      or v_reminder.status is distinct from 'active'
      or v_reminder.equipment_id is distinct from p_equipment_id
      or v_reminder.due_on is distinct from p_due_on
      or v_reminder.due_source is distinct from p_due_source
      or v_reminder.action_source is distinct from p_action_source
      or v_reminder.last_maintenance_on is distinct from p_last_maintenance_on
      or v_reminder.lead_days is distinct from p_lead_days then
      raise exception 'La confirmation ne correspond plus à la proposition.' using errcode = '23505';
    end if;
  end if;
  return v_reminder;
end;
$$;

create function public.update_maintenance_reminder(
  p_id uuid,
  p_expected_version integer,
  p_due_on date,
  p_due_source text,
  p_last_maintenance_on date,
  p_lead_days integer,
  p_expected_recipient_email text,
  p_action_source text default 'manual'
)
returns public.maintenance_reminders
language plpgsql security definer set search_path = ''
as $$
declare
  v_reminder public.maintenance_reminders;
  v_email text;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  select email into v_email from auth.users
  where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then
    raise exception 'Adresse e-mail non confirmée.' using errcode = '42501';
  end if;
  if lower(v_email) is distinct from lower(p_expected_recipient_email) then
    raise exception 'Le destinataire a changé depuis la confirmation.' using errcode = '40001';
  end if;
  if p_due_on is null or p_due_on <= (now() at time zone 'Europe/Paris')::date
    or p_due_on > (now() at time zone 'Europe/Paris')::date + 3650
    or p_lead_days is null or p_lead_days not between 0 and 365
    or p_due_source is distinct from 'user_selected'
    or p_action_source not in ('manual', 'shiba')
    or (p_last_maintenance_on is not null and (
      p_last_maintenance_on > p_due_on
      or p_last_maintenance_on > (now() at time zone 'Europe/Paris')::date
    )) then
    raise exception 'Paramètres du rappel invalides.' using errcode = '22023';
  end if;
  update public.maintenance_reminders r set
    due_on = p_due_on, due_source = p_due_source, status = 'active',
    action_source = p_action_source,
    recipient_email = v_email,
    last_maintenance_on = p_last_maintenance_on,
    last_maintenance_source = case when p_last_maintenance_on is null then null else 'professional_reported' end,
    lead_days = p_lead_days, version = r.version + 1,
    notification_state = 'pending', notification_attempts = 0,
    next_attempt_at = null, claim_id = null, claimed_at = null,
    accepted_at = null, provider_message_id = null, last_error = null,
    confirmed_at = now(), updated_at = now()
  where r.id = p_id and r.version = p_expected_version
    and r.status in ('active', 'review_required') and r.notification_state <> 'sending'
    and r.recipient_user_id = auth.uid()
    and public.is_company_member(r.company_id)
    and exists (
      select 1 from public.subscriptions s where s.company_id = r.company_id
        and s.status::text in ('active', 'trialing')
        and (s.plan::text <> 'free' or s.trial_ends_at > now())
        and (s.plan::text <> 'enterprise' or s.current_period_end > now())
    )
  returning * into v_reminder;
  if v_reminder.id is null then
    raise exception 'Rappel introuvable, déjà modifié ou en cours d’envoi.' using errcode = '40001';
  end if;
  return v_reminder;
end;
$$;

create function public.cancel_maintenance_reminder(
  p_id uuid, p_expected_version integer, p_action_source text default 'manual'
)
returns public.maintenance_reminders
language plpgsql security definer set search_path = ''
as $$
declare v_reminder public.maintenance_reminders;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if p_action_source not in ('manual', 'shiba') then
    raise exception 'Origine invalide.' using errcode = '22023';
  end if;
  update public.maintenance_reminders r set
    status = 'cancelled', notification_state = 'cancelled',
    action_source = p_action_source,
    version = r.version + 1, cancelled_at = now(), updated_at = now()
  where r.id = p_id and r.version = p_expected_version
    and r.status in ('active', 'review_required') and r.notification_state <> 'sending'
    and r.recipient_user_id = auth.uid()
    and public.is_company_member(r.company_id)
  returning * into v_reminder;
  if v_reminder.id is null then
    raise exception 'Rappel introuvable, déjà modifié ou en cours d’envoi.' using errcode = '40001';
  end if;
  return v_reminder;
end;
$$;

revoke all on function public.create_maintenance_reminder(uuid,date,text,date,integer,uuid,text,text) from public, anon, authenticated;
revoke all on function public.update_maintenance_reminder(uuid,integer,date,text,date,integer,text,text) from public, anon, authenticated;
revoke all on function public.cancel_maintenance_reminder(uuid,integer,text) from public, anon, authenticated;
grant execute on function public.create_maintenance_reminder(uuid,date,text,date,integer,uuid,text,text) to authenticated;
grant execute on function public.update_maintenance_reminder(uuid,integer,date,text,date,integer,text,text) to authenticated;
grant execute on function public.cancel_maintenance_reminder(uuid,integer,text) to authenticated;

-- 20261006000200_maintenance_dispatch.sql
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

-- 20261006000300_public_reminder_opt_in.sql
-- QR only identifies an appliance. These rows never grant access to its private data.
create table public.public_reminder_requests (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipments(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  carnet_pass_id text not null check (carnet_pass_id ~ '^CP-[0-9]{4}-[0-9]{6}$'),
  recipient_email text not null,
  due_on date not null,
  lead_days integer not null default 30 check (lead_days between 0 and 365),
  verification_hash text not null unique check (verification_hash ~ '^[0-9a-f]{64}$'),
  management_hash text not null check (management_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index public_reminder_requests_expires_idx on public.public_reminder_requests(expires_at);
alter table public.public_reminder_requests enable row level security;
revoke all on public.public_reminder_requests from public, anon, authenticated;
grant select, insert, update, delete on public.public_reminder_requests to service_role;

create table public.public_maintenance_reminders (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipments(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  carnet_pass_id text not null,
  recipient_email text not null,
  due_on date not null,
  due_source text not null default 'user_selected' check (due_source = 'user_selected'),
  lead_days integer not null default 30 check (lead_days between 0 and 365),
  timezone text not null default 'Europe/Paris' check (timezone = 'Europe/Paris'),
  management_hash text not null unique check (management_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'active' check (status in ('active', 'review_required', 'cancelled')),
  version integer not null default 1 check (version > 0),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  notification_state text not null default 'pending'
    check (notification_state in ('pending', 'sending', 'accepted', 'failed', 'cancelled')),
  notification_attempts integer not null default 0 check (notification_attempts between 0 and 3),
  claim_id uuid,
  claimed_at timestamptz,
  accepted_at timestamptz,
  provider_message_id text,
  last_error text,
  constraint public_maintenance_reminders_equipment_email_unique unique (equipment_id, recipient_email)
);
create index public_maintenance_reminders_due_idx on public.public_maintenance_reminders(due_on)
  where status = 'active' and notification_state in ('pending', 'failed');
alter table public.public_maintenance_reminders enable row level security;
revoke all on public.public_maintenance_reminders from public, anon, authenticated;
grant select, insert, update, delete on public.public_maintenance_reminders to service_role;

create function public.activate_public_maintenance_reminder(
  p_verification_hash text, p_management_hash text
)
returns public.public_maintenance_reminders
language plpgsql security definer set search_path = ''
as $$
declare
  v_request public.public_reminder_requests;
  v_reminder public.public_maintenance_reminders;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  select * into v_request from public.public_reminder_requests
  where verification_hash = p_verification_hash and management_hash = p_management_hash
    and consumed_at is null and expires_at > now()
  for update;
  if v_request.id is null then
    raise exception 'Lien expiré ou déjà utilisé.' using errcode = '22023';
  end if;
  if v_request.due_on <= (now() at time zone 'Europe/Paris')::date
    or v_request.due_on > (now() at time zone 'Europe/Paris')::date + 3650 then
    raise exception 'Échéance dépassée.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.equipments e
    where e.id = v_request.equipment_id and e.company_id = v_request.company_id
  ) then
    raise exception 'Équipement indisponible.' using errcode = '22023';
  end if;
  insert into public.public_maintenance_reminders (
    equipment_id, company_id, carnet_pass_id, recipient_email, due_on,
    lead_days, management_hash, verified_at
  ) values (
    v_request.equipment_id, v_request.company_id, v_request.carnet_pass_id,
    v_request.recipient_email, v_request.due_on, v_request.lead_days,
    p_management_hash, now()
  )
  on conflict on constraint public_maintenance_reminders_equipment_email_unique
  do update set
    due_on = excluded.due_on, lead_days = excluded.lead_days,
    management_hash = excluded.management_hash,
    verified_at = now(), status = 'active', cancelled_at = null,
    notification_state = 'pending', notification_attempts = 0,
    claim_id = null, claimed_at = null, accepted_at = null,
    provider_message_id = null, last_error = null,
    version = public_maintenance_reminders.version + 1, updated_at = now()
  where public_maintenance_reminders.notification_state <> 'sending'
  returning * into v_reminder;
  if v_reminder.id is null then
    raise exception 'Rappel en cours d’envoi.' using errcode = '40001';
  end if;
  update public.public_reminder_requests set consumed_at = now() where id = v_request.id;
  return v_reminder;
end;
$$;

create function public.update_public_maintenance_reminder(
  p_management_hash text, p_expected_version integer,
  p_due_on date, p_lead_days integer, p_cancel boolean
)
returns public.public_maintenance_reminders
language plpgsql security definer set search_path = ''
as $$
declare v_reminder public.public_maintenance_reminders;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if p_cancel is not true and (p_due_on is null
    or p_due_on <= (now() at time zone 'Europe/Paris')::date
    or p_due_on > (now() at time zone 'Europe/Paris')::date + 3650
    or p_lead_days is null or p_lead_days not between 0 and 365) then
    raise exception 'Date invalide.' using errcode = '22023';
  end if;
  update public.public_maintenance_reminders r set
    due_on = case when p_cancel then r.due_on else p_due_on end,
    lead_days = case when p_cancel then r.lead_days else p_lead_days end,
    status = case when p_cancel then 'cancelled' else 'active' end,
    cancelled_at = case when p_cancel then now() else null end,
    notification_state = case when p_cancel then 'cancelled' else 'pending' end,
    notification_attempts = case when p_cancel then r.notification_attempts else 0 end,
    claim_id = null, claimed_at = null,
    accepted_at = case when p_cancel then r.accepted_at else null end,
    provider_message_id = case when p_cancel then r.provider_message_id else null end,
    last_error = null, version = r.version + 1, updated_at = now()
  where r.management_hash = p_management_hash and r.version = p_expected_version
    and r.status in ('active', 'review_required')
    and r.notification_state <> 'sending'
  returning * into v_reminder;
  if v_reminder.id is null then
    raise exception 'Rappel introuvable ou en cours d’envoi.' using errcode = '22023';
  end if;
  return v_reminder;
end;
$$;

revoke all on function public.activate_public_maintenance_reminder(text,text) from public, anon, authenticated;
revoke all on function public.update_public_maintenance_reminder(text,integer,date,integer,boolean) from public, anon, authenticated;
grant execute on function public.activate_public_maintenance_reminder(text,text) to service_role;
grant execute on function public.update_public_maintenance_reminder(text,integer,date,integer,boolean) to service_role;

-- 20261006000400_public_reminder_dispatch.sql
create table public.public_maintenance_reminder_attempts (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.public_maintenance_reminders(id) on delete cascade,
  reminder_version integer not null,
  claim_id uuid not null unique,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  result text not null default 'claimed' check (result in ('claimed', 'accepted', 'failed', 'cancelled')),
  provider_message_id text,
  error_code text
);
create index public_maintenance_reminder_attempts_reminder_idx
  on public.public_maintenance_reminder_attempts(reminder_id, attempted_at desc);
alter table public.public_maintenance_reminder_attempts enable row level security;
revoke all on public.public_maintenance_reminder_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.public_maintenance_reminder_attempts to service_role;

create function public.claim_due_public_maintenance_reminders(p_limit integer default 10)
returns setof public.public_maintenance_reminders
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
    select r.id from public.public_maintenance_reminders r
    join public.equipments e on e.id = r.equipment_id and e.company_id = r.company_id
    join public.subscriptions s on s.company_id = r.company_id
    join public.companies c on c.id = r.company_id
    left join public.company_verifications v on v.company_id = r.company_id
    where r.status = 'active' and r.verified_at is not null
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
      and (r.notification_state in ('pending', 'failed')
        or (r.notification_state = 'sending' and r.claimed_at < now() - interval '15 minutes'))
      and r.due_on - r.lead_days <= (now() at time zone 'Europe/Paris')::date
      and not exists (
        select 1 from public.public_maintenance_reminder_attempts old_attempt
        where old_attempt.reminder_id = r.id and old_attempt.reminder_version = r.version
          and old_attempt.attempted_at < now() - interval '23 hours'
      )
    order by r.due_on, r.created_at
    limit p_limit for update of r skip locked
  ), claimed as (
    update public.public_maintenance_reminders r set
      notification_state = 'sending', notification_attempts = r.notification_attempts + 1,
      claim_id = gen_random_uuid(), claimed_at = now(), updated_at = now()
    from due where r.id = due.id returning r.*
  ), attempts as (
    insert into public.public_maintenance_reminder_attempts(reminder_id, reminder_version, claim_id)
    select c.id, c.version, c.claim_id from claimed c
  )
  select c.* from claimed c;
end;
$$;

create function public.finish_public_maintenance_reminder_attempt(
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
  if p_result not in ('accepted', 'failed', 'cancelled') then
    raise exception 'Résultat invalide.' using errcode = '22023';
  end if;
  update public.public_maintenance_reminder_attempts a set
    result = p_result, provider_message_id = left(p_provider_message_id, 255),
    error_code = left(p_error_code, 100), completed_at = now()
  where a.claim_id = p_claim_id and a.result = 'claimed';
  get diagnostics v_count = row_count;
  if v_count = 0 then return false; end if;
  update public.public_maintenance_reminders r set
    notification_state = p_result,
    accepted_at = case when p_result = 'accepted' then now() else r.accepted_at end,
    provider_message_id = case when p_result = 'accepted' then left(p_provider_message_id, 255) else r.provider_message_id end,
    last_error = case when p_result = 'failed' then left(p_error_code, 100) else null end,
    claim_id = null, claimed_at = null, updated_at = now()
  where r.claim_id = p_claim_id and r.notification_state = 'sending';
  return true;
end;
$$;

revoke all on function public.claim_due_public_maintenance_reminders(integer) from public, anon, authenticated;
revoke all on function public.finish_public_maintenance_reminder_attempt(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.claim_due_public_maintenance_reminders(integer) to service_role;
grant execute on function public.finish_public_maintenance_reminder_attempt(uuid,text,text,text) to service_role;

-- 20261006000500_maintenance_reminder_audit.sql
create table public.maintenance_reminder_audit (
  id bigint generated always as identity primary key,
  reminder_id uuid not null references public.maintenance_reminders(id) on delete cascade,
  actor_user_id uuid,
  action text not null check (action in ('created', 'modified', 'cancelled', 'notification')),
  action_source text not null check (action_source in ('manual', 'shiba', 'system')),
  reminder_version integer not null,
  due_on date not null,
  status text not null,
  notification_state text not null,
  created_at timestamptz not null default now()
);
create index maintenance_reminder_audit_reminder_idx
  on public.maintenance_reminder_audit(reminder_id, created_at desc);
alter table public.maintenance_reminder_audit enable row level security;
revoke all on public.maintenance_reminder_audit from public, anon, authenticated;
grant select, insert on public.maintenance_reminder_audit to service_role;

create function public.audit_maintenance_reminder()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'created';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    v_action := 'cancelled';
  elsif new.version <> old.version then
    v_action := 'modified';
  elsif new.notification_state is distinct from old.notification_state then
    v_action := 'notification';
  else
    return new;
  end if;
  insert into public.maintenance_reminder_audit (
    reminder_id, actor_user_id, action, action_source, reminder_version,
    due_on, status, notification_state
  ) values (
    new.id, auth.uid(), v_action,
    case when auth.uid() is null then 'system' else new.action_source end,
    new.version, new.due_on, new.status, new.notification_state
  );
  return new;
end;
$$;
create trigger maintenance_reminder_audit_trigger
after insert or update on public.maintenance_reminders
for each row execute function public.audit_maintenance_reminder();
revoke all on function public.audit_maintenance_reminder() from public, anon, authenticated;

-- 20261006000600_maintenance_after_validation.sql
-- Distinct from validation_status, which belongs to the AI-learning review.
alter table public.interventions
  add column maintenance_verified_at timestamptz,
  add column maintenance_verified_by uuid references public.profiles(id),
  add constraint maintenance_verification_consistency check (
    (maintenance_verified_at is null) = (maintenance_verified_by is null)
  );

create function public.confirm_completed_maintenance(p_intervention_id uuid)
returns public.interventions
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_intervention public.interventions;
begin
  if v_user_id is null or auth.role() is distinct from 'authenticated' then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  select * into v_intervention from public.interventions
  where id = p_intervention_id for update;
  if v_intervention.id is null
    or v_intervention.intervention_type <> 'maintenance'
    or v_intervention.polygon_state <> 'confirmed'
    or v_intervention.maintenance_verified_at is not null
    or not exists (
      select 1 from public.company_members m
      where m.company_id = v_intervention.company_id and m.user_id = v_user_id
        and (m.role::text in ('owner', 'admin')
          or (m.role::text = 'technician' and v_intervention.technician_id = v_user_id))
    ) then
    raise exception 'Validation d’entretien non autorisée ou indisponible.' using errcode = '42501';
  end if;
  update public.interventions set maintenance_verified_at = now(),
    maintenance_verified_by = v_user_id
  where id = p_intervention_id returning * into v_intervention;
  return v_intervention;
end;
$$;
revoke all on function public.confirm_completed_maintenance(uuid) from public, anon, authenticated;
grant execute on function public.confirm_completed_maintenance(uuid) to authenticated;

-- A confirmed maintenance makes pending reminders potentially obsolete.
-- Do not infer a new interval from the installation, a repair or a draft.
create function public.review_reminders_after_validated_maintenance()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.maintenance_verified_at is not null
    and old.maintenance_verified_at is null
    and new.intervention_type = 'maintenance'
    and new.polygon_state = 'confirmed' then
    update public.maintenance_reminders r set
      status = 'review_required', notification_state = 'cancelled',
      claim_id = null, claimed_at = null,
      version = r.version + 1, updated_at = now()
    where r.equipment_id = new.equipment_id and r.company_id = new.company_id
      and r.status = 'active';
    update public.public_maintenance_reminders r set
      status = 'review_required', notification_state = 'cancelled',
      claim_id = null, claimed_at = null,
      version = r.version + 1, updated_at = now()
    where r.equipment_id = new.equipment_id and r.company_id = new.company_id
      and r.status = 'active';
  end if;
  return new;
end;
$$;
create trigger review_reminders_after_validated_maintenance_trigger
after update of maintenance_verified_at on public.interventions
for each row execute function public.review_reminders_after_validated_maintenance();
revoke all on function public.review_reminders_after_validated_maintenance() from public, anon, authenticated;

-- 20261006000700_reminder_description.sql
-- Existing reminders remain maintenance reminders; new professional reminders can
-- describe any planned action without changing the public opt-in flow.
alter table public.maintenance_reminders
  add column description text not null default 'Entretien';

-- Existing reminders were maintenance-only. New professional reminders must
-- state their purpose so completed maintenance does not cancel unrelated work.
alter table public.maintenance_reminders
  add column reminder_type text not null default 'maintenance'
  check (reminder_type in ('maintenance', 'repair', 'removal', 'installation', 'other'));

alter table public.maintenance_reminders
  add constraint maintenance_reminders_description_length
  check (char_length(btrim(description)) between 1 and 240 and description !~ '[[:cntrl:]]');

create function public.create_described_maintenance_reminder(
  p_equipment_id uuid,
  p_due_on date,
  p_due_source text,
  p_last_maintenance_on date,
  p_lead_days integer,
  p_confirmation_key uuid,
  p_expected_recipient_email text,
  p_action_source text,
  p_description text,
  p_reminder_type text
)
returns public.maintenance_reminders
language plpgsql security definer set search_path = ''
as $$
declare
  v_existing public.maintenance_reminders;
  v_reminder public.maintenance_reminders;
begin
  if p_confirmation_key is null or p_description is null
    or char_length(btrim(p_description)) not between 1 and 240
    or p_description ~ '[[:cntrl:]]'
    or p_reminder_type is null
    or p_reminder_type not in ('maintenance', 'repair', 'removal', 'installation', 'other') then
    raise exception 'Description ou type du rappel invalide.' using errcode = '22023';
  end if;

  -- Serialize retries with the same confirmation key so an idempotent retry
  -- cannot silently change the description supplied in the first request.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_confirmation_key::text, 0)
  );
  select * into v_existing from public.maintenance_reminders
  where confirmation_key = p_confirmation_key;

  v_reminder := public.create_maintenance_reminder(
    p_equipment_id, p_due_on, p_due_source, p_last_maintenance_on,
    p_lead_days, p_confirmation_key, p_expected_recipient_email, p_action_source
  );
  if v_existing.id is not null
    and (v_existing.description is distinct from btrim(p_description)
      or v_existing.reminder_type is distinct from p_reminder_type) then
    raise exception 'La confirmation ne correspond plus à la proposition.' using errcode = '23505';
  end if;

  update public.maintenance_reminders
  set description = btrim(p_description), reminder_type = p_reminder_type
  where id = v_reminder.id
  returning * into v_reminder;
  return v_reminder;
end;
$$;

create function public.update_described_maintenance_reminder(
  p_id uuid,
  p_expected_version integer,
  p_due_on date,
  p_due_source text,
  p_last_maintenance_on date,
  p_lead_days integer,
  p_expected_recipient_email text,
  p_action_source text,
  p_description text,
  p_reminder_type text
)
returns public.maintenance_reminders
language plpgsql security definer set search_path = ''
as $$
declare v_reminder public.maintenance_reminders;
begin
  if p_description is null
    or char_length(btrim(p_description)) not between 1 and 240
    or p_description ~ '[[:cntrl:]]'
    or p_reminder_type is null
    or p_reminder_type not in ('maintenance', 'repair', 'removal', 'installation', 'other') then
    raise exception 'Description ou type du rappel invalide.' using errcode = '22023';
  end if;

  v_reminder := public.update_maintenance_reminder(
    p_id, p_expected_version, p_due_on, p_due_source, p_last_maintenance_on,
    p_lead_days, p_expected_recipient_email, p_action_source
  );
  update public.maintenance_reminders
  set description = btrim(p_description), reminder_type = p_reminder_type
  where id = v_reminder.id
  returning * into v_reminder;
  return v_reminder;
end;
$$;

-- A validated maintenance only re-evaluates reminders explicitly categorized
-- as maintenance. Public opt-ins remain maintenance reminders.
create or replace function public.review_reminders_after_validated_maintenance()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.maintenance_verified_at is not null
    and old.maintenance_verified_at is null
    and new.intervention_type = 'maintenance'
    and new.polygon_state = 'confirmed' then
    update public.maintenance_reminders r set
      status = 'review_required', notification_state = 'cancelled',
      claim_id = null, claimed_at = null,
      version = r.version + 1, updated_at = now()
    where r.equipment_id = new.equipment_id and r.company_id = new.company_id
      and r.status = 'active' and r.reminder_type = 'maintenance';
    update public.public_maintenance_reminders r set
      status = 'review_required', notification_state = 'cancelled',
      claim_id = null, claimed_at = null,
      version = r.version + 1, updated_at = now()
    where r.equipment_id = new.equipment_id and r.company_id = new.company_id
      and r.status = 'active';
  end if;
  return new;
end;
$$;

revoke all on function public.create_described_maintenance_reminder(uuid,date,text,date,integer,uuid,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.update_described_maintenance_reminder(uuid,integer,date,text,date,integer,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.create_described_maintenance_reminder(uuid,date,text,date,integer,uuid,text,text,text,text)
  to authenticated;
grant execute on function public.update_described_maintenance_reminder(uuid,integer,date,text,date,integer,text,text,text,text)
  to authenticated;

commit;

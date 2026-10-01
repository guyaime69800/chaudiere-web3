begin;

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

commit;

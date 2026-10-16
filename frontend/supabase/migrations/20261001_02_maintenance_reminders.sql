begin;

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

commit;

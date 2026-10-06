begin;

-- Keep reminder creation and dispatch aligned with the five-day Discovery trial.
-- A missing trial_ends_at uses the company creation date, as the pro workspace does.

create or replace function public.create_maintenance_reminder(
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
      and (s.plan::text <> 'free' or coalesce(s.trial_ends_at, (select c.created_at from public.companies c where c.id = s.company_id) + interval '5 days') > now())
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

create or replace function public.update_maintenance_reminder(
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
        and (s.plan::text <> 'free' or coalesce(s.trial_ends_at, (select c.created_at from public.companies c where c.id = s.company_id) + interval '5 days') > now())
        and (s.plan::text <> 'enterprise' or s.current_period_end > now())
    )
  returning * into v_reminder;
  if v_reminder.id is null then
    raise exception 'Rappel introuvable, déjà modifié ou en cours d’envoi.' using errcode = '40001';
  end if;
  return v_reminder;
end;
$$;

create or replace function public.claim_due_maintenance_reminders(p_limit integer default 20)
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
      and (s.plan::text <> 'free' or coalesce(s.trial_ends_at, (select c.created_at from public.companies c where c.id = s.company_id) + interval '5 days') > now())
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

create or replace function public.claim_due_public_maintenance_reminders(p_limit integer default 10)
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
      and (s.plan::text <> 'free' or coalesce(s.trial_ends_at, (select c.created_at from public.companies c where c.id = s.company_id) + interval '5 days') > now())
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

commit;

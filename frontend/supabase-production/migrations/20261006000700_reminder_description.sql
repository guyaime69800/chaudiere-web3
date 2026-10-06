begin;

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

begin;

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

commit;

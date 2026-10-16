begin;
create table public.company_data_erasure_operations (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 requested_by uuid not null, equipment_id uuid, created_at timestamptz not null default now(), completed_at timestamptz
);
create table public.company_data_cleanup_jobs (
 id uuid primary key default gen_random_uuid(), operation_id uuid not null references public.company_data_erasure_operations(id) on delete cascade,
 company_id uuid not null, kind text not null check(kind in ('blob','registry')), pathname text, equipment_id uuid,
 scan_cursor text not null default '0', status text not null default 'pending' check(status in ('pending','done')), attempts integer not null default 0,
 created_at timestamptz not null default now(), completed_at timestamptz,
 check ((kind='blob' and (pathname is not null or status='done') and equipment_id is not null) or (kind='registry' and equipment_id is not null))
);
create index company_cleanup_pending_idx on public.company_data_cleanup_jobs(created_at) where status='pending';
alter table public.company_data_erasure_operations enable row level security;
alter table public.company_data_cleanup_jobs enable row level security;
revoke all on public.company_data_erasure_operations,public.company_data_cleanup_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.company_data_erasure_operations,public.company_data_cleanup_jobs to service_role;
create or replace function public.protect_issued_boiler_certificate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only the service role inside the explicit, membership-checked erasure transaction.
  if tg_op = 'DELETE' and current_setting('role', true) = 'service_role'
    and current_setting('carnetpass.erasing_company', true) = old.company_id::text then
    return old;
  end if;
  if tg_op = 'DELETE' and old.status in ('issued', 'cancelled') then
    raise exception
      'Une attestation émise ou annulée ne peut pas être supprimée.'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and old.status = 'cancelled' then
    raise exception
      'Une attestation annulée est définitive et ne peut plus être modifiée.'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and old.status = 'issued' then
    if new.status <> 'cancelled' then
      raise exception
        'Une attestation émise peut uniquement être annulée.'
        using errcode = '55000';
    end if;

    if (
      to_jsonb(new)
        - array[
            'status',
            'cancelled_at',
            'cancelled_by',
            'cancellation_reason',
            'updated_at'
          ]
      <>
      to_jsonb(old)
        - array[
            'status',
            'cancelled_at',
            'cancelled_by',
            'cancellation_reason',
            'updated_at'
          ]
    ) then
      raise exception
        'Le contenu d’une attestation émise ne peut pas être modifié.'
        using errcode = '55000';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;
create or replace function public.guard_thermodynamic_document()
returns trigger language plpgsql security definer set search_path = '' as $$
declare linked public.interventions%rowtype;
begin
  -- Only the service role inside the explicit, membership-checked erasure transaction.
  if tg_op = 'DELETE' and current_setting('role', true) = 'service_role'
    and current_setting('carnetpass.erasing_company', true) = old.company_id::text then
    return old;
  end if;
  if tg_op = 'DELETE' then
    if old.status = 'issued' then
      raise exception 'Un document émis ne peut pas être supprimé.' using errcode = '55000';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status = 'issued' then
    raise exception 'Un document émis ne peut pas être modifié.' using errcode = '55000';
  end if;

  select * into linked from public.interventions where id = new.intervention_id;
  if not found or linked.company_id <> new.company_id
    or linked.equipment_id <> new.equipment_id
    or linked.technician_id <> new.technician_id
    or linked.polygon_state <> 'confirmed' then
    raise exception 'Intervention confirmée incompatible.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.equipments as e
    where e.id = new.equipment_id and e.company_id = new.company_id
      and e.equipment_type::text in ('air_conditioning', 'heat_pump')
  ) then
    raise exception 'Le document exige une climatisation ou une PAC.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then new.updated_at = now(); end if;
  return new;
end;
$$;
grant delete on public.boiler_maintenance_certificates,public.thermodynamic_documents,public.equipment_private_attachments,
 public.interventions,public.equipments,public.company_rge_qualifications,public.shiba_devis_simulations to service_role;
create function public.erase_company_dossiers(p_company_id uuid,p_actor_id uuid,p_equipment_id uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare operation uuid;
begin
 if current_setting('role',true) <> 'service_role' then raise exception 'Service only' using errcode='42501'; end if;
 if not exists(select 1 from public.company_members where company_id=p_company_id and user_id=p_actor_id and role::text in ('admin','owner')) then
  raise exception 'Responsible membership required' using errcode='42501'; end if;
 perform id from public.companies where id=p_company_id for update;
 if p_equipment_id is not null and not exists(select 1 from public.equipments where id=p_equipment_id and company_id=p_company_id) then
  raise exception 'Equipment unavailable' using errcode='42501'; end if;
 perform id from public.equipments where company_id=p_company_id and (p_equipment_id is null or id=p_equipment_id) for update;
 insert into public.company_data_erasure_operations(company_id,requested_by,equipment_id) values(p_company_id,p_actor_id,p_equipment_id) returning id into operation;
 insert into public.company_data_cleanup_jobs(operation_id,company_id,kind,pathname,equipment_id)
 select operation,p_company_id,'blob',blob_pathname,equipment_id from public.equipment_private_attachments
 where company_id=p_company_id and (p_equipment_id is null or equipment_id=p_equipment_id)
 union all select operation,p_company_id,'blob',pdf_pathname,equipment_id from public.thermodynamic_documents
 where company_id=p_company_id and pdf_pathname is not null and (p_equipment_id is null or equipment_id=p_equipment_id);
 insert into public.company_data_cleanup_jobs(operation_id,company_id,kind,equipment_id)
 select operation,p_company_id,'registry',id from public.equipments where company_id=p_company_id and (p_equipment_id is null or id=p_equipment_id);
 perform set_config('carnetpass.erasing_company',p_company_id::text,true);
 delete from public.boiler_maintenance_certificates where company_id=p_company_id and (p_equipment_id is null or equipment_id=p_equipment_id);
 delete from public.thermodynamic_documents where company_id=p_company_id and (p_equipment_id is null or equipment_id=p_equipment_id);
 delete from public.equipment_private_attachments where company_id=p_company_id and (p_equipment_id is null or equipment_id=p_equipment_id);
 delete from public.interventions where company_id=p_company_id and (p_equipment_id is null or equipment_id=p_equipment_id);
 delete from public.equipments where company_id=p_company_id and (p_equipment_id is null or id=p_equipment_id);
 if p_equipment_id is null then
  delete from public.company_rge_qualifications where company_id=p_company_id;
  delete from public.shiba_devis_simulations where company_id=p_company_id;
 end if;
 perform set_config('carnetpass.erasing_company','',true);
 if not exists(select 1 from public.company_data_cleanup_jobs where operation_id=operation) then
  update public.company_data_erasure_operations set completed_at=now() where id=operation;
 end if;
 return operation;
end; $$;
revoke all on function public.erase_company_dossiers(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.erase_company_dossiers(uuid,uuid,uuid) to service_role;
create function public.finish_company_data_cleanup() returns void language sql security invoker set search_path='' as $$
 update public.company_data_erasure_operations o set completed_at=now() where completed_at is null
 and not exists(select 1 from public.company_data_cleanup_jobs j where j.operation_id=o.id and j.status='pending');
 delete from public.company_data_cleanup_jobs where status='done' and completed_at < now()-interval '7 days';
 delete from public.company_data_erasure_operations where completed_at < now()-interval '90 days';
$$;
revoke all on function public.finish_company_data_cleanup() from public,anon,authenticated;
grant execute on function public.finish_company_data_cleanup() to service_role;
commit;

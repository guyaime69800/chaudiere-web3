begin;
alter table public.company_data_cleanup_jobs add column registry_all boolean not null default false, add column registry_serial text;
create or replace function public.erase_company_dossiers(p_company_id uuid,p_actor_id uuid,p_equipment_id uuid default null)
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
 if p_equipment_id is null then
  -- One bounded scan also removes historical company-owned QR records without a SQL link.
  insert into public.company_data_cleanup_jobs(operation_id,company_id,kind,equipment_id,registry_all)
  values(operation,p_company_id,'registry',operation,true);
 else
  insert into public.company_data_cleanup_jobs(operation_id,company_id,kind,equipment_id,registry_serial)
  select operation,p_company_id,'registry',id,serial_number from public.equipments where company_id=p_company_id and id=p_equipment_id;
 end if;
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
commit;

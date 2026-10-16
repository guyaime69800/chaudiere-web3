begin;

-- Apply only to the CarnetPass Preview database. Issued records are immutable.
create table public.thermodynamic_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  equipment_id uuid not null references public.equipments(id),
  intervention_id uuid not null references public.interventions(id),
  technician_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('climate_maintenance', 'fluids_15497_04')),
  status text not null default 'draft' check (status in ('draft', 'issued')),
  equipment_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(equipment_snapshot) = 'object'),
  intervention_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(intervention_snapshot) = 'object'),
  form_data jsonb not null default '{}'::jsonb check (jsonb_typeof(form_data) = 'object'),
  operator_signature jsonb,
  holder_signature jsonb,
  pdf_pathname text,
  pdf_sha256 text,
  pdf_size_bytes integer check (pdf_size_bytes is null or pdf_size_bytes > 0),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (intervention_id, kind),
  check (status <> 'issued' or (issued_at is not null and operator_signature is not null
    and holder_signature is not null and pdf_pathname is not null and pdf_sha256 is not null
    and pdf_size_bytes is not null)),
  check (operator_signature is null or jsonb_typeof(operator_signature) = 'object'),
  check (holder_signature is null or jsonb_typeof(holder_signature) = 'object')
);

create index thermodynamic_documents_company_equipment_idx
  on public.thermodynamic_documents(company_id, equipment_id, created_at desc);

create function public.guard_thermodynamic_document()
returns trigger language plpgsql security definer set search_path = '' as $$
declare linked public.interventions%rowtype;
begin
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

create trigger guard_thermodynamic_document
before insert or update or delete on public.thermodynamic_documents
for each row execute function public.guard_thermodynamic_document();

alter table public.thermodynamic_documents enable row level security;
create policy "Members can read company thermodynamic documents"
on public.thermodynamic_documents for select to authenticated
using (public.is_company_member(company_id));
revoke all on public.thermodynamic_documents from public, anon, authenticated, service_role;
grant select on public.thermodynamic_documents to authenticated;
grant select, insert, update on public.thermodynamic_documents to service_role;
revoke all on function public.guard_thermodynamic_document() from public, anon, authenticated;

comment on table public.thermodynamic_documents is
  'Preview: fiches clim/PAC et saisies numériques des rubriques du CERFA 15497*04, liées aux interventions confirmées.';

commit;

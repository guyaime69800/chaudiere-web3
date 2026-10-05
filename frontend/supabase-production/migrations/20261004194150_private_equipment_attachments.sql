begin;

-- Metadata only. The private file bytes remain in Vercel Blob.
create table public.equipment_private_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  equipment_id uuid not null references public.equipments(id) on delete cascade,
  intervention_id uuid references public.interventions(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  document_kind text not null check (document_kind in ('photo', 'invoice', 'quote', 'proof', 'other')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text check (description is null or char_length(description) <= 1000),
  original_filename text not null check (char_length(btrim(original_filename)) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  blob_url text not null unique,
  blob_pathname text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  check (deleted_at is not null or deleted_by is null)
);

create index equipment_private_attachments_equipment_idx
  on public.equipment_private_attachments(company_id, equipment_id, created_at desc)
  where deleted_at is null;
create index equipment_private_attachments_hash_idx
  on public.equipment_private_attachments(company_id, sha256)
  where deleted_at is null;
create index equipment_private_attachments_intervention_idx
  on public.equipment_private_attachments(intervention_id, created_at desc)
  where intervention_id is not null and deleted_at is null;

create function public.validate_private_attachment_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  equipment_company_id uuid;
  intervention_company_id uuid;
  intervention_equipment_id uuid;
begin
  select equipment.company_id into equipment_company_id
    from public.equipments as equipment where equipment.id = new.equipment_id;
  if equipment_company_id is null then raise exception 'Équipement introuvable.'; end if;
  if equipment_company_id <> new.company_id then
    raise exception 'L’équipement ne correspond pas à cette entreprise.';
  end if;

  if new.intervention_id is not null then
    select intervention.company_id, intervention.equipment_id
      into intervention_company_id, intervention_equipment_id
      from public.interventions as intervention where intervention.id = new.intervention_id;
    if intervention_company_id is null then raise exception 'Intervention introuvable.'; end if;
    if intervention_company_id <> new.company_id then
      raise exception 'L’intervention ne correspond pas à cette entreprise.';
    end if;
    if intervention_equipment_id <> new.equipment_id then
      raise exception 'L’intervention ne correspond pas à cet équipement.';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_private_attachment_scope_trigger
  before insert or update on public.equipment_private_attachments
  for each row execute function public.validate_private_attachment_scope();

alter table public.equipment_private_attachments enable row level security;
alter table public.equipment_private_attachments force row level security;
revoke all on public.equipment_private_attachments from public, anon, authenticated;
grant select, insert, update on public.equipment_private_attachments to service_role;
revoke all on function public.validate_private_attachment_scope() from public, anon, authenticated;

comment on table public.equipment_private_attachments is
  'Métadonnées des pièces jointes privées CarnetPass ; fichiers conservés dans Vercel Blob privé.';

commit;

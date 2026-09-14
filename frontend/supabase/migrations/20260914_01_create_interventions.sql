begin;

-- =========================================================
-- CARNETPASS - INTERVENTIONS PROFESSIONNELLES
-- =========================================================

create table public.interventions (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.companies(id),

  equipment_id uuid not null
    references public.equipments(id),

  -- L’identifiant est vérifié côté serveur avec Redis avant l’insertion.
  carnet_pass_id text not null,

  technician_id uuid not null
    references public.profiles(id),

  intervention_at timestamptz not null default now(),

  -- Journée française utilisée pour l’anti-doublon.
  intervention_day date not null
    default ((now() at time zone 'Europe/Paris')::date),

  intervention_type text not null default 'maintenance'
    check (
      intervention_type in (
        'maintenance',
        'repair',
        'installation',
        'commissioning',
        'inspection',
        'other'
      )
    ),

  symptoms text
    check (
      symptoms is null
      or char_length(btrim(symptoms)) between 1 and 4000
    ),

  fault_code text
    check (
      fault_code is null
      or char_length(btrim(fault_code)) between 1 and 100
    ),

  diagnosis text
    check (
      diagnosis is null
      or char_length(btrim(diagnosis)) between 1 and 4000
    ),

  work_performed text not null
    check (
      char_length(btrim(work_performed)) between 1 and 8000
    ),

  parts_replaced jsonb not null default '[]'::jsonb,

  measurements jsonb not null default '{}'::jsonb,

  result_status text not null
    check (
      result_status in (
        'resolved',
        'partially_resolved',
        'not_resolved',
        'not_applicable'
      )
    ),

  -- Retour du technicien sur l’aide de l’IA.
  ai_assistance_used boolean not null default false,
  ai_answer_helpful boolean,

  ai_feedback text
    check (
      ai_feedback is null
      or char_length(btrim(ai_feedback)) between 1 and 2000
    ),

  -- Désactivé par défaut : aucune utilisation automatique pour l’IA.
  ai_training_allowed boolean not null default false,

  validation_status text not null default 'pending'
    check (
      validation_status in (
        'pending',
        'approved',
        'rejected'
      )
    ),

  validated_by uuid
    references public.profiles(id),

  validated_at timestamptz,

  validation_note text
    check (
      validation_note is null
      or char_length(btrim(validation_note)) between 1 and 2000
    ),

  -- Informations de preuve Polygon.
  proof_version smallint not null default 1
    check (proof_version >= 1),

  polygon_state text not null default 'prepared'
    check (
      polygon_state in (
        'prepared',
        'submitted',
        'confirmation_pending',
        'confirmed',
        'failed'
      )
    ),

  polygon_chain_id integer not null default 137
    check (polygon_chain_id = 137),

  polygon_contract_address text,

  polygon_equipment_key text not null,
  polygon_proof_id text not null,
  polygon_data_hash text not null,

  polygon_transaction_hash text,
  polygon_block_number bigint,
  polygon_transaction_fee_wei numeric(78, 0),

  polygon_submitted_at timestamptz,
  polygon_confirmed_at timestamptz,

  polygon_error_code text
    check (
      polygon_error_code is null
      or char_length(polygon_error_code) between 1 and 100
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint interventions_carnet_pass_format
    check (
      carnet_pass_id ~ '^CP-[0-9]{4}-[0-9]{6}$'
    ),

  constraint interventions_day_matches_timestamp
    check (
      intervention_day =
      (intervention_at at time zone 'Europe/Paris')::date
    ),

  constraint interventions_parts_replaced_array
    check (
      jsonb_typeof(parts_replaced) = 'array'
    ),

  constraint interventions_measurements_object
    check (
      jsonb_typeof(measurements) = 'object'
    ),

  constraint interventions_validation_consistency
    check (
      (
        validation_status = 'pending'
        and validated_by is null
        and validated_at is null
      )
      or
      (
        validation_status in ('approved', 'rejected')
        and validated_by is not null
        and validated_at is not null
      )
    ),

  constraint interventions_polygon_equipment_key_format
    check (
      polygon_equipment_key ~ '^0x[0-9a-fA-F]{64}$'
    ),

  constraint interventions_polygon_proof_id_format
    check (
      polygon_proof_id ~ '^0x[0-9a-fA-F]{64}$'
    ),

  constraint interventions_polygon_data_hash_format
    check (
      polygon_data_hash ~ '^0x[0-9a-fA-F]{64}$'
    ),

  constraint interventions_polygon_contract_format
    check (
      polygon_contract_address is null
      or polygon_contract_address ~ '^0x[0-9a-fA-F]{40}$'
    ),

  constraint interventions_polygon_transaction_format
    check (
      polygon_transaction_hash is null
      or polygon_transaction_hash ~ '^0x[0-9a-fA-F]{64}$'
    ),

  constraint interventions_polygon_block_positive
    check (
      polygon_block_number is null
      or polygon_block_number > 0
    ),

  constraint interventions_polygon_fee_positive
    check (
      polygon_transaction_fee_wei is null
      or polygon_transaction_fee_wei >= 0
    ),

  constraint interventions_polygon_submitted_complete
    check (
      polygon_state not in (
        'submitted',
        'confirmation_pending',
        'confirmed'
      )
      or (
        polygon_contract_address is not null
        and polygon_transaction_hash is not null
        and polygon_submitted_at is not null
      )
    ),

  constraint interventions_polygon_confirmed_complete
    check (
      polygon_state <> 'confirmed'
      or (
        polygon_block_number is not null
        and polygon_transaction_fee_wei is not null
        and polygon_confirmed_at is not null
      )
    ),

  -- Une intervention maximum pour le même technicien,
  -- le même équipement et la même journée.
  constraint interventions_equipment_technician_day_unique
    unique (
      equipment_id,
      technician_id,
      intervention_day
    ),

  constraint interventions_polygon_proof_unique
    unique (polygon_proof_id),

  constraint interventions_polygon_transaction_unique
    unique (polygon_transaction_hash)
);

-- =========================================================
-- INDEXES
-- =========================================================

create index interventions_company_date_idx
on public.interventions (
  company_id,
  intervention_at desc
);

create index interventions_equipment_date_idx
on public.interventions (
  equipment_id,
  intervention_at desc
);

create index interventions_technician_date_idx
on public.interventions (
  technician_id,
  intervention_at desc
);

-- Seules les données autorisées et validées pourront alimenter
-- plus tard la base d’amélioration de l’IA.
create index interventions_ai_learning_idx
on public.interventions (
  result_status,
  intervention_type,
  created_at
)
where
  validation_status = 'approved'
  and ai_training_allowed is true;

-- =========================================================
-- CONTROLES ENTREPRISE, EQUIPEMENT ET TECHNICIEN
-- =========================================================

create function public.guard_intervention_relationships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- L’équipement doit appartenir à l’entreprise indiquée.
  if not exists (
    select 1
    from public.equipments as e
    where e.id = new.equipment_id
      and e.company_id = new.company_id
  ) then
    raise exception
      'Cet équipement n''appartient pas à cette entreprise.'
      using errcode = '23503';
  end if;

  -- Le technicien doit être membre de cette entreprise.
  if not exists (
    select 1
    from public.company_members as m
    where m.company_id = new.company_id
      and m.user_id = new.technician_id
      and m.role::text in (
        'owner',
        'admin',
        'technician'
      )
  ) then
    raise exception
      'Ce technicien n''est pas autorisé pour cette entreprise.'
      using errcode = '42501';
  end if;

  -- L’entreprise doit être validée ou autorisée en démonstration.
  if not exists (
    select 1
    from public.companies as c
    left join public.company_verifications as v
      on v.company_id = c.id
    where c.id = new.company_id
      and (
        (
          c.is_demo is true
          and coalesce(v.status, 'pending') <> 'suspended'
        )
        or
        (
          c.siret ~ '^[0-9]{14}$'
          and v.status = 'approved'
          and v.verified_siret = c.siret
          and v.verified_at is not null
        )
      )
  ) then
    raise exception
      'Cette entreprise n''est pas autorisée à enregistrer une intervention.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger guard_intervention_relationships
before insert or update of
  company_id,
  equipment_id,
  technician_id
on public.interventions
for each row
execute function public.guard_intervention_relationships();

-- =========================================================
-- PROTECTION DE LA PREUVE APRES ENVOI POLYGON
-- =========================================================

create function public.protect_intervention_proof()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Dès qu’un hash de transaction existe, les données ayant servi
  -- à fabriquer la preuve ne peuvent plus être modifiées.
  if old.polygon_transaction_hash is not null
     and row(
       new.company_id,
       new.equipment_id,
       new.carnet_pass_id,
       new.technician_id,
       new.intervention_at,
       new.intervention_day,
       new.intervention_type,
       new.symptoms,
       new.fault_code,
       new.diagnosis,
       new.work_performed,
       new.parts_replaced,
       new.measurements,
       new.result_status,
       new.ai_assistance_used,
       new.ai_answer_helpful,
       new.ai_feedback,
       new.proof_version,
       new.polygon_chain_id,
       new.polygon_contract_address,
       new.polygon_equipment_key,
       new.polygon_proof_id,
       new.polygon_data_hash,
       new.polygon_transaction_hash
     )
     is distinct from
     row(
       old.company_id,
       old.equipment_id,
       old.carnet_pass_id,
       old.technician_id,
       old.intervention_at,
       old.intervention_day,
       old.intervention_type,
       old.symptoms,
       old.fault_code,
       old.diagnosis,
       old.work_performed,
       old.parts_replaced,
       old.measurements,
       old.result_status,
       old.ai_assistance_used,
       old.ai_answer_helpful,
       old.ai_feedback,
       old.proof_version,
       old.polygon_chain_id,
       old.polygon_contract_address,
       old.polygon_equipment_key,
       old.polygon_proof_id,
       old.polygon_data_hash,
       old.polygon_transaction_hash
     ) then
    raise exception
      'La preuve Polygon a déjà été envoyée : les données techniques sont verrouillées.'
      using errcode = '55000';
  end if;

  -- Une preuve confirmée ne peut plus revenir à un autre état
  -- ni perdre ses informations blockchain.
  if old.polygon_state = 'confirmed'
     and row(
       new.polygon_state,
       new.polygon_block_number,
       new.polygon_transaction_fee_wei,
       new.polygon_submitted_at,
       new.polygon_confirmed_at,
       new.polygon_error_code
     )
     is distinct from
     row(
       old.polygon_state,
       old.polygon_block_number,
       old.polygon_transaction_fee_wei,
       old.polygon_submitted_at,
       old.polygon_confirmed_at,
       old.polygon_error_code
     ) then
    raise exception
      'Une preuve Polygon confirmée est définitive.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger protect_intervention_proof
before update on public.interventions
for each row
execute function public.protect_intervention_proof();

-- Met automatiquement à jour la date de modification.
create function public.set_intervention_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_intervention_updated_at
before update on public.interventions
for each row
execute function public.set_intervention_updated_at();

-- =========================================================
-- SECURITE RLS
-- =========================================================

alter table public.interventions
enable row level security;

-- Les interventions restent privées à l’entreprise.
create policy "Members can view company interventions"
on public.interventions
for select
to authenticated
using (
  public.is_company_member(company_id)
);

-- Le navigateur peut seulement lire les interventions autorisées.
-- Les créations et modifications passeront par la future API serveur.
revoke all on public.interventions
from public, anon, authenticated, service_role;

grant select on public.interventions
to authenticated;

grant select, insert, update
on public.interventions
to service_role;

-- Les fonctions internes ne peuvent pas être appelées directement.
revoke all
on function public.guard_intervention_relationships()
from public, anon, authenticated;

revoke all
on function public.protect_intervention_proof()
from public, anon, authenticated;

revoke all
on function public.set_intervention_updated_at()
from public, anon, authenticated;

comment on table public.interventions
is 'Interventions professionnelles privées avec preuve Polygon et validation contrôlée pour l’amélioration future de l’IA.';

comment on column public.interventions.ai_training_allowed
is 'Autorise l’utilisation future de cette intervention uniquement après validation humaine.';

comment on column public.interventions.carnet_pass_id
is 'Identifiant CarnetPass vérifié côté serveur avec Redis avant toute insertion.';

commit;
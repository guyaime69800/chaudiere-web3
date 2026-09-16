begin;

-- =========================================================
-- CARNETPASS - ATTESTATIONS D'ENTRETIEN DES CHAUDIERES
-- Une attestation réglementaire distincte par intervention.
-- =========================================================

create table public.boiler_maintenance_certificates (
  id uuid primary key default gen_random_uuid(),

  intervention_id uuid not null unique
    references public.interventions(id),

  company_id uuid not null
    references public.companies(id),

  equipment_id uuid not null
    references public.equipments(id),

  technician_id uuid not null
    references public.profiles(id),

  status text not null default 'draft'
    check (status in ('draft', 'issued')),

  document_version smallint not null default 1
    check (document_version >= 1),

  certificate_number text,

  -- Instantanés conservés même si les données d'origine changent.
  company_snapshot jsonb not null,
  equipment_snapshot jsonb not null,
  customer_snapshot jsonb not null default '{}'::jsonb,
  installation_snapshot jsonb not null default '{}'::jsonb,
  technician_snapshot jsonb not null,

  -- Informations réglementaires propres à la chaudière.
  boiler_energy text,
  flue_exhaust_type text,
  commissioning_date date,
  nominal_power_kw numeric(10, 2),

  -- Renseigné uniquement si un brûleur à air soufflé existe.
  forced_air_burner jsonb,

  previous_maintenance_date date,
  previous_chimney_sweeping_date date,

  -- Listes et résultats réglementaires.
  controlled_points jsonb not null default '[]'::jsonb,
  measuring_instruments jsonb not null default '[]'::jsonb,
  measurements jsonb not null default '{}'::jsonb,

  ambient_co_ppm numeric(10, 2)
    check (
      ambient_co_ppm is null
      or ambient_co_ppm >= 0
    ),

  ambient_co_status text
    check (
      ambient_co_status is null
      or ambient_co_status in (
        'normal',
        'anomaly',
        'serious_immediate_danger'
      )
    ),

  boiler_efficiency_percent numeric(6, 2)
    check (
      boiler_efficiency_percent is null
      or boiler_efficiency_percent between 0 and 100
    ),

  reference_efficiency_percent numeric(6, 2)
    check (
      reference_efficiency_percent is null
      or reference_efficiency_percent between 0 and 100
    ),

  pollutant_emissions jsonb not null default '{}'::jsonb,

  advice_good_use text,
  advice_improvements text,
  advice_replacement text,

  boiler_energy_class text,
  replacement_energy_classes jsonb not null default '[]'::jsonb,

  -- La signature sera enregistrée sous une forme structurée.
  technician_signature jsonb,

  issued_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint boiler_certificate_number_unique
    unique (company_id, certificate_number),

  constraint boiler_certificate_company_snapshot_object
    check (jsonb_typeof(company_snapshot) = 'object'),

  constraint boiler_certificate_equipment_snapshot_object
    check (jsonb_typeof(equipment_snapshot) = 'object'),

  constraint boiler_certificate_customer_snapshot_object
    check (jsonb_typeof(customer_snapshot) = 'object'),

  constraint boiler_certificate_installation_snapshot_object
    check (jsonb_typeof(installation_snapshot) = 'object'),

  constraint boiler_certificate_technician_snapshot_object
    check (jsonb_typeof(technician_snapshot) = 'object'),

  constraint boiler_certificate_burner_object
    check (
      forced_air_burner is null
      or jsonb_typeof(forced_air_burner) = 'object'
    ),

  constraint boiler_certificate_controlled_points_array
    check (jsonb_typeof(controlled_points) = 'array'),

  constraint boiler_certificate_measuring_instruments_array
    check (jsonb_typeof(measuring_instruments) = 'array'),

  constraint boiler_certificate_measurements_object
    check (jsonb_typeof(measurements) = 'object'),

  constraint boiler_certificate_pollutant_emissions_object
    check (jsonb_typeof(pollutant_emissions) = 'object'),

  constraint boiler_certificate_replacement_classes_array
    check (jsonb_typeof(replacement_energy_classes) = 'array'),

  constraint boiler_certificate_signature_object
    check (
      technician_signature is null
      or jsonb_typeof(technician_signature) = 'object'
    ),

  constraint boiler_certificate_co_consistency
    check (
      (
        ambient_co_ppm is null
        and ambient_co_status is null
      )
      or
      (
        ambient_co_ppm is not null
        and ambient_co_status = case
          when ambient_co_ppm < 10
            then 'normal'
          when ambient_co_ppm < 50
            then 'anomaly'
          else 'serious_immediate_danger'
        end
      )
    ),

  constraint boiler_certificate_issued_consistency
    check (
      status <> 'issued'
      or (
        certificate_number is not null
        and char_length(btrim(certificate_number)) >= 1
        and issued_at is not null
        and technician_signature is not null
        and ambient_co_ppm is not null
        and ambient_co_status is not null
        and jsonb_array_length(controlled_points) > 0
        and jsonb_array_length(measuring_instruments) > 0
      )
    )
);

-- =========================================================
-- INDEXES
-- =========================================================

create index boiler_certificates_company_date_idx
on public.boiler_maintenance_certificates (
  company_id,
  created_at desc
);

create index boiler_certificates_equipment_date_idx
on public.boiler_maintenance_certificates (
  equipment_id,
  created_at desc
);

create index boiler_certificates_status_idx
on public.boiler_maintenance_certificates (
  company_id,
  status,
  created_at desc
);

-- =========================================================
-- CONTROLE DU LIEN AVEC L'INTERVENTION ET LA CHAUDIERE
-- =========================================================

create function public.guard_boiler_maintenance_certificate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_intervention public.interventions%rowtype;
begin
  select *
  into linked_intervention
  from public.interventions
  where id = new.intervention_id;

  if not found then
    raise exception
      'L''intervention liée est introuvable.'
      using errcode = '23503';
  end if;

  if linked_intervention.company_id <> new.company_id
     or linked_intervention.equipment_id <> new.equipment_id
     or linked_intervention.technician_id <> new.technician_id then
    raise exception
      'L''attestation ne correspond pas à l''intervention sélectionnée.'
      using errcode = '23514';
  end if;

  if linked_intervention.intervention_type <> 'maintenance' then
    raise exception
      'Une attestation chaudière exige une intervention de type entretien.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.equipments as e
    where e.id = new.equipment_id
      and e.company_id = new.company_id
      and e.equipment_type::text = 'boiler'
  ) then
    raise exception
      'L''équipement sélectionné n''est pas une chaudière.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger guard_boiler_maintenance_certificate
before insert or update of
  intervention_id,
  company_id,
  equipment_id,
  technician_id
on public.boiler_maintenance_certificates
for each row
execute function public.guard_boiler_maintenance_certificate();

-- =========================================================
-- VERROUILLAGE APRES EMISSION
-- =========================================================

create function public.protect_issued_boiler_certificate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'issued' then
    raise exception
      'Une attestation émise est définitive et ne peut plus être modifiée ou supprimée.'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger protect_issued_boiler_certificate
before update or delete
on public.boiler_maintenance_certificates
for each row
execute function public.protect_issued_boiler_certificate();

create function public.set_boiler_certificate_updated_at()
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

create trigger set_boiler_certificate_updated_at
before update
on public.boiler_maintenance_certificates
for each row
execute function public.set_boiler_certificate_updated_at();

-- =========================================================
-- SECURITE RLS
-- =========================================================

alter table public.boiler_maintenance_certificates
enable row level security;

create policy "Members can view company boiler certificates"
on public.boiler_maintenance_certificates
for select
to authenticated
using (
  public.is_company_member(company_id)
);

revoke all
on public.boiler_maintenance_certificates
from public, anon, authenticated, service_role;

grant select
on public.boiler_maintenance_certificates
to authenticated;

grant select, insert, update, delete
on public.boiler_maintenance_certificates
to service_role;

revoke all
on function public.guard_boiler_maintenance_certificate()
from public, anon, authenticated;

revoke all
on function public.protect_issued_boiler_certificate()
from public, anon, authenticated;

revoke all
on function public.set_boiler_certificate_updated_at()
from public, anon, authenticated;

comment on table public.boiler_maintenance_certificates
is 'Attestations réglementaires d’entretien des chaudières, distinctes des rapports techniques génériques.';

comment on column public.boiler_maintenance_certificates.intervention_id
is 'Une seule attestation chaudière peut être rattachée à une intervention d’entretien.';

comment on column public.boiler_maintenance_certificates.company_snapshot
is 'Instantané des informations de l’entreprise au moment de la préparation de l’attestation.';

comment on column public.boiler_maintenance_certificates.equipment_snapshot
is 'Instantané des informations de la chaudière au moment de la préparation de l’attestation.';

commit;
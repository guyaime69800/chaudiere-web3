begin;

-- =========================================================
-- CARNETPASS - EQUIPEMENTS DES ENTREPRISES
-- =========================================================

create table public.equipments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies(id) on delete cascade,
  brand text not null
    check (char_length(btrim(brand)) between 2 and 100),
  model text not null
    check (char_length(btrim(model)) between 1 and 150),
  product_reference text
    check (
      product_reference is null
      or char_length(btrim(product_reference)) between 1 and 100
    ),
  serial_number text not null
    check (char_length(btrim(serial_number)) between 1 and 150),
  created_by uuid not null
    references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint equipments_company_serial_unique
    unique (company_id, serial_number)
);

create index equipments_company_id_idx
on public.equipments(company_id);

alter table public.equipments
enable row level security;

-- Tous les membres de l'entreprise peuvent consulter ses équipements.
create policy "Members can view company equipments"
on public.equipments
for select
to authenticated
using (public.is_company_member(company_id));

-- L'application crée les équipements uniquement par la fonction sécurisée.
revoke all on public.equipments
from public, anon, authenticated;

grant select on public.equipments
to authenticated;

grant select, insert, update, delete
on public.equipments
to service_role;

create function public.create_company_equipment(
  p_company_id uuid,
  p_brand text,
  p_model text,
  p_product_reference text,
  p_serial_number text
)
returns public.equipments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_equipment public.equipments;
begin
  if v_user_id is null
     or auth.role() is distinct from 'authenticated' then
    raise exception 'Connexion requise.'
      using errcode = '42501';
  end if;

  if nullif(btrim(p_brand), '') is null
     or char_length(btrim(p_brand)) > 100 then
    raise exception 'La marque est obligatoire.'
      using errcode = '22023';
  end if;

  if nullif(btrim(p_model), '') is null
     or char_length(btrim(p_model)) > 150 then
    raise exception 'Le modèle est obligatoire.'
      using errcode = '22023';
  end if;

  if nullif(btrim(p_serial_number), '') is null
     or char_length(btrim(p_serial_number)) > 150 then
    raise exception 'Le numéro de série est obligatoire.'
      using errcode = '22023';
  end if;

  if p_product_reference is not null
     and char_length(btrim(p_product_reference)) > 100 then
    raise exception 'La référence produit est trop longue.'
      using errcode = '22023';
  end if;

  -- Tous les membres actifs de l'entreprise peuvent créer un équipement.
  if not exists (
    select 1
    from public.company_members as m
    where m.company_id = p_company_id
      and m.user_id = v_user_id
  ) then
    raise exception 'Ajout d''équipement non autorisé.'
      using errcode = '42501';
  end if;

  -- La validation doit correspondre au SIRET actuel de l'entreprise.
  if not exists (
    select 1
    from public.companies as c
    join public.company_verifications as v
      on v.company_id = c.id
    where c.id = p_company_id
      and c.siret ~ '^[0-9]{14}$'
      and v.status = 'approved'
      and v.verified_siret = c.siret
      and v.verified_at is not null
  ) then
    raise exception 'Votre entreprise doit être validée avant d''ajouter un équipement.'
      using errcode = '42501';
  end if;

  insert into public.equipments (
    company_id,
    brand,
    model,
    product_reference,
    serial_number,
    created_by
  )
  values (
    p_company_id,
    btrim(p_brand),
    btrim(p_model),
    nullif(btrim(p_product_reference), ''),
    btrim(p_serial_number),
    v_user_id
  )
  returning * into v_equipment;

  return v_equipment;
exception
  when unique_violation then
    raise exception 'Ce numéro de série existe déjà dans votre entreprise.'
      using errcode = '23505';
end;
$$;

revoke all
on function public.create_company_equipment(uuid, text, text, text, text)
from public, anon, authenticated;

grant execute
on function public.create_company_equipment(uuid, text, text, text, text)
to authenticated;

comment on function public.create_company_equipment(uuid, text, text, text, text)
is 'Crée un équipement pour une entreprise validée après contrôle de l’utilisateur connecté.';

commit;

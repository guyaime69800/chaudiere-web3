begin;

alter table public.equipments
add column equipment_type text not null default 'other'
check (
  equipment_type in (
    'boiler',
    'heat_pump',
    'air_conditioning',
    'vmc',
    'rooftop',
    'other'
  )
);

drop function public.create_company_equipment(uuid, text, text, text, text);

create function public.create_company_equipment(
  p_company_id uuid,
  p_equipment_type text,
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
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;

  if p_equipment_type is null
     or p_equipment_type not in (
       'boiler', 'heat_pump', 'air_conditioning',
       'vmc', 'rooftop', 'other'
     ) then
    raise exception 'Le type d''équipement est invalide.'
      using errcode = '22023';
  end if;

  if nullif(btrim(p_brand), '') is null
     or char_length(btrim(p_brand)) > 100 then
    raise exception 'La marque est obligatoire.' using errcode = '22023';
  end if;

  if nullif(btrim(p_model), '') is null
     or char_length(btrim(p_model)) > 150 then
    raise exception 'Le modèle est obligatoire.' using errcode = '22023';
  end if;

  if nullif(btrim(p_serial_number), '') is null
     or char_length(btrim(p_serial_number)) > 150 then
    raise exception 'Le numéro de série est obligatoire.' using errcode = '22023';
  end if;

  if p_product_reference is not null
     and char_length(btrim(p_product_reference)) > 100 then
    raise exception 'La référence produit est trop longue.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.company_members as m
    where m.company_id = p_company_id
      and m.user_id = v_user_id
  ) then
    raise exception 'Ajout d''équipement non autorisé.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.companies as c
    join public.company_verifications as v on v.company_id = c.id
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
    equipment_type,
    brand,
    model,
    product_reference,
    serial_number,
    created_by
  )
  values (
    p_company_id,
    p_equipment_type,
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
on function public.create_company_equipment(uuid, text, text, text, text, text)
from public, anon, authenticated;

grant execute
on function public.create_company_equipment(uuid, text, text, text, text, text)
to authenticated;

comment on function public.create_company_equipment(uuid, text, text, text, text, text)
is 'Crée un équipement catégorisé pour une entreprise validée.';

commit;

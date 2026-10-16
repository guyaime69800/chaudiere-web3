begin;

-- Cette fonction est appelée uniquement par le parcours Découverte. Elle garde
-- l'autorisation et le plafond dans la base, même si le navigateur est modifié.
create or replace function public.create_discovery_equipment(
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
  v_company public.companies;
  v_subscription public.subscriptions;
  v_verification_status text;
  v_equipment_count integer;
begin
  if v_user_id is null or auth.role() is distinct from 'authenticated' then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if p_equipment_type is null or p_equipment_type not in
    ('boiler', 'heat_pump', 'air_conditioning', 'vmc', 'rooftop', 'other') then
    raise exception 'Le type d''équipement est invalide.' using errcode = '22023';
  end if;
  if nullif(btrim(p_brand), '') is null or char_length(btrim(p_brand)) > 100 then
    raise exception 'La marque est obligatoire.' using errcode = '22023';
  end if;
  if nullif(btrim(p_model), '') is null or char_length(btrim(p_model)) > 150 then
    raise exception 'Le modèle est obligatoire.' using errcode = '22023';
  end if;
  if p_product_reference is not null and char_length(btrim(p_product_reference)) > 100 then
    raise exception 'La référence produit est trop longue.' using errcode = '22023';
  end if;
  if p_serial_number is not null and char_length(btrim(p_serial_number)) > 150 then
    raise exception 'Le numéro de série est trop long.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.company_members as m
    where m.company_id = p_company_id and m.user_id = v_user_id
  ) then
    raise exception 'Ajout d''équipement non autorisé.' using errcode = '42501';
  end if;

  -- Le verrou sérialise deux créations simultanées pour la même entreprise.
  select * into v_company from public.companies
  where id = p_company_id for update;
  select * into v_subscription from public.subscriptions
  where company_id = p_company_id;
  select status::text into v_verification_status
  from public.company_verifications where company_id = p_company_id;

  if v_company.id is null or v_subscription.company_id is null
    or v_subscription.plan::text <> 'free'
    or v_subscription.status::text not in ('active', 'trialing')
    or now() >= coalesce(v_subscription.trial_ends_at, v_company.created_at + interval '5 days')
    or v_verification_status in ('suspended', 'rejected') then
    raise exception 'La période Découverte de 5 jours est terminée ou indisponible.'
      using errcode = '42501';
  end if;

  select count(*) into v_equipment_count from public.equipments
  where company_id = p_company_id;
  if v_equipment_count >= 5 then
    raise exception 'La formule Découverte est limitée à 5 équipements.'
      using errcode = '23514';
  end if;

  insert into public.equipments (
    company_id, equipment_type, brand, model, product_reference,
    serial_number, created_by
  ) values (
    p_company_id, p_equipment_type, btrim(p_brand), btrim(p_model),
    nullif(btrim(p_product_reference), ''), nullif(btrim(p_serial_number), ''),
    v_user_id
  ) returning * into v_equipment;
  return v_equipment;
exception
  when unique_violation then
    raise exception 'Ce numéro de série existe déjà dans votre entreprise.'
      using errcode = '23505';
end;
$$;

revoke all on function public.create_discovery_equipment(uuid,text,text,text,text,text)
from public, anon, authenticated;
grant execute on function public.create_discovery_equipment(uuid,text,text,text,text,text)
to authenticated;

-- La fonction historique create_company_equipment reste exécutable pour les
-- entreprises validées. Ce contrôle empêche un compte free validé de contourner
-- le plafond en appelant directement cette ancienne fonction.
create or replace function public.enforce_discovery_equipment_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies;
  v_subscription public.subscriptions;
  v_count integer;
begin
  select * into v_company from public.companies
  where id = new.company_id for update;
  if v_company.is_demo is true then return new; end if;

  select * into v_subscription from public.subscriptions
  where company_id = new.company_id;
  if v_subscription.plan::text <> 'free' then return new; end if;

  if v_subscription.status::text not in ('active', 'trialing')
    or now() >= coalesce(v_subscription.trial_ends_at, v_company.created_at + interval '5 days') then
    raise exception 'La période Découverte de 5 jours est terminée ou indisponible.'
      using errcode = '42501';
  end if;
  select count(*) into v_count from public.equipments
  where company_id = new.company_id;
  if v_count >= 5 then
    raise exception 'La formule Découverte est limitée à 5 équipements.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_discovery_equipment_limit on public.equipments;
create trigger enforce_discovery_equipment_limit
before insert on public.equipments
for each row execute function public.enforce_discovery_equipment_limit();

commit;

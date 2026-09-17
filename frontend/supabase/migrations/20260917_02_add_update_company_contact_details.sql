begin;

create or replace function public.update_company_contact_details(
  p_company_id uuid,
  p_phone text,
  p_email text,
  p_address_line1 text,
  p_address_line2 text,
  p_postal_code text,
  p_city text,
  p_country text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_phone text;
  v_email text;
  v_address_line1 text;
  v_address_line2 text;
  v_postal_code text;
  v_city text;
  v_country text;
begin
  if v_user_id is null
     or auth.role() is distinct from 'authenticated' then
    raise exception 'Connexion requise.'
      using errcode = '42501';
  end if;

  v_phone := nullif(btrim(coalesce(p_phone, '')), '');
  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_address_line1 := nullif(btrim(coalesce(p_address_line1, '')), '');
  v_address_line2 := nullif(btrim(coalesce(p_address_line2, '')), '');
  v_postal_code := nullif(btrim(coalesce(p_postal_code, '')), '');
  v_city := nullif(btrim(coalesce(p_city, '')), '');
  v_country := coalesce(
    nullif(btrim(coalesce(p_country, '')), ''),
    'France'
  );

  if v_phone is not null and length(v_phone) > 50 then
    raise exception 'Le numéro de téléphone est trop long.'
      using errcode = '22023';
  end if;

  if v_email is not null
     and (
       length(v_email) > 254
       or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     ) then
    raise exception 'L’adresse e-mail est invalide.'
      using errcode = '22023';
  end if;

  if v_address_line1 is not null
     and length(v_address_line1) > 200 then
    raise exception 'L’adresse est trop longue.'
      using errcode = '22023';
  end if;

  if v_address_line2 is not null
     and length(v_address_line2) > 200 then
    raise exception 'Le complément d’adresse est trop long.'
      using errcode = '22023';
  end if;

  if v_postal_code is not null
     and length(v_postal_code) > 20 then
    raise exception 'Le code postal est trop long.'
      using errcode = '22023';
  end if;

  if v_city is not null and length(v_city) > 120 then
    raise exception 'Le nom de la ville est trop long.'
      using errcode = '22023';
  end if;

  if length(v_country) > 100 then
    raise exception 'Le nom du pays est trop long.'
      using errcode = '22023';
  end if;

  perform 1
  from public.company_members as m
  where m.company_id = p_company_id
    and m.user_id = v_user_id
    and m.role::text in ('owner', 'admin')
  for share;

  if not found then
    raise exception 'Modification des coordonnées non autorisée.'
      using errcode = '42501';
  end if;

  update public.companies
  set
    phone = v_phone,
    email = v_email,
    address_line1 = v_address_line1,
    address_line2 = v_address_line2,
    postal_code = v_postal_code,
    city = v_city,
    country = v_country,
    updated_at = now()
  where id = p_company_id;

  if not found then
    raise exception 'Entreprise introuvable.';
  end if;
end;
$function$;

revoke all
on function public.update_company_contact_details(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
)
from public;

grant execute
on function public.update_company_contact_details(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
)
to authenticated;

commit;
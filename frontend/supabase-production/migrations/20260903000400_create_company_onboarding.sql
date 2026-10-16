-- =========================================================
-- CARNETPASS - CREATION SECURISEE D'UNE ENTREPRISE
-- =========================================================

create or replace function public.create_company_onboarding(
  p_name text,
  p_siret text default null,
  p_phone text default null,
  p_job_title text default null
)
returns public.companies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company public.companies;
  v_siret text :=
    nullif(
      regexp_replace(coalesce(p_siret, ''), '[^0-9]', '', 'g'),
      ''
    );
begin
  if v_user_id is null then
    raise exception 'Vous devez être connecté.';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Le nom de l''entreprise est obligatoire.';
  end if;

  if nullif(btrim(p_siret), '') is not null
     and (v_siret is null or v_siret !~ '^[0-9]{14}$') then
    raise exception 'Le SIRET doit contenir exactement 14 chiffres.';
  end if;

  if exists (
    select 1
    from public.company_members
    where user_id = v_user_id
  ) then
    raise exception 'Vous appartenez déjà à une entreprise.';
  end if;

  insert into public.companies (
    name,
    siret,
    phone,
    created_by
  )
  values (
    btrim(p_name),
    v_siret,
    nullif(btrim(p_phone), ''),
    v_user_id
  )
  returning * into v_company;

  insert into public.company_members (
    company_id,
    user_id,
    role
  )
  values (
    v_company.id,
    v_user_id,
    'owner'
  )
  on conflict (company_id, user_id)
  do update set role = excluded.role;

  insert into public.subscriptions (
    company_id
  )
  values (
    v_company.id
  )
  on conflict (company_id) do nothing;

  update public.profiles
  set
    job_title = coalesce(
      nullif(btrim(p_job_title), ''),
      job_title
    ),
    updated_at = now()
  where id = v_user_id;

  return v_company;
end;
$$;

revoke all
on function public.create_company_onboarding(text, text, text, text)
from public;

grant execute
on function public.create_company_onboarding(text, text, text, text)
to authenticated;

comment on function public.create_company_onboarding(text, text, text, text)
is 'Crée une entreprise, son propriétaire et son abonnement initial en une seule transaction sécurisée.';
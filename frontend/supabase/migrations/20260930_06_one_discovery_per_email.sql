begin;

-- Preview only. This ledger survives membership removal and account soft deletion.
-- A confirmed email is not proof of a unique natural person; SMS verification
-- would be needed to raise the anti-abuse bar across different email addresses.
create table public.discovery_claims (
  email_sha256 text primary key check (email_sha256 ~ '^[0-9a-f]{64}$'),
  first_user_id uuid not null,
  claimed_at timestamptz not null default now()
);
create index discovery_claims_first_user_idx on public.discovery_claims(first_user_id);
alter table public.discovery_claims enable row level security;
revoke all on public.discovery_claims from public, anon, authenticated;
grant select on public.discovery_claims to service_role;

-- Keep claims for existing accounts, including canceled/expired trials.
insert into public.discovery_claims (email_sha256, first_user_id)
select distinct on (encode(sha256(convert_to(lower(btrim(u.email)), 'UTF8')), 'hex'))
  encode(sha256(convert_to(lower(btrim(u.email)), 'UTF8')), 'hex'), c.created_by
from public.companies c
join auth.users u on u.id = c.created_by
where nullif(btrim(u.email), '') is not null
order by encode(sha256(convert_to(lower(btrim(u.email)), 'UTF8')), 'hex'), c.created_at
on conflict do nothing;

-- The onboarding RPC is the sole authenticated creation route.
revoke insert on public.companies from authenticated;
revoke insert (name, siret, phone, created_by) on public.companies from authenticated;

create or replace function public.create_company_onboarding(
  p_name text,
  p_siret text default null,
  p_phone text default null,
  p_job_title text default null
)
returns public.companies
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_email_sha256 text;
  v_trial_used boolean;
  v_new_claim boolean;
  v_company public.companies;
  v_siret text := nullif(regexp_replace(coalesce(p_siret, ''), '[^0-9]', '', 'g'), '');
begin
  if v_user_id is null then
    raise exception 'Vous devez être connecté.' using errcode = '42501';
  end if;
  select email into v_email from auth.users
    where id = v_user_id and email_confirmed_at is not null;
  if nullif(btrim(v_email), '') is null then
    raise exception 'Confirmez votre adresse e-mail avant de commencer Découverte.' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Le nom de l''entreprise est obligatoire.' using errcode = '22023';
  end if;
  if nullif(btrim(p_siret), '') is not null
    and (v_siret is null or v_siret !~ '^[0-9]{14}$') then
    raise exception 'Le SIRET doit contenir exactement 14 chiffres.' using errcode = '22023';
  end if;
  if v_siret is not null and exists (select 1 from public.companies where siret = v_siret) then
    raise exception 'Ce SIRET est déjà rattaché à une entreprise. Contactez CarnetPass.' using errcode = '23505';
  end if;
  if exists (select 1 from public.company_members where user_id = v_user_id) then
    raise exception 'Vous appartenez déjà à une entreprise.' using errcode = '23505';
  end if;

  v_trial_used := exists (select 1 from public.companies where created_by = v_user_id);
  v_email_sha256 := encode(sha256(convert_to(lower(btrim(v_email)), 'UTF8')), 'hex');
  insert into public.discovery_claims (email_sha256, first_user_id)
    values (v_email_sha256, v_user_id)
    on conflict do nothing returning true into v_new_claim;
  v_trial_used := v_trial_used or not coalesce(v_new_claim, false);
  if v_trial_used and v_siret is null then
    raise exception 'Découverte déjà utilisée : renseignez un SIRET pour créer une entreprise sans nouvel essai.' using errcode = '23505';
  end if;

  insert into public.companies (name, siret, phone, created_by)
    values (btrim(p_name), v_siret, nullif(btrim(p_phone), ''), v_user_id)
    returning * into v_company;
  insert into public.company_members (company_id, user_id, role)
    values (v_company.id, v_user_id, 'owner')
    on conflict (company_id, user_id) do update set role = excluded.role;
  insert into public.subscriptions (company_id, status)
    values (v_company.id, case when v_trial_used then 'canceled'::public.subscription_status else 'active'::public.subscription_status end)
    on conflict (company_id) do nothing;
  update public.profiles
    set job_title = coalesce(nullif(btrim(p_job_title), ''), job_title), updated_at = now()
    where id = v_user_id;
  return v_company;
end;
$$;

revoke all on function public.create_company_onboarding(text, text, text, text) from public;
grant execute on function public.create_company_onboarding(text, text, text, text) to authenticated;

commit;

-- CarnetPass Preview: schema initialization for a NEW, EMPTY Supabase project only.
-- Contains the 22 repository migrations in filename order, through 20260929_03.
-- Do not run on an existing CarnetPass database; these migrations are not all repeatable.
-- Founder bootstrap is separate: run bootstrap-preview-founder.sql only after account confirmation.

-- BEGIN 20260902_01_create_profiles.sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  job_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
-- END 20260902_01_create_profiles.sql

-- BEGIN 20260902_02_create_companies_and_roles.sql
create type public.company_role
as enum ('admin', 'technician');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2),
  siret text,
  phone text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_members (
  company_id uuid not null
    references public.companies(id) on delete cascade,
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  role public.company_role not null default 'technician',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

alter table public.companies enable row level security;
alter table public.company_members enable row level security;

create or replace function public.is_company_member(
  requested_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_members
    where company_id = requested_company_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_company_admin(
  requested_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_members
    where company_id = requested_company_id
      and user_id = (select auth.uid())
      and role = 'admin'::public.company_role
  );
$$;

create or replace function public.handle_new_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.company_members (
    company_id,
    user_id,
    role
  )
  values (
    new.id,
    new.created_by,
    'admin'
  );

  return new;
end;
$$;

create trigger on_company_created
after insert on public.companies
for each row
execute function public.handle_new_company();

create policy "Members can view their company"
on public.companies
for select
to authenticated
using (
  public.is_company_member(id)
  or created_by = (select auth.uid())
);

create policy "Users can create a company"
on public.companies
for insert
to authenticated
with check (
  created_by = (select auth.uid())
);

create policy "Admins can update their company"
on public.companies
for update
to authenticated
using (public.is_company_admin(id))
with check (public.is_company_admin(id));

create policy "Members can view company members"
on public.company_members
for select
to authenticated
using (public.is_company_member(company_id));

create policy "Admins can add company members"
on public.company_members
for insert
to authenticated
with check (public.is_company_admin(company_id));

create policy "Admins can update company roles"
on public.company_members
for update
to authenticated
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

create policy "Admins can remove company members"
on public.company_members
for delete
to authenticated
using (public.is_company_admin(company_id));

revoke all on public.profiles from anon;
revoke all on public.companies from anon;
revoke all on public.company_members from anon;

grant select on public.profiles to authenticated;
grant update (
  full_name,
  job_title,
  updated_at
) on public.profiles to authenticated;

grant select on public.companies to authenticated;
grant insert (
  name,
  siret,
  phone,
  created_by
) on public.companies to authenticated;
grant update (
  name,
  siret,
  phone,
  updated_at
) on public.companies to authenticated;

grant select on public.company_members to authenticated;
grant insert (
  company_id,
  user_id,
  role
) on public.company_members to authenticated;
grant update (
  role
) on public.company_members to authenticated;
grant delete on public.company_members to authenticated;

grant usage on type public.company_role to authenticated;

revoke all on function public.is_company_member(uuid) from public;
revoke all on function public.is_company_admin(uuid) from public;
revoke all on function public.handle_new_company() from public;

grant execute
on function public.is_company_member(uuid)
to authenticated;

grant execute
on function public.is_company_admin(uuid)
to authenticated;
-- END 20260902_02_create_companies_and_roles.sql

-- BEGIN 20260902_03_create_subscriptions.sql
create type public.subscription_plan
as enum ('free', 'pro', 'enterprise');

create type public.subscription_status
as enum ('active', 'trialing', 'past_due', 'canceled');

create table public.subscriptions (
  company_id uuid primary key
    references public.companies(id) on delete cascade,
  plan public.subscription_plan not null default 'free',
  status public.subscription_status not null default 'active',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Members can view their subscription"
on public.subscriptions
for select
to authenticated
using (public.is_company_member(company_id));

revoke all on public.subscriptions from anon;

grant select
on public.subscriptions
to authenticated;

grant select, insert, update
on public.subscriptions
to service_role;

grant usage
on type public.subscription_plan
to authenticated, service_role;

grant usage
on type public.subscription_status
to authenticated, service_role;

create or replace function public.handle_new_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.company_members (
    company_id,
    user_id,
    role
  )
  values (
    new.id,
    new.created_by,
    'admin'
  );

  insert into public.subscriptions (
    company_id,
    plan,
    status
  )
  values (
    new.id,
    'free',
    'active'
  );

  return new;
end;
$$;
-- END 20260902_03_create_subscriptions.sql

-- BEGIN 20260903_04_create_company_onboarding.sql
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
-- END 20260903_04_create_company_onboarding.sql

-- BEGIN 20260904_05_add_owner_role.sql
-- =========================================================
-- CARNETPASS - AJOUT DU ROLE PROPRIETAIRE
-- =========================================================

alter type public.company_role
add value if not exists 'owner';
-- END 20260904_05_add_owner_role.sql

-- BEGIN 20260906_06_create_company_verifications.sql
begin;

create table public.company_verifications (
  company_id uuid primary key
    references public.companies(id) on delete cascade,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'suspended')),

  verified_siret text
    check (verified_siret ~ '^[0-9]{14}$'),

  verified_at timestamptz,

  updated_at timestamptz not null default now(),

  constraint approval_requires_verification
    check (
      status <> 'approved'
      or (
        verified_siret is not null
        and verified_at is not null
      )
    )
);

alter table public.company_verifications
enable row level security;

revoke all on public.company_verifications
from public, anon, authenticated;

grant select on public.company_verifications
to authenticated;

grant select, insert, update, delete
on public.company_verifications
to service_role;

create policy "Members can view company verification"
on public.company_verifications
for select
to authenticated
using (
  public.is_company_member(company_id)
);

-- Les entreprises existantes commencent en attente.
insert into public.company_verifications (company_id)
select id
from public.companies;

commit;
-- END 20260906_06_create_company_verifications.sql

-- BEGIN 20260907_07_company_siret_update.sql
begin;

-- Contrôle chaque changement de SIRET, même en dehors du formulaire.
create function public.guard_company_siret_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.siret is not distinct from old.siret then
    return new;
  end if;

  -- Pour un utilisateur connecté : propriétaire ou administrateur uniquement.
  if auth.role() = 'authenticated' then
    if not exists (
      select 1
      from public.company_members as m
      where m.company_id = old.id
        and m.user_id = auth.uid()
        and m.role::text in ('owner', 'admin')
    ) then
      raise exception 'Modification du SIRET non autorisée.'
        using errcode = '42501';
    end if;
  elsif auth.role() = 'anon' then
    raise exception 'Connexion requise.'
      using errcode = '42501';
  end if;

  if new.siret is not null
     and new.siret !~ '^[0-9]{14}$' then
    raise exception 'Le SIRET doit contenir exactement 14 chiffres.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger guard_company_siret_change
before update of siret on public.companies
for each row
execute function public.guard_company_siret_change();

-- Annule la validation liée à l’ancien SIRET.
create function public.reset_company_verification_on_siret_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.siret is distinct from old.siret then
    insert into public.company_verifications as v (
      company_id,
      status,
      verified_siret,
      verified_at,
      updated_at
    )
    values (
      new.id,
      'pending',
      null,
      null,
      now()
    )
    on conflict (company_id) do update
    set
      status = case
        when v.status = 'suspended' then 'suspended'
        else 'pending'
      end,
      verified_siret = null,
      verified_at = null,
      updated_at = now();
  end if;

  return new;
end;
$$;

create trigger reset_company_verification_on_siret_change
after update of siret on public.companies
for each row
execute function public.reset_company_verification_on_siret_change();

-- Fonction appelée par le futur formulaire.
create function public.update_company_siret(
  p_company_id uuid,
  p_siret text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_siret text;
begin
  if v_user_id is null
     or auth.role() is distinct from 'authenticated' then
    raise exception 'Connexion requise.'
      using errcode = '42501';
  end if;

  -- Accepte les espaces de présentation, mais pas les lettres.
  if p_siret is null or length(p_siret) > 64 then
    raise exception 'Le SIRET doit contenir exactement 14 chiffres.'
      using errcode = '22023';
  end if;

  v_siret := regexp_replace(p_siret, '[[:space:]]', '', 'g');

  if v_siret !~ '^[0-9]{14}$' then
    raise exception 'Le SIRET doit contenir exactement 14 chiffres.'
      using errcode = '22023';
  end if;

  -- Vérifie le rôle et empêche sa modification pendant l’opération.
  perform 1
  from public.company_members as m
  where m.company_id = p_company_id
    and m.user_id = v_user_id
    and m.role::text in ('owner', 'admin')
  for share;

  if not found then
    raise exception 'Modification du SIRET non autorisée.'
      using errcode = '42501';
  end if;

  update public.companies
  set
    siret = v_siret,
    updated_at = now()
  where id = p_company_id;

  if not found then
    raise exception 'Entreprise introuvable.';
  end if;
end;
$$;

-- Les fonctions internes ne sont pas accessibles depuis l’application.
revoke all on function public.guard_company_siret_change()
from public, anon, authenticated;

revoke all on function public.reset_company_verification_on_siret_change()
from public, anon, authenticated;

-- Seuls les utilisateurs connectés peuvent appeler le formulaire.
-- Leur rôle est ensuite vérifié dans la fonction.
revoke all on function public.update_company_siret(uuid, text)
from public, anon, authenticated;

grant execute on function public.update_company_siret(uuid, text)
to authenticated;

commit;

-- END 20260907_07_company_siret_update.sql

-- BEGIN 20260907_08_create_equipments.sql
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

-- END 20260907_08_create_equipments.sql

-- BEGIN 20260907_09_add_equipment_type.sql
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

-- END 20260907_09_add_equipment_type.sql

-- BEGIN 20260907_10_add_demo_company_mode.sql
begin;

-- Le mode démonstration est désactivé par défaut.
alter table public.companies
add column is_demo boolean not null default false;

comment on column public.companies.is_demo
is 'Autorise les tests sans SIRET uniquement pour une entreprise de démonstration.';

-- L’application ne peut pas activer elle-même ce mode.
revoke update (is_demo)
on public.companies
from public, anon, authenticated;

-- Remplace la fonction de création d’équipement.
drop function public.create_company_equipment(
  uuid,
  text,
  text,
  text,
  text,
  text
);

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
    raise exception 'Connexion requise.'
      using errcode = '42501';
  end if;

  if p_equipment_type is null
     or p_equipment_type not in (
       'boiler',
       'heat_pump',
       'air_conditioning',
       'vmc',
       'rooftop',
       'other'
     ) then
    raise exception 'Le type d''équipement est invalide.'
      using errcode = '22023';
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

  -- L’utilisateur doit appartenir à l’entreprise.
  if not exists (
    select 1
    from public.company_members as m
    where m.company_id = p_company_id
      and m.user_id = v_user_id
  ) then
    raise exception 'Ajout d''équipement non autorisé.'
      using errcode = '42501';
  end if;

  -- Autorisation :
  -- 1. entreprise réellement validée ;
  -- 2. ou entreprise de démonstration non suspendue.
  if not exists (
    select 1
    from public.companies as c
    left join public.company_verifications as v
      on v.company_id = c.id
    where c.id = p_company_id
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
on function public.create_company_equipment(
  uuid,
  text,
  text,
  text,
  text,
  text
)
from public, anon, authenticated;

grant execute
on function public.create_company_equipment(
  uuid,
  text,
  text,
  text,
  text,
  text
)
to authenticated;

comment on function public.create_company_equipment(
  uuid,
  text,
  text,
  text,
  text,
  text
)
is 'Crée un équipement pour une entreprise validée ou une démonstration autorisée.';

commit;
-- END 20260907_10_add_demo_company_mode.sql

-- BEGIN 20260908_01_secure_company_verification_result.sql
begin;

-- Enregistre le résultat transmis par le serveur CarnetPass.
-- La ligne de l’entreprise est verrouillée pendant l’opération :
-- un ancien SIRET ne peut donc pas être approuvé par erreur.

create or replace function public.record_company_verification(
  p_company_id uuid,
  p_verified_siret text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_siret text;
  v_current_status text;
begin
  -- Cette fonction est exclusivement réservée au serveur.
  if auth.role() is distinct from 'service_role' then
    raise exception 'Accès serveur requis.'
      using errcode = '42501';
  end if;

  if p_verified_siret is null
     or p_verified_siret !~ '^[0-9]{14}$' then
    raise exception 'SIRET vérifié invalide.'
      using errcode = '22023';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Statut de vérification invalide.'
      using errcode = '22023';
  end if;

  -- FOR UPDATE verrouille temporairement cette entreprise.
  select c.siret
  into v_current_siret
  from public.companies as c
  where c.id = p_company_id
  for update;

  if not found then
    raise exception 'Entreprise introuvable.';
  end if;

  -- Le SIRET contrôlé doit toujours être celui de l’entreprise.
  if v_current_siret is distinct from p_verified_siret then
    raise exception 'Le SIRET a changé pendant la vérification.'
      using errcode = '40001';
  end if;

  select v.status
  into v_current_status
  from public.company_verifications as v
  where v.company_id = p_company_id;

  -- Une suspension administrative ne peut jamais être annulée
  -- automatiquement par une nouvelle vérification.
  if v_current_status = 'suspended' then
    raise exception 'La validation de cette entreprise est suspendue.'
      using errcode = '42501';
  end if;

  insert into public.company_verifications (
    company_id,
    status,
    verified_siret,
    verified_at,
    updated_at
  )
  values (
    p_company_id,
    p_status,
    p_verified_siret,
    now(),
    now()
  )
  on conflict (company_id) do update
  set
    status = excluded.status,
    verified_siret = excluded.verified_siret,
    verified_at = excluded.verified_at,
    updated_at = excluded.updated_at;
end;
$$;

revoke all
on function public.record_company_verification(uuid, text, text)
from public, anon, authenticated;

grant execute
on function public.record_company_verification(uuid, text, text)
to service_role;

comment on function public.record_company_verification(uuid, text, text)
is 'Enregistre de manière atomique un résultat officiel de vérification SIRET, uniquement côté serveur.';

commit;
-- END 20260908_01_secure_company_verification_result.sql

-- BEGIN 20260914_01_create_interventions.sql
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
-- END 20260914_01_create_interventions.sql

-- BEGIN 20260916_01_create_boiler_maintenance_certificates.sql
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
grant select
on public.companies, public.profiles
to service_role;

commit;
-- END 20260916_01_create_boiler_maintenance_certificates.sql

-- BEGIN 20260917_01_add_company_contact_details.sql
begin;

alter table public.companies
  add column if not exists email text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists country text
    default 'France';

comment on column public.companies.email
is 'Adresse e-mail professionnelle affichée sur les documents CarnetPass.';

comment on column public.companies.address_line1
is 'Première ligne de l’adresse professionnelle.';

comment on column public.companies.address_line2
is 'Complément facultatif de l’adresse professionnelle.';

comment on column public.companies.postal_code
is 'Code postal de l’entreprise.';

comment on column public.companies.city
is 'Ville de l’entreprise.';

comment on column public.companies.country
is 'Pays de l’entreprise, France par défaut.';

commit;
-- END 20260917_01_add_company_contact_details.sql

-- BEGIN 20260917_02_add_update_company_contact_details.sql
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
-- END 20260917_02_add_update_company_contact_details.sql

-- BEGIN 20260922_01_add_boiler_certificate_cancellation.sql
begin;

alter table public.boiler_maintenance_certificates
drop constraint if exists boiler_maintenance_certificates_status_check;

alter table public.boiler_maintenance_certificates
add constraint boiler_maintenance_certificates_status_check
check (status in ('draft', 'issued', 'cancelled'));

alter table public.boiler_maintenance_certificates
add column cancelled_at timestamptz,
add column cancelled_by uuid
  references public.profiles(id),
add column cancellation_reason text;

alter table public.boiler_maintenance_certificates
add constraint boiler_certificate_cancellation_consistency
check (
  (
    status <> 'cancelled'
    and cancelled_at is null
    and cancelled_by is null
    and cancellation_reason is null
  )
  or
  (
    status = 'cancelled'
    and issued_at is not null
    and certificate_number is not null
    and cancelled_at is not null
    and cancelled_by is not null
    and char_length(btrim(cancellation_reason)) >= 5
  )
);

create or replace function public.protect_issued_boiler_certificate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.status in ('issued', 'cancelled') then
    raise exception
      'Une attestation émise ou annulée ne peut pas être supprimée.'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and old.status = 'cancelled' then
    raise exception
      'Une attestation annulée est définitive et ne peut plus être modifiée.'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and old.status = 'issued' then
    if new.status <> 'cancelled' then
      raise exception
        'Une attestation émise peut uniquement être annulée.'
        using errcode = '55000';
    end if;

    if (
      to_jsonb(new)
        - array[
            'status',
            'cancelled_at',
            'cancelled_by',
            'cancellation_reason',
            'updated_at'
          ]
      <>
      to_jsonb(old)
        - array[
            'status',
            'cancelled_at',
            'cancelled_by',
            'cancellation_reason',
            'updated_at'
          ]
    ) then
      raise exception
        'Le contenu d’une attestation émise ne peut pas être modifié.'
        using errcode = '55000';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

commit;
-- END 20260922_01_add_boiler_certificate_cancellation.sql

-- BEGIN 20260924_01_optional_equipment_serial.sql
begin;

-- La référence produit décrit un modèle ; le numéro de série peut être illisible.
-- La clé primaire UUID de chaque équipement reste unique, même sans série.
alter table public.equipments alter column serial_number drop not null;

create or replace function public.create_company_equipment(
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
    raise exception 'Connexion requise.'
      using errcode = '42501';
  end if;

  if p_equipment_type is null
     or p_equipment_type not in (
       'boiler',
       'heat_pump',
       'air_conditioning',
       'vmc',
       'rooftop',
       'other'
     ) then
    raise exception 'Le type d''équipement est invalide.'
      using errcode = '22023';
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

  if p_serial_number is not null
     and char_length(btrim(p_serial_number)) > 150 then
    raise exception 'Le numéro de série est trop long.'
      using errcode = '22023';
  end if;

  if p_product_reference is not null
     and char_length(btrim(p_product_reference)) > 100 then
    raise exception 'La référence produit est trop longue.'
      using errcode = '22023';
  end if;

  -- L’utilisateur doit appartenir à l’entreprise.
  if not exists (
    select 1
    from public.company_members as m
    where m.company_id = p_company_id
      and m.user_id = v_user_id
  ) then
    raise exception 'Ajout d''équipement non autorisé.'
      using errcode = '42501';
  end if;

  -- Autorisation :
  -- 1. entreprise réellement validée ;
  -- 2. ou entreprise de démonstration non suspendue.
  if not exists (
    select 1
    from public.companies as c
    left join public.company_verifications as v
      on v.company_id = c.id
    where c.id = p_company_id
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
    nullif(btrim(p_serial_number), ''),
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


-- Une fonction SECURITY DEFINER est exécutable uniquement par les rôles autorisés.
revoke all on function public.create_company_equipment(uuid,text,text,text,text,text)
from public, anon, authenticated;
grant execute on function public.create_company_equipment(uuid,text,text,text,text,text)
to authenticated;

commit;

-- END 20260924_01_optional_equipment_serial.sql

-- BEGIN 20260927_01_create_discovery_equipment.sql
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

-- END 20260927_01_create_discovery_equipment.sql

-- BEGIN 20260928_01_stripe_test_billing.sql
-- Les paiements Stripe fictifs restent séparés des abonnements réels.
create table if not exists public.stripe_test_subscriptions (
  company_id uuid primary key references public.companies(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan text check (plan in ('pro', 'team')),
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.stripe_test_subscriptions enable row level security;

create policy "Members can view Stripe test subscriptions"
  on public.stripe_test_subscriptions for select to authenticated
  using (public.is_company_member(company_id));

revoke all on public.stripe_test_subscriptions from anon;
grant select on public.stripe_test_subscriptions to authenticated;
grant select, insert, update on public.stripe_test_subscriptions to service_role;

-- END 20260928_01_stripe_test_billing.sql

-- BEGIN 20260929_01_platform_enterprise_admin.sql
begin;

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('founder', 'operator')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table public.enterprise_access_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id),
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('activate', 'suspend')),
  payment_reference text,
  contract_end timestamptz,
  note text,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
alter table public.enterprise_access_events enable row level security;
revoke all on public.platform_admins, public.enterprise_access_events from public, anon, authenticated;
grant select, insert, update, delete on public.platform_admins to service_role;
grant select, insert on public.enterprise_access_events to service_role;
grant usage, select on sequence public.enterprise_access_events_id_seq to service_role;

create or replace function public.platform_set_enterprise(
  p_actor uuid, p_company uuid, p_action text,
  p_contract_end timestamptz, p_payment_reference text, p_note text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_current public.subscriptions%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
  if not exists (select 1 from public.platform_admins where user_id = p_actor) then raise exception 'Forbidden'; end if;
  if p_action not in ('activate', 'suspend') then raise exception 'Invalid action'; end if;
  select * into v_current from public.subscriptions where company_id = p_company for update;
  if not found then raise exception 'Company subscription missing'; end if;
  if p_action = 'activate' then
    if p_contract_end is null or p_contract_end <= now() or p_contract_end > now() + interval '5 years'
      or length(trim(coalesce(p_payment_reference, ''))) < 3 then raise exception 'Invalid contract or payment reference'; end if;
    if not exists (select 1 from public.companies c
      join public.company_verifications v on v.company_id = c.id
      where c.id = p_company and v.status = 'approved' and v.verified_siret = c.siret
        and v.verified_at is not null and c.is_demo is not true) then
      raise exception 'Company not verified';
    end if;
    if exists (select 1 from public.stripe_test_subscriptions
      where company_id = p_company and status in ('active', 'trialing')) then
      raise exception 'Active Stripe test subscription';
    end if;
    update public.subscriptions set plan = 'enterprise', status = 'active',
      current_period_end = p_contract_end, trial_ends_at = null, updated_at = now()
      where company_id = p_company;
  else
    if v_current.plan::text <> 'enterprise' then raise exception 'Not an Enterprise subscription'; end if;
    update public.subscriptions set status = 'canceled', updated_at = now()
      where company_id = p_company;
  end if;
  insert into public.enterprise_access_events(company_id, actor_id, action, payment_reference, contract_end, note)
    values (p_company, p_actor, p_action, nullif(trim(p_payment_reference), ''), p_contract_end,
      nullif(trim(p_note), ''));
end;
$$;

revoke all on function public.platform_set_enterprise(uuid, uuid, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.platform_set_enterprise(uuid, uuid, text, timestamptz, text, text) to service_role;

create or replace function public.platform_manage_collaborator(
  p_actor uuid, p_email text, p_add boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_target uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
  if not exists (select 1 from public.platform_admins where user_id = p_actor and role = 'founder')
    then raise exception 'Forbidden'; end if;
  select id into v_target from auth.users
    where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;
  if v_target is null or v_target = p_actor then raise exception 'Target unavailable'; end if;
  if p_add then
    insert into public.platform_admins(user_id, role, created_by)
      values (v_target, 'operator', p_actor) on conflict (user_id) do nothing;
  else
    delete from public.platform_admins where user_id = v_target and role = 'operator';
  end if;
  return v_target;
end;
$$;
revoke all on function public.platform_manage_collaborator(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.platform_manage_collaborator(uuid, text, boolean) to service_role;

commit;

-- END 20260929_01_platform_enterprise_admin.sql

-- BEGIN 20260929_02_platform_enterprise_seats.sql
begin;

alter table public.subscriptions
  add column enterprise_seat_limit integer
  check (enterprise_seat_limit between 1 and 10000);

alter table public.enterprise_access_events
  drop constraint enterprise_access_events_action_check;
alter table public.enterprise_access_events
  add constraint enterprise_access_events_action_check
  check (action in ('activate', 'suspend', 'set_seats', 'add_technician', 'remove_technician'));

alter table public.enterprise_access_events
  add column target_user_id uuid references auth.users(id),
  add column seat_limit integer;

create or replace function public.enforce_enterprise_seat_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_limit integer;
declare v_plan public.subscription_plan;
declare v_count integer;
begin
  select plan, enterprise_seat_limit into v_plan, v_limit
    from public.subscriptions where company_id = new.company_id for update;
  if v_plan = 'enterprise' then
    if v_limit is null then raise exception 'Enterprise seat limit missing'; end if;
    select count(*) into v_count from public.company_members where company_id = new.company_id;
    if v_count >= v_limit then raise exception 'Enterprise seat limit reached'; end if;
  end if;
  return new;
end;
$$;

create trigger enforce_enterprise_seat_limit_before_insert
before insert on public.company_members
for each row execute function public.enforce_enterprise_seat_limit();
revoke all on function public.enforce_enterprise_seat_limit() from public, anon, authenticated;

drop function public.platform_set_enterprise(uuid, uuid, text, timestamptz, text, text);
create function public.platform_set_enterprise(
  p_actor uuid, p_company uuid, p_action text,
  p_contract_end timestamptz, p_payment_reference text, p_note text,
  p_seat_limit integer
) returns void language plpgsql security definer set search_path = '' as $$
declare v_current public.subscriptions%rowtype;
declare v_members integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
  if not exists (select 1 from public.platform_admins where user_id = p_actor) then raise exception 'Forbidden'; end if;
  if p_action not in ('activate', 'suspend', 'set_seats') then raise exception 'Invalid action'; end if;
  select * into v_current from public.subscriptions where company_id = p_company for update;
  if not found then raise exception 'Company subscription missing'; end if;
  select count(*) into v_members from public.company_members where company_id = p_company;
  if p_action in ('activate', 'set_seats') and
      (p_seat_limit is null or p_seat_limit < greatest(v_members, 1) or p_seat_limit > 10000) then
    raise exception 'Invalid seat limit';
  end if;
  if p_action = 'activate' then
    if p_contract_end is null or p_contract_end <= now() or p_contract_end > now() + interval '5 years'
      or length(trim(coalesce(p_payment_reference, ''))) < 3 then raise exception 'Invalid contract or payment reference'; end if;
    if not exists (select 1 from public.companies c
      join public.company_verifications v on v.company_id = c.id
      where c.id = p_company and v.status = 'approved' and v.verified_siret = c.siret
        and v.verified_at is not null and c.is_demo is not true) then
      raise exception 'Company not verified';
    end if;
    if exists (select 1 from public.stripe_test_subscriptions
      where company_id = p_company and status in ('active', 'trialing')) then
      raise exception 'Active Stripe test subscription';
    end if;
    update public.subscriptions set plan = 'enterprise', status = 'active',
      current_period_end = p_contract_end, trial_ends_at = null,
      enterprise_seat_limit = p_seat_limit, updated_at = now()
      where company_id = p_company;
  elsif p_action = 'set_seats' then
    if v_current.plan::text <> 'enterprise' or v_current.status::text <> 'active'
      or v_current.current_period_end <= now() then raise exception 'Enterprise access inactive'; end if;
    update public.subscriptions set enterprise_seat_limit = p_seat_limit, updated_at = now()
      where company_id = p_company;
  else
    if v_current.plan::text <> 'enterprise' then raise exception 'Not an Enterprise subscription'; end if;
    update public.subscriptions set status = 'canceled', updated_at = now()
      where company_id = p_company;
  end if;
  insert into public.enterprise_access_events(company_id, actor_id, action, payment_reference, contract_end, note, seat_limit)
    values (p_company, p_actor, p_action, nullif(trim(p_payment_reference), ''), p_contract_end,
      nullif(trim(p_note), ''), p_seat_limit);
end;
$$;
revoke all on function public.platform_set_enterprise(uuid, uuid, text, timestamptz, text, text, integer) from public, anon, authenticated;
grant execute on function public.platform_set_enterprise(uuid, uuid, text, timestamptz, text, text, integer) to service_role;

create function public.platform_manage_technician(
  p_actor uuid, p_company uuid, p_email text, p_add boolean, p_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_target uuid;
declare v_subscription public.subscriptions%rowtype;
declare v_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
  if not exists (select 1 from public.platform_admins where user_id = p_actor) then raise exception 'Forbidden'; end if;
  select * into v_subscription from public.subscriptions where company_id = p_company for update;
  if not found or v_subscription.plan::text <> 'enterprise'
    or v_subscription.status::text <> 'active'
    or v_subscription.current_period_end <= now() then raise exception 'Enterprise access inactive'; end if;
  select id into v_target from auth.users
    where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;
  if v_target is null then raise exception 'Confirmed account not found'; end if;
  if p_add then
    if not exists (select 1 from public.profiles where id = v_target) then raise exception 'Profile missing'; end if;
    if exists (select 1 from public.company_members where user_id = v_target) then raise exception 'Account already assigned'; end if;
    select count(*) into v_count from public.company_members where company_id = p_company;
    if v_count >= v_subscription.enterprise_seat_limit then raise exception 'Enterprise seat limit reached'; end if;
    insert into public.company_members(company_id, user_id, role)
      values (p_company, v_target, 'technician');
  else
    delete from public.company_members
      where company_id = p_company and user_id = v_target and role = 'technician';
    if not found then raise exception 'Technician not found'; end if;
  end if;
  insert into public.enterprise_access_events(company_id, actor_id, action, target_user_id, note, seat_limit)
    values (p_company, p_actor, case when p_add then 'add_technician' else 'remove_technician' end,
      v_target, nullif(trim(p_note), ''), v_subscription.enterprise_seat_limit);
  return v_target;
end;
$$;
revoke all on function public.platform_manage_technician(uuid, uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.platform_manage_technician(uuid, uuid, text, boolean, text) to service_role;

commit;

-- END 20260929_02_platform_enterprise_seats.sql

-- BEGIN 20260929_03_platform_document_intake.sql
begin;

create table public.platform_document_intake (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references auth.users(id),
  manufacturer text not null check (length(manufacturer) between 2 and 120),
  model_reference text not null check (length(model_reference) between 2 and 160),
  title text not null check (length(title) between 2 and 200),
  original_filename text not null check (length(original_filename) between 1 and 255),
  blob_pathname text not null unique,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.platform_document_intake enable row level security;
revoke all on public.platform_document_intake from public, anon, authenticated;
grant select, insert, update on public.platform_document_intake to service_role;

commit;

-- END 20260929_03_platform_document_intake.sql

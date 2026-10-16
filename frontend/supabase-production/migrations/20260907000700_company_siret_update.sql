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

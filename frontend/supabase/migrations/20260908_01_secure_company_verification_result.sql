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
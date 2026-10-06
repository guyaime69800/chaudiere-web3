-- Exécuter uniquement dans CarnetPass Production Paris 2, après vérification
-- de l'adresse du compte fondateur dans Authentication > Users.
begin;

do $$
declare
  founder_id uuid;
begin
  select id into founder_id
  from auth.users
  where lower(email) = 'guy@carnetpass.fr' and email_confirmed_at is not null;
  if founder_id is null then
    raise exception 'Compte fondateur confirmé introuvable. Aucun droit ajouté.';
  end if;
  if exists (select 1 from public.platform_admins where role = 'founder' and user_id <> founder_id) then
    raise exception 'Un autre fondateur existe déjà. Vérification manuelle nécessaire.';
  end if;
  insert into public.platform_admins(user_id, role, created_by)
  values (founder_id, 'founder', founder_id)
  on conflict (user_id) do update set role = 'founder';
end;
$$;

commit;

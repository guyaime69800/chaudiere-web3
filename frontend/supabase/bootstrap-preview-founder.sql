-- Run only in the separate CarnetPass Preview project, after
-- contact@carnetpass.fr has signed up and confirmed their address.
do $$
declare v_founder uuid;
begin
  select id into v_founder from auth.users
    where lower(email) = 'contact@carnetpass.fr' and email_confirmed_at is not null;
  if v_founder is null then
    raise exception 'Confirmed Preview founder account not found';
  end if;
  insert into public.platform_admins(user_id, role)
    values (v_founder, 'founder')
    on conflict (user_id) do update set role = 'founder';
end;
$$;

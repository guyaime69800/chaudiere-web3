begin;

-- Authenticator enrollment uses Supabase Auth, which remains reachable at AAL1.
-- These database guards enforce AAL2 for platform administrators and users who
-- already enrolled a verified factor, including direct Data API requests.
create or replace function public.mfa_account_access_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    coalesce(auth.jwt()->>'aal', '') = 'aal2'
    or (
      not exists (select 1 from public.platform_admins where user_id = auth.uid())
      and not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status::text = 'verified')
    )
  );
$$;
revoke all on function public.mfa_account_access_allowed() from public, anon;
grant execute on function public.mfa_account_access_allowed() to authenticated, service_role;

-- Security-definer RPCs can bypass RLS; retain a write guard for requests whose
-- verified JWT role is authenticated. Backend service jobs remain unchanged.
create or replace function public.enforce_account_mfa_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and not public.mfa_account_access_allowed() then
    raise exception 'MFA_REQUIRED' using errcode = '42501';
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke all on function public.enforce_account_mfa_write() from public, anon, authenticated;
grant execute on function public.enforce_account_mfa_write() to service_role;

do $$
declare target record;
begin
  for target in
    select n.nspname, c.relname from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    execute format('drop policy if exists carnetpass_mfa_guard on %I.%I', target.nspname, target.relname);
    execute format('create policy carnetpass_mfa_guard on %I.%I as restrictive for all to authenticated using ((select public.mfa_account_access_allowed())) with check ((select public.mfa_account_access_allowed()))', target.nspname, target.relname);
    execute format('drop trigger if exists carnetpass_mfa_write_guard on %I.%I', target.nspname, target.relname);
    execute format('create trigger carnetpass_mfa_write_guard before insert or update or delete on %I.%I for each row execute function public.enforce_account_mfa_write()', target.nspname, target.relname);
  end loop;
end;
$$;

-- The founder provisioning RPC may return an existing company without writing.
-- Guard that path too, preserving the current deployed function and grants.
do $$
declare definition text;
begin
  definition := pg_catalog.pg_get_functiondef('public.ensure_founder_test_company()'::regprocedure);
  if position('MFA_REQUIRED' in definition) = 0 then
    definition := replace(definition,
      'perform pg_catalog.pg_advisory_xact_lock',
      'if not public.mfa_account_access_allowed() then raise exception ''MFA_REQUIRED'' using errcode = ''42501''; end if; perform pg_catalog.pg_advisory_xact_lock');
    if position('MFA_REQUIRED' in definition) = 0 then raise exception 'Founder RPC guard could not be installed'; end if;
    execute definition;
  end if;
end;
$$;

commit;

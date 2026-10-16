begin;

-- The Paris 2 project does not expose new tables automatically. These are
-- the server-side account and administration operations used by CarnetPass.
grant select, update on public.profiles to service_role;
grant select on public.companies to service_role;
grant select, delete on public.company_members to service_role;

commit;

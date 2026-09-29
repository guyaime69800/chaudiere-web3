begin;

-- The Preview billing API checks whether the signed-in user owns the company.
-- Keep the table protected from anonymous users; grant only the server role
-- the columns needed for that check.
grant select (company_id, user_id, role)
  on public.company_members to service_role;

commit;

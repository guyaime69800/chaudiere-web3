begin;

create schema if not exists carnetpass_test;
revoke all on schema carnetpass_test from public, anon, authenticated;
grant usage on schema carnetpass_test to service_role;
create table carnetpass_test.admin_workspaces (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table carnetpass_test.admin_workspaces enable row level security;
revoke all on carnetpass_test.admin_workspaces from public, anon, authenticated;
grant select, insert on carnetpass_test.admin_workspaces to service_role;

create function public.open_admin_test_workspace(p_actor uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_workspace carnetpass_test.admin_workspaces;
begin
  if not exists (select 1 from public.platform_admins where user_id = p_actor and role = 'founder') then
    raise exception 'Founder required' using errcode = '42501';
  end if;
  insert into carnetpass_test.admin_workspaces(actor_id) values(p_actor) on conflict(actor_id) do nothing;
  select * into strict v_workspace from carnetpass_test.admin_workspaces where actor_id = p_actor;
  return jsonb_build_object('id', v_workspace.id, 'environment', 'test');
end;
$$;
revoke all on function public.open_admin_test_workspace(uuid) from public, anon, authenticated;
grant execute on function public.open_admin_test_workspace(uuid) to service_role;

-- Production only. Test provisioning remains in the separate Preview project.
revoke all on function public.ensure_founder_test_company() from public, anon, authenticated, service_role;
comment on function public.ensure_founder_test_company() is 'Disabled in Production: founder test accounts belong to the separate Preview project.';

-- Preserve historical records; close only the named founder test entitlement.
update public.subscriptions s set status = 'canceled', current_period_end = now(), updated_at = now()
from public.companies c
where s.company_id = c.id and c.is_demo is true
  and c.name = 'CarnetPass — tests fondateur'
  and exists(select 1 from public.platform_admins p where p.user_id = c.created_by and p.role = 'founder');

commit;

begin;

create table public.maintenance_reminder_audit (
  id bigint generated always as identity primary key,
  reminder_id uuid not null references public.maintenance_reminders(id) on delete cascade,
  actor_user_id uuid,
  action text not null check (action in ('created', 'modified', 'cancelled', 'notification')),
  action_source text not null check (action_source in ('manual', 'shiba', 'system')),
  reminder_version integer not null,
  due_on date not null,
  status text not null,
  notification_state text not null,
  created_at timestamptz not null default now()
);
create index maintenance_reminder_audit_reminder_idx
  on public.maintenance_reminder_audit(reminder_id, created_at desc);
alter table public.maintenance_reminder_audit enable row level security;
revoke all on public.maintenance_reminder_audit from public, anon, authenticated;
grant select, insert on public.maintenance_reminder_audit to service_role;

create function public.audit_maintenance_reminder()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'created';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    v_action := 'cancelled';
  elsif new.version <> old.version then
    v_action := 'modified';
  elsif new.notification_state is distinct from old.notification_state then
    v_action := 'notification';
  else
    return new;
  end if;
  insert into public.maintenance_reminder_audit (
    reminder_id, actor_user_id, action, action_source, reminder_version,
    due_on, status, notification_state
  ) values (
    new.id, auth.uid(), v_action,
    case when auth.uid() is null then 'system' else new.action_source end,
    new.version, new.due_on, new.status, new.notification_state
  );
  return new;
end;
$$;
create trigger maintenance_reminder_audit_trigger
after insert or update on public.maintenance_reminders
for each row execute function public.audit_maintenance_reminder();
revoke all on function public.audit_maintenance_reminder() from public, anon, authenticated;

commit;

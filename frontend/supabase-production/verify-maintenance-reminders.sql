-- Run read-only after maintenance-reminders-rollout.sql in Paris 2 Production.
with required(name) as (
  values
    ('maintenance_reminders'),
    ('maintenance_reminder_attempts'),
    ('maintenance_reminder_audit'),
    ('public_reminder_requests'),
    ('public_maintenance_reminders'),
    ('public_maintenance_reminder_attempts')
)
select required.name,
  c.oid is not null as table_exists,
  coalesce(c.relrowsecurity, false) as rls_enabled
from required
left join pg_namespace n on n.nspname = 'public'
left join pg_class c on c.relnamespace = n.oid and c.relname = required.name
order by required.name;

with required(name) as (
  values
    ('create_described_maintenance_reminder'),
    ('update_described_maintenance_reminder'),
    ('cancel_maintenance_reminder'),
    ('claim_due_maintenance_reminders'),
    ('finish_maintenance_reminder_attempt'),
    ('confirm_completed_maintenance'),
    ('review_reminders_after_validated_maintenance')
)
select required.name, exists (
  select 1 from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = required.name
) as function_exists
from required
order by required.name;

select tgname, not tgisinternal as installed
from pg_trigger
where tgname in (
  'maintenance_reminder_audit_trigger',
  'review_reminders_after_validated_maintenance_trigger'
)
order by tgname;

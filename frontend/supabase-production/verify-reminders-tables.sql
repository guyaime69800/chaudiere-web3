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

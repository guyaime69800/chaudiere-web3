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

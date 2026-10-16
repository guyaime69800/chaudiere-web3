-- One-off additive setup for CarnetPass Production Paris 2.
-- Existing backup: production-documents-107.csv. No existing rows or Blob references changed.
-- Not executed by Codex. Run as postgres in the confirmed production project only.
begin;
create table public.platform_document_r2_copies (
  sha256 text primary key check (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check (size_bytes between 1 and 31457280),
  object_key text not null unique,
  verified_at timestamptz not null,
  check (object_key = 'platform-documents/sha256/' || sha256 || '.pdf')
);
create table public.platform_document_r2_attempts (
  id uuid primary key,
  document_id uuid not null references public.platform_document_intake(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text not null check (outcome in ('started', 'verified', 'reused', 'failed')),
  reason text check (reason in ('source_invalid', 'r2_unavailable', 'tracking_unavailable'))
);
alter table public.platform_document_r2_copies enable row level security;
alter table public.platform_document_r2_attempts enable row level security;
revoke all on public.platform_document_r2_copies, public.platform_document_r2_attempts
  from public, anon, authenticated, service_role;
grant select, insert on public.platform_document_r2_copies to service_role;
grant select, insert, update on public.platform_document_r2_attempts to service_role;
commit;

-- Verification: expect two rows, both RLS true and browser access false.
select c.relname, c.relrowsecurity,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_read,
  has_table_privilege('authenticated', c.oid, 'SELECT') as browser_read,
  has_table_privilege('service_role', c.oid, 'SELECT') as server_read
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in
  ('platform_document_r2_copies', 'platform_document_r2_attempts');

-- Rollback: use prior deployment / keep Blob reads; leave these tables and all files intact.

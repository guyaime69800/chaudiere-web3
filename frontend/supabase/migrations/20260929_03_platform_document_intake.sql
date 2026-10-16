begin;

create table public.platform_document_intake (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references auth.users(id),
  manufacturer text not null check (length(manufacturer) between 2 and 120),
  model_reference text not null check (length(model_reference) between 2 and 160),
  title text not null check (length(title) between 2 and 200),
  original_filename text not null check (length(original_filename) between 1 and 255),
  blob_pathname text not null unique,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.platform_document_intake enable row level security;
revoke all on public.platform_document_intake from public, anon, authenticated;
grant select, insert, update on public.platform_document_intake to service_role;

commit;

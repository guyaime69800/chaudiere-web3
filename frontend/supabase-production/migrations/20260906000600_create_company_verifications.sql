begin;

create table public.company_verifications (
  company_id uuid primary key
    references public.companies(id) on delete cascade,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'suspended')),

  verified_siret text
    check (verified_siret ~ '^[0-9]{14}$'),

  verified_at timestamptz,

  updated_at timestamptz not null default now(),

  constraint approval_requires_verification
    check (
      status <> 'approved'
      or (
        verified_siret is not null
        and verified_at is not null
      )
    )
);

alter table public.company_verifications
enable row level security;

revoke all on public.company_verifications
from public, anon, authenticated;

grant select on public.company_verifications
to authenticated;

grant select, insert, update, delete
on public.company_verifications
to service_role;

create policy "Members can view company verification"
on public.company_verifications
for select
to authenticated
using (
  public.is_company_member(company_id)
);

-- Les entreprises existantes commencent en attente.
insert into public.company_verifications (company_id)
select id
from public.companies;

commit;
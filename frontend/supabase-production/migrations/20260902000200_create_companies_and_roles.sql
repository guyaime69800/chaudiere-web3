create type public.company_role
as enum ('admin', 'technician');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2),
  siret text,
  phone text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_members (
  company_id uuid not null
    references public.companies(id) on delete cascade,
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  role public.company_role not null default 'technician',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

alter table public.companies enable row level security;
alter table public.company_members enable row level security;

create or replace function public.is_company_member(
  requested_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_members
    where company_id = requested_company_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_company_admin(
  requested_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_members
    where company_id = requested_company_id
      and user_id = (select auth.uid())
      and role = 'admin'::public.company_role
  );
$$;

create or replace function public.handle_new_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.company_members (
    company_id,
    user_id,
    role
  )
  values (
    new.id,
    new.created_by,
    'admin'
  );

  return new;
end;
$$;

create trigger on_company_created
after insert on public.companies
for each row
execute function public.handle_new_company();

create policy "Members can view their company"
on public.companies
for select
to authenticated
using (
  public.is_company_member(id)
  or created_by = (select auth.uid())
);

create policy "Users can create a company"
on public.companies
for insert
to authenticated
with check (
  created_by = (select auth.uid())
);

create policy "Admins can update their company"
on public.companies
for update
to authenticated
using (public.is_company_admin(id))
with check (public.is_company_admin(id));

create policy "Members can view company members"
on public.company_members
for select
to authenticated
using (public.is_company_member(company_id));

create policy "Admins can add company members"
on public.company_members
for insert
to authenticated
with check (public.is_company_admin(company_id));

create policy "Admins can update company roles"
on public.company_members
for update
to authenticated
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

create policy "Admins can remove company members"
on public.company_members
for delete
to authenticated
using (public.is_company_admin(company_id));

revoke all on public.profiles from anon;
revoke all on public.companies from anon;
revoke all on public.company_members from anon;

grant select on public.profiles to authenticated;
grant update (
  full_name,
  job_title,
  updated_at
) on public.profiles to authenticated;

grant select on public.companies to authenticated;
grant insert (
  name,
  siret,
  phone,
  created_by
) on public.companies to authenticated;
grant update (
  name,
  siret,
  phone,
  updated_at
) on public.companies to authenticated;

grant select on public.company_members to authenticated;
grant insert (
  company_id,
  user_id,
  role
) on public.company_members to authenticated;
grant update (
  role
) on public.company_members to authenticated;
grant delete on public.company_members to authenticated;

grant usage on type public.company_role to authenticated;

revoke all on function public.is_company_member(uuid) from public;
revoke all on function public.is_company_admin(uuid) from public;
revoke all on function public.handle_new_company() from public;

grant execute
on function public.is_company_member(uuid)
to authenticated;

grant execute
on function public.is_company_admin(uuid)
to authenticated;
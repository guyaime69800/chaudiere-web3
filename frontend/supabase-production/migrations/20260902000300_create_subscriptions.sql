create type public.subscription_plan
as enum ('free', 'pro', 'enterprise');

create type public.subscription_status
as enum ('active', 'trialing', 'past_due', 'canceled');

create table public.subscriptions (
  company_id uuid primary key
    references public.companies(id) on delete cascade,
  plan public.subscription_plan not null default 'free',
  status public.subscription_status not null default 'active',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Members can view their subscription"
on public.subscriptions
for select
to authenticated
using (public.is_company_member(company_id));

revoke all on public.subscriptions from anon;

grant select
on public.subscriptions
to authenticated;

grant select, insert, update
on public.subscriptions
to service_role;

grant usage
on type public.subscription_plan
to authenticated, service_role;

grant usage
on type public.subscription_status
to authenticated, service_role;

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

  insert into public.subscriptions (
    company_id,
    plan,
    status
  )
  values (
    new.id,
    'free',
    'active'
  );

  return new;
end;
$$;
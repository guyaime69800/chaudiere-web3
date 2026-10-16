-- Les paiements Stripe fictifs restent séparés des abonnements réels.
create table if not exists public.stripe_test_subscriptions (
  company_id uuid primary key references public.companies(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan text check (plan in ('pro', 'team')),
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.stripe_test_subscriptions enable row level security;

create policy "Members can view Stripe test subscriptions"
  on public.stripe_test_subscriptions for select to authenticated
  using (public.is_company_member(company_id));

revoke all on public.stripe_test_subscriptions from anon;
grant select on public.stripe_test_subscriptions to authenticated;
grant select, insert, update on public.stripe_test_subscriptions to service_role;

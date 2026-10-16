-- Customer association is maintained only by trusted billing administration.
alter table public.subscriptions add column if not exists stripe_customer_id text;
alter table public.subscriptions add constraint subscriptions_stripe_customer_format
  check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[a-zA-Z0-9]+$');
create unique index subscriptions_stripe_customer_unique
  on public.subscriptions(stripe_customer_id) where stripe_customer_id is not null;

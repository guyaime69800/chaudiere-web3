begin;
alter table public.subscriptions add column stripe_live_managed boolean not null default false;
alter table public.stripe_live_event_inbox add column next_attempt_at timestamptz not null default now();
alter table public.stripe_live_event_inbox add column attempt_count integer not null default 0;
create index stripe_live_event_retry on public.stripe_live_event_inbox(next_attempt_at,received_at) where processing_status='pending';

create table public.stripe_live_customers (
  company_id uuid primary key references public.companies(id) on delete cascade,
  account_id text not null check(account_id ~ '^acct_[A-Za-z0-9]+$'),
  customer_id text not null unique check(customer_id ~ '^cus_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now(),
  unique(company_id,account_id,customer_id)
);
create table public.stripe_live_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.stripe_live_customers(company_id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check(kind in ('pro','recharge100','recharge200')),
  session_id text unique check(session_id ~ '^cs_live_[A-Za-z0-9]+$'),
  terms_version text not null,
  terms_sha256 text not null check(terms_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
create index stripe_live_orders_company on public.stripe_live_orders(company_id);
create index stripe_live_orders_user on public.stripe_live_orders(user_id);

create table public.stripe_live_company_state (
  company_id uuid primary key references public.stripe_live_customers(company_id) on delete cascade,
  lease_token uuid,
  lease_until timestamptz,
  subscription_id text unique check(subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  paid_until timestamptz,
  updated_at timestamptz not null default now()
);
create table public.stripe_live_credit_balances (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  balance integer not null default 0,
  primary key(company_id,user_id)
);
create index stripe_live_credit_balances_user on public.stripe_live_credit_balances(user_id);
create table public.stripe_live_credit_purchases (
  session_id text primary key check(session_id ~ '^cs_live_[A-Za-z0-9]+$'),
  order_id uuid not null unique references public.stripe_live_orders(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  payment_intent_id text not null unique check(payment_intent_id ~ '^pi_[A-Za-z0-9]+$'),
  credits integer not null check(credits in (100,200)),
  revoked_credits integer not null default 0 check(revoked_credits between 0 and credits),
  created_at timestamptz not null default now()
);
create index stripe_live_credit_purchases_company on public.stripe_live_credit_purchases(company_id);
create index stripe_live_credit_purchases_user on public.stripe_live_credit_purchases(user_id);

do $$ declare tab text; begin
  foreach tab in array array['stripe_live_customers','stripe_live_orders','stripe_live_company_state',
    'stripe_live_credit_balances','stripe_live_credit_purchases'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from public,anon,authenticated',tab);
    execute format('grant select,insert,update on public.%I to service_role',tab);
  end loop;
end $$;

create function public.claim_stripe_live_company(p_company uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare lease uuid := gen_random_uuid(); begin
  insert into public.stripe_live_company_state(company_id) values(p_company) on conflict do nothing;
  update public.stripe_live_company_state set lease_token=lease,lease_until=clock_timestamp()+interval '90 seconds'
    where company_id=p_company and (lease_until is null or lease_until<clock_timestamp());
  if not found then return null; end if;
  return lease;
end $$;

create function public.apply_stripe_live_effect(p_company uuid,p_token uuid,p_event text,p_effect jsonb) returns text
language plpgsql security invoker set search_path='' as $$
declare binding public.stripe_live_customers%rowtype; state public.stripe_live_company_state%rowtype;
  receipt public.stripe_live_event_inbox%rowtype; purchase public.stripe_live_credit_purchases%rowtype;
  ord public.stripe_live_orders%rowtype; until_time timestamptz; qty integer; revoke_to integer; delta integer;
begin
  select * into state from public.stripe_live_company_state where company_id=p_company for update;
  if not found or state.lease_token is distinct from p_token or state.lease_until<=clock_timestamp()
    or p_token is null then raise exception 'Lease expired'; end if;
  select * into binding from public.stripe_live_customers where company_id=p_company;
  select * into receipt from public.stripe_live_event_inbox
    where account_id=binding.account_id and event_id=p_event for update;
  if not found then raise exception 'Event not recorded'; end if;
  if receipt.processing_status='processed' then
    update public.stripe_live_company_state set lease_token=null,lease_until=null where company_id=p_company;
    return 'duplicate';
  end if;
  if p_effect->>'customer_id' is distinct from binding.customer_id then raise exception 'Customer mismatch'; end if;
  if p_effect->>'kind'='subscription' then
    if p_effect->>'subscription_id' is null or p_effect->>'subscription_id' !~ '^sub_[A-Za-z0-9]+$'
      or (state.subscription_id is not null and state.subscription_id is distinct from p_effect->>'subscription_id')
      then raise exception 'Subscription mismatch'; end if;
    if state.subscription_id is null then
      select * into ord from public.stripe_live_orders where id=(p_effect->>'order_id')::uuid
        and company_id=p_company and kind='pro' and session_id is not null;
      if not found then raise exception 'Missing subscription order'; end if;
    end if;
    if p_effect->>'status' not in ('active','past_due','canceled') then raise exception 'Invalid status'; end if;
    qty:=(p_effect->>'seats')::integer;
    until_time:=(p_effect->>'paid_until')::timestamptz;
    if qty is null or qty<0 or until_time is null then raise exception 'Invalid entitlement'; end if;
    if exists(select 1 from public.subscriptions where company_id=p_company and plan='enterprise') then
      raise exception 'Enterprise managed separately'; end if;
    update public.subscriptions set plan='pro',status=(p_effect->>'status')::public.subscription_status,
      current_period_end=until_time,stripe_customer_id=binding.customer_id,stripe_live_managed=true,updated_at=now() where company_id=p_company;
    if not found then raise exception 'Missing subscription'; end if;
    insert into public.pro_additional_accounts(company_id,quantity,paid_until,billing_environment,updated_at)
      values(p_company,qty,until_time,'production',now()) on conflict(company_id) do update
      set quantity=excluded.quantity,paid_until=excluded.paid_until,billing_environment='production',updated_at=now();
    update public.stripe_live_company_state set subscription_id=p_effect->>'subscription_id',paid_until=until_time,
      updated_at=now() where company_id=p_company;
  elsif p_effect->>'kind'='credits' then
    select * into ord from public.stripe_live_orders where id=(p_effect->>'order_id')::uuid and company_id=p_company;
    if not found or ord.kind not in ('recharge100','recharge200') or ord.user_id is null
      or ord.session_id is distinct from p_effect->>'session_id' then raise exception 'Invalid recharge order'; end if;
    if not exists(select 1 from public.company_members where company_id=p_company and user_id=ord.user_id) then
      raise exception 'Recharge recipient unavailable'; end if;
    qty:=case when ord.kind='recharge100' then 100 else 200 end;
    insert into public.stripe_live_credit_purchases(session_id,order_id,company_id,user_id,payment_intent_id,credits)
      values(ord.session_id,ord.id,p_company,ord.user_id,p_effect->>'payment_intent_id',qty) on conflict(session_id) do nothing;
    if found then
      insert into public.stripe_live_credit_balances(company_id,user_id,balance) values(p_company,ord.user_id,qty)
        on conflict(company_id,user_id) do update set balance=stripe_live_credit_balances.balance+qty;
    else
      select * into purchase from public.stripe_live_credit_purchases where session_id=ord.session_id;
      if purchase.order_id<>ord.id or purchase.payment_intent_id is distinct from p_effect->>'payment_intent_id' then
        raise exception 'Conflicting credit purchase'; end if;
    end if;
  elsif p_effect->>'kind'='refund' then
    select * into purchase from public.stripe_live_credit_purchases
      where company_id=p_company and payment_intent_id=p_effect->>'payment_intent_id' for update;
    if not found then raise exception 'Unknown credit refund'; end if;
    revoke_to:=least(purchase.credits,(p_effect->>'revoked_credits')::integer);
    if revoke_to is null or revoke_to<0 then raise exception 'Invalid refund'; end if;
    delta:=greatest(0,revoke_to-purchase.revoked_credits);
    update public.stripe_live_credit_purchases set revoked_credits=greatest(revoked_credits,revoke_to)
      where session_id=purchase.session_id;
    -- Debt is retained when refunded credits were already spent; it is never clamped away.
    update public.stripe_live_credit_balances set balance=balance-delta
      where company_id=p_company and user_id=purchase.user_id;
  elsif p_effect->>'kind' is distinct from 'review' then raise exception 'Unknown effect';
  end if;
  update public.stripe_live_event_inbox set processing_status=case when p_effect->>'kind'='review' then 'review' else 'processed' end,
    processed_at=now() where account_id=binding.account_id and event_id=p_event;
  update public.stripe_live_company_state set lease_token=null,lease_until=null where company_id=p_company;
  return case when p_effect->>'kind'='review' then 'review' else 'processed' end;
end $$;

revoke all on function public.claim_stripe_live_company(uuid) from public,anon,authenticated;
revoke all on function public.apply_stripe_live_effect(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.claim_stripe_live_company(uuid) to service_role;
grant execute on function public.apply_stripe_live_effect(uuid,uuid,text,jsonb) to service_role;

create table public.stripe_live_credit_reservations (
  id uuid primary key,
  company_id uuid not null,
  user_id uuid not null,
  refunded boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key(company_id,user_id) references public.stripe_live_credit_balances(company_id,user_id) on delete cascade
);
create index stripe_live_credit_reservations_owner on public.stripe_live_credit_reservations(company_id,user_id);
alter table public.stripe_live_credit_reservations enable row level security;
revoke all on public.stripe_live_credit_reservations from public,anon,authenticated;
grant select,insert,update on public.stripe_live_credit_reservations to service_role;

create function public.reserve_stripe_live_credit(p_company uuid,p_user uuid,p_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare bal integer; existing public.stripe_live_credit_reservations%rowtype;
begin
  select balance into bal from public.stripe_live_credit_balances where company_id=p_company and user_id=p_user for update;
  if not found then return jsonb_build_object('allowed',false,'balance',0); end if;
  select * into existing from public.stripe_live_credit_reservations where id=p_id;
  if found then
    if existing.company_id<>p_company or existing.user_id<>p_user then raise exception 'Reservation mismatch'; end if;
    return jsonb_build_object('allowed',not existing.refunded,'balance',greatest(0,bal));
  end if;
  if bal<=0 or not exists(select 1 from public.company_members where company_id=p_company and user_id=p_user)
    or not exists(select 1 from public.subscriptions where company_id=p_company and plan='pro' and status='active'
      and (not stripe_live_managed or current_period_end>now())) then
    return jsonb_build_object('allowed',false,'balance',greatest(0,bal));
  end if;
  insert into public.stripe_live_credit_reservations(id,company_id,user_id) values(p_id,p_company,p_user);
  update public.stripe_live_credit_balances set balance=balance-1 where company_id=p_company and user_id=p_user returning balance into bal;
  return jsonb_build_object('allowed',true,'balance',greatest(0,bal));
end $$;
create function public.refund_stripe_live_credit(p_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare reservation public.stripe_live_credit_reservations%rowtype;
begin
  -- Lock balance first, like reservation and purchase/refund paths, to avoid lock-order inversion.
  select * into reservation from public.stripe_live_credit_reservations where id=p_id;
  if not found then return; end if;
  perform 1 from public.stripe_live_credit_balances where company_id=reservation.company_id and user_id=reservation.user_id for update;
  update public.stripe_live_credit_reservations set refunded=true where id=p_id and not refunded;
  if found then
    update public.stripe_live_credit_balances set balance=balance+1 where company_id=reservation.company_id and user_id=reservation.user_id;
  end if;
end $$;
revoke all on function public.reserve_stripe_live_credit(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.refund_stripe_live_credit(uuid) from public,anon,authenticated;
grant execute on function public.reserve_stripe_live_credit(uuid,uuid,uuid) to service_role;
grant execute on function public.refund_stripe_live_credit(uuid) to service_role;
commit;

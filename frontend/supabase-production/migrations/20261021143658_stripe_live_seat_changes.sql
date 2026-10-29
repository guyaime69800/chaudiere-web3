begin;
create table public.stripe_live_seat_changes (
  id uuid primary key,
  company_id uuid not null references public.stripe_live_customers(company_id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  subscription_id text not null check(subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  quantity integer not null check(quantity between 0 and 100),
  previous_quantity integer not null check(previous_quantity between 0 and 100),
  retained_members uuid[] not null default '{}',
  immediate_amount integer not null check(immediate_amount>=0),
  effective_at timestamptz not null,
  proration_date bigint not null check(proration_date>0),
  fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
  stripe_params jsonb not null check(jsonb_typeof(stripe_params)='object'),
  terms_version text not null,
  terms_sha256 text not null check(terms_sha256 ~ '^[a-f0-9]{64}$'),
  accepted_at timestamptz,
  status text not null check(status in ('quoted','applying','awaiting_payment','scheduled','applied','canceled')),
  schedule_id text check(schedule_id ~ '^sub_sched_[A-Za-z0-9]+$'),
  invoice_id text check(invoice_id ~ '^in_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now(),
  check(quantity<>previous_quantity),
  check(cardinality(retained_members)<=quantity)
);
create unique index stripe_live_seats_one_pending on public.stripe_live_seat_changes(company_id)
  where status in ('applying','awaiting_payment','scheduled');
create index stripe_live_seats_company_created on public.stripe_live_seat_changes(company_id,created_at);
create index stripe_live_seats_user on public.stripe_live_seat_changes(user_id);
alter table public.stripe_live_seat_changes enable row level security;
revoke all on public.stripe_live_seat_changes from public,anon,authenticated;
grant select,insert,update on public.stripe_live_seat_changes to service_role;
create or replace function public.apply_stripe_live_effect(p_company uuid,p_token uuid,p_event text,p_effect jsonb) returns text
language plpgsql security invoker set search_path='' as $$
declare binding public.stripe_live_customers%rowtype; state public.stripe_live_company_state%rowtype;
  receipt public.stripe_live_event_inbox%rowtype; purchase public.stripe_live_credit_purchases%rowtype;
  ord public.stripe_live_orders%rowtype; until_time timestamptz; cancellation_time timestamptz; qty integer; revoke_to integer; delta integer; seat_change public.stripe_live_seat_changes%rowtype;
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

      then raise exception 'Subscription mismatch'; end if;
    if state.subscription_id is not null and state.subscription_id is distinct from p_effect->>'subscription_id' then
      if p_effect->>'status' is distinct from 'active'
        or not exists(select 1 from public.subscriptions where company_id=p_company and stripe_live_managed and status::text='canceled')
        or not exists(select 1 from public.stripe_live_orders where id=(p_effect->>'order_id')::uuid and company_id=p_company
          and kind='pro' and session_id is not null and created_at>=state.updated_at)
      then raise exception 'Previous subscription not closed'; end if;
    end if;
    if state.subscription_id is null or state.subscription_id is distinct from p_effect->>'subscription_id' then
      select * into ord from public.stripe_live_orders where id=(p_effect->>'order_id')::uuid
        and company_id=p_company and kind='pro' and session_id is not null;
      if not found then raise exception 'Missing subscription order'; end if;
    end if;
    if p_effect->>'status' not in ('active','past_due','canceled') then raise exception 'Invalid status'; end if;
    qty:=(p_effect->>'seats')::integer;
    until_time:=(p_effect->>'paid_until')::timestamptz;
    cancellation_time:=(p_effect->>'cancellation_at')::timestamptz;
    if cancellation_time is not null and not isfinite(cancellation_time) then raise exception 'Invalid cancellation'; end if;
    if p_effect->>'status'='canceled' then cancellation_time:=null; end if;
    if p_effect->>'status'='active' and cancellation_time is not null then until_time:=least(until_time,cancellation_time); end if;
    if qty is null or qty<0 or until_time is null then raise exception 'Invalid entitlement'; end if;
    if exists(select 1 from public.subscriptions where company_id=p_company and plan='enterprise') then
      raise exception 'Enterprise managed separately'; end if;
    update public.subscriptions set plan='pro',status=(p_effect->>'status')::public.subscription_status,
      current_period_end=until_time,stripe_cancel_at=cancellation_time,stripe_customer_id=binding.customer_id,stripe_live_managed=true,updated_at=now() where company_id=p_company;
    if not found then raise exception 'Missing subscription'; end if;
    -- A reduction keeps the explicitly selected colleagues only after the new paid period.
    for seat_change in select * from public.stripe_live_seat_changes where company_id=p_company
      and subscription_id=p_effect->>'subscription_id' and status in ('applying','awaiting_payment','scheduled') for update loop
      if p_effect->>'status'='canceled' then
        update public.stripe_live_seat_changes set status='canceled' where id=seat_change.id;
      elsif p_effect->>'status'='active' and qty=seat_change.quantity then
        if seat_change.quantity < seat_change.previous_quantity then
          if until_time > seat_change.effective_at and clock_timestamp() >= seat_change.effective_at then
            delete from public.company_members where company_id=p_company and role::text='technician'
              and user_id in(select user_id from public.pro_account_assignments where company_id=p_company)
              and not(user_id=any(seat_change.retained_members));
            update public.pro_account_invitations set expires_at=least(expires_at,clock_timestamp())
              where company_id=p_company and used_at is null;
            update public.stripe_live_seat_changes set status='applied' where id=seat_change.id;
          end if;
        else
          update public.stripe_live_seat_changes set status='applied' where id=seat_change.id;
        end if;
      end if;
    end loop;
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

revoke all on function public.apply_stripe_live_effect(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_stripe_live_effect(uuid,uuid,text,jsonb) to service_role;
commit;

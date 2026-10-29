-- Durable reception only. No subscription, seat or credit grant is performed here.
begin;

create table public.stripe_live_event_inbox (
  account_id text not null check (account_id ~ '^acct_[A-Za-z0-9]+$'),
  event_id text not null check (event_id ~ '^evt_[A-Za-z0-9]+$'),
  event_type text not null check (length(event_type) between 1 and 100),
  object_id text not null check (object_id ~ '^[A-Za-z0-9_]{1,255}$'),
  event_created bigint not null check (event_created > 0),
  api_version text,
  identity_hash text not null check (identity_hash ~ '^[a-f0-9]{64}$'),
  received_at timestamptz not null default now(),
  processing_status text not null default 'pending' check (processing_status in ('pending','processed','review')),
  processed_at timestamptz,
  primary key (account_id, event_id)
);
create index stripe_live_event_pending on public.stripe_live_event_inbox (received_at)
where processing_status = 'pending';
alter table public.stripe_live_event_inbox enable row level security;
revoke all on public.stripe_live_event_inbox from public, anon, authenticated;
grant select, insert, update on public.stripe_live_event_inbox to service_role;

create function public.record_stripe_live_event(receipt jsonb) returns text
language plpgsql security invoker set search_path = ''
as $$
declare stored_hash text;
begin
  if receipt is null or jsonb_typeof(receipt) <> 'object'
    or not (receipt ?& array['account_id','event_id','event_type','object_id','event_created','identity_hash']) then
    raise exception 'Invalid receipt';
  end if;
  insert into public.stripe_live_event_inbox(account_id,event_id,event_type,object_id,event_created,api_version,identity_hash)
  values(receipt->>'account_id',receipt->>'event_id',receipt->>'event_type',receipt->>'object_id',
    (receipt->>'event_created')::bigint,receipt->>'api_version',receipt->>'identity_hash')
  on conflict (account_id,event_id) do nothing;
  if found then return 'recorded'; end if;
  select identity_hash into stored_hash from public.stripe_live_event_inbox
    where account_id=receipt->>'account_id' and event_id=receipt->>'event_id';
  if stored_hash is distinct from receipt->>'identity_hash' then
    raise exception 'Conflicting event identity';
  end if;
  return 'duplicate';
end;
$$;
revoke all on function public.record_stripe_live_event(jsonb) from public, anon, authenticated;
grant execute on function public.record_stripe_live_event(jsonb) to service_role;

comment on table public.stripe_live_event_inbox is
'Service-only live Stripe event identifiers. Pending does not mean paid and grants no rights. Re-fetch Stripe objects before reconciliation.';
commit;

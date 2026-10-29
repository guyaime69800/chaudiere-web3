-- Synthetic verification only, fully rolled back. No customer or entitlement writes.
begin;
set local role service_role;
do $$
declare receipt jsonb := jsonb_build_object(
  'account_id','acct_CarnetPassVerification', 'event_id','evt_CarnetPassVerification20261020',
  'event_type','invoice.paid','object_id','in_CarnetPassVerification',
  'event_created',1792512000,'identity_hash',repeat('f',64));
begin
  if public.record_stripe_live_event(receipt) <> 'recorded' then raise exception 'Insert failed'; end if;
  if public.record_stripe_live_event(receipt) <> 'duplicate' then raise exception 'Duplicate failed'; end if;
  begin
    perform public.record_stripe_live_event(receipt || jsonb_build_object('identity_hash',repeat('a',64)));
    raise exception 'Conflict incorrectly accepted';
  exception when raise_exception then
    if sqlerrm <> 'Conflicting event identity' then raise; end if;
  end;
end;
$$;
rollback;

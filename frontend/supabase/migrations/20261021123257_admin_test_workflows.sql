begin;
grant update(id) on carnetpass_test.admin_workspaces to service_role;
create table carnetpass_test.records (
 workspace_id uuid not null references carnetpass_test.admin_workspaces(id) on delete cascade,
 id uuid not null, kind text not null check(kind in ('equipment','scan','document')),
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=65536),
 created_at timestamptz not null default now(), primary key(workspace_id,id)
);
create table carnetpass_test.billing (
 workspace_id uuid primary key references carnetpass_test.admin_workspaces(id) on delete cascade,
 data jsonb not null default '{}' check(jsonb_typeof(data)='object' and octet_length(data::text)<=16384),
 lease_token uuid, lease_until timestamptz
);
alter table carnetpass_test.records enable row level security;
alter table carnetpass_test.billing enable row level security;
revoke all on carnetpass_test.records,carnetpass_test.billing from public,anon,authenticated;
grant select,insert,update,delete on carnetpass_test.records,carnetpass_test.billing to service_role;

create function public.admin_test_command(p_actor uuid,p_action text,p_id uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w uuid; result jsonb; token uuid; item carnetpass_test.records;
begin
 if not exists(select 1 from public.platform_admins where user_id=p_actor and role='founder') then
  raise exception 'Founder required' using errcode='42501';
 end if;
 select id into strict w from carnetpass_test.admin_workspaces where actor_id=p_actor;
 -- Serializes the small workspace, including object count and state transitions.
 perform 1 from carnetpass_test.admin_workspaces where id=w for update;
 if p_action='snapshot' then
  select jsonb_build_object('id',w,'environment','test','records',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'data',data,'createdAt',created_at) order by created_at desc)
    from carnetpass_test.records where workspace_id=w and kind<>'scan'),'[]'::jsonb),
    'billing',coalesce((select data from carnetpass_test.billing where workspace_id=w),'{}'::jsonb)) into result;
  return result;
 elsif p_action='get' then
  select * into strict item from carnetpass_test.records where workspace_id=w and id=p_id;
  if item.kind='scan' and item.created_at < now()-interval '2 hours' then raise exception 'Expired scan'; end if;
  return jsonb_build_object('id',item.id,'kind',item.kind,'data',item.data,'createdAt',item.created_at);
 elsif p_action in ('save_equipment','save_scan','save_document') then
  delete from carnetpass_test.records where workspace_id=w and kind='scan' and created_at<now()-interval '2 hours';
  if (select count(*) from carnetpass_test.records where workspace_id=w)>=300
    and not exists(select 1 from carnetpass_test.records where workspace_id=w and id=p_id) then raise exception 'Test workspace limit'; end if;
  if p_id is null then raise exception 'Record identifier required'; end if;
  insert into carnetpass_test.records(workspace_id,id,kind,data) values(w,p_id,substring(p_action from 6),p_data) on conflict(workspace_id,id) do nothing;
  select * into strict item from carnetpass_test.records where workspace_id=w and id=p_id;
  if item.kind<>substring(p_action from 6) then raise exception 'Record kind conflict'; end if;
  return jsonb_build_object('id',item.id,'kind',item.kind,'data',item.data,'createdAt',item.created_at);
 elsif p_action='claim_billing' then
  token:=gen_random_uuid();
  insert into carnetpass_test.billing(workspace_id) values(w) on conflict do nothing;
  update carnetpass_test.billing set lease_token=token,lease_until=now()+interval '90 seconds'
   where workspace_id=w and (lease_until is null or lease_until<now()) returning data into result;
  if not found then raise exception 'Billing busy'; end if;
  return jsonb_build_object('token',token,'data',result,'workspaceId',w);
 elsif p_action='save_billing' then
  update carnetpass_test.billing set data=p_data where workspace_id=w and lease_token=p_id and lease_until>now();
  if not found then raise exception 'Billing lease expired'; end if;
  return p_data;
 elsif p_action='release_billing' then
  update carnetpass_test.billing set lease_token=null,lease_until=null where workspace_id=w and lease_token=p_id;
  return '{}'::jsonb;
 end if;
 raise exception 'Unsupported test action';
end;
$$;
revoke all on function public.admin_test_command(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_test_command(uuid,text,uuid,jsonb) to service_role;
commit;

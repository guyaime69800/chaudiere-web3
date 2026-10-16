begin;
create table public.pro_additional_accounts (
 company_id uuid primary key references public.companies(id) on delete cascade,
 quantity integer not null default 0 check(quantity >= 0),
 paid_until timestamptz,
 billing_environment text not null check(billing_environment in ('preview','production')),
 updated_at timestamptz not null default now()
);
create table public.pro_account_assignments (
 company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 assigned_at timestamptz not null default now(),
 primary key(company_id,user_id),
 foreign key(company_id,user_id) references public.company_members(company_id,user_id) on delete cascade
);
alter table public.pro_additional_accounts enable row level security;
alter table public.pro_account_assignments enable row level security;
revoke all on public.pro_additional_accounts, public.pro_account_assignments from public,anon,authenticated;
grant select on public.pro_additional_accounts, public.pro_account_assignments to authenticated;
grant select,insert,update,delete on public.pro_additional_accounts, public.pro_account_assignments to service_role;
create policy pro_accounts_read on public.pro_additional_accounts for select to authenticated using(public.is_company_member(company_id));
create policy pro_assignments_read on public.pro_account_assignments for select to authenticated using(public.is_company_member(company_id));
-- Only the trusted payment synchronizer writes purchased capacity. User RPC cannot increase it.
create function public.manage_pro_account(p_company uuid,p_target uuid,p_add boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_paid public.pro_additional_accounts%rowtype; v_count integer;
begin
 if auth.uid() is null or not exists(select 1 from public.company_members where company_id=p_company and user_id=auth.uid() and role::text in ('owner','admin')) then raise exception 'Forbidden'; end if;
 select * into v_paid from public.pro_additional_accounts where company_id=p_company for update;
 if not found or v_paid.paid_until is null or v_paid.paid_until <= now() then raise exception 'Paid additional accounts required'; end if;
 if not exists(select 1 from public.subscriptions where company_id=p_company and plan::text='pro' and status::text='active') then raise exception 'Active Pro subscription required'; end if;
 if not exists(select 1 from public.company_members where company_id=p_company and user_id=p_target and role::text='technician') then raise exception 'Existing technician required'; end if;
 if p_add then
  if exists(select 1 from public.pro_account_assignments where company_id=p_company and user_id=p_target) then return; end if;
  select count(*) into v_count from public.pro_account_assignments where company_id=p_company;
  if v_count >= v_paid.quantity then raise exception 'No purchased place available'; end if;
  insert into public.pro_account_assignments(company_id,user_id) values(p_company,p_target);
 else
  -- Removing the assignment alone must not upgrade this user back to main quotas.
  delete from public.company_members where company_id=p_company and user_id=p_target and role::text='technician';
 end if;
end; $$;
revoke all on function public.manage_pro_account(uuid,uuid,boolean) from public,anon;
grant execute on function public.manage_pro_account(uuid,uuid,boolean) to authenticated;

create table public.pro_account_invitations (
 company_id uuid not null references public.companies(id) on delete cascade,
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 email text not null, expires_at timestamptz not null default now()+interval '7 days',
 created_by uuid not null references auth.users(id), used_at timestamptz
);
alter table public.pro_account_invitations enable row level security;
revoke all on public.pro_account_invitations from public,anon,authenticated;
grant select,insert,update,delete on public.pro_account_invitations to service_role;
create function public.invite_pro_account(p_company uuid,p_email text,p_hash text)
returns void language plpgsql security definer set search_path='' as $$
declare v_paid public.pro_additional_accounts%rowtype; v_count integer;
begin
 if auth.uid() is null or not exists(select 1 from public.company_members where company_id=p_company and user_id=auth.uid() and role::text in ('owner','admin')) then raise exception 'Forbidden'; end if;
 if not exists(select 1 from public.subscriptions where company_id=p_company and plan::text='pro' and status::text='active') then raise exception 'Active Pro subscription required'; end if;
 if p_hash !~ '^[a-f0-9]{64}$' or length(p_email)>254 or p_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' then raise exception 'Invalid invitation'; end if;
 select * into v_paid from public.pro_additional_accounts where company_id=p_company for update;
 if not found or v_paid.paid_until<=now() or v_paid.paid_until is null then raise exception 'Paid additional accounts required'; end if;
 select count(*) into v_count from public.pro_account_assignments where company_id=p_company;
 v_count:=v_count+(select count(*) from public.pro_account_invitations where company_id=p_company and used_at is null and expires_at>now());
 if v_count>=v_paid.quantity then raise exception 'No purchased place available'; end if;
 insert into public.pro_account_invitations(company_id,token_hash,email,created_by) values(p_company,p_hash,lower(trim(p_email)),auth.uid());
end; $$;
create function public.accept_pro_account(p_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_invite public.pro_account_invitations%rowtype; v_email text;
begin
 if auth.uid() is null then raise exception 'Forbidden'; end if;
 select email into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into v_invite from public.pro_account_invitations where token_hash=p_hash and used_at is null and expires_at>now() for update;
 if not found or lower(v_email) is distinct from v_invite.email then raise exception 'Invitation unavailable'; end if;
 if exists(select 1 from public.company_members where user_id=auth.uid()) then raise exception 'Account already assigned'; end if;
 if not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Profile required'; end if;
 insert into public.company_members(company_id,user_id,role) values(v_invite.company_id,auth.uid(),'technician');
 update public.pro_account_invitations set used_at=now() where token_hash=p_hash;
 return v_invite.company_id;
end; $$;
-- This trigger covers direct Data API membership insertion as well as invitation acceptance.
create function public.assign_new_pro_account()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_plan text; v_paid public.pro_additional_accounts%rowtype; v_count integer;
begin
 select plan::text into v_plan from public.subscriptions where company_id=new.company_id for update;
 if v_plan='pro' then
  select count(*) into v_count from public.company_members where company_id=new.company_id and user_id<>new.user_id;
  if v_count>0 or new.role::text='technician' then
   select * into v_paid from public.pro_additional_accounts where company_id=new.company_id for update;
   if not found or v_paid.paid_until is null or v_paid.paid_until<=now() then raise exception 'Paid additional accounts required'; end if;
   select count(*) into v_count from public.pro_account_assignments where company_id=new.company_id;
   if v_count>=v_paid.quantity then raise exception 'No purchased place available'; end if;
   insert into public.pro_account_assignments(company_id,user_id) values(new.company_id,new.user_id);
  end if;
 end if;
 return new;
end; $$;
create trigger assign_new_pro_account_after_insert after insert on public.company_members for each row execute function public.assign_new_pro_account();
revoke all on function public.invite_pro_account(uuid,text,text), public.accept_pro_account(text),public.assign_new_pro_account() from public,anon,authenticated;
grant execute on function public.invite_pro_account(uuid,text,text), public.accept_pro_account(text) to authenticated;


-- RLS helper also rejects expired/over-capacity seats for direct Data API access.
create or replace function public.is_company_member(requested_company_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.company_members m where m.company_id=requested_company_id and m.user_id=(select auth.uid()))
 and not exists(
  select 1 from public.pro_account_assignments a left join public.pro_additional_accounts p on p.company_id=a.company_id
  where a.company_id=requested_company_id and a.user_id=(select auth.uid())
   and (p.paid_until is null or p.paid_until<=now() or p.quantity<=
    (select count(*) from public.pro_account_assignments earlier where earlier.company_id=a.company_id and (earlier.assigned_at,earlier.user_id)<(a.assigned_at,a.user_id)))
 );
$$;
create or replace function public.is_company_admin(requested_company_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.is_company_member(requested_company_id) and exists(select 1 from public.company_members where company_id=requested_company_id and user_id=(select auth.uid()) and role::text='admin');
$$;


create function public.list_pro_accounts(p_company uuid)
returns table(user_id uuid,email text,assigned_at timestamptz) language sql stable security definer set search_path='' as $$
 select a.user_id,u.email,a.assigned_at from public.pro_account_assignments a join auth.users u on u.id=a.user_id
 where a.company_id=p_company and auth.uid() is not null and exists(select 1 from public.company_members m where m.company_id=p_company and m.user_id=auth.uid() and m.role::text in ('owner','admin'))
 order by a.assigned_at,a.user_id;
$$;
revoke all on function public.list_pro_accounts(uuid) from public,anon;
grant execute on function public.list_pro_accounts(uuid) to authenticated;

commit;

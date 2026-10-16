begin;
create function public.guard_pro_main_account()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_main uuid;
begin
 if new.plan::text='pro' and (tg_op='INSERT' or old.plan::text is distinct from 'pro') then
  select user_id into v_main from public.company_members where company_id=new.company_id order by (role::text in ('owner','admin')) desc,created_at,user_id limit 1;
  insert into public.pro_account_assignments(company_id,user_id)
   select company_id,user_id from public.company_members where company_id=new.company_id and user_id<>v_main
   on conflict(company_id,user_id) do nothing;
 end if;
 return new;
end; $$;
create trigger guard_pro_main_account_after_subscription after insert or update of plan on public.subscriptions for each row execute function public.guard_pro_main_account();
revoke all on function public.guard_pro_main_account() from public,anon,authenticated;
commit;

begin;
create table public.stripe_live_cancellation_emails (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 cancel_at timestamptz not null,
 created_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','sending','sent','skipped','review')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 lease_token uuid,
 sent_at timestamptz
);
alter table public.stripe_live_cancellation_emails enable row level security;
revoke all on public.stripe_live_cancellation_emails from public,anon,authenticated;
grant select,insert,update,delete on public.stripe_live_cancellation_emails to service_role;
create index stripe_live_cancellation_email_pending on public.stripe_live_cancellation_emails(next_attempt_at) where status in ('pending','sending');
create function public.enqueue_scheduled_cancellation_email() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.stripe_live_managed and new.status::text='active' and new.stripe_cancel_at>now()
   and new.stripe_cancel_at is distinct from old.stripe_cancel_at then
   insert into public.stripe_live_cancellation_emails(company_id,cancel_at) values(new.company_id,new.stripe_cancel_at);
 end if;
 return new;
end; $$;
revoke all on function public.enqueue_scheduled_cancellation_email() from public,anon,authenticated;
create trigger scheduled_cancellation_email after update of stripe_cancel_at on public.subscriptions
 for each row execute function public.enqueue_scheduled_cancellation_email();
create function public.claim_scheduled_cancellation_emails() returns setof public.stripe_live_cancellation_emails
language sql security invoker set search_path='' as $$
 update public.stripe_live_cancellation_emails q set status='sending',attempts=q.attempts+1,
 lease_token=gen_random_uuid(),next_attempt_at=now()+interval '5 minutes'
 where q.id in(select id from public.stripe_live_cancellation_emails
   where status in ('pending','sending') and next_attempt_at<=now() and attempts<8
   order by created_at for update skip locked limit 5)
 returning q.*;
$$;
revoke all on function public.claim_scheduled_cancellation_emails() from public,anon,authenticated;
grant execute on function public.claim_scheduled_cancellation_emails() to service_role;
commit;

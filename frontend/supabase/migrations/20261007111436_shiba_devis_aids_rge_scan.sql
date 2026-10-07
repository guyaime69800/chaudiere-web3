begin;

create table public.shiba_aid_versions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','validated','published','suspended','archived')),
  rule jsonb not null check (jsonb_typeof(rule)='object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  validated_by uuid,
  validated_at timestamptz,
  review_note text,
  published_at timestamptz,
  unique(slug,version),
  check (status not in ('validated','published') or (validated_by is not null and validated_at is not null))
);
create unique index shiba_one_published_version on public.shiba_aid_versions(slug) where status='published';
create table public.shiba_aid_events (
  id uuid primary key default gen_random_uuid(), version_id uuid references public.shiba_aid_versions(id),
  actor_id uuid references auth.users(id) on delete set null, action text not null,
  note text, created_at timestamptz not null default now()
);
create table public.shiba_aid_sources (
  url text primary key, check_interval_days integer not null default 7 check(check_interval_days between 1 and 90),
  freshness_days integer not null default 90 check(freshness_days between 1 and 366),
  last_attempt_at timestamptz, last_success_at timestamptz,
  content_hash text, content_text text,
  status text not null default 'pending' check(status in ('pending','unchanged','changed','unavailable'))
);
create table public.shiba_aid_observations (
  id uuid primary key default gen_random_uuid(), source_url text not null references public.shiba_aid_sources(url),
  outcome text not null check(outcome in ('initial','unchanged','changed','unavailable')),
  previous_hash text, new_hash text, previous_text text, proposed_text text,
  detail text, created_at timestamptz not null default now(), reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz
);
create table public.shiba_devis_simulations (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  snapshot jsonb not null, previous_id uuid references public.shiba_devis_simulations(id) on delete set null,
  created_at timestamptz not null default now()
);
create index shiba_devis_simulations_owner on public.shiba_devis_simulations(owner_id,created_at desc);
create table public.company_rge_qualifications (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  declared_by uuid references auth.users(id) on delete set null, siret text not null check(siret ~ '^[0-9]{14}$'),
  organism text not null, qualification_reference text not null, domains text[] not null,
  valid_from date not null, valid_until date not null check(valid_until>=valid_from),
  proof_attachment_id uuid references public.equipment_private_attachments(id) on delete set null,
  verified_by uuid, verified_at timestamptz, verification_source text,
  created_at timestamptz not null default now(),
  check ((verified_by is null and verified_at is null) or (verified_by is not null and verified_at is not null and verification_source is not null))
);
create index rge_company_idx on public.company_rge_qualifications(company_id,created_at desc);
create table public.equipment_plate_confirmations (
  id uuid primary key default gen_random_uuid(), equipment_id uuid not null references public.equipments(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  confirmed_by uuid references auth.users(id) on delete set null, fields jsonb not null,
  image_sha256 text, created_at timestamptz not null default now()
);

-- All sensitive data is accessed through authenticated server handlers. No new
-- table is exposed to the anonymous/client Data API; service checks scope first.
do $$ declare t text; begin
  foreach t in array array['shiba_aid_versions','shiba_aid_events','shiba_aid_sources','shiba_aid_observations','shiba_devis_simulations','company_rge_qualifications','equipment_plate_confirmations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to service_role',t);
  end loop;
end $$;

create function public.shiba_aid_new_draft(p_actor uuid,p_rule jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare next_version integer; new_id uuid; aid_slug text:=p_rule->>'slug';
begin
  if not exists(select 1 from public.platform_admins where user_id=p_actor) then raise exception 'Forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shiba-aid:'||aid_slug,0));
  select coalesce(max(version),0)+1 into next_version from public.shiba_aid_versions where slug=aid_slug;
  insert into public.shiba_aid_versions(slug,version,rule,created_by) values(aid_slug,next_version,p_rule,p_actor) returning id into new_id;
  insert into public.shiba_aid_events(version_id,actor_id,action) values(new_id,p_actor,'draft');
  return new_id;
end $$;

create function public.shiba_aid_transition(p_actor uuid,p_id uuid,p_action text,p_note text)
returns void language plpgsql security invoker set search_path='' as $$
declare target public.shiba_aid_versions; aid_slug text;
begin
  if not exists(select 1 from public.platform_admins where user_id=p_actor) then raise exception 'Forbidden'; end if;
  select slug into strict aid_slug from public.shiba_aid_versions where id=p_id;
  perform pg_advisory_xact_lock(hashtextextended('shiba-aid:'||aid_slug,0));
  select * into strict target from public.shiba_aid_versions where id=p_id for update;
  if p_action='validate' and target.status='draft' and char_length(btrim(p_note)) between 20 and 2000 then
    update public.shiba_aid_versions set status='validated', validated_by=p_actor, validated_at=now(),review_note=p_note where id=p_id;
  elsif ((p_action='publish' and target.status='validated') or (p_action='rollback' and target.status='archived')) and target.validated_by is not null
    and target.validated_at>=now()-make_interval(days=>(target.rule->>'freshnessDays')::integer)
    and (target.rule->>'effectiveFrom')::date<=current_date
    and ((target.rule->>'effectiveUntil') is null or (target.rule->>'effectiveUntil')::date>=current_date) then
    update public.shiba_aid_versions set status='archived' where slug=target.slug and status='published';
    update public.shiba_aid_versions set status='published',published_at=now() where id=p_id;
  elsif p_action='suspend' and target.status='published' then
    update public.shiba_aid_versions set status='suspended' where id=p_id;
  elsif p_action='archive' and target.status in ('draft','validated','suspended') then
    update public.shiba_aid_versions set status='archived' where id=p_id;
  else raise exception 'Transition refused'; end if;
  insert into public.shiba_aid_events(version_id,actor_id,action,note) values(p_id,p_actor,p_action,p_note);
end $$;
revoke all on function public.shiba_aid_new_draft(uuid,jsonb),public.shiba_aid_transition(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.shiba_aid_new_draft(uuid,jsonb),public.shiba_aid_transition(uuid,uuid,text,text) to service_role;

-- Immutable snapshots make recalculation additive rather than overwriting history.
create function public.shiba_immutable_snapshot() returns trigger language plpgsql set search_path='' as $$
begin
  if new.snapshot is distinct from old.snapshot or new.owner_id is distinct from old.owner_id or new.company_id is distinct from old.company_id or new.id is distinct from old.id or new.created_at is distinct from old.created_at or (new.previous_id is distinct from old.previous_id and new.previous_id is not null) then raise exception 'Immutable snapshot'; end if;
  return new;
end $$;
create trigger immutable_devis_snapshot before update on public.shiba_devis_simulations for each row execute function public.shiba_immutable_snapshot();
create function public.shiba_immutable_rule() returns trigger language plpgsql set search_path='' as $$
begin if new.rule is distinct from old.rule then raise exception 'Create a new version'; end if; return new; end $$;
create trigger immutable_aid_payload before update on public.shiba_aid_versions for each row execute function public.shiba_immutable_rule();
revoke all on function public.shiba_immutable_snapshot(),public.shiba_immutable_rule() from public,anon,authenticated;
commit;

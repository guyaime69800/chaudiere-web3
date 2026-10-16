-- PREVIEW UNIQUEMENT.
-- Exécuter ce fichier en une seule fois dans Supabase SQL Editor.
-- Toutes les mutations de test sont annulées par le ROLLBACK final.
-- Le script ne contient aucun secret et ne relance aucune migration.

-- Précontrôle en lecture seule : une seule entreprise Démo et au moins un membre.
do $preflight$
declare
  v_company_count integer;
  v_member_count integer;
begin
  select count(*) into v_company_count
  from public.companies
  where name = 'CarnetPass Démo';

  if v_company_count <> 1 then
    raise exception
      'Précontrôle interrompu : % entreprise(s) CarnetPass Démo (1 attendue).',
      v_company_count;
  end if;

  select count(*) into v_member_count
  from public.company_members
  where company_id = (
    select id
    from public.companies
    where name = 'CarnetPass Démo'
  );

  if v_member_count < 1 then
    raise exception 'Précontrôle interrompu : aucun membre sur CarnetPass Démo.';
  end if;
end
$preflight$;

begin;

-- Conserve l'entreprise et un de ses vrais membres dans la transaction.
-- Aucun UUID n'a besoin d'être copié dans ce fichier.
select set_config(
  'carnetpass_test.company_id',
  (
    select id::text
    from public.companies
    where name = 'CarnetPass Démo'
  ),
  true
);

select set_config(
  'carnetpass_test.actor_id',
  (
    select m.user_id::text
    from public.company_members as m
    where m.company_id = current_setting('carnetpass_test.company_id')::uuid
    order by case m.role::text
      when 'owner' then 1
      when 'admin' then 2
      else 3
    end,
    m.created_at
    limit 1
  ),
  true
);

-- Contrôle également les droits d'appel de la RPC.
select set_config(
  'carnetpass_test.acl',
  case
    when has_function_privilege(
      'authenticated',
      'public.update_company_siret(uuid,text)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.update_company_siret(uuid,text)',
      'EXECUTE'
    )
    then 'PASS'
    else 'FAIL'
  end,
  true
);

-- État de départ artificiel, entièrement annulé à la fin du fichier.
update public.companies
set siret = '00000000000000'
where id = current_setting('carnetpass_test.company_id')::uuid;

update public.company_members
set role = 'owner'
where company_id = current_setting('carnetpass_test.company_id')::uuid
  and user_id = current_setting('carnetpass_test.actor_id')::uuid;

insert into public.company_verifications (
  company_id,
  status,
  verified_siret,
  verified_at,
  updated_at
)
values (
  current_setting('carnetpass_test.company_id')::uuid,
  'approved',
  '00000000000000',
  '2000-01-01 00:00:00+00'::timestamptz,
  '2000-01-02 00:00:00+00'::timestamptz
)
on conflict (company_id) do update
set status = excluded.status,
    verified_siret = excluded.verified_siret,
    verified_at = excluded.verified_at,
    updated_at = excluded.updated_at;

-- 1. OWNER : autorisé, puis ancienne validation remise à pending.
select set_config(
  'request.jwt.claim.sub',
  current_setting('carnetpass_test.actor_id'),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('carnetpass_test.actor_id'),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $test$
begin
  perform public.update_company_siret(
    current_setting('carnetpass_test.company_id')::uuid,
    '11111111111111'
  );
  perform set_config('carnetpass_test.owner_call', 'PASS', true);
exception when others then
  perform set_config(
    'carnetpass_test.owner_call',
    format('FAIL [%s] %s', sqlstate, sqlerrm),
    true
  );
end
$test$;

reset role;

select set_config(
  'carnetpass_test.owner_reset',
  case when exists (
    select 1
    from public.companies as c
    join public.company_verifications as v on v.company_id = c.id
    where c.id = current_setting('carnetpass_test.company_id')::uuid
      and c.siret = '11111111111111'
      and v.status = 'pending'
      and v.verified_siret is null
      and v.verified_at is null
  ) then 'PASS' else 'FAIL' end,
  true
);

-- 2. SIRET INCHANGÉ : les espaces sont normalisés et la validation reste intacte.
update public.company_verifications
set status = 'approved',
    verified_siret = '11111111111111',
    verified_at = '2001-01-01 00:00:00+00'::timestamptz,
    updated_at = '2001-01-02 00:00:00+00'::timestamptz
where company_id = current_setting('carnetpass_test.company_id')::uuid;

set local role authenticated;

do $test$
begin
  perform public.update_company_siret(
    current_setting('carnetpass_test.company_id')::uuid,
    '111 111 111 111 11'
  );
  perform set_config('carnetpass_test.unchanged_call', 'PASS', true);
exception when others then
  perform set_config(
    'carnetpass_test.unchanged_call',
    format('FAIL [%s] %s', sqlstate, sqlerrm),
    true
  );
end
$test$;

reset role;

select set_config(
  'carnetpass_test.unchanged_state',
  case when exists (
    select 1
    from public.companies as c
    join public.company_verifications as v on v.company_id = c.id
    where c.id = current_setting('carnetpass_test.company_id')::uuid
      and c.siret = '11111111111111'
      and v.status = 'approved'
      and v.verified_siret = '11111111111111'
      and v.verified_at = '2001-01-01 00:00:00+00'::timestamptz
      and v.updated_at = '2001-01-02 00:00:00+00'::timestamptz
  ) then 'PASS' else 'FAIL' end,
  true
);

-- 3. ADMIN : autorisé et changement remis à pending.
update public.company_members
set role = 'admin'
where company_id = current_setting('carnetpass_test.company_id')::uuid
  and user_id = current_setting('carnetpass_test.actor_id')::uuid;

set local role authenticated;

do $test$
begin
  perform public.update_company_siret(
    current_setting('carnetpass_test.company_id')::uuid,
    '22222222222222'
  );
  perform set_config('carnetpass_test.admin_call', 'PASS', true);
exception when others then
  perform set_config(
    'carnetpass_test.admin_call',
    format('FAIL [%s] %s', sqlstate, sqlerrm),
    true
  );
end
$test$;

reset role;

select set_config(
  'carnetpass_test.admin_reset',
  case when exists (
    select 1
    from public.companies as c
    join public.company_verifications as v on v.company_id = c.id
    where c.id = current_setting('carnetpass_test.company_id')::uuid
      and c.siret = '22222222222222'
      and v.status = 'pending'
      and v.verified_siret is null
      and v.verified_at is null
  ) then 'PASS' else 'FAIL' end,
  true
);

-- 4. SUSPENSION : le SIRET change, mais suspended reste suspended.
update public.company_verifications
set status = 'suspended',
    verified_siret = '22222222222222',
    verified_at = '2002-01-01 00:00:00+00'::timestamptz,
    updated_at = '2002-01-02 00:00:00+00'::timestamptz
where company_id = current_setting('carnetpass_test.company_id')::uuid;

set local role authenticated;

do $test$
begin
  perform public.update_company_siret(
    current_setting('carnetpass_test.company_id')::uuid,
    '33333333333333'
  );
  perform set_config('carnetpass_test.suspended_call', 'PASS', true);
exception when others then
  perform set_config(
    'carnetpass_test.suspended_call',
    format('FAIL [%s] %s', sqlstate, sqlerrm),
    true
  );
end
$test$;

reset role;

select set_config(
  'carnetpass_test.suspended_state',
  case when exists (
    select 1
    from public.companies as c
    join public.company_verifications as v on v.company_id = c.id
    where c.id = current_setting('carnetpass_test.company_id')::uuid
      and c.siret = '33333333333333'
      and v.status = 'suspended'
      and v.verified_siret is null
      and v.verified_at is null
  ) then 'PASS' else 'FAIL' end,
  true
);

-- 5. TECHNICIAN : refusé en 42501.
update public.company_members
set role = 'technician'
where company_id = current_setting('carnetpass_test.company_id')::uuid
  and user_id = current_setting('carnetpass_test.actor_id')::uuid;

set local role authenticated;

do $test$
begin
  perform public.update_company_siret(
    current_setting('carnetpass_test.company_id')::uuid,
    '44444444444444'
  );
  perform set_config(
    'carnetpass_test.technician_call',
    'FAIL (appel accepté)',
    true
  );
exception
  when sqlstate '42501' then
    perform set_config('carnetpass_test.technician_call', 'PASS', true);
  when others then
    perform set_config(
      'carnetpass_test.technician_call',
      format('FAIL [%s] %s', sqlstate, sqlerrm),
      true
    );
end
$test$;

reset role;

-- 6. SANS SESSION : rôle API authenticated, mais JWT sans utilisateur.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('role', 'authenticated')::text,
  true
);
set local role authenticated;

do $test$
begin
  perform public.update_company_siret(
    current_setting('carnetpass_test.company_id')::uuid,
    '44444444444444'
  );
  perform set_config(
    'carnetpass_test.no_session_call',
    'FAIL (appel accepté)',
    true
  );
exception
  when sqlstate '42501' then
    perform set_config('carnetpass_test.no_session_call', 'PASS', true);
  when others then
    perform set_config(
      'carnetpass_test.no_session_call',
      format('FAIL [%s] %s', sqlstate, sqlerrm),
      true
    );
end
$test$;

reset role;

-- 7. NON-MEMBRE : JWT valide, appartenance retirée temporairement.
delete from public.company_members
where company_id = current_setting('carnetpass_test.company_id')::uuid
  and user_id = current_setting('carnetpass_test.actor_id')::uuid;

select set_config(
  'request.jwt.claim.sub',
  current_setting('carnetpass_test.actor_id'),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('carnetpass_test.actor_id'),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $test$
begin
  perform public.update_company_siret(
    current_setting('carnetpass_test.company_id')::uuid,
    '44444444444444'
  );
  perform set_config(
    'carnetpass_test.non_member_call',
    'FAIL (appel accepté)',
    true
  );
exception
  when sqlstate '42501' then
    perform set_config('carnetpass_test.non_member_call', 'PASS', true);
  when others then
    perform set_config(
      'carnetpass_test.non_member_call',
      format('FAIL [%s] %s', sqlstate, sqlerrm),
      true
    );
end
$test$;

reset role;

-- 8. ANON : aucun droit EXECUTE et aucune session.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select set_config(
  'request.jwt.claims',
  json_build_object('role', 'anon')::text,
  true
);
set local role anon;

do $test$
begin
  perform public.update_company_siret(
    current_setting('carnetpass_test.company_id')::uuid,
    '44444444444444'
  );
  perform set_config('carnetpass_test.anon_call', 'FAIL (appel accepté)', true);
exception
  when sqlstate '42501' then
    perform set_config('carnetpass_test.anon_call', 'PASS', true);
  when others then
    perform set_config(
      'carnetpass_test.anon_call',
      format('FAIL [%s] %s', sqlstate, sqlerrm),
      true
    );
end
$test$;

reset role;

select set_config(
  'carnetpass_test.denied_state',
  case when exists (
    select 1
    from public.companies
    where id = current_setting('carnetpass_test.company_id')::uuid
      and siret = '33333333333333'
  ) then 'PASS' else 'FAIL' end,
  true
);

-- Résultat attendu : PASS sur chaque ligne.
select test, result
from (
  values
    ('ACL RPC', current_setting('carnetpass_test.acl', true)),
    ('Owner autorisé', current_setting('carnetpass_test.owner_call', true)),
    ('Changement : validation annulée', current_setting('carnetpass_test.owner_reset', true)),
    ('Inchangé : appel accepté', current_setting('carnetpass_test.unchanged_call', true)),
    ('Inchangé : validation intacte', current_setting('carnetpass_test.unchanged_state', true)),
    ('Admin autorisé', current_setting('carnetpass_test.admin_call', true)),
    ('Admin : validation annulée', current_setting('carnetpass_test.admin_reset', true)),
    ('Suspension : appel accepté', current_setting('carnetpass_test.suspended_call', true)),
    ('Suspension conservée', current_setting('carnetpass_test.suspended_state', true)),
    ('Technicien refusé', current_setting('carnetpass_test.technician_call', true)),
    ('Sans session refusé', current_setting('carnetpass_test.no_session_call', true)),
    ('Non-membre refusé', current_setting('carnetpass_test.non_member_call', true)),
    ('Anonyme refusé', current_setting('carnetpass_test.anon_call', true)),
    ('Refus : SIRET intact', current_setting('carnetpass_test.denied_state', true))
) as results(test, result);

rollback;

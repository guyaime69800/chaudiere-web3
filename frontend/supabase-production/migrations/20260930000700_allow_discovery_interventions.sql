begin;

-- Align the database guard with requireVerifiedCompany: an active Discovery
-- trial may record interventions without a SIRET, but only until its deadline.
create or replace function public.guard_intervention_relationships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.equipments as e
    where e.id = new.equipment_id
      and e.company_id = new.company_id
  ) then
    raise exception 'Cet équipement n''appartient pas à cette entreprise.'
      using errcode = '23503';
  end if;

  if not exists (
    select 1 from public.company_members as m
    where m.company_id = new.company_id
      and m.user_id = new.technician_id
      and m.role::text in ('owner', 'admin', 'technician')
  ) then
    raise exception 'Ce technicien n''est pas autorisé pour cette entreprise.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.companies as c
    left join public.company_verifications as v on v.company_id = c.id
    left join public.subscriptions as s on s.company_id = c.id
    where c.id = new.company_id
      and (
        (c.is_demo is true and coalesce(v.status::text, 'pending') <> 'suspended')
        or (
          c.siret ~ '^[0-9]{14}$'
          and v.status::text = 'approved'
          and v.verified_siret = c.siret
          and v.verified_at is not null
        )
        or (
          s.plan::text = 'free'
          and s.status::text in ('active', 'trialing')
          and now() < coalesce(s.trial_ends_at, c.created_at + interval '5 days')
          and coalesce(v.status::text, 'pending') not in ('suspended', 'rejected')
        )
      )
  ) then
    raise exception 'Cette entreprise n''est pas autorisée à enregistrer une intervention.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

commit;

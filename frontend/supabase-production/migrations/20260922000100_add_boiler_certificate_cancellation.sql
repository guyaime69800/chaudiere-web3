begin;

alter table public.boiler_maintenance_certificates
drop constraint if exists boiler_maintenance_certificates_status_check;

alter table public.boiler_maintenance_certificates
add constraint boiler_maintenance_certificates_status_check
check (status in ('draft', 'issued', 'cancelled'));

alter table public.boiler_maintenance_certificates
add column cancelled_at timestamptz,
add column cancelled_by uuid
  references public.profiles(id),
add column cancellation_reason text;

alter table public.boiler_maintenance_certificates
add constraint boiler_certificate_cancellation_consistency
check (
  (
    status <> 'cancelled'
    and cancelled_at is null
    and cancelled_by is null
    and cancellation_reason is null
  )
  or
  (
    status = 'cancelled'
    and issued_at is not null
    and certificate_number is not null
    and cancelled_at is not null
    and cancelled_by is not null
    and char_length(btrim(cancellation_reason)) >= 5
  )
);

create or replace function public.protect_issued_boiler_certificate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.status in ('issued', 'cancelled') then
    raise exception
      'Une attestation émise ou annulée ne peut pas être supprimée.'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and old.status = 'cancelled' then
    raise exception
      'Une attestation annulée est définitive et ne peut plus être modifiée.'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and old.status = 'issued' then
    if new.status <> 'cancelled' then
      raise exception
        'Une attestation émise peut uniquement être annulée.'
        using errcode = '55000';
    end if;

    if (
      to_jsonb(new)
        - array[
            'status',
            'cancelled_at',
            'cancelled_by',
            'cancellation_reason',
            'updated_at'
          ]
      <>
      to_jsonb(old)
        - array[
            'status',
            'cancelled_at',
            'cancelled_by',
            'cancellation_reason',
            'updated_at'
          ]
    ) then
      raise exception
        'Le contenu d’une attestation émise ne peut pas être modifié.'
        using errcode = '55000';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

commit;
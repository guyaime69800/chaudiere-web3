begin;

alter table public.platform_document_intake
  add column catalog_category text check (catalog_category in (
    'boiler', 'heat_pump_indoor', 'heat_pump_outdoor',
    'air_conditioning_indoor', 'air_conditioning_outdoor', 'burner',
    'water_heater', 'regulation', 'heat_pump_water_heater', 'vmc'
  )),
  add column reviewed_by uuid references auth.users(id),
  add column reviewed_at timestamptz,
  add column distribution_confirmed_at timestamptz;

create index platform_document_intake_catalog_idx
  on public.platform_document_intake (catalog_category, created_at desc)
  where status = 'approved';

commit;

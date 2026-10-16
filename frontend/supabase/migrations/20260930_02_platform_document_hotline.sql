begin;

alter table public.platform_document_intake
  add column hotline_phone text check (
    hotline_phone is null or
    (length(hotline_phone) between 6 and 32 and hotline_phone ~ '^[+0-9(). -]+$')
  ),
  add column model_aliases text[] not null default '{}'::text[]
    check (cardinality(model_aliases) <= 10);

commit;

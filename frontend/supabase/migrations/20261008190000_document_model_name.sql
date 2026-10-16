-- Separate the commercial model family from the exact manufacturer reference.
alter table public.platform_document_intake
  add column if not exists model_name text;
alter table public.platform_document_intake
  add constraint platform_document_model_name_length
  check (model_name is null or char_length(btrim(model_name)) between 2 and 160);
comment on column public.platform_document_intake.model_name is
  'Commercial model family, distinct from model_reference. Null for legacy documents until classified by an administrator.';

begin;

alter table public.platform_document_intake
  drop constraint platform_document_intake_size_bytes_check;

alter table public.platform_document_intake
  add constraint platform_document_intake_size_bytes_check
  check (size_bytes between 1 and 31457280);

commit;

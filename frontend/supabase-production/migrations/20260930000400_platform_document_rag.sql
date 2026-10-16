begin;

alter table public.platform_document_intake
  add column rag_status text not null default 'pending'
    check (rag_status in ('pending', 'indexing', 'ready', 'needs_ocr', 'failed')),
  add column rag_data jsonb,
  add column rag_error text,
  add column rag_started_at timestamptz,
  add column rag_indexed_at timestamptz;

create index platform_document_intake_rag_ready_idx
  on public.platform_document_intake (manufacturer, model_reference)
  where status = 'approved' and rag_status = 'ready';

commit;

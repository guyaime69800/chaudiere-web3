-- Classify explicitly identifiable legacy administrative imports.
-- Exact references, files, indexing and publication remain untouched.
update public.platform_document_intake
set model_name = case
  when model_reference ~* '^\s*themaplus\s+condens\M' then 'ThemaPlus Condens'
  when model_reference ~* '^\s*themafast\s+condens\M' then 'ThemaFast Condens'
end
where lower(btrim(manufacturer)) = 'saunier duval'
  and nullif(btrim(model_name), '') is null
  and model_reference ~* '^\s*(themaplus|themafast)\s+condens\M';

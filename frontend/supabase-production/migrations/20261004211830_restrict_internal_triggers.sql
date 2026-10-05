begin;

-- Internal trigger functions are not application RPC endpoints.
-- Their triggers remain installed; only direct Data API execution is removed.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_discovery_equipment_limit() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

commit;

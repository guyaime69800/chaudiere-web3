-- =========================================================
-- CARNETPASS - AJOUT DU ROLE PROPRIETAIRE
-- =========================================================

alter type public.company_role
add value if not exists 'owner';
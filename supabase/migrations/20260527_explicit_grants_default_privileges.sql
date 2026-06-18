-- Migration: Explicit GRANTs and ALTER DEFAULT PRIVILEGES
-- Prepares the project for the Supabase change that removes implicit grants
-- on public schema tables. Idempotent — safe to run multiple times.
--
-- Covers:
--   - profiles, profile_settings, leads (no GRANT in prior migrations)
--   - GRANT USAGE/SELECT on sequences (future-proofing)
--   - ALTER DEFAULT PRIVILEGES so future tables get proper grants automatically

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles (user identity data, owner-only via RLS)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- profile_settings (user profile extended data, used by APP and WEB)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profile_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profile_settings TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- leads (anonymous lead capture; anon INSERT is justified for the capture form)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leads TO service_role;
GRANT INSERT ON TABLE public.leads TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Sequences (none in public currently, covers future ones)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Default privileges — ensures future tables and sequences get proper grants
-- without relying on Supabase implicit defaults
-- ─────────────────────────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

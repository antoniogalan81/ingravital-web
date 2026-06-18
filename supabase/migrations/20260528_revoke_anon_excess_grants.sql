-- Migration: Revoke excess anon permissions on all private tables
-- Removes the broad anon=ALL inherited from original Supabase project setup.
-- RLS was already protecting data; this reduces attack surface at the grant level.
-- Idempotent — safe to run multiple times.

-- ─────────────────────────────────────────────────────────────────────────────
-- Private user tables: revoke all anon access
-- RLS owner-only policies remain in place; this adds defence-in-depth
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.tasks                     FROM anon;
REVOKE ALL ON TABLE public.metas                     FROM anon;
REVOKE ALL ON TABLE public.bank_accounts             FROM anon;
REVOKE ALL ON TABLE public.finance_movements         FROM anon;
REVOKE ALL ON TABLE public.income_forecast_lines     FROM anon;
REVOKE ALL ON TABLE public.nutrition_quick_items     FROM anon;
REVOKE ALL ON TABLE public.app_settings              FROM anon;
REVOKE ALL ON TABLE public.ai_meta_drafts            FROM anon;
REVOKE ALL ON TABLE public.operaciones_inmobiliarias FROM anon;
REVOKE ALL ON TABLE public.profiles                  FROM anon;
REVOKE ALL ON TABLE public.profile_settings          FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- leads: revoke all, then restore only INSERT
-- Anonymous visitors submit their email via the lead capture form (no login).
-- id = gen_random_uuid() — no sequence grant needed.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.leads FROM anon;
GRANT INSERT ON TABLE public.leads TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Default privileges: remove anon from future postgres-role objects
-- Note: supabase_admin default privileges cannot be changed by this migration
-- ─────────────────────────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon;

-- Migration: Add server_updated_at trigger to bank_accounts
--
-- Root cause: bank_accounts was created without the BEFORE UPDATE trigger
-- that advances server_updated_at. All other synced tables (tasks, metas,
-- finance_movements, income_forecast_lines, app_settings) have this trigger,
-- so their incremental pulls (server_updated_at > lastPulledAt) work across
-- WEB and APP. bank_accounts was missing it, causing cross-device balance
-- changes to be silently ignored on every incremental pull.
--
-- The function public.set_server_updated_at() already exists (created by
-- 20260116_create_app_settings.sql). We only need to attach the trigger.

DROP TRIGGER IF EXISTS bank_accounts_server_updated_at ON public.bank_accounts;

CREATE TRIGGER bank_accounts_server_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_server_updated_at();

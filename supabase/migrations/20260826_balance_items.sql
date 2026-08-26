-- Migration: tabla `balance_items` — MÓDULO BALANCE (compartido WEB ⇄ APP).
--
-- Sigue EXACTAMENTE el patrón de sync JSONB ya usado por el resto de entidades
-- (id, user_id, data, client_updated_at, server_updated_at, deleted_at) para que
-- los motores de sync existentes de WEB (src/sync) y APP (src/sync) la traten sin
-- ningún mecanismo nuevo.
--
-- UNA SOLA TABLA para los tres conceptos del módulo. `data->>'kind'` discrimina:
--   'HOLDER'  → titular (particular o sociedad)
--   'ACCOUNT' → cuenta bancaria (banco, alias, titular, saldo, fecha de saldo)
--   'LOAN'    → préstamo (alias, prestamista, titular, capital pendiente, cuota,
--               día de cargo, cuenta asociada)
-- Contrato de tipos: WEB/src/lib/balance.ts ≡ APP/models/balance.ts.
--
-- ADITIVA E IDEMPOTENTE: sin DROP/DELETE/TRUNCATE de datos. Se aplica a mano en el
-- SQL Editor del proyecto Supabase de Invergravital (ver README_FASE4_apply.md).

CREATE TABLE IF NOT EXISTS public.balance_items (
  id                UUID        PRIMARY KEY,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data              JSONB       NOT NULL,
  client_updated_at TIMESTAMPTZ NOT NULL,
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS balance_items_user_id_idx
  ON public.balance_items(user_id);

-- El pull incremental de ambas plataformas filtra por server_updated_at > watermark.
CREATE INDEX IF NOT EXISTS balance_items_server_updated_at_idx
  ON public.balance_items(server_updated_at);

-- Reutiliza public.set_server_updated_at() (creada en 20260116_create_app_settings.sql).
DROP TRIGGER IF EXISTS balance_items_server_updated_at ON public.balance_items;

CREATE TRIGGER balance_items_server_updated_at
  BEFORE UPDATE ON public.balance_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_server_updated_at();

-- ── RLS owner-only ───────────────────────────────────────────────────────────
-- Mismo modelo que operaciones_inmobiliarias: cada usuario solo ve y escribe sus
-- propias filas. Los inversores NO acceden a esta tabla en ningún caso.
ALTER TABLE public.balance_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'balance_items'
                   AND policyname = 'balance_items_select') THEN
    CREATE POLICY "balance_items_select" ON public.balance_items
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'balance_items'
                   AND policyname = 'balance_items_insert') THEN
    CREATE POLICY "balance_items_insert" ON public.balance_items
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'balance_items'
                   AND policyname = 'balance_items_update') THEN
    CREATE POLICY "balance_items_update" ON public.balance_items
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'balance_items'
                   AND policyname = 'balance_items_delete') THEN
    CREATE POLICY "balance_items_delete" ON public.balance_items
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Grants: `authenticated` queda gateado fila a fila por las policies de arriba.
-- `anon` NO recibe ningún privilegio (coherente con 20260528_revoke_anon_excess_grants.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.balance_items TO authenticated;
GRANT ALL ON public.balance_items TO service_role;

-- ── Verificación (solo lectura, tras aplicar) ────────────────────────────────
--   SELECT relname, relrowsecurity FROM pg_class
--     WHERE oid = 'public.balance_items'::regclass;            -- relrowsecurity = true
--   SELECT policyname, cmd FROM pg_policies
--     WHERE schemaname='public' AND tablename='balance_items';  -- 4 policies

-- Migration: RLS explícita y versionada para operaciones_inmobiliarias
-- ⚠️ NO APLICADA todavía. Requiere autorización expresa para ejecutarse (política del repo:
--    "no ejecutar migraciones sin autorización"). Es ADITIVA e IDEMPOTENTE: no borra datos,
--    no toca columnas, solo habilita RLS y crea policies owner-only SI NO EXISTEN.
--
-- CONTEXTO (auditoría 2026-07-03):
--   `operaciones_inmobiliarias` es la tabla NÚCLEO del producto (todas las inversiones,
--   con la capa de seguimiento anidada en `data` JSONB). A diferencia de tasks/metas/
--   bank_accounts/etc. (ver 20260429_enable_rls_core_tables.sql), esta tabla NO tiene
--   ninguna migración trackeada que habilite su RLS ni cree sus policies: se creó antes
--   del control de versiones y su RLS/grants viven solo en el dashboard de Supabase.
--   `20260528_revoke_anon_excess_grants.sql` ya revoca el acceso de `anon` (verificado en
--   vivo: SELECT/INSERT anónimos → 401), pero el AISLAMIENTO entre usuarios AUTENTICADOS
--   depende de una policy `auth.uid() = user_id` que NO está versionada y que no se pudo
--   confirmar sin dos cuentas reales. El filtro `.eq("user_id", ...)` del cliente (ver
--   src/sync/syncEngine.ts) NO es una frontera de seguridad. Esta migración pone esa
--   garantía bajo control de versiones.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1 (solo lectura) — VERIFICAR el estado ACTUAL antes de aplicar nada.
-- Ejecuta esto en el SQL editor de Supabase. Si RLS ya está habilitada y las 4 policies
-- owner-only ya existen, esta migración es innecesaria (y de todos modos inocua).
--
--   -- ¿RLS habilitada?
--   SELECT relname, relrowsecurity
--   FROM pg_class
--   WHERE oid = 'public.operaciones_inmobiliarias'::regclass;
--
--   -- ¿Qué policies existen y con qué condición?
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'operaciones_inmobiliarias';
--
--   -- ¿Quién tiene grants sobre la tabla? (anon NO debe aparecer)
--   SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name = 'operaciones_inmobiliarias'
--   ORDER BY grantee, privilege_type;
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2 — Aplicar (solo con autorización). Mismo patrón que 20260429.

ALTER TABLE public.operaciones_inmobiliarias ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operaciones_inmobiliarias' AND policyname = 'operaciones_inmobiliarias: select own') THEN
    CREATE POLICY "operaciones_inmobiliarias: select own" ON public.operaciones_inmobiliarias
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operaciones_inmobiliarias' AND policyname = 'operaciones_inmobiliarias: insert own') THEN
    CREATE POLICY "operaciones_inmobiliarias: insert own" ON public.operaciones_inmobiliarias
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operaciones_inmobiliarias' AND policyname = 'operaciones_inmobiliarias: update own') THEN
    CREATE POLICY "operaciones_inmobiliarias: update own" ON public.operaciones_inmobiliarias
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operaciones_inmobiliarias' AND policyname = 'operaciones_inmobiliarias: delete own') THEN
    CREATE POLICY "operaciones_inmobiliarias: delete own" ON public.operaciones_inmobiliarias
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_operaciones_inmobiliarias_user_id ON public.operaciones_inmobiliarias(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operaciones_inmobiliarias TO authenticated;
GRANT ALL ON public.operaciones_inmobiliarias TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 3 (solo lectura) — VERIFICACIÓN post-aplicación, idealmente con dos cuentas:
--   · Inicia sesión como usuario A y crea una operación.
--   · Inicia sesión como usuario B: su pull NO debe devolver filas de A.
--   · Repite el PASO 1 y confirma relrowsecurity=true y las 4 policies presentes.
--
-- NOTA: otras tablas del revoke (app_settings, ai_meta_drafts, profile_settings) tampoco
-- tienen RLS versionada en el repo; conviene auditarlas con el mismo PASO 1. Quedan FUERA
-- del alcance de esta tarea (centrada en inversiones) y no se tocan aquí.

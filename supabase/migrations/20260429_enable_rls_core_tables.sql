-- Migration: Enable RLS on core tables created without it
-- Tables: tasks, metas, bank_accounts, finance_movements,
--         income_forecast_lines, nutrition_quick_items
-- All tables follow the standard sync pattern (id, user_id, data JSONB, timestamps).
-- Idempotent: safe to run multiple times.

-- ═════════════════════════════════════════════════════════════════════════════
-- tasks
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tasks: select own') THEN
    CREATE POLICY "tasks: select own" ON public.tasks FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tasks: insert own') THEN
    CREATE POLICY "tasks: insert own" ON public.tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tasks: update own') THEN
    CREATE POLICY "tasks: update own" ON public.tasks FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tasks: delete own') THEN
    CREATE POLICY "tasks: delete own" ON public.tasks FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);

GRANT ALL ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- metas
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'metas' AND policyname = 'metas: select own') THEN
    CREATE POLICY "metas: select own" ON public.metas FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'metas' AND policyname = 'metas: insert own') THEN
    CREATE POLICY "metas: insert own" ON public.metas FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'metas' AND policyname = 'metas: update own') THEN
    CREATE POLICY "metas: update own" ON public.metas FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'metas' AND policyname = 'metas: delete own') THEN
    CREATE POLICY "metas: delete own" ON public.metas FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_metas_user_id ON public.metas(user_id);

GRANT ALL ON public.metas TO authenticated;
GRANT ALL ON public.metas TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- bank_accounts
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'bank_accounts: select own') THEN
    CREATE POLICY "bank_accounts: select own" ON public.bank_accounts FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'bank_accounts: insert own') THEN
    CREATE POLICY "bank_accounts: insert own" ON public.bank_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'bank_accounts: update own') THEN
    CREATE POLICY "bank_accounts: update own" ON public.bank_accounts FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'bank_accounts: delete own') THEN
    CREATE POLICY "bank_accounts: delete own" ON public.bank_accounts FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON public.bank_accounts(user_id);

GRANT ALL ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- finance_movements
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.finance_movements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finance_movements' AND policyname = 'finance_movements: select own') THEN
    CREATE POLICY "finance_movements: select own" ON public.finance_movements FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finance_movements' AND policyname = 'finance_movements: insert own') THEN
    CREATE POLICY "finance_movements: insert own" ON public.finance_movements FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finance_movements' AND policyname = 'finance_movements: update own') THEN
    CREATE POLICY "finance_movements: update own" ON public.finance_movements FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finance_movements' AND policyname = 'finance_movements: delete own') THEN
    CREATE POLICY "finance_movements: delete own" ON public.finance_movements FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_finance_movements_user_id ON public.finance_movements(user_id);

GRANT ALL ON public.finance_movements TO authenticated;
GRANT ALL ON public.finance_movements TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- income_forecast_lines
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.income_forecast_lines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'income_forecast_lines' AND policyname = 'income_forecast_lines: select own') THEN
    CREATE POLICY "income_forecast_lines: select own" ON public.income_forecast_lines FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'income_forecast_lines' AND policyname = 'income_forecast_lines: insert own') THEN
    CREATE POLICY "income_forecast_lines: insert own" ON public.income_forecast_lines FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'income_forecast_lines' AND policyname = 'income_forecast_lines: update own') THEN
    CREATE POLICY "income_forecast_lines: update own" ON public.income_forecast_lines FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'income_forecast_lines' AND policyname = 'income_forecast_lines: delete own') THEN
    CREATE POLICY "income_forecast_lines: delete own" ON public.income_forecast_lines FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_income_forecast_lines_user_id ON public.income_forecast_lines(user_id);

GRANT ALL ON public.income_forecast_lines TO authenticated;
GRANT ALL ON public.income_forecast_lines TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- nutrition_quick_items
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.nutrition_quick_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nutrition_quick_items' AND policyname = 'nutrition_quick_items: select own') THEN
    CREATE POLICY "nutrition_quick_items: select own" ON public.nutrition_quick_items FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nutrition_quick_items' AND policyname = 'nutrition_quick_items: insert own') THEN
    CREATE POLICY "nutrition_quick_items: insert own" ON public.nutrition_quick_items FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nutrition_quick_items' AND policyname = 'nutrition_quick_items: update own') THEN
    CREATE POLICY "nutrition_quick_items: update own" ON public.nutrition_quick_items FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nutrition_quick_items' AND policyname = 'nutrition_quick_items: delete own') THEN
    CREATE POLICY "nutrition_quick_items: delete own" ON public.nutrition_quick_items FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_nutrition_quick_items_user_id ON public.nutrition_quick_items(user_id);

GRANT ALL ON public.nutrition_quick_items TO authenticated;
GRANT ALL ON public.nutrition_quick_items TO service_role;

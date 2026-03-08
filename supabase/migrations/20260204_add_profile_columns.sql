-- Migración: Añadir columnas de perfil a public.profiles
-- Fecha: 2026-02-04
-- Descripción: Añade columnas para información personal del usuario
-- IMPORTANTE: Esta migración es idempotente (se puede ejecutar múltiples veces sin error)

-- Añadir columna first_name si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'first_name') THEN
    ALTER TABLE public.profiles ADD COLUMN first_name TEXT NULL;
  END IF;
END $$;

-- Añadir columna last_name si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_name') THEN
    ALTER TABLE public.profiles ADD COLUMN last_name TEXT NULL;
  END IF;
END $$;

-- Añadir columna gender si no existe (valores: 'hombre', 'mujer', 'otro')
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'gender') THEN
    ALTER TABLE public.profiles ADD COLUMN gender TEXT NULL;
  END IF;
END $$;

-- Añadir columna birth_date si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'birth_date') THEN
    ALTER TABLE public.profiles ADD COLUMN birth_date DATE NULL;
  END IF;
END $$;

-- Añadir columna height_cm si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'height_cm') THEN
    ALTER TABLE public.profiles ADD COLUMN height_cm INTEGER NULL;
  END IF;
END $$;

-- Añadir columna weight_kg si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'weight_kg') THEN
    ALTER TABLE public.profiles ADD COLUMN weight_kg INTEGER NULL;
  END IF;
END $$;

-- Comentarios descriptivos en las columnas
COMMENT ON COLUMN public.profiles.first_name IS 'Nombre del usuario';
COMMENT ON COLUMN public.profiles.last_name IS 'Apellidos del usuario';
COMMENT ON COLUMN public.profiles.gender IS 'Género: hombre, mujer, otro';
COMMENT ON COLUMN public.profiles.birth_date IS 'Fecha de nacimiento';
COMMENT ON COLUMN public.profiles.height_cm IS 'Altura en centímetros';
COMMENT ON COLUMN public.profiles.weight_kg IS 'Peso en kilogramos';

-- =============================================================
-- RLS POLICIES (Row Level Security)
-- =============================================================
-- Nota: Solo se crean si no existen. Si ya tienes RLS configurado, 
-- estas políticas se añadirán sin conflicto.

-- Habilitar RLS si no está habilitado
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT - cada usuario puede ver solo su propio perfil
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can view own profile') THEN
    CREATE POLICY "Users can view own profile" ON public.profiles
      FOR SELECT
      USING (auth.uid() = id);
  END IF;
END $$;

-- Policy: UPDATE - cada usuario puede actualizar solo su propio perfil
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update own profile') THEN
    CREATE POLICY "Users can update own profile" ON public.profiles
      FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- Policy: INSERT - cada usuario puede insertar solo su propio perfil
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile') THEN
    CREATE POLICY "Users can insert own profile" ON public.profiles
      FOR INSERT
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;


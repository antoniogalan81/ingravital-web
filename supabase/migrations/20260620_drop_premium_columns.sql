-- Migración: Eliminar columnas Premium de public.profiles
-- Fecha: 2026-06-20
-- Descripción: La funcionalidad Premium se ha eliminado por completo del producto.
--   Esta migración borra ÚNICAMENTE las columnas relacionadas con Premium en
--   public.profiles. NO toca datos operativos ni de negocio (perfiles, usuarios,
--   operaciones inmobiliarias, tareas, finanzas, etc.).
-- IMPORTANTE: Es idempotente (se puede ejecutar varias veces sin error).
-- ⚠️ DESTRUCTIVA: en producción, aplicar solo con confirmación explícita.

-- Eliminar columna premium_active si existe
ALTER TABLE public.profiles DROP COLUMN IF EXISTS premium_active;

-- Eliminar columna premium_until si existe
ALTER TABLE public.profiles DROP COLUMN IF EXISTS premium_until;

-- Eliminar columna premium_source si existe
ALTER TABLE public.profiles DROP COLUMN IF EXISTS premium_source;

-- Nota: no existen tablas, políticas RLS, RPCs ni triggers específicos de Premium
-- en el esquema del repositorio. Las únicas referencias eran estas tres columnas.
-- No se elimina la tabla public.profiles (contiene datos de usuario no premium).

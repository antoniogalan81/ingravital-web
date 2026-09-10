-- scripts/purge-anonymous-test-users.sql
--
-- Purga los usuarios ANÓNIMOS que dejaron las verificaciones contra producción
-- (`e2e-investor-flow.mjs` y `adversarial-idor-probe.mjs`).
--
-- POR QUÉ HACE FALTA ESTO: esos scripts crean sesiones anónimas reales porque
-- `SUPABASE_SECRET_KEY` está marcada como **sensible** en Vercel y no se puede
-- recuperar, así que no hay forma de dar de alta usuarios con email ni de borrarlos
-- por la API de administración. Sus FILAS de datos sí las borran ellos mismos al
-- terminar (queda comprobado en su salida: «filas de prueba restantes: 0»); lo único
-- que queda son los registros vacíos de `auth.users`.
--
-- Ejecutar en el SQL Editor del Dashboard de Supabase.

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1 — MIRAR ANTES DE BORRAR. Ejecuta solo esto primero.
-- ─────────────────────────────────────────────────────────────────────────────
-- Debe salir `datos_asociados = 0` en todas las filas. Si alguna tuviera datos,
-- NO sigas: no sería un usuario de prueba.

select u.id,
       u.created_at,
       u.email,
       u.phone,
       (select count(*) from public.operaciones_inmobiliarias o where o.user_id = u.id)
     + (select count(*) from public.investment_opportunities p where p.owner_id = u.id)
     + (select count(*) from public.investor_contacts c where c.owner_id = u.id)
     + (select count(*) from public.opportunity_invitations i where i.owner_id = u.id)
     + (select count(*) from public.investments v where v.owner_id = u.id)
     + (select count(*) from public.balance_items b where b.user_id = u.id) as datos_asociados
  from auth.users u
 where u.is_anonymous = true
 order by u.created_at;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2 — BORRAR. Solo si el paso 1 mostró `datos_asociados = 0` en todas.
-- ─────────────────────────────────────────────────────────────────────────────
-- El `where` repite la condición de seguridad: aunque la lista del paso 1 se quedara
-- obsoleta, aquí no se borra ningún usuario que tenga datos colgando.

delete from auth.users u
 where u.is_anonymous = true
   and not exists (select 1 from public.operaciones_inmobiliarias o where o.user_id = u.id)
   and not exists (select 1 from public.investment_opportunities p where p.owner_id = u.id)
   and not exists (select 1 from public.investor_contacts c where c.owner_id = u.id)
   and not exists (select 1 from public.opportunity_invitations i where i.owner_id = u.id)
   and not exists (select 1 from public.investments v where v.owner_id = u.id)
   and not exists (select 1 from public.balance_items b where b.user_id = u.id);

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 3 — COMPROBAR. Debe devolver 0.
-- ─────────────────────────────────────────────────────────────────────────────

select count(*) as anonimos_restantes from auth.users where is_anonymous = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- Si `auth.users` no tuviera la columna `is_anonymous` (versiones antiguas de
-- Supabase), los usuarios de prueba se reconocen igual: son los que NO tienen ni
-- email ni teléfono.
--
--   select id, created_at from auth.users
--    where email is null and phone is null
--    order by created_at;
--
-- Comprueba antes, con la consulta del PASO 1, que no tienen datos asociados.
-- ─────────────────────────────────────────────────────────────────────────────

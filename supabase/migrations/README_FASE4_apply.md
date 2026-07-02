# Fase 4 — Aplicar backend de Storage + Shares (manual)

Este repo NO tiene Supabase CLI enlazado ni credenciales privilegiadas
(service_role / DB password), por lo que las migraciones se aplican **a mano** en
el proyecto Supabase correcto (el mismo que usa `NEXT_PUBLIC_SUPABASE_URL`).

Todas las migraciones son **aditivas e idempotentes** (no hacen DROP/DELETE/TRUNCATE).

## Pasos (Supabase Dashboard → SQL Editor)

1. Abre el proyecto Supabase de Invergravital (el de `NEXT_PUBLIC_SUPABASE_URL`).
2. SQL Editor → pega y ejecuta, en este orden:
   1. `20260702_investment_shares.sql`  (tabla `investment_shares` + índices + RLS)
   2. `20260702_investment_storage.sql` (buckets privados + políticas de Storage)
3. Verifica:
   - Table Editor → existe `public.investment_shares` con RLS activa.
   - Storage → existen los buckets **privados** `investment-media` y `investment-documents`.
   - Storage → Policies: owner CRUD + inversor read (media/docs) por share activo.

## Verificación funcional (tras aplicar)

- Como **propietario** (logueado): Seguimiento → Media → "Subir foto/vídeo" (sube y
  se ve); Económico → factura → subir/ver/quitar; Inversores → Compartir → "Dar
  acceso" a un email → aparece en la lista.
- Como **inversor** (logueado con ese email): entra en `/inversor` → ve el snapshot
  filtrado (solo lo visible) y los archivos permitidos; NO ve datos ocultos.
- Revoca el acceso → el inversor deja de verlo.

## Notas de seguridad

- Buckets **privados**; los archivos se sirven con **signed URL** temporal.
- El inversor **nunca** recibe el JSON completo de la operación: solo el **snapshot**
  publicado (`investment_shares.payload`), ya filtrado por visibilidad en el cliente
  del propietario. El acceso está limitado server-side por RLS (email/uid del inversor).
- No se abre SELECT global ni buckets públicos. No se toca la RLS de
  `operaciones_inmobiliarias`.

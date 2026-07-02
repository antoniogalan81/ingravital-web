-- 20260702_investment_storage.sql
-- Fase 4 — Storage real para inversiones. ADITIVO e IDEMPOTENTE.
-- Buckets PRIVADOS (public=false). Rutas: `${ownerId}/${operationId}/media/...`
-- y `${ownerId}/${operationId}/expenses/${expenseId}/...`.
-- No hace público ningún bucket. No borra objetos ni buckets existentes.
--
-- Acceso:
--   · Propietario: CRUD sobre sus propios objetos (primer segmento = su uid).
--   · Inversor: SOLO lectura, y solo si existe un share ACTIVO no caducado sobre esa
--     operación asignado a su email/uid, y la visibilidad del tipo lo permite
--     (media → visibility.media ; documentos/facturas → visibility.facturas).

-- Buckets privados (idempotente).
insert into storage.buckets (id, name, public)
  values ('investment-media', 'investment-media', false)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('investment-documents', 'investment-documents', false)
  on conflict (id) do nothing;

-- Policies sobre storage.objects (idempotentes vía pg_policies).
do $$ begin
  -- ── Propietario: CRUD de sus objetos en ambos buckets ──
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='inv storage: owner select') then
    create policy "inv storage: owner select" on storage.objects for select to authenticated
      using (bucket_id in ('investment-media','investment-documents') and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='inv storage: owner insert') then
    create policy "inv storage: owner insert" on storage.objects for insert to authenticated
      with check (bucket_id in ('investment-media','investment-documents') and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='inv storage: owner update') then
    create policy "inv storage: owner update" on storage.objects for update to authenticated
      using (bucket_id in ('investment-media','investment-documents') and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id in ('investment-media','investment-documents') and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='inv storage: owner delete') then
    create policy "inv storage: owner delete" on storage.objects for delete to authenticated
      using (bucket_id in ('investment-media','investment-documents') and (storage.foldername(name))[1] = auth.uid()::text);
  end if;

  -- ── Inversor: lectura de MEDIA si hay share activo con visibility.media ──
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='inv storage: investor read media') then
    create policy "inv storage: investor read media" on storage.objects for select to authenticated
      using (
        bucket_id = 'investment-media'
        and exists (
          select 1 from public.investment_shares s
          where s.status = 'active'
            and (s.expires_at is null or s.expires_at > now())
            and s.owner_id::text = (storage.foldername(name))[1]
            and s.operation_id     = (storage.foldername(name))[2]
            and (s.investor_user_id = auth.uid() or lower(s.investor_email) = lower(auth.jwt() ->> 'email'))
            and coalesce((s.visibility ->> 'media')::boolean, false)
        )
      );
  end if;

  -- ── Inversor: lectura de DOCUMENTOS/facturas si hay share activo con visibility.facturas ──
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='inv storage: investor read docs') then
    create policy "inv storage: investor read docs" on storage.objects for select to authenticated
      using (
        bucket_id = 'investment-documents'
        and exists (
          select 1 from public.investment_shares s
          where s.status = 'active'
            and (s.expires_at is null or s.expires_at > now())
            and s.owner_id::text = (storage.foldername(name))[1]
            and s.operation_id     = (storage.foldername(name))[2]
            and (s.investor_user_id = auth.uid() or lower(s.investor_email) = lower(auth.jwt() ->> 'email'))
            and coalesce((s.visibility ->> 'facturas')::boolean, false)
        )
      );
  end if;
end $$;

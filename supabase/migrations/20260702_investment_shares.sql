-- 20260702_investment_shares.sql
-- Fase 4 — Compartir inversiones con inversores. ADITIVO e IDEMPOTENTE.
-- No hace DROP/TRUNCATE/DELETE. Sigue el patrón RLS del repo (auth.uid() = owner).
--
-- Modelo seguro (snapshot): el propietario publica en `payload` una vista ya
-- filtrada por visibilidad (computada en su cliente, que sí ve todo). El inversor
-- SOLO puede leer el snapshot de sus shares activos (RLS por email/uid). Nunca
-- accede al JSON completo de la operación (operaciones_inmobiliarias) — su RLS
-- por user_id se mantiene intacta y NO se abre.

create extension if not exists pgcrypto;

create table if not exists public.investment_shares (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  operation_id      text not null,
  investor_email    text,
  investor_user_id  uuid references auth.users(id) on delete set null,
  token             text unique,
  status            text not null default 'active',
  permissions       jsonb not null default '{}'::jsonb,
  visibility        jsonb not null default '{}'::jsonb,
  payload           jsonb not null default '{}'::jsonb,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.investment_shares is
  'Compartición de una operación con un inversor. payload = snapshot filtrado por visibilidad (no expone el JSON completo de la operación).';

create index if not exists investment_shares_owner_idx      on public.investment_shares (owner_id);
create index if not exists investment_shares_operation_idx  on public.investment_shares (operation_id);
create index if not exists investment_shares_investor_idx   on public.investment_shares (investor_user_id);
create index if not exists investment_shares_email_idx      on public.investment_shares (lower(investor_email));
create index if not exists investment_shares_token_idx      on public.investment_shares (token);
create index if not exists investment_shares_status_idx     on public.investment_shares (status);

-- updated_at automático
create or replace function public.set_investment_shares_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_investment_shares_updated_at on public.investment_shares;
create trigger trg_investment_shares_updated_at
  before update on public.investment_shares
  for each row execute function public.set_investment_shares_updated_at();

-- Grants coherentes con el repo (anon sin acceso; authenticated con RLS).
revoke all on table public.investment_shares from anon;
grant select, insert, update, delete on table public.investment_shares to authenticated;

-- RLS
alter table public.investment_shares enable row level security;

-- Propietario: CRUD completo de SUS shares.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='investment_shares' and policyname='inv_shares: owner select') then
    create policy "inv_shares: owner select" on public.investment_shares for select using (auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='investment_shares' and policyname='inv_shares: owner insert') then
    create policy "inv_shares: owner insert" on public.investment_shares for insert with check (auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='investment_shares' and policyname='inv_shares: owner update') then
    create policy "inv_shares: owner update" on public.investment_shares for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='investment_shares' and policyname='inv_shares: owner delete') then
    create policy "inv_shares: owner delete" on public.investment_shares for delete using (auth.uid() = owner_id);
  end if;
  -- Inversor: SOLO lectura de shares ACTIVOS no caducados asignados a su email o uid.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='investment_shares' and policyname='inv_shares: investor read') then
    create policy "inv_shares: investor read" on public.investment_shares for select using (
      status = 'active'
      and (expires_at is null or expires_at > now())
      and (
        investor_user_id = auth.uid()
        or lower(investor_email) = lower(auth.jwt() ->> 'email')
      )
    );
  end if;
end $$;

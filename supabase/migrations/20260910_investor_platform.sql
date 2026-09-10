-- 20260910_investor_platform.sql
-- Plataforma de INVERSORES: roles, CRM de contactos, oportunidades, invitaciones,
-- inversiones reales y trazabilidad. ADITIVO e IDEMPOTENTE.
--
-- NO hace DROP / DELETE / TRUNCATE. No modifica ni abre la RLS de
-- `operaciones_inmobiliarias` (sigue siendo owner-only). No toca `investment_shares`
-- salvo para leerla en el backfill opcional del final.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PRINCIPIO DE SEGURIDAD CENTRAL
--
-- El inversor NUNCA lee `operaciones_inmobiliarias` ni `investment_opportunities`
-- (esta última contiene `internal_notes` y el resto de datos internos del promotor).
-- Todo lo que ve pasa por `public.get_investor_snapshot(token)`, una función
-- SECURITY DEFINER que aplica la visibilidad **en el momento de la lectura**.
--
-- Consecuencia deliberada: si el promotor apaga un dato, el inversor deja de verlo
-- de inmediato. No hay que "republicar" nada. (Corrige el defecto D8 de docs/INVERSORES.md.)
--
-- Ver docs/INVERSORES.md para el modelo completo.

create extension if not exists pgcrypto;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1) ROLES — una cuenta, varios roles
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.user_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('promotor', 'inversor')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

comment on table public.user_roles is
  'Roles de una cuenta. Una misma persona puede ser promotor e inversor a la vez.';

create index if not exists user_roles_role_idx on public.user_roles (role);

-- Helper para usar DENTRO de policies sin provocar recursión de RLS.
create or replace function public.has_role(p_user uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_user and ur.role = p_role
  );
$$;

revoke all on function public.has_role(uuid, text) from public, anon;
grant execute on function public.has_role(uuid, text) to authenticated;

alter table public.user_roles enable row level security;
revoke all on table public.user_roles from anon;
grant select, insert on table public.user_roles to authenticated;

do $$ begin
  -- Cada usuario ve y se concede sus propios roles. No puede escribir los de otro.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_roles' and policyname='user_roles: self select') then
    create policy "user_roles: self select" on public.user_roles
      for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_roles' and policyname='user_roles: self insert') then
    create policy "user_roles: self insert" on public.user_roles
      for insert with check (auth.uid() = user_id);
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2) NORMALIZACIÓN de email y teléfono (una sola definición, usada por triggers)
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.norm_email(p text)
returns text language sql immutable as $$
  select nullif(lower(btrim(coalesce(p, ''))), '');
$$;

-- Teléfono a E.164 asumiendo España cuando no hay prefijo internacional.
-- Deliberadamente simple: quita separadores, respeta '+', y antepone +34 a los
-- nueve dígitos nacionales. No pretende validar numeración de todos los países.
create or replace function public.norm_phone(p text)
returns text language plpgsql immutable as $$
declare
  digits text;
  raw    text;
begin
  raw := btrim(coalesce(p, ''));
  if raw = '' then return null; end if;

  if left(raw, 2) = '00' then
    raw := '+' || substr(raw, 3);
  end if;

  digits := regexp_replace(raw, '[^0-9]', '', 'g');
  if digits = '' then return null; end if;

  if left(raw, 1) = '+' then
    return '+' || digits;
  end if;

  if length(digits) = 9 then
    return '+34' || digits;
  end if;

  if length(digits) > 9 and left(digits, 2) = '34' then
    return '+' || digits;
  end if;

  return '+' || digits;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3) CRM — contactos del promotor
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.investor_contacts (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  first_name     text not null,
  last_name      text,
  email          text,
  phone          text,
  whatsapp       text,
  notes          text,
  status         text not null default 'nuevo'
                 check (status in ('nuevo','contactado','interesado','inversor','descartado')),
  source         text,
  linked_user_id uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Un contacto sirve para algo solo si se le puede escribir o llamar.
  constraint investor_contacts_reachable check (email is not null or phone is not null)
);

comment on table public.investor_contacts is
  'CRM de contactos/inversores del promotor. Un contacto NO es un usuario: linked_user_id se rellena cuando esa persona se registra.';
comment on column public.investor_contacts.linked_user_id is
  'Vínculo estable contacto->usuario. Es el identificador que manda, no la comparación de emails.';

create index if not exists investor_contacts_owner_idx  on public.investor_contacts (owner_id);
create index if not exists investor_contacts_linked_idx on public.investor_contacts (linked_user_id);
create index if not exists investor_contacts_email_idx  on public.investor_contacts (email);
create index if not exists investor_contacts_phone_idx  on public.investor_contacts (phone);

-- Deduplicación: dentro de un mismo promotor, un email o un teléfono es único.
create unique index if not exists investor_contacts_owner_email_uq
  on public.investor_contacts (owner_id, email) where email is not null;
create unique index if not exists investor_contacts_owner_phone_uq
  on public.investor_contacts (owner_id, phone) where phone is not null;

create or replace function public.tg_investor_contacts_normalize()
returns trigger language plpgsql as $$
begin
  new.email    := public.norm_email(new.email);
  new.phone    := public.norm_phone(new.phone);
  new.whatsapp := public.norm_phone(coalesce(new.whatsapp, new.phone));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_investor_contacts_normalize on public.investor_contacts;
create trigger trg_investor_contacts_normalize
  before insert or update on public.investor_contacts
  for each row execute function public.tg_investor_contacts_normalize();

alter table public.investor_contacts enable row level security;
revoke all on table public.investor_contacts from anon;
grant select, insert, update, delete on table public.investor_contacts to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='investor_contacts' and policyname='contacts: owner all') then
    create policy "contacts: owner all" on public.investor_contacts
      for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;
  -- El contacto vinculado puede LEER su propia ficha (para su perfil de inversor).
  -- No puede editarla ni ver las notas internas: la lectura del inversor va por RPC.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='investor_contacts' and policyname='contacts: linked self read') then
    create policy "contacts: linked self read" on public.investor_contacts
      for select using (linked_user_id = auth.uid());
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4) OPORTUNIDADES — la oferta estructurada a partir de una operación
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.investment_opportunities (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade,
  operation_id       uuid not null,
  status             text not null default 'borrador'
                     check (status in ('borrador','publicada','en_captacion','cubierta','cerrada','liquidada')),

  -- Ficha comercial (lo que el inversor puede llegar a ver)
  title              text not null,
  location           text,
  summary            text,
  strategy           text,
  risks              text,

  -- Datos INTERNOS: nunca salen por get_investor_snapshot()
  internal_notes     text,

  -- Estructura económica de la oferta
  target_capital     numeric,
  min_ticket         numeric,
  target_ticket      numeric,
  max_ticket         numeric,
  offered_yield_pct  numeric,
  term_months        integer,
  start_date         date,
  return_date        date,
  investment_model   text default 'prestamo'
                     check (investment_model in ('prestamo','participacion','mixto','otro')),
  conditions         text,
  guarantee          text,
  guarantee_rank     text,
  early_cancellation text,

  -- KPIs ya computados por el cliente del promotor (calcResults). Se recalculan al
  -- guardar la operación. Nunca contienen inputs sensibles: solo resultados.
  metrics            jsonb not null default '{}'::jsonb,

  -- Visibilidad por defecto para las invitaciones nuevas de esta oportunidad.
  visibility         jsonb not null default '{}'::jsonb,

  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint investment_opportunities_owner_operation_uq unique (owner_id, operation_id)
);

comment on table public.investment_opportunities is
  'Oferta para inversores construida sobre una operacion_inmobiliaria. Una operación NO es una oportunidad hasta que existe esta fila.';
comment on column public.investment_opportunities.internal_notes is
  'DATO INTERNO. get_investor_snapshot() nunca lo devuelve.';
comment on column public.investment_opportunities.metrics is
  'KPIs ya calculados (no inputs). Lo que se filtra por visibilidad al leer.';

create index if not exists inv_opp_owner_idx     on public.investment_opportunities (owner_id);
create index if not exists inv_opp_operation_idx on public.investment_opportunities (operation_id);
create index if not exists inv_opp_status_idx    on public.investment_opportunities (status);

alter table public.investment_opportunities enable row level security;
revoke all on table public.investment_opportunities from anon;
grant select, insert, update, delete on table public.investment_opportunities to authenticated;

do $$ begin
  -- SOLO el propietario. El inversor no tiene ninguna policy de lectura aquí: su
  -- acceso pasa exclusivamente por get_investor_snapshot().
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='investment_opportunities' and policyname='opportunities: owner all') then
    create policy "opportunities: owner all" on public.investment_opportunities
      for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5) INVITACIONES — una por destinatario y canal, con trazabilidad
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.opportunity_invitations (
  id               uuid primary key default gen_random_uuid(),
  opportunity_id   uuid not null references public.investment_opportunities(id) on delete cascade,
  owner_id         uuid not null references auth.users(id) on delete cascade,
  contact_id       uuid references public.investor_contacts(id) on delete set null,

  channel          text not null default 'link' check (channel in ('whatsapp','email','link')),
  token            text not null unique,

  status           text not null default 'pendiente'
                   check (status in ('pendiente','enviada','vista','interesado','descartada','revocada','caducada')),

  -- Identidad esperada del destinatario (normalizada). Sirve para reclamar la invitación.
  invited_email    text,
  invited_phone    text,
  investor_user_id uuid references auth.users(id) on delete set null,

  -- Visibilidad EFECTIVA de esta invitación. Es la autoridad en tiempo de lectura.
  visibility       jsonb not null default '{}'::jsonb,

  -- Trazabilidad
  sent_at          timestamptz,
  first_viewed_at  timestamptz,
  last_viewed_at   timestamptz,
  view_count       integer not null default 0,

  -- Interés (NO es compromiso económico)
  interest         text check (interest in ('interesado','mas_info','descartada')),
  interest_at      timestamptz,
  interest_note    text,

  expires_at       timestamptz,
  revoked_at       timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint opportunity_invitations_addressable
    check (invited_email is not null or invited_phone is not null or contact_id is not null)
);

comment on table public.opportunity_invitations is
  'Invitación individual a una oportunidad. Recibirla NO otorga participación económica: eso es public.investments.';
comment on column public.opportunity_invitations.token is
  'Identifica la oportunidad en el enlace. NO autentica: tras abrirlo hay que identificarse por magic link u OTP.';
comment on column public.opportunity_invitations.visibility is
  'Autoridad en tiempo de lectura. Cambiarla surte efecto inmediato (no hay snapshot que republicar).';

create index if not exists opp_inv_opportunity_idx on public.opportunity_invitations (opportunity_id);
create index if not exists opp_inv_owner_idx       on public.opportunity_invitations (owner_id);
create index if not exists opp_inv_contact_idx     on public.opportunity_invitations (contact_id);
create index if not exists opp_inv_user_idx        on public.opportunity_invitations (investor_user_id);
create index if not exists opp_inv_email_idx       on public.opportunity_invitations (invited_email);
create index if not exists opp_inv_phone_idx       on public.opportunity_invitations (invited_phone);
create index if not exists opp_inv_status_idx      on public.opportunity_invitations (status);

create or replace function public.tg_opportunity_invitations_normalize()
returns trigger language plpgsql as $$
begin
  new.invited_email := public.norm_email(new.invited_email);
  new.invited_phone := public.norm_phone(new.invited_phone);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_opportunity_invitations_normalize on public.opportunity_invitations;
create trigger trg_opportunity_invitations_normalize
  before insert or update on public.opportunity_invitations
  for each row execute function public.tg_opportunity_invitations_normalize();

alter table public.opportunity_invitations enable row level security;
revoke all on table public.opportunity_invitations from anon;
grant select, insert, update, delete on table public.opportunity_invitations to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='opportunity_invitations' and policyname='invitations: owner all') then
    create policy "invitations: owner all" on public.opportunity_invitations
      for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;

  -- El inversor lee SOLO sus invitaciones vivas. Nunca las de otro inversor.
  -- Ojo: esto expone la fila de invitación (visibilidad, fechas), no la oportunidad.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='opportunity_invitations' and policyname='invitations: investor read own') then
    create policy "invitations: investor read own" on public.opportunity_invitations
      for select using (
        revoked_at is null
        and (expires_at is null or expires_at > now())
        and status <> 'revocada'
        and investor_user_id = auth.uid()
      );
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6) INVERSIONES REALES — capital efectivamente aportado
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.investments (
  id                   uuid primary key default gen_random_uuid(),
  opportunity_id       uuid not null references public.investment_opportunities(id) on delete cascade,
  owner_id             uuid not null references auth.users(id) on delete cascade,
  contact_id           uuid references public.investor_contacts(id) on delete set null,
  investor_user_id     uuid references auth.users(id) on delete set null,

  amount               numeric not null check (amount > 0),
  invested_at          date,
  agreed_yield_pct     numeric,
  term_months          integer,
  expected_return_date date,
  guarantee            text,
  conditions           text,

  status               text not null default 'comprometida'
                       check (status in ('comprometida','desembolsada','activa','liquidada','cancelada')),

  -- Liquidación
  final_yield_pct      numeric,
  returned_amount      numeric,
  returned_at          date,

  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.investments is
  'Inversión REAL. Solo el promotor la crea, y solo tras acordar la participación. Alimenta "Mis inversiones" del inversor.';

create index if not exists investments_opportunity_idx on public.investments (opportunity_id);
create index if not exists investments_owner_idx       on public.investments (owner_id);
create index if not exists investments_user_idx        on public.investments (investor_user_id);
create index if not exists investments_contact_idx     on public.investments (contact_id);
create index if not exists investments_status_idx      on public.investments (status);

alter table public.investments enable row level security;
revoke all on table public.investments from anon;
grant select, insert, update, delete on table public.investments to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='investments' and policyname='investments: owner all') then
    create policy "investments: owner all" on public.investments
      for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;
  -- El inversor lee SOLO las suyas.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='investments' and policyname='investments: investor read own') then
    create policy "investments: investor read own" on public.investments
      for select using (investor_user_id = auth.uid());
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7) ACTIVIDAD — trazabilidad funcional (quién, qué, cuándo)
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.investment_activity (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid references public.investment_opportunities(id) on delete cascade,
  invitation_id  uuid references public.opportunity_invitations(id) on delete set null,
  investment_id  uuid references public.investments(id) on delete set null,
  actor_user_id  uuid references auth.users(id) on delete set null,
  kind           text not null
                 check (kind in ('creada','compartida','enviada','vista','interes','invertida','actualizada','revocada','liquidada')),
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists inv_activity_owner_idx       on public.investment_activity (owner_id, created_at desc);
create index if not exists inv_activity_opportunity_idx on public.investment_activity (opportunity_id);

alter table public.investment_activity enable row level security;
revoke all on table public.investment_activity from anon;
grant select, insert on table public.investment_activity to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='investment_activity' and policyname='activity: owner read') then
    create policy "activity: owner read" on public.investment_activity
      for select using (auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='investment_activity' and policyname='activity: owner insert') then
    create policy "activity: owner insert" on public.investment_activity
      for insert with check (auth.uid() = owner_id);
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 8) updated_at automático (una función para todas)
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['investment_opportunities', 'investments'] loop
    execute format('drop trigger if exists trg_touch_updated_at on public.%I', t);
    execute format(
      'create trigger trg_touch_updated_at before update on public.%I
       for each row execute function public.tg_touch_updated_at()', t);
  end loop;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 9) RECLAMAR UNA INVITACIÓN — vincula contacto <-> usuario por UUID estable
-- ═════════════════════════════════════════════════════════════════════════════
--
-- El usuario recién identificado (magic link u OTP) llama a esta función con el
-- token del enlace. Solo se le asigna la invitación si su identidad verificada
-- (email o teléfono del JWT) coincide con la del destinatario. A partir de ahí
-- manda `investor_user_id` y no se vuelve a comparar strings.

create or replace function public.claim_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv     public.opportunity_invitations%rowtype;
  v_uid     uuid := auth.uid();
  v_email   text := public.norm_email(auth.jwt() ->> 'email');
  v_phone   text := public.norm_phone(auth.jwt() ->> 'phone');
  v_matches boolean;
begin
  if v_uid is null then
    raise exception 'No hay sesión activa' using errcode = '28000';
  end if;

  select * into v_inv from public.opportunity_invitations where token = p_token;
  if not found then
    raise exception 'Invitación no encontrada' using errcode = 'P0002';
  end if;

  if v_inv.revoked_at is not null or v_inv.status = 'revocada' then
    raise exception 'Invitación revocada' using errcode = 'P0002';
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    raise exception 'Invitación caducada' using errcode = 'P0002';
  end if;

  -- Ya reclamada por otra persona: no se transfiere jamás.
  if v_inv.investor_user_id is not null and v_inv.investor_user_id <> v_uid then
    raise exception 'Invitación ya asignada a otro usuario' using errcode = '42501';
  end if;

  v_matches :=
       (v_inv.invited_email is not null and v_email is not null and v_inv.invited_email = v_email)
    or (v_inv.invited_phone is not null and v_phone is not null and v_inv.invited_phone = v_phone);

  if not v_matches and v_inv.investor_user_id is distinct from v_uid then
    raise exception 'La identidad verificada no coincide con la del destinatario'
      using errcode = '42501';
  end if;

  update public.opportunity_invitations
     set investor_user_id = v_uid,
         status = case when status = 'pendiente' then 'enviada' else status end,
         updated_at = now()
   where id = v_inv.id;

  -- Vincula el contacto del CRM con el usuario (A4). Idempotente.
  if v_inv.contact_id is not null then
    update public.investor_contacts
       set linked_user_id = v_uid
     where id = v_inv.contact_id
       and (linked_user_id is null or linked_user_id = v_uid);
  end if;

  -- Toda persona que reclama una invitación es, por definición, inversora.
  insert into public.user_roles (user_id, role)
  values (v_uid, 'inversor')
  on conflict do nothing;

  -- Las inversiones ya registradas para ese contacto pasan a ser visibles para él.
  if v_inv.contact_id is not null then
    update public.investments
       set investor_user_id = v_uid
     where contact_id = v_inv.contact_id and investor_user_id is null;
  end if;

  return v_inv.id;
end;
$$;

revoke all on function public.claim_invitation(text) from public, anon;
grant execute on function public.claim_invitation(text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 10) LECTURA DEL INVERSOR — filtrado por visibilidad EN TIEMPO DE LECTURA
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Única puerta de entrada del inversor a los datos de una oportunidad.
-- Devuelve exclusivamente lo que la visibilidad vigente permite. No devuelve
-- `internal_notes` ni ningún input sensible de la operación bajo ninguna condición.

create or replace function public.get_investor_snapshot(p_invitation uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv  public.opportunity_invitations%rowtype;
  v_opp  public.investment_opportunities%rowtype;
  v_vis  jsonb;
  v_m    jsonb;
  v_out  jsonb;
  v_uid  uuid := auth.uid();

begin
  if v_uid is null then
    raise exception 'No hay sesión activa' using errcode = '28000';
  end if;

  select * into v_inv
    from public.opportunity_invitations
   where id = p_invitation and investor_user_id = v_uid;

  if not found then
    raise exception 'Sin acceso a esta oportunidad' using errcode = '42501';
  end if;
  if v_inv.revoked_at is not null or v_inv.status = 'revocada' then
    raise exception 'Acceso revocado' using errcode = '42501';
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    raise exception 'Acceso caducado' using errcode = '42501';
  end if;

  select * into v_opp from public.investment_opportunities where id = v_inv.opportunity_id;
  if not found then
    raise exception 'Oportunidad no encontrada' using errcode = 'P0002';
  end if;

  -- La visibilidad de la invitación manda; si está vacía, la de la oportunidad.
  v_vis := case when v_inv.visibility = '{}'::jsonb then v_opp.visibility else v_inv.visibility end;
  v_m   := coalesce(v_opp.metrics, '{}'::jsonb);

  -- Ficha comercial: siempre visible (es el objeto de la invitación).
  v_out := jsonb_build_object(
    'opportunityId',    v_opp.id,
    'invitationId',     v_inv.id,
    'title',            v_opp.title,
    'location',         v_opp.location,
    'summary',          v_opp.summary,
    'status',           v_opp.status,
    'investmentModel',  v_opp.investment_model,
    'targetCapital',    v_opp.target_capital,
    'minTicket',        v_opp.min_ticket,
    'targetTicket',     v_opp.target_ticket,
    'maxTicket',        v_opp.max_ticket,
    'offeredYieldPct',  v_opp.offered_yield_pct,
    'termMonths',       v_opp.term_months,
    'startDate',        v_opp.start_date,
    'returnDate',       v_opp.return_date,
    'guarantee',        v_opp.guarantee,
    'guaranteeRank',    v_opp.guarantee_rank,
    'earlyCancellation',v_opp.early_cancellation,
    'conditions',       v_opp.conditions,
    'generatedAt',      now()
  );

  -- Bloques opcionales: SOLO si la visibilidad vigente los permite.
  if coalesce((v_vis ->> 'estrategia')::boolean, false) then
    v_out := v_out || jsonb_build_object('strategy', v_opp.strategy);
  end if;
  if coalesce((v_vis ->> 'riesgos')::boolean, false) then
    v_out := v_out || jsonb_build_object('risks', v_opp.risks);
  end if;
  if coalesce((v_vis ->> 'progreso')::boolean, false) then
    v_out := v_out || jsonb_build_object('progreso', v_m -> 'progreso');
  end if;
  if coalesce((v_vis ->> 'hitos')::boolean, false) then
    v_out := v_out || jsonb_build_object('hitos', v_m -> 'hitos');
  end if;
  if coalesce((v_vis ->> 'media')::boolean, false) then
    v_out := v_out || jsonb_build_object('media', v_m -> 'media');
  end if;
  if coalesce((v_vis ->> 'ventas')::boolean, false) then
    v_out := v_out || jsonb_build_object(
      'ventas',
      case when coalesce((v_vis ->> 'ventasPrecios')::boolean, false)
           then v_m -> 'ventas'
           else v_m -> 'ventasSinPrecios' end);
  end if;
  if coalesce((v_vis ->> 'gastos')::boolean, false) then
    v_out := v_out || jsonb_build_object(
      'gastos',
      case when coalesce((v_vis ->> 'gastosImportes')::boolean, false)
           then v_m -> 'gastos'
           else v_m -> 'gastosSinImportes' end);
  end if;
  if coalesce((v_vis ->> 'costesTotales')::boolean, false) then
    v_out := v_out || jsonb_build_object('costesTotales', v_m -> 'costesTotales');
  end if;
  if coalesce((v_vis ->> 'ingresos')::boolean, false) then
    v_out := v_out || jsonb_build_object('ingresos', v_m -> 'ingresos');
  end if;
  if coalesce((v_vis ->> 'pendientePago')::boolean, false) then
    v_out := v_out || jsonb_build_object(
      'pendientePago',  v_m -> 'pendientePago',
      'pendienteCobro', v_m -> 'pendienteCobro');
  end if;
  if coalesce((v_vis ->> 'rentabilidadEstimada')::boolean, false) then
    v_out := v_out || jsonb_build_object('rentabilidadEstimada', v_m -> 'rentabilidadEstimada');
  end if;
  if coalesce((v_vis ->> 'rentabilidadReal')::boolean, false) then
    v_out := v_out || jsonb_build_object('rentabilidadReal', v_m -> 'rentabilidadReal');
  end if;
  if coalesce((v_vis ->> 'rentabilidadInversor')::boolean, false) then
    v_out := v_out || jsonb_build_object('rentabilidadInversor', v_m -> 'rentabilidadInversor');
  end if;
  -- `rentabilidadPromotor` es dato del promotor: solo si se activa explícitamente.
  if coalesce((v_vis ->> 'rentabilidadPromotor')::boolean, false) then
    v_out := v_out || jsonb_build_object('rentabilidadPromotor', v_m -> 'rentabilidadPromotor');
  end if;

  -- Estado de captación calculado sobre inversiones REALES (nunca cifras inventadas).
  if coalesce((v_vis ->> 'estadoCaptacion')::boolean, false) then
    v_out := v_out || jsonb_build_object(
      'captacion',
      (select jsonb_build_object(
                'comprometido', coalesce(sum(amount) filter (where status = 'comprometida'), 0),
                'invertido',    coalesce(sum(amount) filter (where status in ('desembolsada','activa','liquidada')), 0),
                'inversores',   count(*) filter (where status <> 'cancelada'))
         from public.investments where opportunity_id = v_opp.id));
  end if;

  return v_out;
end;
$$;

revoke all on function public.get_investor_snapshot(uuid) from public, anon;
grant execute on function public.get_investor_snapshot(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 10b) LISTADO del inversor — cabeceras de sus oportunidades en UNA llamada
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Devuelve solo lo imprescindible para pintar la lista. Los datos sensibles siguen
-- pasando por get_investor_snapshot(): aquí no se expone ninguno, ni siquiera si el
-- promotor los tuviera activados.

create or replace function public.list_my_investor_opportunities()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x order by x ->> 'updatedAt' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'invitationId',    i.id,
             'opportunityId',   o.id,
             'title',           o.title,
             'location',        o.location,
             'summary',         o.summary,
             'status',          o.status,
             'investmentModel', o.investment_model,
             'offeredYieldPct', o.offered_yield_pct,
             'termMonths',      o.term_months,
             'minTicket',       o.min_ticket,
             'targetCapital',   o.target_capital,
             'interest',        i.interest,
             'firstViewedAt',   i.first_viewed_at,
             'expiresAt',       i.expires_at,
             'updatedAt',       i.updated_at
           ) as x
      from public.opportunity_invitations i
      join public.investment_opportunities o on o.id = i.opportunity_id
     where i.investor_user_id = auth.uid()
       and i.revoked_at is null
       and i.status <> 'revocada'
       and (i.expires_at is null or i.expires_at > now())
  ) t;
$$;

revoke all on function public.list_my_investor_opportunities() from public, anon;
grant execute on function public.list_my_investor_opportunities() to authenticated;

-- Inversiones del inversor con el nombre del proyecto (la RLS de `investments` ya
-- filtra, pero el título vive en una tabla que el inversor no puede leer).
create or replace function public.list_my_investments()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x order by x ->> 'createdAt' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'id',                 v.id,
             'opportunityId',      o.id,
             'title',              o.title,
             'location',           o.location,
             'amount',             v.amount,
             'status',             v.status,
             'investedAt',         v.invested_at,
             'agreedYieldPct',     v.agreed_yield_pct,
             'termMonths',         v.term_months,
             'expectedReturnDate', v.expected_return_date,
             'guarantee',          v.guarantee,
             'conditions',         v.conditions,
             'finalYieldPct',      v.final_yield_pct,
             'returnedAmount',     v.returned_amount,
             'returnedAt',         v.returned_at,
             'createdAt',          v.created_at,
             'invitationId',       (select i.id from public.opportunity_invitations i
                                     where i.opportunity_id = o.id
                                       and i.investor_user_id = auth.uid()
                                       and i.revoked_at is null
                                     order by i.updated_at desc limit 1)
           ) as x
      from public.investments v
      join public.investment_opportunities o on o.id = v.opportunity_id
     where v.investor_user_id = auth.uid()
  ) t;
$$;

revoke all on function public.list_my_investments() from public, anon;
grant execute on function public.list_my_investments() to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 11) REGISTRAR VISTA E INTERÉS (el inversor no puede escribir la fila directamente)
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.register_invitation_view(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No hay sesión activa' using errcode = '28000';
  end if;

  update public.opportunity_invitations
     set first_viewed_at = coalesce(first_viewed_at, now()),
         last_viewed_at  = now(),
         view_count      = view_count + 1,
         status          = case when status in ('pendiente','enviada') then 'vista' else status end,
         updated_at      = now()
   where id = p_invitation
     and investor_user_id = v_uid
     and revoked_at is null
     and (expires_at is null or expires_at > now());

  if found then
    insert into public.investment_activity (owner_id, opportunity_id, invitation_id, actor_user_id, kind)
    select owner_id, opportunity_id, id, v_uid, 'vista'
      from public.opportunity_invitations where id = p_invitation;
  end if;
end;
$$;

revoke all on function public.register_invitation_view(uuid) from public, anon;
grant execute on function public.register_invitation_view(uuid) to authenticated;

create or replace function public.set_invitation_interest(p_invitation uuid, p_interest text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No hay sesión activa' using errcode = '28000';
  end if;
  if p_interest not in ('interesado', 'mas_info', 'descartada') then
    raise exception 'Valor de interés no válido' using errcode = '22023';
  end if;

  update public.opportunity_invitations
     set interest      = p_interest,
         interest_at   = now(),
         interest_note = p_note,
         status        = case when p_interest = 'descartada' then 'descartada' else 'interesado' end,
         updated_at    = now()
   where id = p_invitation
     and investor_user_id = v_uid
     and revoked_at is null
     and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'Sin acceso a esta invitación' using errcode = '42501';
  end if;

  insert into public.investment_activity (owner_id, opportunity_id, invitation_id, actor_user_id, kind, detail)
  select owner_id, opportunity_id, id, v_uid, 'interes', jsonb_build_object('interest', p_interest)
    from public.opportunity_invitations where id = p_invitation;
end;
$$;

revoke all on function public.set_invitation_interest(uuid, text, text) from public, anon;
grant execute on function public.set_invitation_interest(uuid, text, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 12) STORAGE — el inversor lee archivos por INVITACIÓN o por INVERSIÓN vigente
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Se AÑADEN policies nuevas; las de 20260702_investment_storage.sql se conservan.
-- Ruta: `${ownerId}/${operationId}/…`  → foldername[1] = owner, [2] = operación.
-- La visibilidad se lee EN VIVO: revocar un toggle corta el acceso al archivo ya.
--
-- ⚠️ POR QUÉ ESTO ES UNA FUNCIÓN Y NO UN `exists (...)` DENTRO DE LA POLICY:
-- una subconsulta dentro de una policy se evalúa CON LA RLS DEL QUE LLAMA. El
-- inversor no tiene —deliberadamente— ninguna policy de lectura sobre
-- `investment_opportunities`, así que el join devolvía SIEMPRE 0 filas y la policy
-- denegaba incluso el acceso legítimo. Verificado con el banco de pruebas PGlite.
-- `security definer` evalúa la comprobación con permisos de la función, no del inversor.

create or replace function public.investor_can_read_file(
  p_owner     text,
  p_operation text,
  p_key       text  -- 'media' | 'facturas'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_opid  uuid;
  v_opp   public.investment_opportunities%rowtype;
  v_inv   public.opportunity_invitations%rowtype;
  v_has_inv        boolean := false;
  v_live_invite    boolean := false;
  v_live_investment boolean := false;
  v_vis   jsonb;
begin
  if v_uid is null then return false; end if;

  -- Rutas que no son UUID no pertenecen a este esquema de almacenamiento.
  begin
    v_owner := p_owner::uuid;
    v_opid  := p_operation::uuid;
  exception when others then
    return false;
  end;

  select * into v_opp
    from public.investment_opportunities
   where owner_id = v_owner and operation_id = v_opid;
  if not found then return false; end if;

  -- Invitación de ESTE inversor para ESTA oportunidad (la viva tiene prioridad).
  select * into v_inv
    from public.opportunity_invitations
   where opportunity_id = v_opp.id and investor_user_id = v_uid
   order by (revoked_at is null
             and status <> 'revocada'
             and (expires_at is null or expires_at > now())) desc,
            updated_at desc
   limit 1;
  v_has_inv := found;

  if v_has_inv then
    v_live_invite := v_inv.revoked_at is null
                 and v_inv.status <> 'revocada'
                 and (v_inv.expires_at is null or v_inv.expires_at > now());
  end if;

  -- Una inversión viva mantiene abierta la ventana de acceso aunque la invitación
  -- original haya caducado (el inversor debe poder seguir lo que financia).
  v_live_investment := exists (
    select 1 from public.investments
     where opportunity_id = v_opp.id
       and investor_user_id = v_uid
       and status in ('comprometida', 'desembolsada', 'activa'));

  if not (v_live_invite or v_live_investment) then
    return false;
  end if;

  -- REGLA ÚNICA DE VISIBILIDAD (la misma que aplica get_investor_snapshot):
  -- manda la de la invitación si existe y no está vacía; si no, la de la oportunidad.
  -- Así nunca hay dos fuentes compitiendo y el promotor conserva el control (req. 30).
  v_vis := case
             when v_has_inv and v_inv.visibility <> '{}'::jsonb then v_inv.visibility
             else v_opp.visibility
           end;

  return coalesce((v_vis ->> p_key)::boolean, false);
end;
$$;

revoke all on function public.investor_can_read_file(text, text, text) from public, anon;
grant execute on function public.investor_can_read_file(text, text, text) to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='inv storage: invitation read media') then
    create policy "inv storage: invitation read media" on storage.objects for select to authenticated
      using (
        bucket_id = 'investment-media'
        and public.investor_can_read_file(
              (storage.foldername(name))[1], (storage.foldername(name))[2], 'media')
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='inv storage: invitation read docs') then
    create policy "inv storage: invitation read docs" on storage.objects for select to authenticated
      using (
        bucket_id = 'investment-documents'
        and public.investor_can_read_file(
              (storage.foldername(name))[1], (storage.foldername(name))[2], 'facturas')
      );
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 13) HIGIENE: revocar el SELECT sobrante de `anon` sobre profiles
-- ═════════════════════════════════════════════════════════════════════════════
-- La RLS ya lo filtraba (anon recibe []), pero el grant es innecesario.
-- Coherente con 20260528_revoke_anon_excess_grants.sql.

revoke select on table public.profiles from anon;

-- ═════════════════════════════════════════════════════════════════════════════
-- 14) BACKFILL desde `investment_shares` (aditivo, no destruye el origen)
-- ═════════════════════════════════════════════════════════════════════════════
-- Convierte los accesos existentes en oportunidad + contacto + invitación, para no
-- perder lo ya compartido. `investment_shares` se conserva intacta.

do $$
declare
  s        record;
  v_opp_id uuid;
  v_con_id uuid;
  v_op_uuid uuid;
begin
  -- Si la tabla heredada no existe en este entorno, no hay nada que migrar.
  if to_regclass('public.investment_shares') is null then
    return;
  end if;

  for s in
    select * from public.investment_shares where status = 'active'
  loop
    -- `investment_shares.operation_id` es text; las tablas nuevas usan uuid.
    begin
      v_op_uuid := s.operation_id::uuid;
    exception when others then
      continue;  -- id no convertible: se deja fuera del backfill (queda en la tabla origen)
    end;

    insert into public.investment_opportunities (owner_id, operation_id, title, status, visibility)
    values (s.owner_id, v_op_uuid,
            coalesce(nullif(s.payload ->> 'name', ''), 'Operación'),
            'publicada',
            coalesce(s.visibility, '{}'::jsonb))
    on conflict (owner_id, operation_id) do nothing;

    select id into v_opp_id
      from public.investment_opportunities
     where owner_id = s.owner_id and operation_id = v_op_uuid;

    if v_opp_id is null then continue; end if;

    v_con_id := null;
    if s.investor_email is not null then
      insert into public.investor_contacts (owner_id, first_name, email, source, linked_user_id)
      values (s.owner_id, split_part(s.investor_email, '@', 1), s.investor_email,
              'migracion_investment_shares', s.investor_user_id)
      on conflict (owner_id, email) where email is not null do nothing;

      select id into v_con_id
        from public.investor_contacts
       where owner_id = s.owner_id and email = public.norm_email(s.investor_email);
    end if;

    insert into public.opportunity_invitations
      (opportunity_id, owner_id, contact_id, channel, token, status,
       invited_email, investor_user_id, visibility, expires_at, created_at)
    values
      (v_opp_id, s.owner_id, v_con_id, 'link',
       coalesce(nullif(s.token, ''), encode(gen_random_bytes(16), 'hex')),
       'enviada', s.investor_email, s.investor_user_id,
       coalesce(s.visibility, '{}'::jsonb), s.expires_at, s.created_at)
    on conflict (token) do nothing;
  end loop;
end $$;

-- 20260910b_investor_platform_owner_guard.sql
-- CORRECCIÓN DE SEGURIDAD — IDOR entre oportunidades. ADITIVO e IDEMPOTENTE.
-- Requiere que 20260910_investor_platform.sql ya esté aplicada.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- EL FALLO (verificado explotable contra producción)
--
-- Las policies `invitations: owner all` e `investments: owner all` solo comprobaban
-- `auth.uid() = owner_id`: que la fila DIJERA ser tuya. No comprobaban que la
-- `opportunity_id` a la que apunta lo fuera. Como el cliente elige ambos valores,
-- cualquier usuario autenticado podía:
--
--   1. insertar una invitación con `owner_id` = él mismo y `opportunity_id` = la
--      oportunidad de OTRO promotor, con toda la visibilidad activada;
--   2. reclamarla (el email invitado es el suyo, así que la identidad casa);
--   3. llamar a `get_investor_snapshot`, que es SECURITY DEFINER y lee
--      `investment_opportunities` saltándose la RLS.
--
-- Medido: se filtraban título, `costesTotales` y `rentabilidadPromotor` de una
-- oportunidad con la visibilidad COMPLETAMENTE vacía. `internal_notes` no, porque la
-- función nunca lo selecciona. Servía también para que un inversor legítimo se
-- auto-concediera más visibilidad de la autorizada.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- CÓMO SE CIERRA — en tres capas independientes
--
--   A. ESCRITURA  · trigger que DERIVA `owner_id` del servidor y rechaza operar
--                   sobre oportunidades ajenas, en INSERT y en UPDATE.
--   B. RLS        · las policies exigen además ser dueño de la oportunidad.
--   C. LECTURA    · TODOS los caminos SECURITY DEFINER comprueban que el dueño de la
--                   invitación (o de la inversión) coincide con el de la oportunidad.
--                   Así, aunque existiera una fila incoherente —creada antes de este
--                   parche o por cualquier vía futura— no otorga acceso a nada.
--
-- Y las filas incoherentes que ya existieran se NEUTRALIZAN (§5). Ojo: NO se
-- reasignan al propietario legítimo. Reasignarlas convertiría la invitación forjada
-- en una invitación válida del promotor víctima que sigue apuntando al atacante en
-- `investor_user_id` — le consolidaría el acceso en vez de quitárselo.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1) ESCRITURA — el propietario lo pone el servidor, no el cliente
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.tg_enforce_opportunity_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_uid   uuid := auth.uid();
begin
  select owner_id into v_owner
    from public.investment_opportunities
   where id = new.opportunity_id;

  if v_owner is null then
    raise exception 'La oportunidad no existe' using errcode = '23503';
  end if;

  -- Sin sesión (migraciones, tareas del servidor) no hay identidad que validar; el
  -- propietario se deriva igualmente. Con sesión, tiene que ser la del dueño real.
  if v_uid is not null and v_owner <> v_uid then
    raise exception 'No puedes operar sobre una oportunidad que no es tuya'
      using errcode = '42501';
  end if;

  new.owner_id := v_owner;  -- el valor que mandó el cliente se ignora a propósito
  return new;
end;
$$;

comment on function public.tg_enforce_opportunity_owner() is
  'Deriva owner_id desde investment_opportunities y rechaza operar sobre oportunidades ajenas. Capa A del cierre del IDOR.';

do $$
declare t text;
begin
  foreach t in array array['opportunity_invitations', 'investments'] loop
    execute format('drop trigger if exists trg_enforce_opportunity_owner on public.%I', t);
    execute format(
      'create trigger trg_enforce_opportunity_owner
         before insert or update of opportunity_id, owner_id on public.%I
         for each row execute function public.tg_enforce_opportunity_owner()', t);
  end loop;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2) RLS — la policy exige además ser dueño de la oportunidad
-- ═════════════════════════════════════════════════════════════════════════════

drop policy if exists "invitations: owner all" on public.opportunity_invitations;
create policy "invitations: owner all" on public.opportunity_invitations
  for all
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.investment_opportunities o
       where o.id = opportunity_id and o.owner_id = auth.uid()
    )
  );

drop policy if exists "investments: owner all" on public.investments;
create policy "investments: owner all" on public.investments
  for all
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.investment_opportunities o
       where o.id = opportunity_id and o.owner_id = auth.uid()
    )
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- 3) LECTURA — coherencia de propietario en TODOS los caminos SECURITY DEFINER
-- ═════════════════════════════════════════════════════════════════════════════

-- Una invitación cuyo dueño no es el dueño de la oportunidad no es una invitación:
-- es una fila forjada. Ningún camino de lectura debe honrarla.
create or replace function public.invitation_is_coherent(p_invitation uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.opportunity_invitations i
      join public.investment_opportunities o on o.id = i.opportunity_id
     where i.id = p_invitation
       and i.owner_id = o.owner_id
  );
$$;

revoke all on function public.invitation_is_coherent(uuid) from public, anon;
grant execute on function public.invitation_is_coherent(uuid) to authenticated;

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

  -- CAPA C: el dueño de la invitación tiene que ser el dueño de la oportunidad.
  -- Sin esto, una fila forjada daba acceso a la oportunidad de un tercero.
  if v_inv.owner_id <> v_opp.owner_id then
    raise exception 'Sin acceso a esta oportunidad' using errcode = '42501';
  end if;

  v_vis := case when v_inv.visibility = '{}'::jsonb then v_opp.visibility else v_inv.visibility end;
  v_m   := coalesce(v_opp.metrics, '{}'::jsonb);

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
  if coalesce((v_vis ->> 'rentabilidadPromotor')::boolean, false) then
    v_out := v_out || jsonb_build_object('rentabilidadPromotor', v_m -> 'rentabilidadPromotor');
  end if;

  if coalesce((v_vis ->> 'estadoCaptacion')::boolean, false) then
    v_out := v_out || jsonb_build_object(
      'captacion',
      (select jsonb_build_object(
                'comprometido', coalesce(sum(amount) filter (where status = 'comprometida'), 0),
                'invertido',    coalesce(sum(amount) filter (where status in ('desembolsada','activa','liquidada')), 0),
                'inversores',   count(*) filter (where status <> 'cancelada'))
         from public.investments
        where opportunity_id = v_opp.id
          and owner_id = v_opp.owner_id));   -- solo inversiones coherentes
  end if;

  return v_out;
end;
$$;

revoke all on function public.get_investor_snapshot(uuid) from public, anon;
grant execute on function public.get_investor_snapshot(uuid) to authenticated;

-- Storage: misma comprobación de coherencia en las dos vías de acceso.
create or replace function public.investor_can_read_file(
  p_owner     text,
  p_operation text,
  p_key       text
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
  v_has_inv         boolean := false;
  v_live_invite     boolean := false;
  v_live_investment boolean := false;
  v_vis   jsonb;
begin
  if v_uid is null then return false; end if;

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

  -- Solo invitaciones COHERENTES (su dueño es el dueño de la oportunidad).
  select * into v_inv
    from public.opportunity_invitations
   where opportunity_id = v_opp.id
     and investor_user_id = v_uid
     and owner_id = v_opp.owner_id
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

  -- Ídem para las inversiones.
  v_live_investment := exists (
    select 1 from public.investments
     where opportunity_id = v_opp.id
       and investor_user_id = v_uid
       and owner_id = v_opp.owner_id
       and status in ('comprometida', 'desembolsada', 'activa'));

  if not (v_live_invite or v_live_investment) then
    return false;
  end if;

  v_vis := case
             when v_has_inv and v_inv.visibility <> '{}'::jsonb then v_inv.visibility
             else v_opp.visibility
           end;

  return coalesce((v_vis ->> p_key)::boolean, false);
end;
$$;

revoke all on function public.investor_can_read_file(text, text, text) from public, anon;
grant execute on function public.investor_can_read_file(text, text, text) to authenticated;

-- Listados: el join exige coherencia de propietario.
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
      join public.investment_opportunities o
        on o.id = i.opportunity_id
       and o.owner_id = i.owner_id            -- coherencia
     where i.investor_user_id = auth.uid()
       and i.revoked_at is null
       and i.status <> 'revocada'
       and (i.expires_at is null or i.expires_at > now())
  ) t;
$$;

revoke all on function public.list_my_investor_opportunities() from public, anon;
grant execute on function public.list_my_investor_opportunities() to authenticated;

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
                                       and i.owner_id = o.owner_id
                                       and i.revoked_at is null
                                     order by i.updated_at desc limit 1)
           ) as x
      from public.investments v
      join public.investment_opportunities o
        on o.id = v.opportunity_id
       and o.owner_id = v.owner_id            -- coherencia
     where v.investor_user_id = auth.uid()
  ) t;
$$;

revoke all on function public.list_my_investments() from public, anon;
grant execute on function public.list_my_investments() to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4) `claim_invitation` — coherencia + identidad VERIFICADA
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.claim_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv      public.opportunity_invitations%rowtype;
  v_uid      uuid  := auth.uid();
  v_jwt      jsonb := auth.jwt();
  v_email    text  := public.norm_email(v_jwt ->> 'email');
  v_phone    text  := public.norm_phone(v_jwt ->> 'phone');
  v_email_ok boolean;
  v_phone_ok boolean;
  v_matches  boolean;
begin
  if v_uid is null then
    raise exception 'No hay sesión activa' using errcode = '28000';
  end if;

  -- `false` explícito ⇒ identidad no verificada. Ausente ⇒ no se bloquea, para no
  -- romper accesos legítimos en curso; la confirmación al registrarse sigue siendo
  -- la protección principal.
  v_email_ok := coalesce(
    (v_jwt -> 'user_metadata' ->> 'email_verified')::boolean,
    (v_jwt ->> 'email_verified')::boolean,
    true);
  v_phone_ok := coalesce(
    (v_jwt -> 'user_metadata' ->> 'phone_verified')::boolean,
    (v_jwt ->> 'phone_verified')::boolean,
    true);

  select * into v_inv from public.opportunity_invitations where token = p_token;
  if not found then
    raise exception 'Invitación no encontrada' using errcode = 'P0002';
  end if;

  -- Una invitación incoherente no se puede reclamar: no es una invitación.
  if not public.invitation_is_coherent(v_inv.id) then
    raise exception 'Invitación no válida' using errcode = '42501';
  end if;

  if v_inv.revoked_at is not null or v_inv.status = 'revocada' then
    raise exception 'Invitación revocada' using errcode = 'P0002';
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    raise exception 'Invitación caducada' using errcode = 'P0002';
  end if;

  if v_inv.investor_user_id is not null and v_inv.investor_user_id <> v_uid then
    raise exception 'Invitación ya asignada a otro usuario' using errcode = '42501';
  end if;

  v_matches :=
       (v_inv.invited_email is not null and v_email is not null and v_email_ok
        and v_inv.invited_email = v_email)
    or (v_inv.invited_phone is not null and v_phone is not null and v_phone_ok
        and v_inv.invited_phone = v_phone);

  if not v_matches and v_inv.investor_user_id is distinct from v_uid then
    raise exception 'La identidad verificada no coincide con la del destinatario'
      using errcode = '42501';
  end if;

  update public.opportunity_invitations
     set investor_user_id = v_uid,
         status = case when status = 'pendiente' then 'enviada' else status end,
         updated_at = now()
   where id = v_inv.id;

  if v_inv.contact_id is not null then
    update public.investor_contacts
       set linked_user_id = v_uid
     where id = v_inv.contact_id
       and (linked_user_id is null or linked_user_id = v_uid);
  end if;

  insert into public.user_roles (user_id, role)
  values (v_uid, 'inversor')
  on conflict do nothing;

  -- Solo las inversiones coherentes del promotor de esa invitación.
  if v_inv.contact_id is not null then
    update public.investments v
       set investor_user_id = v_uid
      from public.investment_opportunities o
     where o.id = v.opportunity_id
       and o.owner_id = v.owner_id
       and v.contact_id = v_inv.contact_id
       and v.investor_user_id is null;
  end if;

  return v_inv.id;
end;
$$;

revoke all on function public.claim_invitation(text) from public, anon;
grant execute on function public.claim_invitation(text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5) NEUTRALIZAR las filas incoherentes que ya existieran
-- ═════════════════════════════════════════════════════════════════════════════
--
-- NO se reasignan al propietario legítimo: eso convertiría la invitación forjada en
-- una invitación válida del promotor víctima que sigue apuntando al atacante en
-- `investor_user_id`. Se revocan y se desvinculan, conservando la fila como evidencia.

do $$
declare
  n_inv int := 0;
  n_ver int := 0;
begin
  update public.opportunity_invitations i
     set status           = 'revocada',
         revoked_at       = coalesce(i.revoked_at, now()),
         investor_user_id = null,
         visibility       = '{}'::jsonb,
         updated_at       = now()
    from public.investment_opportunities o
   where o.id = i.opportunity_id
     and i.owner_id <> o.owner_id;
  get diagnostics n_inv = row_count;

  update public.investments v
     set status           = 'cancelada',
         investor_user_id = null,
         updated_at       = now()
    from public.investment_opportunities o
   where o.id = v.opportunity_id
     and v.owner_id <> o.owner_id;
  get diagnostics n_ver = row_count;

  raise notice 'Invitaciones incoherentes neutralizadas: %', n_inv;
  raise notice 'Inversiones incoherentes neutralizadas: %', n_ver;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6) `user_roles`: permitir RENUNCIAR a un rol propio
-- ═════════════════════════════════════════════════════════════════════════════
-- La migración anterior daba SELECT e INSERT pero no DELETE: un rol era irrevocable.
-- Sumado a la autoconcesión de `promotor`, alguien que solo quería ser inversor se
-- quedaba con el rol sin forma de quitárselo.

grant delete on table public.user_roles to authenticated;

drop policy if exists "user_roles: self delete" on public.user_roles;
create policy "user_roles: self delete" on public.user_roles
  for delete using (auth.uid() = user_id);

-- ═════════════════════════════════════════════════════════════════════════════
-- 7) VERIFICACIÓN — debe devolver 6 filas, todas con ok = true
-- ═════════════════════════════════════════════════════════════════════════════

select 'trigger en opportunity_invitations' as comprobacion,
       exists (select 1 from pg_trigger
                where tgname = 'trg_enforce_opportunity_owner'
                  and tgrelid = 'public.opportunity_invitations'::regclass) as ok
union all
select 'trigger en investments',
       exists (select 1 from pg_trigger
                where tgname = 'trg_enforce_opportunity_owner'
                  and tgrelid = 'public.investments'::regclass)
union all
select 'policy de invitaciones comprueba la oportunidad',
       coalesce((select with_check like '%investment_opportunities%'
                   from pg_policies
                  where schemaname = 'public'
                    and tablename = 'opportunity_invitations'
                    and policyname = 'invitations: owner all'), false)
union all
select 'policy de inversiones comprueba la oportunidad',
       coalesce((select with_check like '%investment_opportunities%'
                   from pg_policies
                  where schemaname = 'public'
                    and tablename = 'investments'
                    and policyname = 'investments: owner all'), false)
union all
select 'user_roles admite DELETE propio',
       exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = 'user_roles'
                  and policyname = 'user_roles: self delete')
union all
select 'no quedan filas incoherentes',
       not exists (
         select 1 from public.opportunity_invitations i
           join public.investment_opportunities o on o.id = i.opportunity_id
          where i.owner_id <> o.owner_id
            and i.revoked_at is null)
       and not exists (
         select 1 from public.investments v
           join public.investment_opportunities o on o.id = v.opportunity_id
          where v.owner_id <> o.owner_id
            and v.status <> 'cancelada');

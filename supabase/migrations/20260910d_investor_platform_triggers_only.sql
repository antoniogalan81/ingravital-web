-- 20260910d_investor_platform_triggers_only.sql
--
-- BLOQUE MÍNIMO Y AUTOCONTENIDO. Idempotente. Se puede pegar entero en el SQL Editor.
--
-- POR QUÉ EXISTE: tras aplicar `20260910c`, una sonda contra producción comprobó que
-- sus DOS TRIGGERS no estaban activos (crear una oportunidad sobre la operación de
-- otro y registrar actividad sobre entidades ajenas seguían devolviendo HTTP 201).
-- El resto de `20260910c` —las dos funciones que comprueban `invitation_is_coherent`—
-- no es distinguible por comportamiento, así que este fichero las reinstala también.
--
-- La migración `20260910c` es correcta: verificada sobre Postgres real, crea los cuatro
-- triggers y bloquea el ataque. Este fichero es un extracto suyo, sin nada más, para
-- descartar cualquier problema al aplicarla.
--
-- Al final devuelve 4 filas: TODAS deben salir `ok = true`.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1) La oportunidad solo puede publicarse sobre una operación PROPIA
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.tg_enforce_operation_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_op_owner uuid;
  v_uid      uuid := auth.uid();
begin
  if v_uid is null then
    return new;
  end if;

  select user_id into v_op_owner
    from public.operaciones_inmobiliarias
   where id = new.operation_id;

  -- Si la operación aún no está sincronizada no hay tercero al que perjudicar, y
  -- exigirla rompería «Preparar para inversores» en una operación recién creada.
  if v_op_owner is not null and v_op_owner <> v_uid then
    raise exception 'Esa operación no es tuya' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_enforce_operation_owner on public.investment_opportunities;
create trigger trg_enforce_operation_owner
  before insert or update of operation_id on public.investment_opportunities
  for each row execute function public.tg_enforce_operation_owner();

-- ═════════════════════════════════════════════════════════════════════════════
-- 2) La actividad solo puede referirse a entidades PROPIAS
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.tg_enforce_activity_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
begin
  -- Las RPC del módulo escriben la traza a nombre del promotor de forma legítima.
  if coalesce(current_setting('invergravital.activity_trusted', true), '') = 'on' then
    return new;
  end if;

  if v_uid is null then
    return new;
  end if;

  if new.opportunity_id is not null then
    select owner_id into v_owner from public.investment_opportunities where id = new.opportunity_id;
    if v_owner is not null and v_owner <> v_uid then
      raise exception 'Esa oportunidad no es tuya' using errcode = '42501';
    end if;
  end if;

  if new.invitation_id is not null then
    select owner_id into v_owner from public.opportunity_invitations where id = new.invitation_id;
    if v_owner is not null and v_owner <> v_uid then
      raise exception 'Esa invitación no es tuya' using errcode = '42501';
    end if;
  end if;

  if new.investment_id is not null then
    select owner_id into v_owner from public.investments where id = new.investment_id;
    if v_owner is not null and v_owner <> v_uid then
      raise exception 'Esa inversión no es tuya' using errcode = '42501';
    end if;
  end if;

  new.owner_id := v_uid;
  return new;
end;
$fn$;

drop trigger if exists trg_enforce_activity_owner on public.investment_activity;
create trigger trg_enforce_activity_owner
  before insert or update on public.investment_activity
  for each row execute function public.tg_enforce_activity_owner();

-- ═════════════════════════════════════════════════════════════════════════════
-- 3) Las dos RPC que deben comprobar la coherencia de la invitación
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.register_invitation_view(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No hay sesión activa' using errcode = '28000';
  end if;
  if not public.invitation_is_coherent(p_invitation) then
    return;
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
    perform set_config('invergravital.activity_trusted', 'on', true);
    insert into public.investment_activity (owner_id, opportunity_id, invitation_id, actor_user_id, kind)
    select owner_id, opportunity_id, id, v_uid, 'vista'
      from public.opportunity_invitations where id = p_invitation;
    perform set_config('invergravital.activity_trusted', 'off', true);
  end if;
end;
$fn$;

revoke all on function public.register_invitation_view(uuid) from public, anon;
grant execute on function public.register_invitation_view(uuid) to authenticated;

create or replace function public.set_invitation_interest(p_invitation uuid, p_interest text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No hay sesión activa' using errcode = '28000';
  end if;
  if p_interest not in ('interesado', 'mas_info', 'descartada') then
    raise exception 'Valor de interés no válido' using errcode = '22023';
  end if;
  if not public.invitation_is_coherent(p_invitation) then
    raise exception 'Sin acceso a esta invitación' using errcode = '42501';
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

  perform set_config('invergravital.activity_trusted', 'on', true);
  insert into public.investment_activity (owner_id, opportunity_id, invitation_id, actor_user_id, kind, detail)
  select owner_id, opportunity_id, id, v_uid, 'interes', jsonb_build_object('interest', p_interest)
    from public.opportunity_invitations where id = p_invitation;
  perform set_config('invergravital.activity_trusted', 'off', true);
end;
$fn$;

revoke all on function public.set_invitation_interest(uuid, text, text) from public, anon;
grant execute on function public.set_invitation_interest(uuid, text, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN — 4 filas, TODAS deben salir ok = true
-- ═════════════════════════════════════════════════════════════════════════════

select 'trigger trg_enforce_operation_owner activo' as comprobacion,
       exists (select 1 from pg_trigger
                where tgname = 'trg_enforce_operation_owner'
                  and tgrelid = 'public.investment_opportunities'::regclass
                  and not tgisinternal) as ok
union all
select 'trigger trg_enforce_activity_owner activo',
       exists (select 1 from pg_trigger
                where tgname = 'trg_enforce_activity_owner'
                  and tgrelid = 'public.investment_activity'::regclass
                  and not tgisinternal)
union all
select 'register_invitation_view comprueba coherencia',
       coalesce((select prosrc like '%invitation_is_coherent%'
                   from pg_proc where proname = 'register_invitation_view' limit 1), false)
union all
select 'set_invitation_interest comprueba coherencia',
       coalesce((select prosrc like '%invitation_is_coherent%'
                   from pg_proc where proname = 'set_invitation_interest' limit 1), false);

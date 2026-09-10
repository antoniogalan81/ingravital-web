-- 20260910c_investor_platform_hardening.sql
-- Endurecimiento tras la tercera revisión adversarial. ADITIVO e IDEMPOTENTE.
-- Requiere 20260910_investor_platform.sql y 20260910b_investor_platform_owner_guard.sql.
--
-- Ninguno de los tres puntos era explotable con las capas ya aplicadas: son
-- comprobaciones ausentes que cierran vías laterales y hacen cierta la garantía que
-- el propio guard declara. Verificados contra producción antes de escribir esto.
--
--   1. `investment_opportunities.operation_id` no comprobaba que la operación fuera
--      de quien publica la oportunidad. Medido: HTTP 201 al apuntar a la operación
--      de otro promotor.
--   2. `investment_activity` no comprobaba nada más que `owner_id`. Medido: HTTP 201
--      registrando actividad sobre la oportunidad de otro.
--   3. `register_invitation_view` y `set_invitation_interest` eran las únicas dos
--      funciones SECURITY DEFINER que el guard NO redefinió, así que no comprobaban
--      la coherencia entre el dueño de la invitación y el de la oportunidad. El
--      comentario del guard afirmaba «TODOS los caminos»: ahora es cierto.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1) La oportunidad solo puede publicarse sobre una operación PROPIA
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Se rechaza si la operación existe y es de otro. Si NO existe todavía, se permite:
-- el cliente crea la operación en local y el motor de sync la sube con retardo, así
-- que exigir su presencia rompería «Preparar para inversores» en una operación recién
-- creada. Y si no hay fila, no hay tercero a quien perjudicar — que es el riesgo real.

create or replace function public.tg_enforce_operation_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_op_owner uuid;
  v_uid      uuid := auth.uid();
begin
  if v_uid is null then
    return new;  -- migraciones y tareas del servidor
  end if;

  select user_id into v_op_owner
    from public.operaciones_inmobiliarias
   where id = new.operation_id;

  if v_op_owner is not null and v_op_owner <> v_uid then
    raise exception 'Esa operación no es tuya' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.tg_enforce_operation_owner() is
  'Impide publicar una oportunidad sobre la operación inmobiliaria de otro usuario.';

drop trigger if exists trg_enforce_operation_owner on public.investment_opportunities;
create trigger trg_enforce_operation_owner
  before insert or update of operation_id on public.investment_opportunities
  for each row execute function public.tg_enforce_operation_owner();

-- ═════════════════════════════════════════════════════════════════════════════
-- 2) La actividad solo puede referirse a entidades PROPIAS
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `investment_activity` no lleva el trigger de propiedad de las otras dos tablas, así
-- que se podían registrar entradas apuntando a la oportunidad, invitación o inversión
-- de otro. Solo las leía quien las escribía, pero es basura que ensucia la
-- trazabilidad y que un panel agregado futuro podría llegar a mostrar.

create or replace function public.tg_enforce_activity_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
begin
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

  new.owner_id := v_uid;  -- el propietario lo pone el servidor
  return new;
end;
$$;

comment on function public.tg_enforce_activity_owner() is
  'La actividad solo puede referirse a entidades del propio usuario.';

drop trigger if exists trg_enforce_activity_owner on public.investment_activity;
create trigger trg_enforce_activity_owner
  before insert or update on public.investment_activity
  for each row execute function public.tg_enforce_activity_owner();

-- ═════════════════════════════════════════════════════════════════════════════
-- 3) Las dos funciones que faltaban por comprobar coherencia
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

  -- Una invitación cuyo dueño no es el de la oportunidad no es una invitación.
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

  insert into public.investment_activity (owner_id, opportunity_id, invitation_id, actor_user_id, kind, detail)
  select owner_id, opportunity_id, id, v_uid, 'interes', jsonb_build_object('interest', p_interest)
    from public.opportunity_invitations where id = p_invitation;
end;
$$;

revoke all on function public.set_invitation_interest(uuid, text, text) from public, anon;
grant execute on function public.set_invitation_interest(uuid, text, text) to authenticated;

-- ⚠️ OJO: `investment_activity` lleva ahora un trigger que fuerza `owner_id := auth.uid()`.
-- Las dos funciones de arriba insertan actividad a nombre del PROMOTOR (`owner_id` de la
-- invitación) mientras las ejecuta el INVERSOR. El trigger lo reescribiría al inversor,
-- dejando al promotor sin la traza que necesita. Se exime a estas inserciones marcándolas
-- con un ajuste local que el trigger respeta.

create or replace function public.tg_enforce_activity_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

-- Las dos RPC marcan sus inserciones como de confianza (ajuste LOCAL: se descarta al
-- terminar la transacción, así que no puede quedar activado para otras sentencias).
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
$$;

revoke all on function public.set_invitation_interest(uuid, text, text) from public, anon;
grant execute on function public.set_invitation_interest(uuid, text, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4) VERIFICACIÓN — 5 filas, todas con ok = true
-- ═════════════════════════════════════════════════════════════════════════════

select 'trigger de propiedad de la operación' as comprobacion,
       exists (select 1 from pg_trigger
                where tgname = 'trg_enforce_operation_owner'
                  and tgrelid = 'public.investment_opportunities'::regclass) as ok
union all
select 'trigger de propiedad de la actividad',
       exists (select 1 from pg_trigger
                where tgname = 'trg_enforce_activity_owner'
                  and tgrelid = 'public.investment_activity'::regclass)
union all
select 'register_invitation_view comprueba coherencia',
       coalesce((select prosrc like '%invitation_is_coherent%'
                   from pg_proc where proname = 'register_invitation_view' limit 1), false)
union all
select 'set_invitation_interest comprueba coherencia',
       coalesce((select prosrc like '%invitation_is_coherent%'
                   from pg_proc where proname = 'set_invitation_interest' limit 1), false)
union all
select 'no quedan oportunidades sobre operaciones ajenas',
       not exists (
         select 1 from public.investment_opportunities p
           join public.operaciones_inmobiliarias o on o.id = p.operation_id
          where o.user_id <> p.owner_id);

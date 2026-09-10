-- 20260910b_investor_platform_owner_guard.sql
-- CORRECCIÓN DE SEGURIDAD — IDOR entre oportunidades. ADITIVO e IDEMPOTENTE.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EL FALLO (verificado explotable en producción antes de escribir esto)
--
-- Las policies `invitations: owner all` e `investments: owner all` solo comprobaban
-- `auth.uid() = owner_id`, es decir, que la fila DIJERA ser tuya. No comprobaban que
-- la `opportunity_id` a la que apunta sea tuya. Como el cliente elige ambos valores,
-- cualquier usuario autenticado podía:
--
--   1. insertar una invitación con `owner_id` = él mismo y `opportunity_id` = la
--      oportunidad de OTRO promotor, con toda la visibilidad activada;
--   2. reclamarla (el email invitado es el suyo, así que la identidad casa);
--   3. llamar a `get_investor_snapshot`, que es SECURITY DEFINER y por tanto lee
--      `investment_opportunities` saltándose la RLS.
--
-- Resultado real medido: se filtraban título, `costesTotales` y `rentabilidadPromotor`
-- de una oportunidad ajena cuya visibilidad estaba COMPLETAMENTE vacía. Lo mismo servía
-- para que un inversor legítimo se auto-concediera más visibilidad de la autorizada.
-- (`internal_notes` no se filtraba: la función nunca lo selecciona.)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LA CORRECCIÓN
--
-- `owner_id` deja de ser un dato del cliente: se DERIVA en el servidor desde
-- `investment_opportunities.owner_id`, y se rechaza cualquier intento de operar sobre
-- una oportunidad ajena. Un trigger cubre INSERT y UPDATE, así que tampoco vale crear
-- la fila sobre una oportunidad propia y luego repuntarla a otra.
--
-- Se hace con trigger y no solo con `with check` porque el trigger además NORMALIZA
-- (`owner_id` correcto siempre), y porque debe seguir funcionando en contextos sin
-- sesión —el backfill de la migración anterior corre como `postgres`, sin `auth.uid()`—
-- donde no hay identidad que comprobar pero sí conviene derivar el propietario.

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

  -- El valor que mandó el cliente se ignora a propósito.
  new.owner_id := v_owner;
  return new;
end;
$$;

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

-- Defensa en profundidad: además del trigger, la propia policy exige la propiedad de
-- la oportunidad. Si alguien deshabilitara el trigger, la RLS sigue cerrando el paso.
do $$ begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='opportunity_invitations' and policyname='invitations: owner all') then
    drop policy "invitations: owner all" on public.opportunity_invitations;
  end if;
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

  if exists (select 1 from pg_policies where schemaname='public' and tablename='investments' and policyname='investments: owner all') then
    drop policy "investments: owner all" on public.investments;
  end if;
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
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- LIMPIEZA de filas que el fallo pudiera haber dejado
--
-- Cualquier invitación o inversión cuyo `owner_id` no coincida con el propietario de
-- su oportunidad es, por construcción, ilegítima: se corrige el propietario para que
-- la fila deje de dar acceso a quien la creó. No se borra nada.

update public.opportunity_invitations i
   set owner_id = o.owner_id
  from public.investment_opportunities o
 where o.id = i.opportunity_id
   and i.owner_id <> o.owner_id;

update public.investments v
   set owner_id = o.owner_id
  from public.investment_opportunities o
 where o.id = v.opportunity_id
   and v.owner_id <> o.owner_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- ENDURECIMIENTO de `claim_invitation`: exigir identidad VERIFICADA
--
-- La comparación usaba `auth.jwt() ->> 'email'` sin mirar si ese email está
-- confirmado. Hoy el proyecto exige confirmación al registrarse, así que no era
-- explotable, pero depender de un ajuste del panel para una garantía de seguridad es
-- frágil. Ahora, si el JWT dice explícitamente que la identidad NO está verificada,
-- se rechaza. Si el claim no viene (JWT antiguo), se mantiene el comportamiento
-- anterior para no romper accesos legítimos en curso.

create or replace function public.claim_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv     public.opportunity_invitations%rowtype;
  v_uid     uuid := auth.uid();
  v_jwt     jsonb := auth.jwt();
  v_email   text := public.norm_email(v_jwt ->> 'email');
  v_phone   text := public.norm_phone(v_jwt ->> 'phone');
  v_email_ok boolean;
  v_phone_ok boolean;
  v_matches boolean;
begin
  if v_uid is null then
    raise exception 'No hay sesión activa' using errcode = '28000';
  end if;

  -- `false` explícito ⇒ no verificada. Ausente ⇒ no se bloquea (compatibilidad).
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

comment on function public.tg_enforce_opportunity_owner() is
  'Deriva owner_id desde investment_opportunities y rechaza operar sobre oportunidades ajenas. Cierra el IDOR de invitaciones e inversiones.';

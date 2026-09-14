-- 20260914_document_sync.sql — "Actualizar con IA": documentos de Google Drive → datos reales.
--
-- Diseño (ver docs/DOCUMENTOS_DRIVE.md):
--  · El documento original SE QUEDA en Drive. Aquí solo se guarda metadatos, el resultado
--    estructurado mínimo (sin texto completo) y la trazabilidad.
--  · El navegador NUNCA escribe estas tablas directamente: solo lee lo suyo (RLS por
--    user_id) y llama a dos RPC (`request_document_sync`, `decide_document_proposal`).
--  · El worker (PC del propietario) usa una clave secreta de servidor y las funciones
--    `claim_document_job`, `record_document_proposal`, `finish_document_job`.
--  · Una IA nunca escribe la operación: el worker propone items ya validados y la única
--    función que toca `operaciones_inmobiliarias.data` es `apply_document_proposal`,
--    con lista cerrada de colecciones y auditoría del valor anterior y el nuevo.
--  · Tenant = propietario (`user_id`), igual que `operaciones_inmobiliarias`.
--
-- Idempotente: se puede reaplicar (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS).
-- No modifica ni borra datos existentes.

begin;

-- ── Tareas de actualización ─────────────────────────────────────────────────────

create table if not exists public.document_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null references public.operaciones_inmobiliarias(id) on delete cascade,
  drive_folder_id text not null check (drive_folder_id ~ '^[A-Za-z0-9_-]{10,128}$'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'needs_review', 'error')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  attempts integer not null default 0,
  worker_id text,
  lease_until timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error text check (error is null or length(error) <= 500),
  updated_at timestamptz not null default now()
);

-- Doble clic / dos pestañas / dos variantes de la misma carpeta: una sola tarea activa.
create unique index if not exists document_jobs_one_active
  on public.document_processing_jobs (user_id, drive_folder_id)
  where status in ('pending', 'processing');
create index if not exists document_jobs_queue
  on public.document_processing_jobs (requested_at)
  where status in ('pending', 'processing');
create index if not exists document_jobs_by_folder
  on public.document_processing_jobs (user_id, drive_folder_id, requested_at desc);

-- ── Documentos vistos en la carpeta ─────────────────────────────────────────────

create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  drive_folder_id text not null check (drive_folder_id ~ '^[A-Za-z0-9_-]{10,128}$'),
  drive_file_id text not null check (drive_file_id ~ '^[A-Za-z0-9_-]{10,128}$'),
  operation_id text references public.operaciones_inmobiliarias(id) on delete set null,
  name text not null check (length(name) <= 300),
  mime_type text not null check (length(mime_type) <= 120),
  size_bytes bigint,
  modified_time timestamptz,
  md5_checksum text check (md5_checksum is null or md5_checksum ~ '^[a-f0-9]{32}$'),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'processed', 'needs_review', 'already_registered', 'duplicate', 'ignored', 'unreadable', 'error')),
  doc_type text check (doc_type is null or doc_type in ('invoice', 'receipt', 'sale', 'loan', 'budget', 'certification', 'other')),
  extractor_version text,
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  extraction jsonb,
  error text check (error is null or length(error) <= 500),
  attempts integer not null default 0,
  duplicate_of uuid references public.project_documents(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  processed_at timestamptz,
  removed_at timestamptz,
  last_job_id uuid references public.document_processing_jobs(id) on delete set null,
  constraint project_documents_file_unique unique (user_id, drive_folder_id, drive_file_id)
);

create index if not exists project_documents_by_status
  on public.project_documents (user_id, drive_folder_id, status);
create index if not exists project_documents_by_hash
  on public.project_documents (user_id, drive_folder_id, content_sha256)
  where content_sha256 is not null;

-- ── Propuestas de cambio ────────────────────────────────────────────────────────

create table if not exists public.document_change_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.project_documents(id) on delete cascade,
  operation_id text not null references public.operaciones_inmobiliarias(id) on delete cascade,
  job_id uuid references public.document_processing_jobs(id) on delete set null,
  kind text not null check (kind in ('real_expense', 'real_loan', 'sale')),
  mode text not null check (mode in ('insert', 'patch')),
  target_id text not null check (target_id ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  -- Misma factura / mismo documento no puede aplicarse dos veces a una operación.
  dedupe_key text not null check (length(dedupe_key) between 3 and 200),
  item jsonb not null check (jsonb_typeof(item) = 'object'),
  current_value jsonb,
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  status text not null
    check (status in ('pending', 'auto_applied', 'accepted', 'rejected', 'superseded', 'failed')),
  reason text check (reason is null or length(reason) <= 500),
  document_version text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists document_proposals_dedupe
  on public.document_change_proposals (operation_id, dedupe_key)
  where status in ('pending', 'auto_applied', 'accepted');
create index if not exists document_proposals_by_status
  on public.document_change_proposals (user_id, operation_id, status);
create index if not exists document_proposals_by_document
  on public.document_change_proposals (document_id);

-- ── Auditoría (solo inserción) ──────────────────────────────────────────────────

create table if not exists public.document_processing_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id text,
  job_id uuid,
  document_id uuid,
  proposal_id uuid,
  actor_type text not null check (actor_type in ('user', 'worker')),
  actor_id text not null check (length(actor_id) <= 120),
  action text not null check (action ~ '^[a-z_]{3,60}$'),
  field text,
  old_value jsonb,
  new_value jsonb,
  confidence numeric(4, 3),
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists document_audit_by_user on public.document_processing_audit (user_id, created_at desc);
create index if not exists document_audit_by_operation on public.document_processing_audit (operation_id, created_at desc);

-- ── RLS y permisos: el cliente solo LEE lo suyo ─────────────────────────────────

alter table public.document_processing_jobs enable row level security;
alter table public.project_documents enable row level security;
alter table public.document_change_proposals enable row level security;
alter table public.document_processing_audit enable row level security;

revoke all on public.document_processing_jobs, public.project_documents,
  public.document_change_proposals, public.document_processing_audit from anon, authenticated;
grant select on public.document_processing_jobs, public.project_documents,
  public.document_change_proposals, public.document_processing_audit to authenticated;
grant select, insert, update, delete on public.document_processing_jobs, public.project_documents,
  public.document_change_proposals to service_role;
grant select, insert on public.document_processing_audit to service_role;

drop policy if exists document_jobs_owner_select on public.document_processing_jobs;
create policy document_jobs_owner_select on public.document_processing_jobs
  for select to authenticated using (user_id = auth.uid());

drop policy if exists project_documents_owner_select on public.project_documents;
create policy project_documents_owner_select on public.project_documents
  for select to authenticated using (user_id = auth.uid());

drop policy if exists document_proposals_owner_select on public.document_change_proposals;
create policy document_proposals_owner_select on public.document_change_proposals
  for select to authenticated using (user_id = auth.uid());

drop policy if exists document_audit_owner_select on public.document_processing_audit;
create policy document_audit_owner_select on public.document_processing_audit
  for select to authenticated using (user_id = auth.uid());

-- ── Utilidades ──────────────────────────────────────────────────────────────────

-- Id de carpeta desde el enlace guardado en la operación (mismo criterio que
-- parseDriveLink en src/lib/realFinances.ts: /folders/<id> u open?id=<id>).
create or replace function public.drive_folder_id_from_url(p_url text)
returns text language sql immutable set search_path = pg_catalog as $$
  select case
    when p_url is null or p_url !~* '^https?://(drive|docs)\.google\.com/' then null
    else coalesce(
      substring(p_url from '/folders/([A-Za-z0-9_-]{10,128})'),
      substring(p_url from '[?&]id=([A-Za-z0-9_-]{10,128})')
    )
  end;
$$;

create or replace function public.iso_utc(p timestamptz)
returns text language sql immutable set search_path = pg_catalog as $$
  select to_char(p at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- ── Cliente: pedir una actualización ────────────────────────────────────────────

create or replace function public.request_document_sync(p_operation_id text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_folder text;
  v_job public.document_processing_jobs%rowtype;
  v_recent integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select public.drive_folder_id_from_url(o.data -> 'invoicesDriveFolder' ->> 'url')
    into v_folder
    from public.operaciones_inmobiliarias o
   where o.id = p_operation_id and o.user_id = v_uid and o.deleted_at is null;
  if not found then
    raise exception 'operation_not_found' using errcode = 'P0002';
  end if;
  if v_folder is null then
    raise exception 'drive_folder_missing' using errcode = '22023';
  end if;

  -- Si ya hay una en cola o en curso para esa carpeta, se devuelve esa.
  select * into v_job from public.document_processing_jobs
   where user_id = v_uid and drive_folder_id = v_folder and status in ('pending', 'processing');
  if found then
    return jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'already_queued', true);
  end if;

  select count(*) into v_recent from public.document_processing_jobs
   where user_id = v_uid and requested_at > now() - interval '1 hour';
  if v_recent >= 30 then
    raise exception 'too_many_requests' using errcode = '54000';
  end if;

  begin
    insert into public.document_processing_jobs (user_id, operation_id, drive_folder_id, requested_by)
    values (v_uid, p_operation_id, v_folder, v_uid)
    returning * into v_job;
  exception when unique_violation then
    -- Carrera entre dos peticiones simultáneas: gana la primera.
    select * into v_job from public.document_processing_jobs
     where user_id = v_uid and drive_folder_id = v_folder and status in ('pending', 'processing');
    return jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'already_queued', true);
  end;

  insert into public.document_processing_audit (user_id, operation_id, job_id, actor_type, actor_id, action)
  values (v_uid, p_operation_id, v_job.id, 'user', v_uid::text, 'job_requested');

  return jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'already_queued', false);
end;
$$;

-- ── Aplicar una propuesta a la operación (única escritura sobre data) ───────────
--
-- · Colecciones cerradas: realExpenses, realLoans, sales.
-- · insert: añade el item (o lo sustituye si ya existe y no está borrado por el usuario).
-- · patch:  mezcla campos sobre un item existente.
-- · Nunca revive un item con `deletedAt`: el borrado del usuario manda.
-- · client_updated_at avanza 1 ms: el push condicionado de WEB/APP detecta la escritura
--   (y reintenta fusionando), sin fingir que la operación entera se editó "ahora".

create or replace function public.apply_document_proposal(p_proposal uuid, p_status text, p_actor_type text, p_actor_id text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_p public.document_change_proposals%rowtype;
  v_op public.operaciones_inmobiliarias%rowtype;
  v_coll text;
  v_arr jsonb;
  v_idx integer;
  v_old jsonb;
  v_new jsonb;
  v_now text := public.iso_utc(now());
  v_client timestamptz;
  v_reason text;
begin
  if p_status not in ('auto_applied', 'accepted') then
    raise exception 'invalid_status';
  end if;

  select * into v_p from public.document_change_proposals where id = p_proposal for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_p.applied_at is not null then
    return jsonb_build_object('applied', false, 'reason', 'already_applied');
  end if;

  v_coll := case v_p.kind when 'real_expense' then 'realExpenses' when 'real_loan' then 'realLoans' when 'sale' then 'sales' end;

  select * into v_op from public.operaciones_inmobiliarias
   where id = v_p.operation_id and user_id = v_p.user_id and deleted_at is null
   for update;
  if not found then
    v_reason := 'operation_not_found';
  else
    v_arr := coalesce(v_op.data -> v_coll, '[]'::jsonb);
    if jsonb_typeof(v_arr) <> 'array' then
      v_reason := 'collection_not_array';
    end if;
  end if;

  if v_reason is null then
    select (e.ord - 1)::int into v_idx
      from jsonb_array_elements(v_arr) with ordinality as e(val, ord)
     where e.val ->> 'id' = v_p.target_id
     limit 1;
    v_old := case when v_idx is null then null else v_arr -> v_idx end;

    if v_old ? 'deletedAt' and v_old ->> 'deletedAt' is not null then
      v_reason := 'deleted_by_user';
    elsif v_p.mode = 'patch' and v_old is null then
      v_reason := 'target_not_found';
    end if;
  end if;

  if v_reason is not null then
    update public.document_change_proposals
       set status = 'failed', reason = v_reason, decided_at = coalesce(decided_at, now())
     where id = v_p.id;
    insert into public.document_processing_audit
      (user_id, operation_id, job_id, document_id, proposal_id, actor_type, actor_id, action, detail)
    values (v_p.user_id, v_p.operation_id, v_p.job_id, v_p.document_id, v_p.id, p_actor_type, p_actor_id,
            'change_failed', jsonb_build_object('reason', v_reason));
    return jsonb_build_object('applied', false, 'reason', v_reason);
  end if;

  -- El item nunca puede cambiar su id ni traer marcas de borrado desde un documento.
  v_new := coalesce(v_old, '{}'::jsonb)
           || (v_p.item - 'id' - 'deletedAt' - 'createdAt' - 'updatedAt')
           || jsonb_build_object('id', v_p.target_id, 'updatedAt', v_now,
                                 'createdAt', coalesce(v_old ->> 'createdAt', v_now));

  if v_idx is null then
    v_arr := v_arr || jsonb_build_array(v_new);
  else
    v_arr := jsonb_set(v_arr, array[v_idx::text], v_new);
  end if;

  v_client := v_op.client_updated_at + interval '1 millisecond';
  update public.operaciones_inmobiliarias
     set data = jsonb_set(data, array[v_coll], v_arr) || jsonb_build_object('updatedAt', public.iso_utc(v_client)),
         client_updated_at = v_client
   where id = v_op.id;

  update public.document_change_proposals
     set status = p_status, current_value = v_old, applied_at = now(),
         decided_at = coalesce(decided_at, now())
   where id = v_p.id;

  insert into public.document_processing_audit
    (user_id, operation_id, job_id, document_id, proposal_id, actor_type, actor_id, action, field, old_value, new_value, confidence)
  values (v_p.user_id, v_p.operation_id, v_p.job_id, v_p.document_id, v_p.id, p_actor_type, p_actor_id,
          case p_status when 'auto_applied' then 'change_auto_applied' else 'change_accepted' end,
          v_coll || '[' || v_p.target_id || ']', v_old, v_new, v_p.confidence);

  return jsonb_build_object('applied', true);
end;
$$;

-- ── Cliente: aceptar o rechazar una propuesta ───────────────────────────────────
-- La decisión se extiende a las propuestas hermanas (mismo documento y misma clave) de
-- las variantes que comparten carpeta, para no revisar lo mismo siete veces.

create or replace function public.decide_document_proposal(p_proposal uuid, p_accept boolean)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.document_change_proposals%rowtype;
  v_sibling record;
  v_result jsonb;
  v_applied integer := 0;
  v_failed integer := 0;
  v_rejected integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_p from public.document_change_proposals
   where id = p_proposal and user_id = v_uid;
  if not found then
    raise exception 'proposal_not_found' using errcode = 'P0002';
  end if;
  if v_p.status <> 'pending' then
    raise exception 'proposal_not_pending' using errcode = '22023';
  end if;

  for v_sibling in
    select id from public.document_change_proposals
     where user_id = v_uid and document_id = v_p.document_id and dedupe_key = v_p.dedupe_key
       and status = 'pending'
     order by (id = v_p.id) desc, created_at
     for update
  loop
    if p_accept then
      v_result := public.apply_document_proposal(v_sibling.id, 'accepted', 'user', v_uid::text);
      if (v_result ->> 'applied')::boolean then
        v_applied := v_applied + 1;
        update public.document_change_proposals set decided_by = v_uid where id = v_sibling.id;
      else
        v_failed := v_failed + 1;
      end if;
    else
      update public.document_change_proposals
         set status = 'rejected', decided_by = v_uid, decided_at = now()
       where id = v_sibling.id;
      insert into public.document_processing_audit
        (user_id, operation_id, document_id, proposal_id, actor_type, actor_id, action)
      select user_id, operation_id, document_id, id, 'user', v_uid::text, 'change_rejected'
        from public.document_change_proposals where id = v_sibling.id;
      v_rejected := v_rejected + 1;
    end if;
  end loop;

  update public.project_documents d
     set status = 'processed'
   where d.id = v_p.document_id and d.status = 'needs_review'
     and not exists (select 1 from public.document_change_proposals x
                      where x.document_id = d.id and x.status = 'pending');

  return jsonb_build_object('applied', v_applied, 'failed', v_failed, 'rejected', v_rejected);
end;
$$;

-- ── Worker: reclamar, proponer y cerrar ─────────────────────────────────────────

-- Reclama la tarea más antigua. SKIP LOCKED impide que dos workers cojan la misma; una
-- tarea "processing" cuyo lease caducó (worker caído) vuelve a estar disponible; tras 3
-- intentos se da por fallida.
create or replace function public.claim_document_job(p_worker text, p_lease_seconds integer default 600)
returns setof public.document_processing_jobs
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_worker is null or p_worker !~ '^[A-Za-z0-9_.:-]{3,80}$' then
    raise exception 'invalid_worker';
  end if;

  update public.document_processing_jobs
     set status = 'error', finished_at = now(), updated_at = now(),
         error = 'La tarea se interrumpió varias veces. Vuelve a pulsar Actualizar con IA.'
   where status = 'processing' and lease_until < now() and attempts >= 3;

  return query
  update public.document_processing_jobs j
     set status = 'processing', worker_id = p_worker, attempts = j.attempts + 1,
         started_at = coalesce(j.started_at, now()),
         lease_until = now() + make_interval(secs => greatest(60, least(p_lease_seconds, 3600))),
         updated_at = now()
   where j.id = (
     select c.id from public.document_processing_jobs c
      where c.status = 'pending' or (c.status = 'processing' and c.lease_until < now())
      order by c.requested_at
      limit 1
      for update skip locked
   )
  returning j.*;
end;
$$;

create or replace function public.extend_document_job_lease(p_job uuid, p_worker text, p_lease_seconds integer default 600)
returns boolean
language sql security definer set search_path = public, pg_temp
as $$
  with u as (
    update public.document_processing_jobs
       set lease_until = now() + make_interval(secs => greatest(60, least(p_lease_seconds, 3600))), updated_at = now()
     where id = p_job and worker_id = p_worker and status = 'processing'
    returning 1
  )
  select exists (select 1 from u);
$$;

-- Registra una propuesta (idempotente por operación + clave) y, si procede, la aplica
-- en la misma transacción. Una propuesta pendiente anterior del mismo documento que ya
-- no coincide se marca como sustituida.
create or replace function public.record_document_proposal(
  p_job uuid, p_worker text, p_document uuid, p_operation text, p_kind text, p_mode text,
  p_target_id text, p_dedupe_key text, p_item jsonb, p_confidence numeric, p_auto boolean,
  p_reason text default null, p_document_version text default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_job public.document_processing_jobs%rowtype;
  v_doc public.project_documents%rowtype;
  v_id uuid;
  v_existing public.document_change_proposals%rowtype;
begin
  select * into v_job from public.document_processing_jobs
   where id = p_job and worker_id = p_worker and status = 'processing';
  if not found then raise exception 'job_not_owned'; end if;

  -- Aislamiento: documento y operación deben ser del mismo tenant que la tarea.
  select * into v_doc from public.project_documents
   where id = p_document and user_id = v_job.user_id and drive_folder_id = v_job.drive_folder_id;
  if not found then raise exception 'document_not_in_job'; end if;
  perform 1 from public.operaciones_inmobiliarias
   where id = p_operation and user_id = v_job.user_id and deleted_at is null
     and public.drive_folder_id_from_url(data -> 'invoicesDriveFolder' ->> 'url') = v_job.drive_folder_id;
  if not found then raise exception 'operation_not_in_job'; end if;

  select * into v_existing from public.document_change_proposals
   where operation_id = p_operation and dedupe_key = p_dedupe_key
     and status in ('pending', 'auto_applied', 'accepted');
  if found then
    if v_existing.document_version is not distinct from p_document_version
       or v_existing.item = p_item then
      return jsonb_build_object('proposal_id', v_existing.id, 'status', v_existing.status, 'duplicate', true);
    end if;
    if v_existing.document_id <> p_document then
      -- Otra copia (renombrada / duplicada) de algo ya registrado: no se vuelve a aplicar.
      return jsonb_build_object('proposal_id', v_existing.id, 'status', v_existing.status, 'duplicate', true);
    end if;
    -- Mismo documento modificado: la versión anterior queda sustituida y la nueva SIEMPRE
    -- pasa por revisión, para no pisar lo que el usuario haya corregido a mano.
    update public.document_change_proposals set status = 'superseded' where id = v_existing.id;
    p_auto := false;
    p_reason := coalesce(p_reason, 'El documento ha cambiado desde que se registró.');
  end if;

  insert into public.document_change_proposals
    (user_id, document_id, operation_id, job_id, kind, mode, target_id, dedupe_key, item,
     confidence, status, reason, document_version)
  values (v_job.user_id, p_document, p_operation, p_job, p_kind, p_mode, p_target_id, p_dedupe_key, p_item,
          p_confidence, 'pending', p_reason, p_document_version)
  returning id into v_id;

  if p_auto then
    return jsonb_build_object('proposal_id', v_id, 'duplicate', false)
           || public.apply_document_proposal(v_id, 'auto_applied', 'worker', p_worker);
  end if;

  insert into public.document_processing_audit
    (user_id, operation_id, job_id, document_id, proposal_id, actor_type, actor_id, action, new_value, confidence)
  values (v_job.user_id, p_operation, p_job, p_document, v_id, 'worker', p_worker, 'change_proposed', p_item, p_confidence);

  return jsonb_build_object('proposal_id', v_id, 'status', 'pending', 'duplicate', false, 'applied', false);
end;
$$;

-- Cierra la tarea. Idempotente: un segundo envío del mismo resultado no cambia nada.
create or replace function public.finish_document_job(p_job uuid, p_worker text, p_status text, p_summary jsonb, p_error text default null)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_job public.document_processing_jobs%rowtype;
begin
  if p_status not in ('completed', 'needs_review', 'error') then
    raise exception 'invalid_status';
  end if;
  update public.document_processing_jobs
     set status = p_status, summary = coalesce(p_summary, '{}'::jsonb), error = left(p_error, 500),
         finished_at = now(), lease_until = null, updated_at = now()
   where id = p_job and worker_id = p_worker and status = 'processing'
  returning * into v_job;
  if not found then return false; end if;

  insert into public.document_processing_audit (user_id, operation_id, job_id, actor_type, actor_id, action, detail)
  values (v_job.user_id, v_job.operation_id, v_job.id, 'worker', p_worker, 'job_finished',
          jsonb_build_object('status', p_status, 'summary', p_summary, 'error', left(p_error, 500)));
  return true;
end;
$$;

-- ── Permisos de ejecución ───────────────────────────────────────────────────────
-- Supabase concede EXECUTE a anon/authenticated por defecto: se retira explícitamente.

revoke all on function public.request_document_sync(text) from public, anon;
revoke all on function public.decide_document_proposal(uuid, boolean) from public, anon;
grant execute on function public.request_document_sync(text) to authenticated;
grant execute on function public.decide_document_proposal(uuid, boolean) to authenticated;

revoke all on function public.apply_document_proposal(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_document_job(text, integer) from public, anon, authenticated;
revoke all on function public.extend_document_job_lease(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.record_document_proposal(uuid, text, uuid, text, text, text, text, text, jsonb, numeric, boolean, text, text) from public, anon, authenticated;
revoke all on function public.finish_document_job(uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_document_proposal(uuid, text, text, text) to service_role;
grant execute on function public.claim_document_job(text, integer) to service_role;
grant execute on function public.extend_document_job_lease(uuid, text, integer) to service_role;
grant execute on function public.record_document_proposal(uuid, text, uuid, text, text, text, text, text, jsonb, numeric, boolean, text, text) to service_role;
grant execute on function public.finish_document_job(uuid, text, text, jsonb, text) to service_role;

commit;

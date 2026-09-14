// supabase/tests/documentSync.test.mjs
//
// "Actualizar con IA" contra un Postgres REAL (PGlite): RLS, aislamiento entre tenants,
// cola de tareas, idempotencia de propuestas y la única escritura sobre la operación.
// Ejecutar: npm run test:db

import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(join(HERE, "..", "migrations", "20260914_document_sync.sql"), "utf8");

const FOLDER = "1rWfolderAAAAAAAAAAAA";
const FOLDER_URL = `https://drive.google.com/drive/folders/${FOLDER}`;

const BOOTSTRAP = `
create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;
end $$;
grant usage on schema public, auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

create table public.operaciones_inmobiliarias (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  client_updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.operaciones_inmobiliarias enable row level security;
create policy operaciones_select on public.operaciones_inmobiliarias for select using (auth.uid() = user_id);
create policy operaciones_update on public.operaciones_inmobiliarias for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.operaciones_inmobiliarias to authenticated, service_role;
`;

async function setup() {
  const db = new PGlite();
  await db.exec(BOOTSTRAP);
  await db.exec(MIGRATION);
  const mkUser = async (email) => (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
  const A = await mkUser("a@test.com");
  const B = await mkUser("b@test.com");
  const mkOp = async (id, uid, data) =>
    db.query(`insert into public.operaciones_inmobiliarias (id, user_id, data, client_updated_at) values ($1, $2, $3, '2026-09-01T10:00:00Z')`, [id, uid, JSON.stringify(data)]);
  const folder = { url: FOLDER_URL, linkedAt: "2026-09-01T00:00:00Z" };
  await mkOp("opA1", A, {
    name: "Variante 1",
    invoicesDriveFolder: folder,
    realExpenses: [{ id: "rexp_1", concept: "Luz", amount: 10, date: "2026-01-01", createdAt: "x", updatedAt: "2026-01-01T00:00:00Z" }],
    sales: [{ id: "sale_1", title: "Vivienda 1", status: "DISPONIBLE", createdAt: "x", updatedAt: "2026-01-01T00:00:00Z" }],
  });
  await mkOp("opA2", A, { name: "Variante 2", invoicesDriveFolder: folder, realExpenses: [] });
  await mkOp("opA3", A, { name: "Sin carpeta" });
  await mkOp("opB1", B, { name: "De B", invoicesDriveFolder: { url: "https://drive.google.com/drive/folders/1BfolderBBBBBBBBBBBB", linkedAt: "x" } });

  const as = async (role, uid, fn) => {
    await db.exec("reset role;");
    await db.exec(`select set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid, role }) : ""}', false);`);
    await db.exec(`set role ${role};`);
    try {
      return await fn();
    } finally {
      await db.exec("reset role;");
      await db.exec("select set_config('request.jwt.claims', '', false);");
    }
  };
  const asUser = (uid, fn) => as("authenticated", uid, fn);
  const asWorker = (fn) => as("service_role", null, fn);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  return { db, A, B, as, asUser, asWorker, one };
}

async function denied(fn, pattern = /permission denied|not_authenticated|operation_not_found|proposal_not_found|job_not_owned|document_not_in_job|operation_not_in_job/) {
  await assert.rejects(fn, pattern);
}

/** Tarea reclamada + documento registrado por el worker, listo para proponer. */
async function claimedJobWithDocument(t) {
  const req = await t.asUser(t.A, () => t.one(`select public.request_document_sync('opA1') r`));
  const job = await t.asWorker(() => t.one(`select * from public.claim_document_job('pc-test')`));
  assert.equal(job.id, req.r.job_id);
  const doc = await t.asWorker(() =>
    t.one(
      `insert into public.project_documents (user_id, drive_folder_id, drive_file_id, operation_id, name, mime_type, md5_checksum, status, last_job_id)
       values ($1, $2, '1FileInvoiceXXXXXXXX', 'opA1', 'factura.pdf', 'application/pdf', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'pending', $3) returning id`,
      [t.A, FOLDER, job.id],
    ),
  );
  return { job, doc };
}

const expenseItem = { concept: "Fontanería", amount: 1210, date: "2026-09-10", category: "OBRA", documentUrl: "https://drive.google.com/file/d/1FileInvoiceXXXXXXXX/view" };

test("request_document_sync: crea una tarea, deduplica doble clic y valida propiedad y carpeta", async () => {
  const t = await setup();
  const first = await t.asUser(t.A, () => t.one(`select public.request_document_sync('opA1') r`));
  assert.equal(first.r.already_queued, false);
  const again = await t.asUser(t.A, () => t.one(`select public.request_document_sync('opA1') r`));
  assert.equal(again.r.job_id, first.r.job_id);
  assert.equal(again.r.already_queued, true);
  // Otra variante con la MISMA carpeta comparte la tarea activa.
  const variant = await t.asUser(t.A, () => t.one(`select public.request_document_sync('opA2') r`));
  assert.equal(variant.r.job_id, first.r.job_id);

  await assert.rejects(() => t.asUser(t.A, () => t.one(`select public.request_document_sync('opA3')`)), /drive_folder_missing/);
  await denied(() => t.asUser(t.A, () => t.one(`select public.request_document_sync('opB1')`)));
  await denied(() => t.as("anon", null, () => t.one(`select public.request_document_sync('opA1')`)));

  const audit = await t.asUser(t.A, () => t.one(`select count(*)::int n from public.document_processing_audit where action = 'job_requested'`));
  assert.equal(audit.n, 1);
});

test("multi-tenant: B no ve tareas, documentos, propuestas ni auditoría de A, ni puede decidir", async () => {
  const t = await setup();
  const { job, doc } = await claimedJobWithDocument(t);
  const rec = await t.asWorker(() =>
    t.one(`select public.record_document_proposal($1,'pc-test',$2,'opA1','real_expense','insert','rexp_doc_1FileInvoiceXXXXXXXX','invoice:B12345678:F-1',$3,0.7,false,'Revisar','v1') r`, [job.id, doc.id, JSON.stringify(expenseItem)]),
  );
  for (const table of ["document_processing_jobs", "project_documents", "document_change_proposals", "document_processing_audit"]) {
    const seenByB = await t.asUser(t.B, () => t.one(`select count(*)::int n from public.${table}`));
    assert.equal(seenByB.n, 0, `B ve filas de ${table}`);
    const seenByA = await t.asUser(t.A, () => t.one(`select count(*)::int n from public.${table}`));
    assert.ok(seenByA.n > 0, `A no ve sus filas de ${table}`);
  }
  await denied(() => t.asUser(t.B, () => t.one(`select public.decide_document_proposal($1, true)`, [rec.r.proposal_id])));
  // El navegador no puede escribir directamente en las tablas.
  await denied(() => t.asUser(t.A, () => t.one(`update public.document_change_proposals set status = 'accepted'`)));
  await denied(() => t.asUser(t.A, () => t.one(`insert into public.document_processing_jobs (user_id, operation_id, drive_folder_id) values ($1, 'opA1', $2)`, [t.A, FOLDER])));
  await denied(() => t.asUser(t.A, () => t.one(`delete from public.document_processing_audit`)));
  // Ni ejecutar funciones del worker.
  await denied(() => t.asUser(t.A, () => t.one(`select * from public.claim_document_job('pc-evil')`)));
  await denied(() => t.asUser(t.A, () => t.one(`select public.apply_document_proposal($1, 'accepted', 'user', 'x')`, [rec.r.proposal_id])));
});

test("worker: dos workers no reclaman la misma tarea; lease caducado se recupera; resultado duplicado no cambia nada", async () => {
  const t = await setup();
  await t.asUser(t.A, () => t.one(`select public.request_document_sync('opA1')`));
  const w1 = await t.asWorker(() => t.db.query(`select * from public.claim_document_job('pc-1')`));
  const w2 = await t.asWorker(() => t.db.query(`select * from public.claim_document_job('pc-2')`));
  assert.equal(w1.rows.length, 1);
  assert.equal(w2.rows.length, 0, "el segundo worker no debe recibir la tarea en curso");

  // Worker 1 "cae": el lease caduca y otro worker la retoma.
  await t.db.query(`update public.document_processing_jobs set lease_until = now() - interval '1 second'`);
  const retaken = await t.asWorker(() => t.one(`select * from public.claim_document_job('pc-2')`));
  assert.equal(retaken.id, w1.rows[0].id);
  assert.equal(retaken.attempts, 2);
  // El worker caído ya no puede cerrarla ni proponer.
  const stale = await t.asWorker(() => t.one(`select public.finish_document_job($1, 'pc-1', 'completed', '{}') ok`, [retaken.id]));
  assert.equal(stale.ok, false);

  const done = await t.asWorker(() => t.one(`select public.finish_document_job($1, 'pc-2', 'completed', '{"reviewed":3}') ok`, [retaken.id]));
  assert.equal(done.ok, true);
  const dup = await t.asWorker(() => t.one(`select public.finish_document_job($1, 'pc-2', 'error', '{}', 'boom') ok`, [retaken.id]));
  assert.equal(dup.ok, false);
  const job = await t.one(`select status, summary from public.document_processing_jobs where id = $1`, [retaken.id]);
  assert.equal(job.status, "completed");
  assert.equal(job.summary.reviewed, 3);

  // Tras terminar, se puede pedir otra actualización.
  const next = await t.asUser(t.A, () => t.one(`select public.request_document_sync('opA1') r`));
  assert.equal(next.r.already_queued, false);
});

test("worker: tras 3 caídas la tarea queda en error", async () => {
  const t = await setup();
  await t.asUser(t.A, () => t.one(`select public.request_document_sync('opA1')`));
  for (let i = 0; i < 3; i++) {
    await t.asWorker(() => t.one(`select * from public.claim_document_job('pc-1')`));
    await t.db.query(`update public.document_processing_jobs set lease_until = now() - interval '1 second'`);
  }
  const none = await t.asWorker(() => t.db.query(`select * from public.claim_document_job('pc-1')`));
  assert.equal(none.rows.length, 0);
  const job = await t.one(`select status from public.document_processing_jobs`);
  assert.equal(job.status, "error");
});

test("auto-aplicación: añade el gasto real, avanza client_updated_at y audita; reenviar no duplica", async () => {
  const t = await setup();
  const { job, doc } = await claimedJobWithDocument(t);
  const call = () =>
    t.asWorker(() =>
      t.one(`select public.record_document_proposal($1,'pc-test',$2,'opA1','real_expense','insert','rexp_doc_1FileInvoiceXXXXXXXX','invoice:B12345678:F-1',$3,0.97,true,null,'v1') r`, [job.id, doc.id, JSON.stringify({ ...expenseItem, id: "hack", deletedAt: "2026-01-01" })]),
    );
  const first = await call();
  assert.equal(first.r.applied, true);
  const op = await t.one(`select data, client_updated_at from public.operaciones_inmobiliarias where id = 'opA1'`);
  const added = op.data.realExpenses.find((e) => e.id === "rexp_doc_1FileInvoiceXXXXXXXX");
  assert.ok(added, "el gasto se añadió con el id del documento");
  assert.equal(added.amount, 1210);
  assert.equal(added.deletedAt, undefined, "un documento no puede traer marca de borrado");
  assert.equal(op.data.realExpenses.length, 2, "se conserva el gasto existente");
  assert.equal(new Date(op.client_updated_at).toISOString(), "2026-09-01T10:00:00.001Z");
  assert.equal(op.data.updatedAt, "2026-09-01T10:00:00.001Z");

  const second = await call(); // resultado del worker enviado dos veces
  assert.equal(second.r.duplicate, true);
  const again = await t.one(`select jsonb_array_length(data->'realExpenses') n from public.operaciones_inmobiliarias where id = 'opA1'`);
  assert.equal(again.n, 2);

  const audit = await t.asUser(t.A, () => t.one(`select old_value, new_value, actor_type, field from public.document_processing_audit where action = 'change_auto_applied'`));
  assert.equal(audit.actor_type, "worker");
  assert.equal(audit.old_value, null);
  assert.equal(audit.new_value.amount, 1210);
  assert.equal(audit.field, "realExpenses[rexp_doc_1FileInvoiceXXXXXXXX]");
});

test("misma factura desde otro documento (renombrado/copiado) no se aplica dos veces", async () => {
  const t = await setup();
  const { job, doc } = await claimedJobWithDocument(t);
  await t.asWorker(() =>
    t.one(`select public.record_document_proposal($1,'pc-test',$2,'opA1','real_expense','insert','rexp_doc_1FileInvoiceXXXXXXXX','invoice:B12345678:F-1',$3,0.97,true,null,'v1')`, [job.id, doc.id, JSON.stringify(expenseItem)]),
  );
  const copy = await t.asWorker(() =>
    t.one(`insert into public.project_documents (user_id, drive_folder_id, drive_file_id, name, mime_type) values ($1, $2, '1FileCopyYYYYYYYYYYYY', 'copia.pdf', 'application/pdf') returning id`, [t.A, FOLDER]),
  );
  const res = await t.asWorker(() =>
    t.one(`select public.record_document_proposal($1,'pc-test',$2,'opA1','real_expense','insert','rexp_doc_1FileCopyYYYYYYYYYYYY','invoice:B12345678:F-1',$3,0.97,true,null,'v9') r`, [job.id, copy.id, JSON.stringify({ ...expenseItem, concept: "otra" })]),
  );
  assert.equal(res.r.duplicate, true);
  const n = await t.one(`select jsonb_array_length(data->'realExpenses') n from public.operaciones_inmobiliarias where id = 'opA1'`);
  assert.equal(n.n, 2);
});

test("documento modificado: la nueva versión sustituye a la anterior y pasa a revisión", async () => {
  const t = await setup();
  const { job, doc } = await claimedJobWithDocument(t);
  await t.asWorker(() =>
    t.one(`select public.record_document_proposal($1,'pc-test',$2,'opA1','real_expense','insert','rexp_doc_1FileInvoiceXXXXXXXX','invoice:B12345678:F-1',$3,0.97,true,null,'v1')`, [job.id, doc.id, JSON.stringify(expenseItem)]),
  );
  const res = await t.asWorker(() =>
    t.one(`select public.record_document_proposal($1,'pc-test',$2,'opA1','real_expense','insert','rexp_doc_1FileInvoiceXXXXXXXX','invoice:B12345678:F-1',$3,0.99,true,null,'v2') r`, [job.id, doc.id, JSON.stringify({ ...expenseItem, amount: 1300 })]),
  );
  assert.equal(res.r.status, "pending");
  const statuses = (await t.db.query(`select status from public.document_change_proposals order by created_at`)).rows.map((r) => r.status);
  assert.deepEqual(statuses.sort(), ["pending", "superseded"]);
  const amount = await t.one(`select (e->>'amount')::numeric a from public.operaciones_inmobiliarias o, jsonb_array_elements(o.data->'realExpenses') e where o.id='opA1' and e->>'id'='rexp_doc_1FileInvoiceXXXXXXXX'`);
  assert.equal(Number(amount.a), 1210, "no se pisa sin revisión");
});

test("revisión: aceptar aplica en todas las variantes de la carpeta y registra quién; rechazar no toca datos", async () => {
  const t = await setup();
  const { job, doc } = await claimedJobWithDocument(t);
  const ids = [];
  for (const op of ["opA1", "opA2"]) {
    const r = await t.asWorker(() =>
      t.one(`select public.record_document_proposal($1,'pc-test',$2,$3,'real_expense','insert','rexp_doc_1FileInvoiceXXXXXXXX','invoice:B12345678:F-1',$4,0.75,false,'Confianza media','v1') r`, [job.id, doc.id, op, JSON.stringify(expenseItem)]),
    );
    ids.push(r.r.proposal_id);
  }
  // La operación de B no es de esta tarea: el worker no puede colarle una propuesta.
  await denied(() =>
    t.asWorker(() =>
      t.one(`select public.record_document_proposal($1,'pc-test',$2,'opB1','real_expense','insert','rexp_x','file:x',$3,0.99,true)`, [job.id, doc.id, JSON.stringify(expenseItem)]),
    ),
  );
  const before = await t.one(`select jsonb_array_length(data->'realExpenses') n from public.operaciones_inmobiliarias where id = 'opA2'`);
  assert.equal(before.n, 0, "pendiente no modifica datos");

  const res = await t.asUser(t.A, () => t.one(`select public.decide_document_proposal($1, true) r`, [ids[0]]));
  assert.equal(res.r.applied, 2);
  for (const op of ["opA1", "opA2"]) {
    const has = await t.one(`select exists (select 1 from public.operaciones_inmobiliarias o, jsonb_array_elements(o.data->'realExpenses') e where o.id=$1 and e->>'id'='rexp_doc_1FileInvoiceXXXXXXXX') x`, [op]);
    assert.equal(has.x, true, `${op} recibe el gasto`);
  }
  const decided = (await t.db.query(`select status, decided_by from public.document_change_proposals`)).rows;
  assert.ok(decided.every((p) => p.status === "accepted" && p.decided_by === t.A));
  await assert.rejects(() => t.asUser(t.A, () => t.one(`select public.decide_document_proposal($1, true)`, [ids[1]])), /proposal_not_pending/);

  // Rechazo
  const doc2 = await t.asWorker(() =>
    t.one(`insert into public.project_documents (user_id, drive_folder_id, drive_file_id, name, mime_type, status) values ($1, $2, '1FileSaleZZZZZZZZZZZZ', 'arras.pdf', 'application/pdf', 'needs_review') returning id`, [t.A, FOLDER]),
  );
  const sale = await t.asWorker(() =>
    t.one(`select public.record_document_proposal($1,'pc-test',$2,'opA1','sale','patch','sale_1','sale:1FileSaleZZZZZZZZZZZZ',$3,0.7,false,'Unidad dudosa') r`, [job.id, doc2.id, JSON.stringify({ status: "VENDIDO", realPrice: 200000 })]),
  );
  await t.asUser(t.A, () => t.one(`select public.decide_document_proposal($1, false)`, [sale.r.proposal_id]));
  const s = await t.one(`select e->>'status' st from public.operaciones_inmobiliarias o, jsonb_array_elements(o.data->'sales') e where o.id='opA1'`);
  assert.equal(s.st, "DISPONIBLE");
  const d2 = await t.one(`select status from public.project_documents where id = $1`, [doc2.id]);
  assert.equal(d2.status, "processed");
  const rejectedAudit = await t.one(`select count(*)::int n from public.document_processing_audit where action = 'change_rejected' and actor_id = $1`, [t.A]);
  assert.equal(rejectedAudit.n, 1);
});

test("aplicar: parche de venta sobre la fila existente; nunca revive un gasto borrado por el usuario", async () => {
  const t = await setup();
  const { job, doc } = await claimedJobWithDocument(t);
  const sale = await t.asWorker(() =>
    t.one(`select public.record_document_proposal($1,'pc-test',$2,'opA1','sale','patch','sale_1','sale:1FileInvoiceXXXXXXXX',$3,0.96,true) r`, [job.id, doc.id, JSON.stringify({ status: "VENDIDO", realPrice: 185000, date: "2026-09-01" })]),
  );
  assert.equal(sale.r.applied, true);
  const s = await t.one(`select e from public.operaciones_inmobiliarias o, jsonb_array_elements(o.data->'sales') e where o.id='opA1'`);
  assert.equal(s.e.status, "VENDIDO");
  assert.equal(s.e.title, "Vivienda 1", "conserva los campos de la fila");
  assert.equal(s.e.realPrice, 185000);

  const missing = await t.asWorker(() =>
    t.one(`select public.record_document_proposal($1,'pc-test',$2,'opA1','sale','patch','sale_nope','sale:other',$3,0.96,true) r`, [job.id, doc.id, JSON.stringify({ status: "VENDIDO" })]),
  );
  assert.equal(missing.r.applied, false);
  assert.equal(missing.r.reason, "target_not_found");

  await t.db.query(`update public.operaciones_inmobiliarias set data = jsonb_set(data, '{realExpenses,0,deletedAt}', '"2026-09-02T00:00:00Z"') where id = 'opA1'`);
  const revive = await t.asWorker(() =>
    t.one(`select public.record_document_proposal($1,'pc-test',$2,'opA1','real_expense','insert','rexp_1','file:rexp_1',$3,0.99,true) r`, [job.id, doc.id, JSON.stringify(expenseItem)]),
  );
  assert.equal(revive.r.applied, false);
  assert.equal(revive.r.reason, "deleted_by_user");
  const e = await t.one(`select e from public.operaciones_inmobiliarias o, jsonb_array_elements(o.data->'realExpenses') e where o.id='opA1' and e->>'id'='rexp_1'`);
  assert.equal(e.e.concept, "Luz");
});

test("drive_folder_id_from_url reconoce solo enlaces de Drive", async () => {
  const t = await setup();
  const r = await t.one(
    `select public.drive_folder_id_from_url($1) a, public.drive_folder_id_from_url($2) b, public.drive_folder_id_from_url($3) c, public.drive_folder_id_from_url($4) d`,
    [FOLDER_URL, "https://drive.google.com/drive/u/0/folders/1abcdefghijKLMN?usp=sharing", "https://evil.com/drive/folders/1abcdefghijKLMN", "https://drive.google.com/open?id=1abcdefghijKLMN"],
  );
  assert.equal(r.a, FOLDER);
  assert.equal(r.b, "1abcdefghijKLMN");
  assert.equal(r.c, null);
  assert.equal(r.d, "1abcdefghijKLMN");
});

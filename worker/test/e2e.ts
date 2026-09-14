// worker/test/e2e.ts — Prueba de extremo a extremo contra el Supabase REAL.
//
//   SUPABASE_PUBLISHABLE_KEY=… npm run worker:e2e
//
// Crea dos usuarios temporales (A y B) con la API de administración, sus operaciones, y
// recorre: petición desde el cliente (RLS real) → dos workers compitiendo → Drive simulado →
// extracción real → propuestas/auto-aplicación (RPC reales) → revisión aceptar/rechazar →
// push de la WEB con copia antigua → aislamiento A/B. Al final borra los usuarios (cascada).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvFile, readConfig } from "../config.ts";
import { createDriveClient } from "../drive.ts";
import { processJob } from "../pipeline.ts";
import { createStore } from "../store.ts";
import { mergeOperationForPush } from "../../src/sync/merge.ts";
import { startMockDrive } from "./mockDrive.ts";

loadEnvFile();
// La prueba usa un Drive simulado: no necesita la autorización real de Google.
for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]) process.env[k] ??= "e2e-no-usado";
const cfg = readConfig();
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!publishable) throw new Error("Falta SUPABASE_PUBLISHABLE_KEY");

const admin = createClient(cfg.supabaseUrl, cfg.supabaseSecretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const step = (msg: string) => process.stdout.write(`✔ ${msg}\n`);

async function signedInUser(tag: string): Promise<{ id: string; email: string; client: SupabaseClient }> {
  const email = `docsync-e2e-${tag}-${randomUUID().slice(0, 8)}@invergravital.com`;
  const password = randomUUID() + "Aa1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(cfg.supabaseUrl, publishable!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, client };
}

async function main() {
  const fixtures = mkdtempSync(join(tmpdir(), "igv-e2e-"));
  execFileSync(cfg.tools.python, [join(import.meta.dirname, "fixtures.py"), fixtures]);
  const fx = (n: string) => readFileSync(join(fixtures, n));
  const drive = await startMockDrive();
  const users: string[] = [];
  try {
    const A = await signedInUser("a");
    const B = await signedInUser("b");
    users.push(A.id, B.id);
    step("usuarios temporales A y B con sesión real");

    const ROOT = `1E2eRoot${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const folderUrl = `https://drive.google.com/drive/folders/${ROOT}`;
    const opData = (name: string) => ({
      name,
      invoicesDriveFolder: { url: folderUrl, linkedAt: new Date().toISOString() },
      units: [{ id: "u1", type: "VIVIENDA", title: "Vivienda 1" }],
      sales: [{ id: "sale_1", title: "Vivienda 1", status: "DISPONIBLE", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" }],
      realExpenses: [],
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    const opA1 = `e2e-${randomUUID()}`;
    const opA2 = `e2e-${randomUUID()}`;
    const opB1 = `e2e-${randomUUID()}`;
    for (const [client, uid, id, name] of [[A.client, A.id, opA1, "Var 1"], [A.client, A.id, opA2, "Var 2"], [B.client, B.id, opB1, "De B"]] as const) {
      const { error } = await client.from("operaciones_inmobiliarias").insert({ id, user_id: uid, data: opData(name), client_updated_at: "2026-09-01T00:00:00.000Z" });
      if (error) throw error;
    }
    step("operaciones creadas por los propios usuarios (RLS de inserción)");

    drive.put({ id: ROOT, name: "Obra", mimeType: "application/vnd.google-apps.folder", parent: "", owners: [A.email] });
    drive.shared.add(ROOT);
    drive.put({ id: "1E2eInvoiceDigitalXXX", name: "factura.pdf", mimeType: "application/pdf", parent: ROOT, content: fx("invoice_digital.pdf") });
    drive.put({ id: "1E2eInvoiceScannedXXX", name: "escaneo.pdf", mimeType: "application/pdf", parent: ROOT, content: fx("invoice_scanned.pdf") });
    drive.put({ id: "1E2eIllegibleXXXXXXXX", name: "ilegible.pdf", mimeType: "application/pdf", parent: ROOT, content: fx("illegible.pdf") });
    drive.put({ id: "1E2eSaleDeedXXXXXXXXX", name: "escritura.pdf", mimeType: "application/pdf", parent: ROOT, content: fx("sale_deed.pdf") });

    // Doble clic
    const r1 = await A.client.rpc("request_document_sync", { p_operation_id: opA1 });
    const r2 = await A.client.rpc("request_document_sync", { p_operation_id: opA2 });
    assert.ifError(r1.error);
    assert.equal(r2.data.job_id, r1.data.job_id);
    assert.equal(r2.data.already_queued, true);
    const denied = await B.client.rpc("request_document_sync", { p_operation_id: opA1 });
    assert.match(denied.error?.message ?? "", /operation_not_found/);
    step("petición: doble clic y variante comparten tarea; B no puede pedir sobre la operación de A");

    // Dos workers compitiendo por la misma tarea (SKIP LOCKED real)
    const w1 = createStore(cfg.supabaseUrl, cfg.supabaseSecretKey, "e2e-worker-1");
    const w2 = createStore(cfg.supabaseUrl, cfg.supabaseSecretKey, "e2e-worker-2");
    const claims = await Promise.all([w1.claimJob(600), w2.claimJob(600)]);
    const mine = claims.filter((j) => j?.id === r1.data.job_id);
    assert.equal(mine.length, 1, "exactamente un worker obtiene la tarea");
    const winner = claims[0]?.id === r1.data.job_id ? w1 : w2;
    const job = mine[0]!;
    step("concurrencia: dos workers simultáneos, solo uno reclama la tarea");

    const driveClient = createDriveClient({ clientId: "c", clientSecret: "s", refreshToken: "good-refresh", apiBase: `${drive.url}/drive/v3`, tokenUrl: `${drive.url}/token` });
    const deps = { store: winner, drive: driveClient, tools: cfg.tools, assistants: [], log: () => {} };
    const result = await processJob(job, deps);
    assert.equal(result.status, "completed");
    assert.deepEqual([result.summary.reviewed, result.summary.autoApplied, result.summary.unreadable], [4, 3, 1]);
    // Resultado enviado dos veces: no cambia nada.
    assert.equal(await winner.finishJob(job.id, "error", {}, "duplicado"), false);
    step(`worker: ${JSON.stringify(result.summary)}`);

    // Lo que ve A (RLS) en su operación
    const { data: rows } = await A.client.from("operaciones_inmobiliarias").select("id, data, client_updated_at").in("id", [opA1, opA2]);
    for (const row of rows ?? []) {
      const amounts = (row.data.realExpenses as { id: string; amount: number }[]).map((e) => e.amount).sort((a, b) => a - b);
      assert.deepEqual(amounts, [3025, 9922], `${row.id}: gastos reales`);
      assert.equal(row.data.sales[0].status, "VENDIDO");
      assert.equal(row.data.sales[0].realPrice, 185000);
    }
    const { data: docs } = await A.client.from("project_documents").select("name, status, extraction").eq("drive_folder_id", ROOT);
    assert.equal(docs?.length, 4);
    assert.equal(docs?.find((d) => d.name === "ilegible.pdf")?.status, "unreadable");
    const { data: jobRow } = await A.client.from("document_processing_jobs").select("status, summary").eq("id", job.id).single();
    assert.equal(jobRow?.status, "completed");
    const { count: auditCount } = await A.client.from("document_processing_audit").select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("action", "change_auto_applied");
    assert.equal(auditCount, 6);
    step("datos reales actualizados en ambas variantes, documentos, tarea y auditoría visibles para A");

    // Aislamiento
    for (const table of ["project_documents", "document_change_proposals", "document_processing_audit", "document_processing_jobs"]) {
      const { data } = await B.client.from(table).select("id").limit(5);
      assert.equal(data?.length ?? 0, 0, `B ve ${table} de A`);
    }
    const { data: opsSeenByB } = await B.client.from("operaciones_inmobiliarias").select("id").in("id", [opA1, opA2]);
    assert.equal(opsSeenByB?.length, 0);
    const forged = await B.client.from("document_change_proposals").update({ status: "accepted" }).eq("operation_id", opA1).select("id");
    assert.equal(forged.data?.length ?? 0, 0);
    step("aislamiento: B no ve ni modifica nada de A");

    // Push de la WEB desde una copia antigua (sin el gasto ni la venta): no se pierden.
    const stale = { id: opA1, ...opData("Var 1 editada"), updatedAt: "2026-09-14T12:00:00.000Z" };
    const { data: existing } = await A.client.from("operaciones_inmobiliarias").select("data, client_updated_at").eq("id", opA1).single();
    const merged = mergeOperationForPush(stale as never, existing!.data);
    const { data: written } = await A.client
      .from("operaciones_inmobiliarias")
      .update({ data: merged, client_updated_at: stale.updatedAt })
      .eq("id", opA1)
      .eq("client_updated_at", existing!.client_updated_at)
      .select("data");
    assert.equal(written?.length, 1);
    assert.equal((written![0].data.realExpenses as unknown[]).length, 2, "los gastos del documento sobreviven");
    assert.equal(written![0].data.sales[0].status, "VENDIDO", "la venta confirmada sobrevive");
    assert.equal(written![0].data.name, "Var 1 editada");
    step("sync WEB: un push con copia antigua conserva gastos y venta aplicados por el worker");

    // Documento modificado → revisión; B no puede decidir; A acepta en todas las variantes.
    drive.put({ ...drive.files.get("1E2eInvoiceDigitalXXX")!, content: fx("invoice_digital_v2.pdf"), modifiedTime: "2026-09-14T10:00:00.000Z" });
    const r3 = await A.client.rpc("request_document_sync", { p_operation_id: opA1 });
    const job2 = await w1.claimJob(600);
    assert.equal(job2?.id, r3.data.job_id);
    const result2 = await processJob(job2!, { ...deps, store: w1 });
    assert.equal(result2.status, "needs_review");
    const { data: pending } = await A.client.from("document_change_proposals").select("id, operation_id, item, reason").eq("status", "pending");
    assert.equal(pending?.length, 2);
    const byB = await B.client.rpc("decide_document_proposal", { p_proposal: pending![0].id, p_accept: true });
    assert.match(byB.error?.message ?? "", /proposal_not_found/);
    const accept = await A.client.rpc("decide_document_proposal", { p_proposal: pending![0].id, p_accept: true });
    assert.ifError(accept.error);
    assert.equal(accept.data.applied, 2);
    const { data: after } = await A.client.from("operaciones_inmobiliarias").select("data").in("id", [opA1, opA2]);
    for (const row of after ?? []) assert.ok((row.data.realExpenses as { amount: number }[]).some((e) => e.amount === 10285), "valor corregido aplicado");
    const { data: decided } = await A.client.from("document_change_proposals").select("decided_by, status").eq("status", "accepted");
    assert.ok(decided?.length === 2 && decided.every((d) => d.decided_by === A.id));
    step("revisión: documento modificado → pendiente; B no puede decidir; A acepta y queda registrado quién");

    // Rechazo: una venta ambigua (fila inexistente) creada a mano como pendiente y rechazada.
    await admin.from("operaciones_inmobiliarias").update({ data: { ...after![0].data, sales: [] } }).eq("id", opA1);
    drive.put({ id: "1E2eSecondSaleXXXXXXX", name: "escritura 2.pdf", mimeType: "application/pdf", parent: ROOT, content: Buffer.concat([fx("sale_deed.pdf"), Buffer.from("\n% v2")]) });
    const r4 = await A.client.rpc("request_document_sync", { p_operation_id: opA1 });
    const job3 = await w2.claimJob(600);
    assert.equal(job3?.id, r4.data.job_id);
    await processJob(job3!, { ...deps, store: w2 });
    const { data: salePending } = await A.client.from("document_change_proposals").select("id, operation_id").eq("status", "pending").eq("kind", "sale").eq("operation_id", opA1);
    assert.equal(salePending?.length, 1);
    const reject = await A.client.rpc("decide_document_proposal", { p_proposal: salePending![0].id, p_accept: false });
    assert.ifError(reject.error);
    const { data: noSale } = await A.client.from("operaciones_inmobiliarias").select("data").eq("id", opA1).single();
    assert.equal((noSale!.data.sales as unknown[]).length, 0, "rechazar no modifica datos");
    step("rechazo: la propuesta dudosa no modifica la operación");
  } finally {
    await drive.close();
    rmSync(fixtures, { recursive: true, force: true });
    for (const id of users) {
      const { error } = await admin.auth.admin.deleteUser(id);
      process.stdout.write(error ? `✖ no se pudo borrar el usuario temporal ${id}: ${error.message}\n` : `✔ usuario temporal borrado (cascada)\n`);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`✖ ${err instanceof Error ? err.stack : err}\n`);
  process.exit(1);
});

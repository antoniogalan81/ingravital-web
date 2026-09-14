// Pipeline completo con Drive simulado, extracción REAL (PyMuPDF + Tesseract) y un almacén en
// memoria que reproduce la semántica de record_document_proposal. La misma lógica SQL se
// prueba en supabase/tests/documentSync.test.mjs y contra producción en worker/test/e2e.ts.

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { REOperation } from "../src/lib/realEstate.ts";
import { createDriveClient, folderBelongsTo } from "./drive.ts";
import { planSync, processJob, type PipelineDeps } from "./pipeline.ts";
import { extractText, type DocumentError } from "./extract/text.ts";
import type { DocumentRow, JobRow, Store } from "./store.ts";
import type { Proposal } from "./rules.ts";
import { startMockDrive, type MockDrive } from "./test/mockDrive.ts";

const TESSERACT = process.env.TESSERACT_PATH ?? join(process.env.ProgramFiles ?? "C:\\Program Files", "Tesseract-OCR", "tesseract.exe");
const TESSDATA = process.env.TESSDATA_DIR ?? join(process.env.LOCALAPPDATA ?? ".", "Invergravital", "tessdata");
const canOcr = existsSync(TESSERACT) && existsSync(join(TESSDATA, "spa.traineddata"));

const ROOT = "1RootFolderAAAAAAAAAAAA";
const SUB = "1SubFolderSuministrosXX";
const OWNER = "owner@test.com";

let drive: MockDrive;
let fixtures: string;

before(async () => {
  fixtures = mkdtempSync(join(tmpdir(), "igv-fixtures-"));
  execFileSync(process.env.PYTHON_PATH ?? "python", [join(import.meta.dirname, "test", "fixtures.py"), fixtures]);
  drive = await startMockDrive();
});
after(async () => {
  await drive.close();
  rmSync(fixtures, { recursive: true, force: true });
});

// ── Almacén en memoria ────────────────────────────────────────────────────────

type StoredProposal = Proposal & { id: string; documentId: string; status: string; version: string };

function memoryStore(ops: REOperation[], email = OWNER) {
  const docs = new Map<string, DocumentRow & Record<string, unknown>>();
  const proposals: StoredProposal[] = [];
  const finished: { status: string; summary: Record<string, number>; error?: string }[] = [];
  let seq = 0;

  const apply = (p: StoredProposal) => {
    const op = ops.find((o) => o.id === p.operationId)!;
    const key = p.kind === "real_expense" ? "realExpenses" : p.kind === "real_loan" ? "realLoans" : "sales";
    const list = [...(((op as Record<string, unknown>)[key] as { id: string }[]) ?? [])];
    const idx = list.findIndex((x) => x.id === p.targetId);
    if (p.mode === "patch" && idx < 0) return false;
    const next = { ...(idx >= 0 ? list[idx] : {}), ...p.item, id: p.targetId, updatedAt: new Date().toISOString() };
    if (idx >= 0) list[idx] = next;
    else list.push(next);
    (op as Record<string, unknown>)[key] = list;
    return true;
  };

  const store = {
    claimJob: async () => null,
    extendLease: async () => true,
    finishJob: async (_id: string, status: string, summary: Record<string, number>, error?: string) => (finished.push({ status, summary, error }), true),
    userEmail: async () => email,
    folderOperations: async () => ops,
    documents: async () => [...docs.values()],
    upsertSeen: async (rows: Record<string, unknown>[]) =>
      rows.map((r) => {
        const existing = [...docs.values()].find((d) => d.drive_file_id === r.drive_file_id);
        const row = { ...(existing ?? { id: `doc${++seq}`, status: "pending", attempts: 0, content_sha256: null, extractor_version: null }), ...r } as DocumentRow & Record<string, unknown>;
        docs.set(row.id, row);
        return row;
      }),
    markRemoved: async (ids: string[]) => ids.forEach((id) => (docs.get(id)!.removed_at = "now")),
    updateDocument: async (_u: string, id: string, patch: Record<string, unknown>) => void docs.set(id, { ...docs.get(id)!, ...patch }),
    findByHash: async (_u: string, _f: string, sha: string, exclude: string) =>
      [...docs.values()].find((d) => d.content_sha256 === sha && d.id !== exclude && ["processed", "needs_review", "already_registered"].includes(d.status))?.id ?? null,
    recordProposal: async (_job: JobRow, documentId: string, p: Proposal, version: string) => {
      const active = proposals.find((x) => x.operationId === p.operationId && x.dedupeKey === p.dedupeKey && ["pending", "auto_applied", "accepted"].includes(x.status));
      let auto = p.auto;
      if (active) {
        if (active.version === version || JSON.stringify(active.item) === JSON.stringify(p.item) || active.documentId !== documentId) return { proposal_id: active.id, status: active.status, duplicate: true };
        active.status = "superseded";
        auto = false;
      }
      const stored: StoredProposal = { ...p, id: `p${++seq}`, documentId, status: "pending", version };
      proposals.push(stored);
      if (auto && apply(stored)) {
        stored.status = "auto_applied";
        return { proposal_id: stored.id, applied: true };
      }
      return { proposal_id: stored.id, status: "pending", applied: false };
    },
    audit: async () => {},
  };
  return { store: store as unknown as Store, docs, proposals, finished };
}

const variant = (id: string): REOperation =>
  ({
    id,
    name: id,
    purchasePrice: 0,
    units: [{ id: "u1", type: "VIVIENDA", title: "Vivienda 1" }],
    costs: {},
    financing: {},
    createdAt: "",
    updatedAt: "",
    invoicesDriveFolder: { url: `https://drive.google.com/drive/folders/${ROOT}`, linkedAt: "" },
    sales: [{ id: `sale_${id}`, title: "Vivienda 1", status: "DISPONIBLE", createdAt: "", updatedAt: "" }],
    realExpenses: [{ id: "rexp_manual", concept: "Registrado a mano", amount: 50, date: "2026-01-01", documentUrl: "https://drive.google.com/file/d/1ManualLinkedFileXXXX/view", createdAt: "", updatedAt: "" }],
  }) as unknown as REOperation;

const JOB: JobRow = { id: "job1", user_id: "user1", operation_id: "v1", drive_folder_id: ROOT, attempts: 1 };

const deps = (store: Store): PipelineDeps => ({
  store,
  drive: createDriveClient({ clientId: "c", clientSecret: "s", refreshToken: "good-refresh", apiBase: `${drive.url}/drive/v3`, tokenUrl: `${drive.url}/token` }),
  tools: { python: process.env.PYTHON_PATH ?? "python", tesseract: TESSERACT, tessdata: TESSDATA },
  assistants: [],
  log: () => {},
});

const fx = (name: string) => readFileSync(join(fixtures, name));

function seedDrive() {
  drive.files.clear();
  drive.shared.clear();
  drive.put({ id: ROOT, name: "Obra", mimeType: "application/vnd.google-apps.folder", parent: "", owners: [OWNER] });
  drive.shared.add(ROOT);
  drive.put({ id: SUB, name: "Suministros", mimeType: "application/vnd.google-apps.folder", parent: ROOT });
  const pdf = "application/pdf";
  drive.put({ id: "1InvoiceDigitalXXXXXX", name: "factura fontanería.pdf", mimeType: pdf, parent: ROOT, content: fx("invoice_digital.pdf") });
  drive.put({ id: "1InvoiceScannedXXXXXX", name: "escaneo.pdf", mimeType: pdf, parent: SUB, content: fx("invoice_scanned.pdf") });
  drive.put({ id: "1InvoiceImageXXXXXXXX", name: "foto factura.png", mimeType: "image/png", parent: ROOT, content: fx("invoice_image.png") });
  drive.put({ id: "1IllegibleXXXXXXXXXXX", name: "borroso.pdf", mimeType: pdf, parent: ROOT, content: fx("illegible.pdf") });
  drive.put({ id: "1FakeMimeXXXXXXXXXXXX", name: "no-es-pdf.pdf", mimeType: pdf, parent: ROOT, content: fx("fake.pdf") });
  drive.put({ id: "1ZipArchiveXXXXXXXXXX", name: "facturas.zip", mimeType: "application/zip", parent: ROOT, content: fx("fake.pdf") });
  drive.put({ id: "1GoogleSheetXXXXXXXXX", name: "Control gastos", mimeType: "application/vnd.google-apps.spreadsheet", parent: ROOT });
  drive.put({ id: "1DuplicateCopyXXXXXXX", name: "factura fontanería (copia).pdf", mimeType: pdf, parent: SUB, content: fx("invoice_digital.pdf") });
  drive.put({ id: "1ManualLinkedFileXXXX", name: "ya registrado.pdf", mimeType: pdf, parent: ROOT, content: fx("invoice_digital.pdf") });
  drive.put({ id: "1SaleDeedXXXXXXXXXXXX", name: "escritura vivienda 1.pdf", mimeType: pdf, parent: ROOT, content: fx("sale_deed.pdf") });
  drive.put({ id: "1LoanXXXXXXXXXXXXXXXX", name: "préstamo.pdf", mimeType: pdf, parent: ROOT, content: fx("loan.pdf") });
  drive.put({ id: "1XlsxInvoiceXXXXXXXXX", name: "factura obra.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", parent: ROOT, content: fx("invoice.xlsx") });
  drive.put({ id: "1ShortcutXXXXXXXXXXXX", name: "atajo", mimeType: "application/vnd.google-apps.shortcut", parent: ROOT });
}

test("planSync: nuevo, modificado, sin cambios, reintento y eliminado", () => {
  const row = (id: string, over: Partial<DocumentRow> = {}): DocumentRow => ({ id: `r-${id}`, drive_file_id: id, name: id, mime_type: "application/pdf", size_bytes: 1, modified_time: "2026-01-01T00:00:00Z", md5_checksum: "a".repeat(32), content_sha256: null, status: "processed", attempts: 1, extractor_version: "old", removed_at: null, ...over });
  const file = (id: string, md5 = "a".repeat(32)) => ({ id, name: id, mimeType: "application/pdf", md5Checksum: md5, modifiedTime: "2026-01-01T00:00:00Z", path: "" });
  const plan = planSync(
    [file("same"), file("changed", "b".repeat(32)), file("new"), file("failed"), file("gaveup")],
    [row("same"), row("changed"), row("failed", { status: "error", attempts: 1 }), row("gaveup", { status: "error", attempts: 3 }), row("gone")],
  );
  assert.deepEqual(plan.toProcess.map((p) => [p.file.id, p.change]), [["changed", "modified"], ["new", "new"], ["failed", "retry"]]);
  assert.equal(plan.unchanged, 2);
  assert.deepEqual(plan.removedIds, ["r-gone"]);
  assert.equal(planSync([file("same")], [row("same")], { reprocess: true }).toProcess.length, 1);
});

test("folderBelongsTo: dueño o quien compartió; nunca sin email", () => {
  assert.equal(folderBelongsTo({ id: "x", name: "", ownerEmails: ["a@b.com"] }, "A@B.com"), true);
  assert.equal(folderBelongsTo({ id: "x", name: "", ownerEmails: ["other@b.com"], sharingUserEmail: "a@b.com" }, "a@b.com"), true);
  assert.equal(folderBelongsTo({ id: "x", name: "", ownerEmails: ["other@b.com"] }, "a@b.com"), false);
  assert.equal(folderBelongsTo({ id: "x", name: "", ownerEmails: [] }, null), false);
});

test("lote real: cada documento acaba en su estado y los datos se actualizan en todas las variantes", { skip: !canOcr && "Tesseract con idioma spa no disponible" }, async () => {
  seedDrive();
  const ops = [variant("v1"), variant("v2")];
  const mem = memoryStore(ops);
  const first = await processJob(JOB, deps(mem.store));

  const byName = Object.fromEntries([...mem.docs.values()].map((d) => [d.name, d]));
  assert.equal(byName["factura fontanería.pdf"].status, "processed");
  assert.equal(byName["escaneo.pdf"].status, "processed", "PDF escaneado vía OCR, en subcarpeta");
  assert.equal(byName["foto factura.png"].status, "processed");
  assert.equal(byName["factura obra.xlsx"].status, "processed");
  assert.equal(byName["borroso.pdf"].status, "unreadable");
  assert.match(String(byName["borroso.pdf"].error), /No se pudo leer texto/);
  assert.equal(byName["no-es-pdf.pdf"].status, "error", "MIME falsificado");
  assert.equal(byName["facturas.zip"].status, "ignored");
  assert.equal(byName["Control gastos"].status, "ignored");
  assert.equal(byName["factura fontanería (copia).pdf"].status, "duplicate");
  assert.equal(byName["ya registrado.pdf"].status, "already_registered");
  assert.equal(byName["escritura vivienda 1.pdf"].status, "processed");
  assert.equal(byName["préstamo.pdf"].status, "processed");
  assert.equal(byName["atajo"], undefined, "los atajos no se siguen");
  assert.ok(!drive.downloads.includes("1ManualLinkedFileXXXX"), "lo ya registrado no se descarga");
  assert.ok(!drive.downloads.includes("1GoogleSheetXXXXXXXXX"));
  // Ningún dato extraído guarda el texto completo del documento.
  assert.ok(!JSON.stringify(byName["factura fontanería.pdf"].extraction).includes("Tubería"));

  for (const op of ops) {
    const expenses = (op.realExpenses ?? []).filter((e) => e.id.startsWith("rexp_doc_"));
    assert.deepEqual(expenses.map((e) => e.amount).sort((a, b) => a - b), [2650, 3025, 9922, 12100], `${op.id}: gastos reales creados`);
    assert.equal(op.sales?.[0].status, "VENDIDO");
    assert.equal(op.sales?.[0].realPrice, 185000);
    assert.equal(op.realLoans?.[0].principal, 250000);
  }
  assert.equal(first.status, "completed");
  assert.deepEqual(
    { reviewed: first.summary.reviewed, new: first.summary.new, autoApplied: first.summary.autoApplied, needsReview: first.summary.needsReview, duplicates: first.summary.duplicates, ignored: first.summary.ignored, unreadable: first.summary.unreadable, alreadyRegistered: first.summary.alreadyRegistered },
    { reviewed: 12, new: 12, autoApplied: 6, needsReview: 0, duplicates: 1, ignored: 2, unreadable: 2, alreadyRegistered: 1 },
  );

  // Segunda pasada sin cambios: no descarga ni analiza nada.
  const downloadsBefore = drive.downloads.length;
  const second = await processJob(JOB, deps(mem.store));
  assert.equal(drive.downloads.length, downloadsBefore);
  assert.equal(second.summary.unchanged, 12);
  assert.equal(mem.proposals.filter((p) => p.status === "auto_applied").length, 12, "sin propuestas nuevas");

  // Documento modificado → nueva versión a revisión (no se pisa lo aplicado); archivo eliminado.
  const changed = drive.files.get("1InvoiceDigitalXXXXXX")!;
  drive.put({ ...changed, content: fx("invoice_digital_v2.pdf"), modifiedTime: "2026-09-10T00:00:00.000Z" });
  drive.files.delete("1LoanXXXXXXXXXXXXXXXX");
  const third = await processJob(JOB, deps(mem.store));
  assert.equal(third.summary.modified, 1);
  assert.equal(third.summary.removed, 1);
  assert.equal(third.status, "needs_review");
  assert.equal(mem.proposals.filter((p) => p.status === "superseded").length, 2);
  assert.equal(ops[0].realExpenses?.find((e) => e.id === "rexp_doc_1InvoiceDigitalXXXXXX")?.amount, 9922, "el valor aplicado no cambia sin revisión");
  assert.equal(ops[0].realLoans?.length, 1, "eliminar el archivo en Drive no borra datos");
});

test("carpeta de otro usuario o no compartida: la tarea termina en error sin tocar nada", async () => {
  seedDrive();
  const notMine = memoryStore([variant("v1")], "intruso@test.com");
  const r1 = await processJob(JOB, deps(notMine.store));
  assert.equal(r1.status, "error");
  assert.match(notMine.finished[0].error ?? "", /debe ser tuya/);
  assert.equal(notMine.docs.size, 0);

  drive.shared.clear();
  const notShared = memoryStore([variant("v1")]);
  const r2 = await processJob(JOB, deps(notShared.store));
  assert.equal(r2.status, "error");
  assert.match(notShared.finished[0].error ?? "", /no está compartida con invergravital@gmail.com/);
});

test("documentos maliciosos: imagen y hoja bomba se rechazan antes de decodificar; página gigante con memoria acotada", { skip: !canOcr && "Tesseract no disponible" }, async () => {
  const tools = { python: process.env.PYTHON_PATH ?? "python", tesseract: TESSERACT, tessdata: TESSDATA };
  await assert.rejects(() => extractText(join(fixtures, "bomb.png"), "image", tools), (e: DocumentError) => e.code === "image_too_large");
  await assert.rejects(() => extractText(join(fixtures, "bomb.xlsx"), "sheet", tools), (e: DocumentError) => e.code === "archive_too_large");
  // Página de 14.000 pt: se rasteriza a menor resolución (≤ 60 M píxeles) y acaba sin texto.
  await assert.rejects(() => extractText(join(fixtures, "huge_page.pdf"), "pdf", tools), (e: DocumentError) => e.code === "empty_text");
});

test("Drive: credencial inválida y descarga por encima del límite", async () => {
  seedDrive();
  const bad = createDriveClient({ clientId: "c", clientSecret: "s", refreshToken: "revoked", apiBase: `${drive.url}/drive/v3`, tokenUrl: `${drive.url}/token` });
  await assert.rejects(() => bad.folderInfo(ROOT), /no es válida o ha caducado/);
  const big = Buffer.alloc(21 * 1024 * 1024, 1);
  drive.put({ id: "1HugeFileXXXXXXXXXXXX", name: "enorme.pdf", mimeType: "application/pdf", parent: ROOT, content: big });
  const client = createDriveClient({ clientId: "c", clientSecret: "s", refreshToken: "good-refresh", apiBase: `${drive.url}/drive/v3`, tokenUrl: `${drive.url}/token` });
  const dest = join(fixtures, "huge.bin");
  await assert.rejects(() => client.download({ id: "1HugeFileXXXXXXXXXXXX", mimeType: "application/pdf" }, dest), /tamaño máximo/);
});

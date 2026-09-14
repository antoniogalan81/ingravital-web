// worker/pipeline.ts — Procesa UNA tarea: Drive → documentos nuevos/modificados → texto →
// extracción → reglas → propuestas (auto o revisión) → resumen. Un documento que falla no
// detiene el lote.

import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { REOperation } from "../src/lib/realEstate.ts";
import { activeItems } from "../src/lib/realFinances.ts";
import { DriveError, folderBelongsTo, type DriveClient, type DriveFile } from "./drive.ts";
import { extractFields, type Extraction } from "./extract/fields.ts";
import { needsAssist, type Assistant } from "./extract/llm.ts";
import { DocumentError, extractText, type FileKind, type TextToolConfig } from "./extract/text.ts";
import { EXTRACTOR_VERSION, LEASE_SECONDS, LIMITS, SUPPORTED_MIME } from "./policy.ts";
import { decideChanges, operationReferencesFile } from "./rules.ts";
import type { DocumentPatch, DocumentRow, JobRow, Store } from "./store.ts";

export type Summary = {
  reviewed: number;
  new: number;
  modified: number;
  unchanged: number;
  removed: number;
  processed: number;
  autoApplied: number;
  needsReview: number;
  alreadyRegistered: number;
  duplicates: number;
  ignored: number;
  unreadable: number;
  errors: number;
};

export type PipelineDeps = {
  store: Store;
  drive: DriveClient;
  tools: TextToolConfig;
  assistants: Assistant[];
  log: (event: string, data?: Record<string, unknown>) => void;
  reprocess?: boolean;
  extract?: typeof extractText; // pruebas
};

const emptySummary = (): Summary => ({ reviewed: 0, new: 0, modified: 0, unchanged: 0, removed: 0, processed: 0, autoApplied: 0, needsReview: 0, alreadyRegistered: 0, duplicates: 0, ignored: 0, unreadable: 0, errors: 0 });

class JobError extends Error {}

// ── Qué hay que procesar (puro) ───────────────────────────────────────────────

export type SyncPlan = {
  toProcess: { file: DriveFile; change: "new" | "modified" | "retry" }[];
  unchanged: number;
  removedIds: string[];
};

export function planSync(files: DriveFile[], known: DocumentRow[], opts: { reprocess?: boolean } = {}): SyncPlan {
  const byFile = new Map(known.map((d) => [d.drive_file_id, d]));
  const listed = new Set(files.map((f) => f.id));
  const plan: SyncPlan = { toProcess: [], unchanged: 0, removedIds: known.filter((d) => !listed.has(d.drive_file_id) && !d.removed_at).map((d) => d.id) };
  for (const file of files) {
    const row = byFile.get(file.id);
    if (!row) {
      plan.toProcess.push({ file, change: "new" });
      continue;
    }
    const contentChanged = file.md5Checksum && row.md5_checksum
      ? file.md5Checksum !== row.md5_checksum
      : !!file.modifiedTime && (!row.modified_time || Date.parse(file.modifiedTime) !== Date.parse(row.modified_time));
    if (contentChanged) plan.toProcess.push({ file, change: "modified" });
    else if (row.status === "pending" || (row.status === "error" && row.attempts < LIMITS.maxDocumentAttempts) || (opts.reprocess && row.extractor_version !== EXTRACTOR_VERSION))
      plan.toProcess.push({ file, change: "retry" });
    else plan.unchanged += 1;
  }
  return plan;
}

/** Lo que se guarda del resultado: datos estructurados, sin texto del documento. */
function minimized(ex: Extraction): Extraction {
  const copy: Extraction = structuredClone(ex);
  if (copy.loan) delete copy.loan.borrower; // no se usa para nada: no se conserva
  return copy;
}

const IGNORED_REASON = (mime: string): string =>
  mime === "application/vnd.google-apps.spreadsheet"
    ? "Hoja de cálculo de Google: no se procesa como documento."
    : /zip|rar|7z|compressed|tar/.test(mime)
      ? "Archivo comprimido: no se abre por seguridad."
      : `Tipo de archivo no soportado (${mime.slice(0, 60)}).`;

// ── Un documento ──────────────────────────────────────────────────────────────

type DocContext = { job: JobRow; ops: REOperation[]; tmp: string; summary: Summary; deps: PipelineDeps; unitTitles: string[] };

async function processDocument(file: DriveFile, row: DocumentRow, ctx: DocContext): Promise<void> {
  const { job, ops, deps, summary } = ctx;
  const done = async (status: string, patch: DocumentPatch = {}) => {
    await deps.store.updateDocument(job.user_id, row.id, { status, extractor_version: EXTRACTOR_VERSION, processed_at: new Date().toISOString(), attempts: row.attempts + 1, error: null, ...patch });
    await deps.store.audit({ user_id: job.user_id, operation_id: job.operation_id, job_id: job.id, document_id: row.id, action: "document_processed", detail: { status, doc_type: patch.doc_type ?? null } });
  };

  const kind = SUPPORTED_MIME[file.mimeType];
  if (!kind) {
    summary.ignored += 1;
    return done("ignored", { error: IGNORED_REASON(file.mimeType) });
  }
  if (file.size !== undefined && file.size > LIMITS.maxFileBytes) {
    summary.ignored += 1;
    return done("ignored", { error: "El archivo supera el tamaño máximo de 20 MB." });
  }
  if (ops.some((op) => operationReferencesFile(op, file.id))) {
    summary.alreadyRegistered += 1;
    return done("already_registered");
  }

  const path = join(ctx.tmp, randomUUID());
  try {
    await deps.drive.download(file, path);
    const sha256 = createHash("sha256").update(await readFile(path)).digest("hex");
    const original = await deps.store.findByHash(job.user_id, job.drive_folder_id, sha256, row.id);
    if (original) {
      summary.duplicates += 1;
      return done("duplicate", { content_sha256: sha256, duplicate_of: original });
    }

    const textKind: FileKind = kind === "gdoc" ? "pdf" : kind;
    const { text, ocr } = await (deps.extract ?? extractText)(path, textKind, deps.tools);
    let ex = extractFields({ text, fileName: file.name, ocr }, ctx.unitTitles);
    for (const assistant of deps.assistants) {
      if (!needsAssist(ex)) break;
      ex = await assistant(text, file.name, ex);
    }

    const version = file.md5Checksum ?? file.modifiedTime ?? sha256;
    const outcome = decideChanges(ex, { driveFileId: file.id, name: file.name, version }, ops);
    const base: DocumentPatch = { doc_type: ex.documentType, confidence: ex.confidence, extraction: minimized(ex), content_sha256: sha256 };

    if (outcome.kind === "no_change") {
      if (outcome.why === "informational") {
        summary.processed += 1;
        return done("processed", base);
      }
      if (outcome.why === "already_registered") {
        summary.alreadyRegistered += 1;
        return done("already_registered", base);
      }
      summary.unreadable += 1;
      const message = outcome.why === "low_confidence" ? "No se extrajo información con suficiente fiabilidad; no se ha modificado nada." : outcome.detail ?? "No se pudo interpretar el documento.";
      return done("unreadable", { ...base, error: message });
    }

    let pending = 0;
    let applied = 0;
    const failures: string[] = [];
    for (const proposal of outcome.proposals) {
      const r = await deps.store.recordProposal(job, row.id, proposal, version);
      if (r.applied) applied += 1;
      else if (r.status === "pending") pending += 1;
      else if (r.reason) failures.push(r.reason);
    }
    if (pending) summary.needsReview += 1;
    if (applied) summary.autoApplied += 1;
    if (!pending && !applied) summary.alreadyRegistered += 1;
    summary.processed += 1;
    return done(pending ? "needs_review" : applied ? "processed" : "already_registered", failures.length ? { ...base, error: `Sin aplicar: ${[...new Set(failures)].join(", ")}` } : base);
  } catch (err) {
    if (err instanceof DocumentError) {
      summary.unreadable += 1;
      // MIME falsificado: error visible pero definitivo (no se reintenta en cada actualización).
      if (err.code === "mime_mismatch") return done("error", { error: err.message, attempts: LIMITS.maxDocumentAttempts });
      return done("unreadable", { error: err.message });
    }
    if (err instanceof DriveError && err.code === "too_large") {
      summary.ignored += 1;
      return done("ignored", { error: err.message });
    }
    summary.errors += 1;
    deps.log("document_error", { jobId: job.id, documentId: row.id, error: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    await deps.store.updateDocument(job.user_id, row.id, { status: "error", attempts: row.attempts + 1, error: err instanceof DriveError ? err.message : "Error inesperado al procesar el documento; se reintentará." });
  } finally {
    await rm(path, { force: true });
  }
}

// ── Una tarea ─────────────────────────────────────────────────────────────────

export async function processJob(job: JobRow, deps: PipelineDeps): Promise<{ status: string; summary: Summary }> {
  const summary = emptySummary();
  const tmp = await mkdtemp(join(tmpdir(), "invergravital-"));
  try {
    const [email, ops] = await Promise.all([deps.store.userEmail(job.user_id), deps.store.folderOperations(job.user_id, job.drive_folder_id)]);
    if (!ops.some((o) => o.id === job.operation_id)) throw new JobError("La operación ya no está enlazada a esta carpeta de Drive.");

    const info = await deps.drive.folderInfo(job.drive_folder_id);
    if (!folderBelongsTo(info, email)) {
      throw new JobError("La carpeta debe ser tuya (o compartida por ti) con la misma cuenta de email con la que usas Invergravital.");
    }
    const files = await deps.drive.listFiles(job.drive_folder_id);
    const known = await deps.store.documents(job.user_id, job.drive_folder_id);
    const plan = planSync(files, known, { reprocess: deps.reprocess });
    summary.reviewed = files.length;
    summary.unchanged = plan.unchanged;
    summary.removed = plan.removedIds.length;
    summary.new = plan.toProcess.filter((p) => p.change === "new").length;
    summary.modified = plan.toProcess.filter((p) => p.change === "modified").length;

    const now = new Date().toISOString();
    const rows = await deps.store.upsertSeen(
      files.map((f) => ({
        user_id: job.user_id,
        drive_folder_id: job.drive_folder_id,
        drive_file_id: f.id,
        operation_id: job.operation_id,
        name: f.name,
        mime_type: f.mimeType,
        size_bytes: f.size ?? null,
        modified_time: f.modifiedTime ?? null,
        md5_checksum: f.md5Checksum ?? null,
        last_seen_at: now,
        removed_at: null,
        last_job_id: job.id,
      })),
    );
    await deps.store.markRemoved(plan.removedIds);
    const rowByFile = new Map(rows.map((r) => [r.drive_file_id, r]));
    // Estado ANTERIOR (antes del upsert) para intentos: el upsert no toca status/attempts.
    const knownByFile = new Map(known.map((r) => [r.drive_file_id, r]));
    const unitTitles = [...new Set(ops.flatMap((op) => [...(op.units ?? []).map((u) => u.title), ...activeItems(op.sales).map((s) => s.title)]).filter(Boolean))];
    const ctx: DocContext = { job, ops, tmp, summary, deps, unitTitles };

    for (const { file } of plan.toProcess) {
      const row = rowByFile.get(file.id) ?? knownByFile.get(file.id);
      if (!row) continue;
      await processDocument(file, row, ctx);
      if (!(await deps.store.extendLease(job.id, LEASE_SECONDS))) throw new JobError("La tarea dejó de pertenecer a este worker.");
    }

    const status = summary.needsReview > 0 ? "needs_review" : "completed";
    await deps.store.finishJob(job.id, status, summary);
    deps.log("job_finished", { jobId: job.id, status, ...summary });
    return { status, summary };
  } catch (err) {
    const message = err instanceof JobError || err instanceof DriveError ? err.message : "Error inesperado en la actualización documental.";
    deps.log("job_error", { jobId: job.id, error: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    // Límite de Google: se deja caducar el lease para que se reintente.
    if (!(err instanceof DriveError && err.code === "rate_limited")) await deps.store.finishJob(job.id, "error", summary, message).catch(() => false);
    return { status: "error", summary };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

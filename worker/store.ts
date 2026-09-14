// worker/store.ts — Acceso del worker a Supabase (clave secreta de servidor, solo en el PC).
// Todas las consultas filtran por el user_id de la tarea: aunque la clave salte la RLS,
// el worker nunca mezcla datos de dos tenants.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { REOperation } from "../src/lib/realEstate.ts";
import type { Proposal } from "./rules.ts";

export type JobRow = {
  id: string;
  user_id: string;
  operation_id: string;
  drive_folder_id: string;
  attempts: number;
};

export type DocumentRow = {
  id: string;
  drive_file_id: string;
  name: string;
  mime_type: string;
  size_bytes: number | null;
  modified_time: string | null;
  md5_checksum: string | null;
  content_sha256: string | null;
  status: string;
  attempts: number;
  extractor_version: string | null;
  removed_at: string | null;
};

export type DocumentPatch = Partial<{
  status: string;
  doc_type: string | null;
  extractor_version: string;
  confidence: number | null;
  extraction: unknown;
  error: string | null;
  attempts: number;
  duplicate_of: string | null;
  content_sha256: string | null;
  processed_at: string;
}>;

export type RecordResult = { proposal_id: string; applied?: boolean; duplicate?: boolean; status?: string; reason?: string };

export type Store = ReturnType<typeof createStore>;

const DOC_COLUMNS = "id, drive_file_id, name, mime_type, size_bytes, modified_time, md5_checksum, content_sha256, status, attempts, extractor_version, removed_at";

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export function createStore(url: string, secretKey: string, workerId: string, client?: SupabaseClient) {
  const db = client ?? createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

  return {
    async claimJob(leaseSeconds: number): Promise<JobRow | null> {
      const rows = check(await db.rpc("claim_document_job", { p_worker: workerId, p_lease_seconds: leaseSeconds }), "claim_document_job") as JobRow[];
      return rows?.[0] ?? null;
    },

    async extendLease(jobId: string, leaseSeconds: number): Promise<boolean> {
      return !!check(await db.rpc("extend_document_job_lease", { p_job: jobId, p_worker: workerId, p_lease_seconds: leaseSeconds }), "extend_lease");
    },

    async finishJob(jobId: string, status: "completed" | "needs_review" | "error", summary: Record<string, number>, error?: string): Promise<boolean> {
      return !!check(await db.rpc("finish_document_job", { p_job: jobId, p_worker: workerId, p_status: status, p_summary: summary, p_error: error ?? null }), "finish_document_job");
    },

    async userEmail(userId: string): Promise<string | null> {
      const { data, error } = await db.auth.admin.getUserById(userId);
      if (error) throw new Error(`getUserById: ${error.message}`);
      return data.user?.email ?? null;
    },

    /** Operaciones activas del usuario que enlazan la carpeta (variantes incluidas). */
    async folderOperations(userId: string, folderId: string): Promise<REOperation[]> {
      const rows = check(
        await db
          .from("operaciones_inmobiliarias")
          .select("id, data")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .like("data->invoicesDriveFolder->>url", `%${folderId}%`),
        "folderOperations",
      ) as { id: string; data: REOperation }[];
      return rows
        .map((r) => ({ ...r.data, id: r.id }))
        .filter((op) => {
          const url = op.invoicesDriveFolder?.url ?? "";
          return new RegExp(`(/folders/|[?&]id=)${folderId}(?![A-Za-z0-9_-])`).test(url);
        });
    },

    async documents(userId: string, folderId: string): Promise<DocumentRow[]> {
      const out: DocumentRow[] = [];
      for (let from = 0; ; from += 1000) {
        const page = check(
          await db.from("project_documents").select(DOC_COLUMNS).eq("user_id", userId).eq("drive_folder_id", folderId).order("first_seen_at").range(from, from + 999),
          "documents",
        ) as DocumentRow[];
        out.push(...page);
        if (page.length < 1000) return out;
      }
    },

    async upsertSeen(rows: Record<string, unknown>[]): Promise<DocumentRow[]> {
      if (!rows.length) return [];
      const out: DocumentRow[] = [];
      for (let i = 0; i < rows.length; i += 500) {
        const res = await db.from("project_documents").upsert(rows.slice(i, i + 500), { onConflict: "user_id,drive_folder_id,drive_file_id" }).select(DOC_COLUMNS);
        out.push(...(check(res, "upsertSeen") as DocumentRow[]));
      }
      return out;
    },

    async markRemoved(ids: string[]): Promise<void> {
      if (!ids.length) return;
      check(await db.from("project_documents").update({ removed_at: new Date().toISOString() }).in("id", ids).is("removed_at", null), "markRemoved");
    },

    async updateDocument(userId: string, id: string, patch: DocumentPatch): Promise<void> {
      check(await db.from("project_documents").update(patch).eq("id", id).eq("user_id", userId), "updateDocument");
    },

    async findByHash(userId: string, folderId: string, sha256: string, excludeId: string): Promise<string | null> {
      const rows = check(
        await db
          .from("project_documents")
          .select("id")
          .eq("user_id", userId)
          .eq("drive_folder_id", folderId)
          .eq("content_sha256", sha256)
          .neq("id", excludeId)
          .in("status", ["processed", "needs_review", "already_registered"])
          .limit(1),
        "findByHash",
      ) as { id: string }[];
      return rows[0]?.id ?? null;
    },

    async recordProposal(job: JobRow, documentId: string, p: Proposal, documentVersion: string): Promise<RecordResult> {
      return check(
        await db.rpc("record_document_proposal", {
          p_job: job.id,
          p_worker: workerId,
          p_document: documentId,
          p_operation: p.operationId,
          p_kind: p.kind,
          p_mode: p.mode,
          p_target_id: p.targetId,
          p_dedupe_key: p.dedupeKey,
          p_item: p.item,
          p_confidence: p.confidence,
          p_auto: p.auto,
          p_reason: p.reason ?? null,
          p_document_version: documentVersion,
        }),
        "record_document_proposal",
      ) as RecordResult;
    },

    async audit(row: { user_id: string; operation_id?: string; job_id?: string; document_id?: string; action: string; detail?: unknown }): Promise<void> {
      check(await db.from("document_processing_audit").insert({ ...row, actor_type: "worker", actor_id: workerId }), "audit");
    },
  };
}

// src/lib/documentSync.ts — "Actualizar con IA" desde el navegador.
//
// El navegador NUNCA habla con Google Drive ni con el worker: pide una tarea
// (`request_document_sync`), lee el estado de lo suyo (RLS por usuario) y decide propuestas
// (`decide_document_proposal`). Los errores se propagan con un mensaje comprensible.

import { supabase } from "./supabaseClient";
import type { DocumentJob, DocumentProposal, ExportDocument, ExportProposal } from "./documentSyncView";

const FRIENDLY: [RegExp, string][] = [
  [/drive_folder_missing/, "Guarda primero el enlace de la carpeta de Google Drive."],
  [/operation_not_found/, "La operación no existe o no es tuya. Recarga la página."],
  [/too_many_requests/, "Demasiadas actualizaciones en poco tiempo. Espera unos minutos."],
  [/proposal_not_pending/, "Esa propuesta ya se decidió."],
  [/proposal_not_found/, "La propuesta ya no existe."],
];

function friendly(error: { message?: string } | null): Error {
  const msg = error?.message ?? "";
  const hit = FRIENDLY.find(([re]) => re.test(msg));
  return new Error(hit ? hit[1] : `No se pudo completar la acción (${msg || "error desconocido"}).`);
}

export async function requestDocumentSync(operationId: string): Promise<{ jobId: string; alreadyQueued: boolean }> {
  const { data, error } = await supabase.rpc("request_document_sync", { p_operation_id: operationId });
  if (error) throw friendly(error);
  return { jobId: data.job_id as string, alreadyQueued: !!data.already_queued };
}

export type DocumentSyncState = {
  lastJob: DocumentJob | null;
  lastFinishedAt: string | null;
  pending: DocumentProposal[];
  problems: { name: string; drive_file_id: string; status: string; error: string | null }[];
};

const JOB_COLUMNS = "id, status, requested_at, finished_at, summary, error";

export async function loadDocumentSyncState(operationId: string, folderId: string): Promise<DocumentSyncState> {
  const [last, finished, pending, problems] = await Promise.all([
    supabase.from("document_processing_jobs").select(JOB_COLUMNS).eq("drive_folder_id", folderId).order("requested_at", { ascending: false }).limit(1),
    supabase.from("document_processing_jobs").select("finished_at").eq("drive_folder_id", folderId).in("status", ["completed", "needs_review"]).order("finished_at", { ascending: false }).limit(1),
    supabase
      .from("document_change_proposals")
      .select("id, kind, mode, target_id, item, confidence, reason, document:project_documents(name, drive_file_id)")
      .eq("operation_id", operationId)
      .eq("status", "pending")
      .order("created_at")
      .limit(100),
    supabase.from("project_documents").select("name, drive_file_id, status, error").eq("drive_folder_id", folderId).in("status", ["unreadable", "error"]).is("removed_at", null).order("name").limit(50),
  ]);
  for (const r of [last, finished, pending, problems]) if (r.error) throw friendly(r.error);
  return {
    lastJob: (last.data?.[0] as DocumentJob | undefined) ?? null,
    lastFinishedAt: (finished.data?.[0]?.finished_at as string | undefined) ?? null,
    pending: (pending.data ?? []) as unknown as DocumentProposal[],
    problems: problems.data ?? [],
  };
}

export async function decideDocumentProposal(proposalId: string, accept: boolean): Promise<{ applied: number; failed: number }> {
  const { data, error } = await supabase.rpc("decide_document_proposal", { p_proposal: proposalId, p_accept: accept });
  if (error) throw friendly(error);
  return { applied: data?.applied ?? 0, failed: data?.failed ?? 0 };
}

/** Datos para el Excel de control (paginado: una carpeta puede tener cientos de documentos). */
export async function loadExportData(folderId: string, operationId: string): Promise<{ docs: ExportDocument[]; proposals: ExportProposal[] }> {
  const docs: ExportDocument[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from("project_documents")
      .select("id, name, drive_file_id, doc_type, status, confidence, processed_at, error, extraction")
      .eq("drive_folder_id", folderId)
      .is("removed_at", null)
      .order("processed_at", { ascending: false, nullsFirst: false })
      .range(from, from + 499);
    if (error) throw friendly(error);
    docs.push(...((data ?? []) as ExportDocument[]));
    if (!data || data.length < 500) break;
  }
  const { data, error } = await supabase.from("document_change_proposals").select("document_id, operation_id, kind, status").eq("operation_id", operationId).limit(5000);
  if (error) throw friendly(error);
  return { docs, proposals: (data ?? []) as ExportProposal[] };
}

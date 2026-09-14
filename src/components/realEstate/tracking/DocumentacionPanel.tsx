"use client";

// Sección DOCUMENTACIÓN de la ficha (Gestión del proyecto): carpeta de Google Drive,
// "Actualizar con IA", resumen de la última actualización y revisión de propuestas.
//
// El trabajo pesado lo hace el worker del PC (worker/): aquí solo se pide una tarea, se lee
// su estado y se aceptan o rechazan propuestas. Mientras hay una tarea en curso se consulta
// cada 10 s, y solo con la sección abierta; al terminar se sincroniza la operación.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { REOperation } from "@/src/lib/realEstate";
import type { REDriveFolder } from "@/src/lib/realEstateTracking";
import { parseDriveLink } from "@/src/lib/realFinances";
import { decideDocumentProposal, loadDocumentSyncState, loadExportData, requestDocumentSync, type DocumentSyncState } from "@/src/lib/documentSync";
import {
  JOB_STATUS_LABEL,
  PROPOSAL_KIND_LABEL,
  currentItem,
  describeItem,
  documentsCsv,
  fmtDateTime,
  isJobActive,
  proposedItem,
  summaryText,
  type DocumentProposal,
} from "@/src/lib/documentSyncView";
import { DriveFolderCard } from "./DriveFolderCard";

const POLL_MS = 10_000;
const DRIVE_ID = /^[A-Za-z0-9_-]{10,128}$/;

const STATUS_PILL: Record<string, string> = {
  pending: "pill-neutral",
  processing: "pill-info",
  completed: "pill-positive",
  needs_review: "pill-warning",
  error: "pill-negative",
};

function driveFile(id: string | undefined) {
  return id && DRIVE_ID.test(id) ? `https://drive.google.com/file/d/${id}/view` : null;
}

export function DocumentacionPanel({
  op,
  onChange,
  onRemoteDataApplied,
}: {
  op: REOperation;
  onChange: (patch: Pick<REOperation, "invoicesDriveFolder">) => void;
  /** Tras cambios aplicados en el servidor: sincronizar para ver los datos nuevos. */
  onRemoteDataApplied: () => void;
}) {
  const parsed = op.invoicesDriveFolder ? parseDriveLink(op.invoicesDriveFolder.url) : null;
  const folderId = parsed && parsed.kind !== "file" ? parsed.id : null;

  const [state, setState] = useState<DocumentSyncState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const wasActive = useRef(false);
  // El callback del padre puede cambiar en cada render: se lee por ref para no reiniciar la carga.
  const onAppliedRef = useRef(onRemoteDataApplied);
  useEffect(() => {
    onAppliedRef.current = onRemoteDataApplied;
  }, [onRemoteDataApplied]);

  const reload = useCallback(async () => {
    if (!folderId) return;
    try {
      const next = await loadDocumentSyncState(op.id, folderId);
      setState(next);
      setLoadError(null);
      const active = isJobActive(next.lastJob);
      if (wasActive.current && !active) {
        const s = next.lastJob?.summary ?? {};
        if (next.lastJob?.status === "error") toast.error("La actualización documental falló", { description: next.lastJob.error ?? undefined });
        else toast.success("Documentación actualizada", { description: summaryText(s) });
        if ((s.autoApplied ?? 0) > 0) onAppliedRef.current();
      }
      wasActive.current = active;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudo cargar el estado.");
    }
  }, [folderId, op.id]);

  useEffect(() => {
    setState(null);
    wasActive.current = false;
    void reload();
  }, [reload]);

  const active = isJobActive(state?.lastJob);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(t);
  }, [active, reload]);

  const update = async () => {
    setRequesting(true);
    try {
      const r = await requestDocumentSync(op.id);
      toast.success(r.alreadyQueued ? "Ya hay una actualización en curso" : "Actualización en cola", {
        description: "Los documentos se analizan en el equipo de Invergravital; puedes seguir trabajando.",
      });
      wasActive.current = true;
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo iniciar la actualización.");
    } finally {
      setRequesting(false);
    }
  };

  const decide = async (p: DocumentProposal, accept: boolean) => {
    setDeciding(p.id);
    try {
      const r = await decideDocumentProposal(p.id, accept);
      if (accept && r.failed && !r.applied) toast.error("No se pudo aplicar: el dato cambió o se borró entretanto.");
      else toast.success(accept ? "Cambio aplicado" : "Propuesta rechazada");
      if (accept && r.applied) onAppliedRef.current();
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la decisión.");
    } finally {
      setDeciding(null);
    }
  };

  const exportCsv = async () => {
    if (!folderId) return;
    try {
      const { docs, proposals } = await loadExportData(folderId, op.id);
      const blob = new Blob([documentsCsv(op.name || "Operación", docs, proposals, op.id)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `documentos-${(op.name || "operacion").replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el Excel.");
    }
  };

  const job = state?.lastJob ?? null;
  const pending = state?.pending ?? [];
  const problems = state?.problems ?? [];

  return (
    <div className="space-y-3">
      <DriveFolderCard
        folder={op.invoicesDriveFolder}
        onSave={(invoicesDriveFolder: REDriveFolder) => onChange({ invoicesDriveFolder })}
        onUnlink={() => onChange({ invoicesDriveFolder: undefined })}
      />

      {folderId ? (
        <section className="rounded-xl border border-line p-3 space-y-3" style={{ background: "var(--surface-alt)" }} aria-labelledby="doc-sync-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 id="doc-sync-title" className="text-xs font-bold text-ink-muted uppercase tracking-wide">Actualización documental</h4>
              <p className="text-sm text-ink mt-0.5">
                {state?.lastFinishedAt ? <>Última actualización: <b className="tabular-nums">{fmtDateTime(state.lastFinishedAt)}</b></> : "Aún no se ha actualizado con los documentos."}
              </p>
            </div>
            <button type="button" className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed" onClick={update} disabled={requesting || active} aria-busy={requesting || active}>
              {active ? `${JOB_STATUS_LABEL[job!.status]}…` : requesting ? "Enviando…" : "Actualizar con IA"}
            </button>
          </div>

          {loadError ? <p className="text-xs text-[var(--negative)]">{loadError}</p> : null}

          {job ? (
            <div className="space-y-2" aria-live="polite">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`pill ${STATUS_PILL[job.status]}`}>{JOB_STATUS_LABEL[job.status]}</span>
                {active ? (
                  <span className="text-xs text-ink-subtle">
                    {job.status === "pending"
                      ? `Solicitada ${fmtDateTime(job.requested_at)}. Empezará cuando el equipo de Invergravital esté disponible.`
                      : "Analizando documentos nuevos o modificados…"}
                  </span>
                ) : job.status === "error" ? (
                  <span className="text-xs text-[var(--negative)]">{job.error}</span>
                ) : (
                  <span className="text-xs text-ink-muted">{summaryText(job.summary)}</span>
                )}
              </div>

              {pending.length ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{pending.length} {pending.length === 1 ? "cambio necesita" : "cambios necesitan"} revisión</span>
                  <button type="button" className="btn-secondary !py-1.5 !px-3 !text-xs" onClick={() => setShowReview((v) => !v)} aria-expanded={showReview}>
                    {showReview ? "Ocultar" : "Revisar"}
                  </button>
                </div>
              ) : null}

              {problems.length ? (
                <div>
                  <button type="button" className="text-xs font-semibold text-ink-muted hover:text-ink underline-offset-2 hover:underline" onClick={() => setShowProblems((v) => !v)} aria-expanded={showProblems}>
                    {problems.length} {problems.length === 1 ? "documento no se pudo procesar" : "documentos no se pudieron procesar"}
                  </button>
                  {showProblems ? (
                    <ul className="mt-1.5 space-y-1">
                      {problems.map((d) => (
                        <li key={d.drive_file_id} className="text-xs text-ink-muted">
                          {driveFile(d.drive_file_id) ? (
                            <a href={driveFile(d.drive_file_id)!} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink hover:underline">{d.name}</a>
                          ) : (
                            <span className="font-semibold text-ink">{d.name}</span>
                          )}{" "}
                          — {d.error ?? "sin detalle"}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {showReview && pending.length ? (
            <ul className="space-y-2">
              {pending.map((p) => {
                const href = driveFile(p.document?.drive_file_id);
                const current = currentItem(op, p);
                return (
                  <li key={p.id} className="rounded-lg border border-line bg-white p-3 space-y-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="min-w-0 text-sm font-semibold text-ink truncate">
                        {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">{p.document?.name ?? "Documento"} ↗</a> : p.document?.name ?? "Documento"}
                      </div>
                      <span className="pill pill-neutral tabular-nums">Confianza {Math.round(p.confidence * 100)} %</span>
                    </div>
                    <dl className="grid gap-1 text-xs sm:grid-cols-[8rem_1fr]">
                      <dt className="text-ink-subtle">Dato detectado</dt>
                      <dd className="text-ink">{PROPOSAL_KIND_LABEL[p.kind]}{p.mode === "insert" && !current ? " (nuevo)" : ""}</dd>
                      <dt className="text-ink-subtle">Valor actual</dt>
                      <dd className="text-ink-muted">{describeItem(p.kind, current)}</dd>
                      <dt className="text-ink-subtle">Valor propuesto</dt>
                      <dd className="text-ink font-medium">{describeItem(p.kind, proposedItem(op, p))}</dd>
                    </dl>
                    {p.reason ? <p className="text-xs" style={{ color: "#6b4a12" }}>{p.reason}</p> : null}
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn-secondary !py-1.5 !px-3 !text-xs" disabled={deciding === p.id} onClick={() => decide(p, false)}>Rechazar</button>
                      <button type="button" className="btn-primary !py-1.5 !px-3 !text-xs" disabled={deciding === p.id} onClick={() => decide(p, true)}>Aceptar</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {job ? (
            <div className="flex justify-end">
              <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={exportCsv}>Descargar Excel de control</button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export default DocumentacionPanel;

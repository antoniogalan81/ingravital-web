// src/lib/documentSyncView.ts — Presentación de "Actualizar con IA": textos de estado, valor
// actual/propuesto y exportación CSV (Excel). Puro: sin React ni red.

import type { REOperation } from "./realEstate";
import { RE_EXPENSE_CATEGORY_LABEL, RE_SALE_STATUS_LABEL, type REExpenseCategory, type RESaleStatus } from "./realEstateTracking";

export type DocumentJobStatus = "pending" | "processing" | "completed" | "needs_review" | "error";

export type DocumentJobSummary = Partial<{
  reviewed: number;
  new: number;
  modified: number;
  unchanged: number;
  removed: number;
  autoApplied: number;
  needsReview: number;
  alreadyRegistered: number;
  duplicates: number;
  ignored: number;
  unreadable: number;
  errors: number;
}>;

export type DocumentJob = {
  id: string;
  status: DocumentJobStatus;
  requested_at: string;
  finished_at: string | null;
  summary: DocumentJobSummary;
  error: string | null;
};

export type ProposalKind = "real_expense" | "real_loan" | "sale";

export type DocumentProposal = {
  id: string;
  kind: ProposalKind;
  mode: "insert" | "patch";
  target_id: string;
  item: Record<string, unknown>;
  confidence: number;
  reason: string | null;
  document: { name: string; drive_file_id: string } | null;
};

export const JOB_STATUS_LABEL: Record<DocumentJobStatus, string> = {
  pending: "Pendiente",
  processing: "Procesando",
  completed: "Completado",
  needs_review: "Necesita revisión",
  error: "Error",
};

export const isJobActive = (job: Pick<DocumentJob, "status"> | null | undefined): boolean => job?.status === "pending" || job?.status === "processing";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "17 documentos revisados · 4 nuevos · 3 actualizados automáticamente · 1 necesita revisión" */
export function summaryText(s: DocumentJobSummary): string {
  const parts = [plural(s.reviewed ?? 0, "documento revisado", "documentos revisados")];
  if (s.new) parts.push(plural(s.new, "nuevo", "nuevos"));
  if (s.modified) parts.push(plural(s.modified, "modificado", "modificados"));
  if (s.autoApplied) parts.push(plural(s.autoApplied, "actualizado automáticamente", "actualizados automáticamente"));
  if (s.needsReview) parts.push(`${s.needsReview} ${s.needsReview === 1 ? "necesita" : "necesitan"} revisión`);
  const unreadable = (s.unreadable ?? 0) + (s.errors ?? 0);
  if (unreadable) parts.push(plural(unreadable, "no legible", "no legibles"));
  return parts.join(" · ");
}

export const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const eur = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : undefined);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export const PROPOSAL_KIND_LABEL: Record<ProposalKind, string> = {
  real_expense: "Gasto real",
  real_loan: "Préstamo",
  sale: "Venta",
};

/** Resumen legible de un item (gasto, préstamo o venta), solo con los campos presentes. */
export function describeItem(kind: ProposalKind, item: Record<string, unknown> | null | undefined): string {
  if (!item) return "—";
  const parts: (string | undefined)[] =
    kind === "real_expense"
      ? [str(item.concept), eur(item.amount), str(item.date), item.category ? RE_EXPENSE_CATEGORY_LABEL[item.category as REExpenseCategory] : undefined]
      : kind === "real_loan"
        ? [str(item.name), eur(item.principal), typeof item.interestRate === "number" ? `TIN ${String(item.interestRate).replace(".", ",")} %` : undefined, typeof item.termMonths === "number" ? `${item.termMonths} meses` : undefined]
        : [str(item.title), item.status ? RE_SALE_STATUS_LABEL[item.status as RESaleStatus] : undefined, eur(item.realPrice), str(item.date), str(item.buyer) ? `comprador: ${str(item.buyer)}` : undefined, eur(item.collected) ? `cobrado ${eur(item.collected)}` : undefined];
  const text = parts.filter(Boolean).join(" · ");
  return text || "—";
}

const COLLECTION: Record<ProposalKind, "realExpenses" | "realLoans" | "sales"> = { real_expense: "realExpenses", real_loan: "realLoans", sale: "sales" };

/** Valor actual en la operación del elemento al que apunta la propuesta (o null si no existe). */
export function currentItem(op: Pick<REOperation, "realExpenses" | "realLoans" | "sales">, p: Pick<DocumentProposal, "kind" | "target_id">): Record<string, unknown> | null {
  const list = (op[COLLECTION[p.kind]] ?? []) as unknown as Record<string, unknown>[];
  const found = list.find((x) => x?.id === p.target_id);
  return found && !found.deletedAt ? found : null;
}

/** Para un parche de venta: el valor propuesto es la fila actual con los cambios encima. */
export function proposedItem(op: Pick<REOperation, "realExpenses" | "realLoans" | "sales">, p: DocumentProposal): Record<string, unknown> {
  return p.mode === "patch" ? { ...(currentItem(op, p) ?? {}), ...p.item } : p.item;
}

// ── Exportación CSV (se abre en Excel) ────────────────────────────────────────

export type ExportDocument = {
  id: string;
  name: string;
  drive_file_id: string;
  doc_type: string | null;
  status: string;
  confidence: number | null;
  processed_at: string | null;
  error: string | null;
  extraction: Record<string, unknown> | null;
};

export type ExportProposal = { document_id: string; operation_id: string; kind: ProposalKind; status: string };

const DOC_TYPE_LABEL: Record<string, string> = { invoice: "Factura", receipt: "Justificante", sale: "Compraventa", loan: "Préstamo", budget: "Presupuesto", certification: "Certificación", other: "Otro" };
const DOC_STATUS_LABEL: Record<string, string> = { pending: "Pendiente", processed: "Procesado", needs_review: "Necesita revisión", already_registered: "Ya registrado", duplicate: "Duplicado", ignored: "Ignorado", unreadable: "No legible", error: "Error" };
const PROPOSAL_STATUS_LABEL: Record<string, string> = { auto_applied: "actualizado automáticamente", accepted: "aceptado", rejected: "rechazado", pending: "pendiente de revisión", superseded: "sustituido", failed: "no aplicado" };

const CSV_HEADERS = ["Fecha procesamiento", "Operación", "Archivo", "URL Drive", "Tipo documento", "Proveedor", "CIF", "Número factura", "Fecha documento", "Concepto", "Base", "IVA", "Total", "Categoría", "Unidad", "Acción realizada", "Confianza", "Estado", "Observaciones"];

/** Celda segura: sin fórmulas (un documento podría traer "=HYPERLINK(...)"), comillas escapadas. */
function cell(v: unknown): string {
  let s = v === undefined || v === null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function documentsCsv(opName: string, docs: ExportDocument[], proposals: ExportProposal[], operationId: string): string {
  const rows = docs.map((d) => {
    const ex = (d.extraction ?? {}) as Record<string, unknown>;
    const supplier = (ex.supplier ?? {}) as Record<string, unknown>;
    const mine = proposals.filter((p) => p.document_id === d.id && p.operation_id === operationId);
    const action = mine.length ? [...new Set(mine.map((p) => `${PROPOSAL_KIND_LABEL[p.kind]} ${PROPOSAL_STATUS_LABEL[p.status] ?? p.status}`))].join(", ") : "";
    const units = Array.isArray(ex.relatedUnits) ? (ex.relatedUnits as string[]).join(", ") : "";
    return [
      fmtDateTime(d.processed_at),
      opName,
      d.name,
      `https://drive.google.com/file/d/${d.drive_file_id}/view`,
      DOC_TYPE_LABEL[d.doc_type ?? ""] ?? "",
      supplier.name,
      supplier.taxId,
      ex.invoiceNumber,
      ex.date,
      ex.description,
      ex.subtotal,
      ex.vat,
      ex.total,
      ex.suggestedCategory ? RE_EXPENSE_CATEGORY_LABEL[ex.suggestedCategory as REExpenseCategory] : "",
      units,
      action,
      d.confidence === null ? "" : `${Math.round(d.confidence * 100)} %`,
      DOC_STATUS_LABEL[d.status] ?? d.status,
      d.error,
    ].map(cell).join(";");
  });
  return `﻿${[CSV_HEADERS.join(";"), ...rows].join("\r\n")}\r\n`;
}

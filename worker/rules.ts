// worker/rules.ts — Reglas de negocio: extracción validada + estado de la operación →
// propuestas de cambio. Puro (sin red): lo que decide qué se aplica solo y qué se revisa.

import type { REOperation } from "../src/lib/realEstate.ts";
import type { RERealExpense, RERealLoan, RESale } from "../src/lib/realEstateTracking.ts";
import { isActiveRealFinanceItem } from "../src/lib/realFinances.ts";
import type { Extraction } from "./extract/fields.ts";
import { foldForMatch, sameAmount } from "./extract/parse.ts";
import { AUTO_APPLY, CONFIDENCE, LIMITS } from "./policy.ts";

export type ProposalKind = "real_expense" | "real_loan" | "sale";

export type Proposal = {
  operationId: string;
  kind: ProposalKind;
  mode: "insert" | "patch";
  targetId: string;
  dedupeKey: string;
  item: Record<string, unknown>;
  confidence: number;
  auto: boolean;
  reason?: string;
};

export type DocumentRef = { driveFileId: string; name: string; version: string };

export type RuleOutcome =
  | { kind: "proposals"; proposals: Proposal[]; skippedOperations: { operationId: string; why: string }[] }
  | { kind: "no_change"; why: "informational" | "already_registered" | "low_confidence" | "unsupported_type" | "missing_data"; detail?: string };

export const driveFileUrl = (fileId: string) => `https://drive.google.com/file/d/${fileId}/view`;

/**
 * ¿Algún gasto real activo registrado A MANO ya enlaza este archivo de Drive? Los creados
 * desde el propio documento (`rexp_doc_<id>`) no cuentan: si el documento cambia, la nueva
 * versión debe llegar a revisión.
 */
export function operationReferencesFile(op: Pick<REOperation, "realExpenses">, fileId: string): boolean {
  return (op.realExpenses ?? []).some(
    (e) => isActiveRealFinanceItem(e) && e.id !== `rexp_doc_${fileId}` && typeof e.documentUrl === "string" && e.documentUrl.includes(fileId),
  );
}

const normKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

const daysBetween = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

function possibleDuplicate(op: Pick<REOperation, "realExpenses">, fileId: string, amount: number, date: string | undefined): RERealExpense | undefined {
  return (op.realExpenses ?? []).find(
    (e) => isActiveRealFinanceItem(e) && e.id !== `rexp_doc_${fileId}` && sameAmount(e.amount, amount) && (!date || !e.date || daysBetween(e.date, date) <= LIMITS.duplicateDateWindowDays),
  );
}

const fmtEur = (n?: number) => (n === undefined ? "" : `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

function expenseNotes(ex: Extraction): string {
  const parts = [
    ex.invoiceNumber ? `Factura ${ex.invoiceNumber}` : undefined,
    ex.supplier?.name,
    ex.supplier?.taxId ? `NIF ${ex.supplier.taxId}` : undefined,
    ex.subtotal !== undefined ? `base ${fmtEur(ex.subtotal)}` : undefined,
    ex.vat !== undefined ? `IVA ${fmtEur(ex.vat)}` : undefined,
    ex.withholding ? `retención ${fmtEur(ex.withholding)}` : undefined,
    ex.paymentMethod ? `pago: ${ex.paymentMethod}` : undefined,
  ].filter(Boolean);
  return `Registrado desde documento de Drive. ${parts.join(" · ")}`.trim();
}

function expenseProposals(ex: Extraction, doc: DocumentRef, ops: REOperation[]): RuleOutcome {
  if (ex.total === undefined || !(ex.total > 0)) return { kind: "no_change", why: "missing_data", detail: "No se encontró el importe total." };
  const date = ex.date;
  if (!date) return { kind: "no_change", why: "missing_data", detail: "No se encontró la fecha del documento." };

  const dedupeKey = ex.invoiceNumber && ex.supplier?.taxId
    ? `invoice:${normKey(ex.supplier.taxId)}:${normKey(ex.invoiceNumber)}`
    : `file:${doc.driveFileId}`;
  const concept = (ex.description || [ex.supplier?.name, ex.invoiceNumber ? `factura ${ex.invoiceNumber}` : undefined].filter(Boolean).join(" · ") || doc.name).slice(0, 140);
  const item: Partial<RERealExpense> = {
    concept,
    amount: ex.total,
    date,
    ...(ex.suggestedCategory ? { category: ex.suggestedCategory } : {}),
    notes: expenseNotes(ex),
    documentName: doc.name,
    documentUrl: driveFileUrl(doc.driveFileId),
  };

  const proposals: Proposal[] = [];
  const skipped: { operationId: string; why: string }[] = [];
  for (const op of ops) {
    if (operationReferencesFile(op, doc.driveFileId)) {
      skipped.push({ operationId: op.id, why: "already_registered" });
      continue;
    }
    const dup = possibleDuplicate(op, doc.driveFileId, ex.total, date);
    const reasons: string[] = [];
    if (dup) reasons.push(`Posible duplicado de «${dup.concept}» (${dup.date}, ${fmtEur(dup.amount)}).`);
    if (ex.documentType === "certification") reasons.push("Certificación de obra: confirma que corresponde a un pago realizado.");
    if (!ex.suggestedCategory) reasons.push("Sin categoría clara.");
    const auto = AUTO_APPLY.real_expense && ex.confidence >= CONFIDENCE.autoApply && !dup && ex.documentType !== "certification";
    proposals.push({
      operationId: op.id,
      kind: "real_expense",
      mode: "insert",
      targetId: `rexp_doc_${doc.driveFileId}`,
      dedupeKey,
      item,
      confidence: ex.confidence,
      auto,
      ...(reasons.length ? { reason: reasons.join(" ") } : {}),
    });
  }
  if (!proposals.length) return { kind: "no_change", why: "already_registered" };
  return { kind: "proposals", proposals, skippedOperations: skipped };
}

function loanProposals(ex: Extraction, doc: DocumentRef, ops: REOperation[]): RuleOutcome {
  const l = ex.loan;
  if (!l?.principal || !l.lender) return { kind: "no_change", why: "missing_data", detail: "Falta el prestamista o el capital." };
  const notes = [
    "Registrado desde documento de Drive:",
    doc.name,
    l.maturityDate ? `· vencimiento ${l.maturityDate}` : "",
    l.fees !== undefined ? `· comisión de apertura ${fmtEur(l.fees)}` : "",
  ].join(" ").trim();
  const item: Partial<RERealLoan> = {
    name: `Préstamo ${l.lender}`.slice(0, 120),
    principal: l.principal,
    ...(l.interestRate !== undefined ? { interestRate: l.interestRate } : {}),
    ...(l.rateType ? { rateType: l.rateType } : {}),
    ...(l.startDate ? { startDate: l.startDate } : {}),
    ...(l.termMonths ? { termMonths: l.termMonths } : {}),
    ...(l.installment !== undefined ? { installment: l.installment, periodicity: "MENSUAL" as const } : {}),
    status: "ACTIVO",
    notes,
  };
  const proposals = ops
    .filter((op) => !(op.realLoans ?? []).some((x) => isActiveRealFinanceItem(x) && x.id !== `rloan_doc_${doc.driveFileId}` && sameAmount(x.principal, l.principal) && foldForMatch(x.name).includes(foldForMatch(l.lender!))))
    .map<Proposal>((op) => ({
      operationId: op.id,
      kind: "real_loan",
      mode: "insert",
      targetId: `rloan_doc_${doc.driveFileId}`,
      dedupeKey: `loan:${foldForMatch(l.lender!).replace(/\s+/g, "-")}:${l.principal}:${l.startDate ?? doc.driveFileId}`,
      item,
      confidence: ex.confidence,
      auto: AUTO_APPLY.real_loan && ex.confidence >= CONFIDENCE.autoApply,
    }));
  if (!proposals.length) return { kind: "no_change", why: "already_registered" };
  return { kind: "proposals", proposals, skippedOperations: [] };
}

function matchSales(op: REOperation, relatedUnits: string[]): RESale[] {
  const sales = op.sales ?? [];
  const wanted = new Set(relatedUnits.map(foldForMatch));
  const unitIds = new Set((op.units ?? []).filter((u) => wanted.has(foldForMatch(u.title))).map((u) => u.id));
  return sales.filter((s) => wanted.has(foldForMatch(s.title)) || (s.unitId && unitIds.has(s.unitId)));
}

function saleProposals(ex: Extraction, doc: DocumentRef, ops: REOperation[]): RuleOutcome {
  const v = ex.sale;
  if (!v) return { kind: "no_change", why: "missing_data" };
  const proposals: Proposal[] = [];
  for (const op of ops) {
    const matches = matchSales(op, ex.relatedUnits ?? []);
    const patch: Partial<RESale> = {
      status: v.status,
      ...(v.price !== undefined ? { realPrice: v.price } : {}),
      ...(ex.date ? { date: ex.date } : {}),
      ...(v.buyer ? { buyer: v.buyer } : {}),
      ...(v.deposit !== undefined ? { deposit: v.deposit } : {}),
      ...(v.collected !== undefined ? { collected: v.collected } : {}),
    };
    if (matches.length === 1) {
      const current = matches[0];
      const unchanged = Object.entries(patch).every(([k, val]) => (current as Record<string, unknown>)[k] === val);
      if (unchanged) continue;
      const reasons: string[] = [];
      if (v.collected !== undefined) reasons.push("Incluye un cobro: confírmalo.");
      if (v.status !== "VENDIDO") reasons.push("Documento previo a la escritura.");
      const auto = AUTO_APPLY.sale && ex.confidence >= CONFIDENCE.autoApply && v.status === "VENDIDO" && v.price !== undefined && v.collected === undefined;
      proposals.push({ operationId: op.id, kind: "sale", mode: "patch", targetId: current.id, dedupeKey: `sale:${doc.driveFileId}`, item: patch, confidence: ex.confidence, auto, ...(reasons.length ? { reason: reasons.join(" ") } : {}) });
    } else {
      const title = matches.length > 1 ? `Unidad por confirmar (${matches.map((m) => m.title).join(" / ")})` : ex.relatedUnits?.[0] ?? `Venta según ${doc.name}`;
      proposals.push({
        operationId: op.id,
        kind: "sale",
        mode: "insert",
        targetId: `sale_doc_${doc.driveFileId}`,
        dedupeKey: `sale:${doc.driveFileId}`,
        item: { title: title.slice(0, 120), ...patch },
        confidence: Math.min(ex.confidence, CONFIDENCE.autoApply - 0.01),
        auto: false,
        reason: matches.length > 1 ? "Varias unidades coinciden con el documento." : "No se identificó la unidad en Ventas: se creará una fila nueva.",
      });
    }
  }
  if (!proposals.length) return { kind: "no_change", why: "already_registered" };
  return { kind: "proposals", proposals, skippedOperations: [] };
}

/** Punto de entrada. `ops`: operaciones del usuario que enlazan la carpeta del documento. */
export function decideChanges(ex: Extraction, doc: DocumentRef, ops: REOperation[]): RuleOutcome {
  if (ex.documentType === "other") return { kind: "no_change", why: "unsupported_type", detail: "No se reconoce el tipo de documento." };
  if (ex.documentType === "budget") return { kind: "no_change", why: "informational", detail: "Presupuesto: se registra, no modifica gastos reales." };
  if (ex.confidence < CONFIDENCE.review) return { kind: "no_change", why: "low_confidence" };
  if (ex.documentType === "loan") return loanProposals(ex, doc, ops);
  if (ex.documentType === "sale") return saleProposals(ex, doc, ops);
  return expenseProposals(ex, doc, ops);
}

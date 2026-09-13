"use client";

// Bloque FINANZAS REALES de la ficha (Gestión del proyecto · uso interno del promotor).
// Se muestra dentro de un SectionBlock de RealEstateModal cuando el interruptor
// "Registrar finanzas reales" está activo, con el lenguaje visual de esos bloques.
// Una sola categoría con tres bloques: carpeta de facturas en Drive, gastos reales y
// financiación real. Escribe `realExpenses`, `realLoans` e `invoicesDriveFolder` en la
// operación (JSON sync). No toca la previsión (`costs`, `financing`). Cada gasto real
// puede imputarse a una partida de Económico (`budgetLineId`): esa es la ÚNICA fuente de
// la columna Real de Económico.

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { REOperation } from "@/src/lib/realEstate";
import {
  RE_EXPENSE_CATEGORY_LABEL,
  RE_LOAN_PERIODICITY_LABEL,
  RE_LOAN_RATE_TYPE_LABEL,
  RE_LOAN_STATUS_LABEL,
  makeRealExpense,
  makeRealLoan,
  type REDriveFolder,
  type REExpense,
  type RERealExpense,
  type RERealLoan,
} from "@/src/lib/realEstateTracking";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import {
  activeRealLoans,
  driveFileUrl,
  driveFolderUrl,
  isActiveRealFinanceItem,
  markRealFinanceDeleted,
  realExpenseTotals,
  realLoanTotals,
} from "@/src/lib/realFinances";
import { RealExpenseDialog, RealLoanDialog } from "./RealFinanceDialogs";
import { DriveFolderCard } from "./DriveFolderCard";

type RealFinancePatch = Pick<REOperation, "realExpenses" | "realLoans" | "invoicesDriveFolder">;

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

export function FinanzasRealesPanel({
  op,
  overlayRoot,
  onChange,
}: {
  op: REOperation;
  /** Nodo donde montar los diálogos (dentro del drawer de la ficha); sin él, en línea. */
  overlayRoot?: HTMLElement | null;
  onChange: (patch: Partial<RealFinancePatch>) => void;
}) {
  // Listas completas (con borrados marcados) para escribir; activas para mostrar.
  const allExpenses = useMemo(() => (Array.isArray(op.realExpenses) ? op.realExpenses : []), [op.realExpenses]);
  const allLoans = useMemo(() => (Array.isArray(op.realLoans) ? op.realLoans : []), [op.realLoans]);
  const expenses = useMemo(() => allExpenses.filter(isActiveRealFinanceItem), [allExpenses]);
  const budgetLines = useMemo(() => (Array.isArray(op.expenses) ? op.expenses : []), [op.expenses]);
  const loans = useMemo(() => activeRealLoans(op), [op]);
  const spent = useMemo(() => realExpenseTotals(op), [op]);
  const loanTotals = useMemo(() => realLoanTotals(op), [op]);
  const folderUrl = op.invoicesDriveFolder ? driveFolderUrl(op.invoicesDriveFolder.url) ?? undefined : undefined;

  const [expenseDialog, setExpenseDialog] = useState<{ item: RERealExpense; isNew: boolean } | null>(null);
  const [loanDialog, setLoanDialog] = useState<{ item: RERealLoan; isNew: boolean } | null>(null);

  const sortedExpenses = useMemo(
    () => [...expenses].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.createdAt.localeCompare(a.createdAt)),
    [expenses],
  );

  const upsert = <T extends { id: string }>(list: T[], item: T) =>
    list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

  // "Guardar y añadir otro": el siguiente registro parte de una copia del que se acaba de
  // guardar (mismos valores, id nuevo). Varios guardados seguidos usan la lista más reciente.
  const saveExpense = (item: RERealExpense, addAnother: boolean) => {
    onChange({ realExpenses: upsert(Array.isArray(op.realExpenses) ? op.realExpenses : [], item) });
    if (!addAnother) {
      setExpenseDialog(null);
      return;
    }
    const fresh = makeRealExpense(item.date);
    setExpenseDialog({ item: { ...item, id: fresh.id, createdAt: fresh.createdAt, updatedAt: fresh.updatedAt }, isNew: true });
  };

  const removeExpense = (e: RERealExpense) => {
    if (!window.confirm(`¿Eliminar el gasto "${e.concept}"? No borra nada en Google Drive.`)) return;
    // Borrado con marca: se sincroniza y gana a copias antiguas en otros dispositivos.
    onChange({ realExpenses: allExpenses.map((x) => (x.id === e.id ? markRealFinanceDeleted(x) : x)) });
  };

  const saveLoan = (item: RERealLoan) => {
    onChange({ realLoans: upsert(allLoans, item) });
    setLoanDialog(null);
  };

  const overlay = (node: React.ReactNode) => (overlayRoot ? createPortal(node, overlayRoot) : node);

  const removeLoan = (l: RERealLoan) => {
    if (!window.confirm(`¿Eliminar el préstamo "${l.name}"?`)) return;
    onChange({ realLoans: allLoans.map((x) => (x.id === l.id ? markRealFinanceDeleted(x) : x)) });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-subtle">
        Lo que realmente se ha gastado y la financiación realmente contratada. No incluye presupuestos ni previsiones.
      </p>

      {/* Cifras reales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Figure
          label="Gastado real"
          value={spent.count ? fmtEUR(spent.total) : "—"}
          sub={spent.count ? `${spent.count} gasto${spent.count === 1 ? "" : "s"}${spent.withoutDocument ? ` · ${spent.withoutDocument} sin documento` : ""}` : "sin gastos"}
        />
        <Figure label="Capital financiado" value={loanTotals.count ? fmtEUR(loanTotals.financed) : "—"} sub={loanTotals.count ? `${loanTotals.activeCount} activo${loanTotals.activeCount === 1 ? "" : "s"}` : "sin préstamos"} />
        <Figure
          label="Capital pendiente"
          value={!loanTotals.count ? "—" : loanTotals.outstanding == null ? "Sin dato" : fmtEUR(loanTotals.outstanding)}
          sub={loanTotals.count && loanTotals.outstanding == null ? "falta en algún préstamo" : undefined}
        />
        <Figure label="Cuotas al mes" value={loanTotals.monthlyInstallments == null ? "—" : fmtEUR(loanTotals.monthlyInstallments)} />
      </div>

      <DriveFolderCard
        folder={op.invoicesDriveFolder}
        onSave={(invoicesDriveFolder: REDriveFolder) => onChange({ invoicesDriveFolder })}
        onUnlink={() => onChange({ invoicesDriveFolder: undefined })}
      />

      {/* Gastos reales */}
      <div className="rounded-xl border border-line p-3 space-y-2" style={{ background: "var(--surface-alt)" }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-ink-muted uppercase tracking-wide">Gastos reales</div>
            <p className="text-[11px] text-ink-subtle">Dinero incurrido o pagado. Se puede registrar sin factura y asociarla después.</p>
          </div>
          <button
            type="button"
            onClick={() => setExpenseDialog({ item: makeRealExpense(todayISO()), isNew: true })}
            className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 bg-white rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap shrink-0"
          >
            + Registrar gasto
          </button>
        </div>

        {sortedExpenses.length === 0 ? (
          <p className="text-xs text-ink-subtle py-1">Aún no hay gastos reales registrados.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-lg border border-line bg-white">
            {sortedExpenses.map((e) => (
              <ExpenseRow key={e.id} e={e} budgetLines={budgetLines} onEdit={() => setExpenseDialog({ item: e, isNew: false })} onRemove={() => removeExpense(e)} />
            ))}
          </ul>
        )}
      </div>

      {/* Financiación real (opcional) */}
      <div className="rounded-xl border border-line p-3 space-y-2" style={{ background: "var(--surface-alt)" }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-ink-muted uppercase tracking-wide">Financiación real</div>
            <p className="text-[11px] text-ink-subtle">Opcional. Préstamos realmente firmados para esta operación (no la financiación prevista).</p>
          </div>
          <button
            type="button"
            onClick={() => setLoanDialog({ item: makeRealLoan(), isNew: true })}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            + Añadir préstamo
          </button>
        </div>

        {loans.length === 0 ? (
          <p className="text-xs text-ink-subtle py-1">Sin préstamos registrados.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {loans.map((l) => (
              <LoanCard key={l.id} l={l} onEdit={() => setLoanDialog({ item: l, isNew: false })} onRemove={() => removeLoan(l)} />
            ))}
          </ul>
        )}
      </div>

      {overlay(
        <>
          {expenseDialog ? (
            <RealExpenseDialog
              key={expenseDialog.item.id}
              initial={expenseDialog.item}
              isNew={expenseDialog.isNew}
              folderUrl={folderUrl}
              budgetLines={budgetLines}
              onSave={saveExpense}
              onClose={() => setExpenseDialog(null)}
            />
          ) : null}
          {loanDialog ? (
            <RealLoanDialog key={loanDialog.item.id} initial={loanDialog.item} isNew={loanDialog.isNew} onSave={saveLoan} onClose={() => setLoanDialog(null)} />
          ) : null}
        </>,
      )}
    </div>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line p-3" style={{ background: "var(--surface-alt)" }}>
      <div className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wide mb-1">{label}</div>
      <div className="text-lg font-extrabold tabular-nums text-ink truncate">{value}</div>
      {sub ? <div className="text-xs text-ink-muted truncate mt-0.5">{sub}</div> : null}
    </div>
  );
}

function DocumentLink({ e }: { e: RERealExpense }) {
  // Se revalida al pintar: el dato puede venir de otro dispositivo o de datos antiguos.
  const href = e.documentUrl ? driveFileUrl(e.documentUrl) : null;
  const name = e.documentName || (href ? "Documento en Drive" : "");
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-full items-center gap-1 text-xs font-semibold text-brand hover:underline"
        title={`Abrir ${name} en Google Drive`}
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="truncate">{name}</span>
      </a>
    );
  }
  if (name) {
    return (
      <span className="inline-flex max-w-full items-center gap-1 text-xs text-ink-muted" title="Falta el enlace al archivo para poder abrirlo">
        <span className="truncate">{name}</span>
        <span className="shrink-0 rounded bg-[var(--warning-soft)] px-1 text-[10px] font-semibold text-[var(--warning)]">sin enlace</span>
      </span>
    );
  }
  return <span className="text-xs text-ink-subtle">Sin factura</span>;
}

function RowActions({ onEdit, onRemove, label }: { onEdit: () => void; onRemove: () => void; label: string }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button type="button" onClick={onEdit} aria-label={`Editar ${label}`} className="p-1.5 rounded-lg text-slate-400 hover:text-brand hover:bg-[var(--brand-soft)] transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
      </button>
      <button type="button" onClick={onRemove} aria-label={`Eliminar ${label}`} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      </button>
    </div>
  );
}

function ExpenseRow({ e, budgetLines, onEdit, onRemove }: { e: RERealExpense; budgetLines: REExpense[]; onEdit: () => void; onRemove: () => void }) {
  const line = e.budgetLineId ? budgetLines.find((l) => l.id === e.budgetLineId) : undefined;
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 bg-white">
      <span className="hidden sm:block w-[4.75rem] shrink-0 text-xs tabular-nums text-ink-subtle">{fmtDate(e.date)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink truncate">
          {e.concept}
          {e.category ? <span className="ml-2 text-[11px] font-normal text-ink-subtle">{RE_EXPENSE_CATEGORY_LABEL[e.category]}</span> : null}
        </p>
        <p className="sm:hidden text-[11px] tabular-nums text-ink-subtle">{fmtDate(e.date)}</p>
        {line ? (
          <p className="text-[11px] text-ink-subtle truncate">Partida: {line.concept?.trim() || RE_EXPENSE_CATEGORY_LABEL[line.category]}</p>
        ) : null}
        <div className="min-w-0 mt-0.5">
          <DocumentLink e={e} />
        </div>
        {e.notes ? <p className="text-[11px] text-ink-subtle truncate mt-0.5">{e.notes}</p> : null}
      </div>
      <span className="text-sm font-extrabold tabular-nums text-ink shrink-0">{fmtEUR(e.amount)}</span>
      <RowActions onEdit={onEdit} onRemove={onRemove} label={e.concept} />
    </li>
  );
}

function LoanCard({ l, onEdit, onRemove }: { l: RERealLoan; onEdit: () => void; onRemove: () => void }) {
  const active = l.status !== "AMORTIZADO";
  const details = [
    l.interestRate != null ? `${l.interestRate.toLocaleString("es-ES", { maximumFractionDigits: 3 })} %${l.rateType ? ` ${RE_LOAN_RATE_TYPE_LABEL[l.rateType].toLowerCase()}` : ""}` : null,
    l.installment != null ? `Cuota ${fmtEUR(l.installment)} ${RE_LOAN_PERIODICITY_LABEL[l.periodicity ?? "MENSUAL"].toLowerCase()}` : null,
    l.termMonths != null ? `${l.termMonths} meses` : null,
    l.startDate ? `desde ${fmtDate(l.startDate)}` : null,
  ].filter(Boolean);
  return (
    <li className="rounded-lg border border-line bg-white p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink truncate">{l.name}</p>
          <span
            className="inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={active ? { background: "var(--brand-soft)", color: "var(--brand)" } : { background: "var(--surface-alt)", color: "var(--ink-subtle)" }}
          >
            {RE_LOAN_STATUS_LABEL[l.status]}
          </span>
        </div>
        <RowActions onEdit={onEdit} onRemove={onRemove} label={l.name} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="kpi-label">Capital inicial</p>
          <p className="text-sm font-extrabold tabular-nums text-ink">{fmtEUR(l.principal)}</p>
        </div>
        <div>
          <p className="kpi-label">Pendiente</p>
          <p className="text-sm font-extrabold tabular-nums text-ink">{!active ? fmtEUR(0) : l.outstanding != null ? fmtEUR(l.outstanding) : "Sin dato"}</p>
        </div>
      </div>
      {details.length ? <p className="text-[11px] text-ink-subtle">{details.join(" · ")}</p> : null}
      {l.notes ? <p className="text-[11px] text-ink-muted">{l.notes}</p> : null}
    </li>
  );
}

export default FinanzasRealesPanel;

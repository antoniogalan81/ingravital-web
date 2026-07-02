"use client";

// Panel GASTOS estilo hoja de cálculo. Tabla editable + resumen por categoría con
// barras estimado vs real. Persiste el array `expenses` en la operación (JSON sync).

import { useMemo } from "react";
import type { REOperation } from "@/src/lib/realEstate";
import {
  RE_EXPENSE_CATEGORIES,
  RE_EXPENSE_CATEGORY_LABEL,
  RE_EXPENSE_STATUS_LABEL,
  makeExpense,
  type REExpense,
  type REExpenseCategory,
  type REExpenseStatus,
} from "@/src/lib/realEstateTracking";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import { expensesByCategory, expenseTotals } from "@/src/lib/realEstateTrackingCalc";
import {
  DataTable,
  TextCellInput,
  NumberCellInput,
  SelectCellInput,
  DateCellInput,
  type DataTableColumn,
} from "@/src/components/ui/DataTable";

const CATEGORY_OPTS = RE_EXPENSE_CATEGORIES.map((c) => ({ value: c.key, label: c.label }));
const STATUS_OPTS = (Object.keys(RE_EXPENSE_STATUS_LABEL) as REExpenseStatus[]).map((k) => ({
  value: k,
  label: RE_EXPENSE_STATUS_LABEL[k],
}));

const isHttp = (s?: string) => !!s && /^https?:\/\//i.test(s);

export function GastosPanel({
  op,
  onChange,
}: {
  op: REOperation;
  onChange: (expenses: REExpense[]) => void;
}) {
  const expenses = useMemo(() => (Array.isArray(op.expenses) ? op.expenses : []), [op.expenses]);
  const totals = useMemo(() => expenseTotals(op), [op]);
  const byCat = useMemo(() => expensesByCategory(op), [op]);

  const update = (id: string, patch: Partial<REExpense>) =>
    onChange(
      expenses.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e)),
    );

  const addRow = () => onChange([...expenses, makeExpense()]);

  const remove = (row: REExpense) => onChange(expenses.filter((e) => e.id !== row.id));

  const columns: DataTableColumn<REExpense>[] = [
    {
      key: "concept",
      header: "Concepto",
      width: "12rem",
      cell: (r) => (
        <TextCellInput value={r.concept} placeholder="Concepto" onChange={(v) => update(r.id, { concept: v })} />
      ),
    },
    {
      key: "category",
      header: "Categoría",
      width: "10rem",
      cell: (r) => (
        <SelectCellInput<REExpenseCategory>
          value={r.category}
          options={CATEGORY_OPTS}
          onChange={(v) => update(r.id, { category: v })}
        />
      ),
    },
    {
      key: "provider",
      header: "Proveedor",
      width: "10rem",
      cell: (r) => (
        <TextCellInput value={r.provider} placeholder="—" onChange={(v) => update(r.id, { provider: v })} />
      ),
    },
    {
      key: "estimated",
      header: "Estimado",
      width: "7rem",
      align: "right",
      cell: (r) => <NumberCellInput value={r.estimated} onChange={(v) => update(r.id, { estimated: v })} />,
    },
    {
      key: "real",
      header: "Real",
      width: "7rem",
      align: "right",
      cell: (r) => <NumberCellInput value={r.real} onChange={(v) => update(r.id, { real: v })} />,
    },
    {
      key: "diff",
      header: "Diferencia",
      width: "7rem",
      align: "right",
      cell: (r) => {
        const est = Number.isFinite(r.estimated as number) ? (r.estimated as number) : 0;
        const real = Number.isFinite(r.real as number) ? (r.real as number) : 0;
        if (r.estimated == null && r.real == null)
          return <span className="text-ink-subtle">—</span>;
        const diff = real - est;
        return (
          <span
            className="tabular-nums font-semibold"
            style={{ color: diff <= 0 ? "var(--positive)" : "var(--negative)" }}
          >
            {fmtEUR(diff)}
          </span>
        );
      },
    },
    {
      key: "paid",
      header: "Pagado",
      width: "7rem",
      align: "right",
      cell: (r) => <NumberCellInput value={r.paid} onChange={(v) => update(r.id, { paid: v })} />,
    },
    {
      key: "status",
      header: "Estado",
      width: "8rem",
      cell: (r) => (
        <SelectCellInput<REExpenseStatus>
          value={r.status}
          options={STATUS_OPTS}
          onChange={(v) => update(r.id, { status: v })}
        />
      ),
    },
    {
      key: "date",
      header: "Fecha",
      width: "9rem",
      cell: (r) => <DateCellInput value={r.date} onChange={(v) => update(r.id, { date: v })} />,
    },
    {
      key: "invoice",
      header: "Factura",
      width: "11rem",
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          <TextCellInput
            value={r.invoiceName ?? r.invoiceUri}
            placeholder="Enlace o nombre"
            onChange={(v) => update(r.id, { invoiceName: v, invoiceUri: isHttp(v) ? v : r.invoiceUri })}
          />
          {isHttp(r.invoiceUri) || isHttp(r.invoiceName) ? (
            <a
              href={(isHttp(r.invoiceUri) ? r.invoiceUri : r.invoiceName) as string}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs font-semibold text-brand hover:underline"
            >
              Ver
            </a>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Totales compactos (los KPIs generales están en la barra-resumen fija) */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <Total label="Estimado" value={fmtEUR(totals.estimated)} />
        <Total label="Real" value={fmtEUR(totals.real)} />
        <Total
          label="Diferencia"
          value={totals.hasData ? fmtEUR(totals.diff) : "—"}
          color={!totals.hasData ? undefined : totals.diff <= 0 ? "var(--positive)" : "var(--negative)"}
        />
        <Total label="Pagado" value={fmtEUR(totals.paid)} />
        <Total label="Pendiente" value={totals.hasData ? fmtEUR(totals.pending) : "—"} color="var(--brand)" />
      </div>

      {/* Tabla editable */}
      <DataTable
        columns={columns}
        rows={expenses}
        getRowId={(r) => r.id}
        onAddRow={addRow}
        addLabel="Añadir gasto"
        onDeleteRow={remove}
        emptyText="Sin gastos. Añade el primero para empezar el control tipo Excel."
      />

      {/* Resumen por categoría con barras estimado vs real */}
      {byCat.length > 0 ? (
        <div className="re-card p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Resumen por categoría</p>
          <div className="space-y-3">
            {byCat.map((c) => {
              const max = Math.max(c.estimated, c.real, 1);
              return (
                <div key={c.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-ink">{RE_EXPENSE_CATEGORY_LABEL[c.category]}</span>
                    <span className="tabular-nums text-ink-muted">
                      est. {fmtEUR(c.estimated)} · real {fmtEUR(c.real)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <Bar value={c.estimated / max} color="var(--ink-subtle)" />
                    <Bar value={c.real / max} color={c.diff <= 0 ? "var(--positive)" : "var(--negative)"} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-ink-subtle">Barra superior: estimado · inferior: real.</p>
        </div>
      ) : null}
    </div>
  );
}

function Total({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-xs uppercase tracking-wide font-bold text-ink-subtle">{label}</span>
      <span className="font-extrabold tabular-nums" style={color ? { color } : undefined}>{value}</span>
    </span>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="h-2 w-full rounded-full bg-[var(--surface-alt)] overflow-hidden border border-line">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export default GastosPanel;

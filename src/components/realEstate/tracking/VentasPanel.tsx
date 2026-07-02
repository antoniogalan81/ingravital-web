"use client";

// Panel VENTAS. Tabla editable de unidades/activos con estados (disponible →
// vendido), precios estimado/real, señal, cobrado y pendiente. Persiste `sales`.

import { useMemo } from "react";
import type { REOperation, REResults } from "@/src/lib/realEstate";
import {
  RE_SALE_STATUS_LABEL,
  RE_SALE_STATUSES,
  makeSale,
  type RESale,
  type RESaleStatus,
} from "@/src/lib/realEstateTracking";
import { fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";
import { salesStats } from "@/src/lib/realEstateTrackingCalc";
import {
  DataTable,
  TextCellInput,
  NumberCellInput,
  SelectCellInput,
  DateCellInput,
  type DataTableColumn,
} from "@/src/components/ui/DataTable";

const STATUS_OPTS = RE_SALE_STATUSES.map((s) => ({ value: s, label: RE_SALE_STATUS_LABEL[s] }));

const STATUS_COLOR: Record<RESaleStatus, string> = {
  DISPONIBLE: "var(--ink-subtle)",
  RESERVADO: "#6366f1",
  SENALADO: "#0ea5e9",
  APALABRADO: "var(--warning, #b45309)",
  VENDIDO: "var(--positive)",
};

export function VentasPanel({
  op,
  results,
  onChange,
}: {
  op: REOperation;
  results: REResults;
  onChange: (sales: RESale[]) => void;
}) {
  const sales = useMemo(() => (Array.isArray(op.sales) ? op.sales : []), [op.sales]);
  const stats = useMemo(() => salesStats(op), [op]);

  const update = (id: string, patch: Partial<RESale>) =>
    onChange(sales.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)));

  const addRow = () => onChange([...sales, makeSale()]);

  const remove = (row: RESale) => onChange(sales.filter((s) => s.id !== row.id));

  const columns: DataTableColumn<RESale>[] = [
    {
      key: "title",
      header: "Unidad / activo",
      width: "12rem",
      cell: (r) => <TextCellInput value={r.title} placeholder="Ej. Vivienda 1ºA" onChange={(v) => update(r.id, { title: v })} />,
    },
    {
      key: "status",
      header: "Estado",
      width: "9rem",
      cell: (r) => (
        <SelectCellInput<RESaleStatus> value={r.status} options={STATUS_OPTS} onChange={(v) => update(r.id, { status: v })} />
      ),
    },
    {
      key: "estimatedPrice",
      header: "Precio est.",
      width: "8rem",
      align: "right",
      cell: (r) => <NumberCellInput value={r.estimatedPrice} onChange={(v) => update(r.id, { estimatedPrice: v })} />,
    },
    {
      key: "realPrice",
      header: "Precio real",
      width: "8rem",
      align: "right",
      cell: (r) => <NumberCellInput value={r.realPrice} onChange={(v) => update(r.id, { realPrice: v })} />,
    },
    {
      key: "deposit",
      header: "Señal",
      width: "7rem",
      align: "right",
      cell: (r) => <NumberCellInput value={r.deposit} onChange={(v) => update(r.id, { deposit: v })} />,
    },
    {
      key: "collected",
      header: "Cobrado",
      width: "7rem",
      align: "right",
      cell: (r) => <NumberCellInput value={r.collected} onChange={(v) => update(r.id, { collected: v })} />,
    },
    {
      key: "pending",
      header: "Pendiente",
      width: "7rem",
      align: "right",
      cell: (r) => {
        const price = r.realPrice ?? r.estimatedPrice;
        if (price == null) return <span className="text-ink-subtle">—</span>;
        const pending = Math.max(0, price - (r.collected ?? 0));
        return <span className="tabular-nums font-semibold text-ink">{fmtEUR(pending)}</span>;
      },
    },
    {
      key: "buyer",
      header: "Comprador",
      width: "10rem",
      cell: (r) => <TextCellInput value={r.buyer} placeholder="—" onChange={(v) => update(r.id, { buyer: v })} />,
    },
    {
      key: "date",
      header: "Fecha",
      width: "9rem",
      cell: (r) => <DateCellInput value={r.date} onChange={(v) => update(r.id, { date: v })} />,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Pipeline comercial: barra apilada por estado + leyenda con conteos */}
      <div className="re-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Pipeline comercial</p>
          <p className="text-sm text-ink-muted">
            {stats.hasData ? `${stats.soldCount}/${stats.count} vendidas · ${fmtPct(stats.soldPct ?? 0)} cerrado` : "Sin ventas"}
          </p>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full border border-line bg-[var(--surface-alt)]">
          {stats.count > 0
            ? RE_SALE_STATUSES.map((s) =>
                stats.byStatus[s] > 0 ? (
                  <div
                    key={s}
                    className="bar-anim h-full"
                    style={{ width: `${(stats.byStatus[s] / stats.count) * 100}%`, background: STATUS_COLOR[s] }}
                    title={`${RE_SALE_STATUS_LABEL[s]}: ${stats.byStatus[s]}`}
                  />
                ) : null,
              )
            : null}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {RE_SALE_STATUSES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-xs">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
              <span className="text-ink-muted">{RE_SALE_STATUS_LABEL[s]}</span>
              <span className="tabular-nums font-bold text-ink">{stats.byStatus[s]}</span>
            </span>
          ))}
        </div>
        {/* Impacto económico */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5 border-t border-line pt-3 text-sm">
          <Fig label="Cobrado" value={stats.hasData ? fmtEUR(stats.collected) : "—"} color="var(--positive)" />
          <Fig label="Pendiente cobro" value={stats.hasData ? fmtEUR(stats.pendingIncome) : "—"} color="var(--brand)" />
          <Fig label="Venta real (cerradas)" value={stats.soldCount > 0 ? fmtEUR(stats.totalReal) : "—"} />
          <Fig label="Venta prevista (motor)" value={fmtEUR(results.totalSales)} />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={sales}
        getRowId={(r) => r.id}
        onAddRow={addRow}
        addLabel="Añadir venta / unidad"
        onDeleteRow={remove}
        emptyText="Sin ventas. Añade unidades o activos y su estado comercial."
      />
    </div>
  );
}

function Fig({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide font-bold text-ink-subtle truncate">{label}</p>
      <p className="text-base font-extrabold tabular-nums tracking-tight truncate" style={color ? { color } : { color: "var(--ink)" }}>{value}</p>
    </div>
  );
}

export default VentasPanel;

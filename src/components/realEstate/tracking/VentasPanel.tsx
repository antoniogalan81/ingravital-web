"use client";

// Panel VENTAS. Tabla editable de unidades/activos con estados (disponible →
// vendido), precios estimado/real, señal, cobrado y pendiente. Persiste `sales`.

import { useMemo } from "react";
import type { REOperation, REResults } from "@/src/lib/realEstate";
import {
  RE_SALE_STATUS_LABEL,
  RE_SALE_STATUSES,
  newTrackingId,
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
import { StatTile } from "@/src/components/ui/StatTile";

const STATUS_OPTS = RE_SALE_STATUSES.map((s) => ({ value: s, label: RE_SALE_STATUS_LABEL[s] }));

const STATUS_PILL: Record<RESaleStatus, string> = {
  DISPONIBLE: "pill-neutral",
  RESERVADO: "pill-info",
  SENALADO: "pill-info",
  APALABRADO: "pill-warning",
  VENDIDO: "pill-positive",
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

  const addRow = () => {
    const nowIso = new Date().toISOString();
    const row: RESale = {
      id: newTrackingId("sale"),
      title: "",
      status: "DISPONIBLE",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    onChange([...sales, row]);
  };

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
      {/* Distribución por estado */}
      <div className="flex flex-wrap gap-2">
        {RE_SALE_STATUSES.map((s) => (
          <span key={s} className={`pill ${STATUS_PILL[s]}`}>
            {RE_SALE_STATUS_LABEL[s]}: <span className="tabular-nums font-bold ml-1">{stats.byStatus[s]}</span>
          </span>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label="Venta estimada" value={fmtEUR(stats.totalEstimated)} />
        <StatTile label="Venta real (cerradas)" value={stats.soldCount > 0 ? fmtEUR(stats.totalReal) : "—"} tone="positive" />
        <StatTile label="Cobrado" value={stats.hasData ? fmtEUR(stats.collected) : "—"} tone="positive" />
        <StatTile label="Pendiente cobro" value={stats.hasData ? fmtEUR(stats.pendingIncome) : "—"} tone="accent" />
      </div>

      {/* Impacto en rentabilidad */}
      <div className="re-card p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Impacto en rentabilidad</p>
          <p className="text-sm text-ink-muted mt-1">
            {stats.hasData
              ? `${stats.soldCount}/${stats.count} vendidas · ${fmtPct(stats.soldPct ?? 0)} cerrado`
              : "Añade ventas para ver el impacto"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide font-bold text-ink-subtle">Venta prevista (motor)</p>
          <p className="text-base font-extrabold tabular-nums text-ink">{fmtEUR(results.totalSales)}</p>
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

export default VentasPanel;

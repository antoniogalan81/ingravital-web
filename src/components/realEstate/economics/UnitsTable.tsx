"use client";

// UNIDADES con edición directa (Proyecto › Unidades y Seguimiento › Ventas). Una fila por unidad
// (ficha de venta o unidad del Proyecto aún sin ficha). Clic en cualquier valor para cambiarlo:
// PREVISIÓN (terminación, señal, venta) y REALIDAD (señal, venta y precio, comprador) más el
// alquiler (destinada ON/OFF y renta). El precio y la renta son los efectivos: propios o base.

import { useMemo } from "react";
import type { REOperation, REResults } from "@/src/lib/realEstate";
import { RE_SALE_STATUS_LABEL, RE_SALE_STATUSES, type RESaleStatus } from "@/src/lib/realEstateTracking";
import { projectUnitRows, type UnitField, type UnitRow } from "@/src/lib/unitEditing";
import { InlineAmount, InlineDate, InlineSelect, InlineText, InlineToggle } from "@/src/components/ui/InlineEdit";

const STATUS_OPTIONS = RE_SALE_STATUSES.map((s) => ({ value: s, label: RE_SALE_STATUS_LABEL[s] }));

export type UnitEdit = (row: UnitRow, field: UnitField, value: string | number | boolean | null) => void;

const TH = "px-1.5 py-1 text-left text-[10px] font-bold uppercase tracking-wide text-ink-subtle whitespace-nowrap";
const TD = "px-0.5 py-0.5 align-middle";

export function UnitsTable({ op, results, onEdit, overlayRoot, readOnly = false }: { op: REOperation; results: REResults; onEdit: UnitEdit; overlayRoot?: HTMLElement | null; readOnly?: boolean }) {
  const rows = useMemo(() => projectUnitRows(op, results), [op, results]);
  if (!rows.length) return <p className="text-xs text-ink-subtle">Todavía no hay unidades. Añádelas arriba con su tipología.</p>;
  const ro = readOnly;
  const cells = (r: UnitRow) => {
    const e = (field: UnitField) => (v: string | number | boolean | null) => onEdit(r, field, v);
    const date = (field: UnitField, label: string, value?: string) => <InlineDate label={`${label} · ${r.title}`} value={value} onChange={e(field)} readOnly={ro} overlayRoot={overlayRoot} />;
    return (
      <>
        <td className={TD}>
          <InlineSelect<RESaleStatus> label={`Estado · ${r.title}`} value={r.status} options={STATUS_OPTIONS} onChange={e("status")} readOnly={ro} />
        </td>
        <td className={`${TD} border-l border-line`}>{date("completionDateEstimated", "Terminación prevista", r.completionDateEstimated)}</td>
        <td className={TD}>{date("depositDateEstimated", "Señal prevista", r.depositDateEstimated)}</td>
        <td className={TD}>{date("saleDateEstimated", "Venta prevista", r.saleDateEstimated)}</td>
        <td className={`${TD} border-l border-line`}>{date("depositDate", "Fecha de la señal", r.depositDate)}</td>
        <td className={TD}><InlineAmount label={`Importe de la señal · ${r.title}`} value={r.deposit} onChange={e("deposit")} readOnly={ro} /></td>
        <td className={TD}>{date("saleDate", "Fecha de venta", r.saleDate)}</td>
        <td className={TD}><InlineAmount label={`Precio de venta · ${r.title}`} value={r.price} own={r.priceOwn} onChange={e("price")} readOnly={ro} /></td>
        <td className={TD}><InlineText label={`Comprador · ${r.title}`} value={r.buyer} onChange={e("buyer")} readOnly={ro} placeholder="Nombre" /></td>
        <td className={`${TD} border-l border-line text-center`}><InlineToggle label={`Destinada al alquiler · ${r.title}`} value={r.forRent} onChange={e("forRent")} readOnly={ro} /></td>
        <td className={TD}><InlineAmount label={`Renta mensual · ${r.title}`} value={r.rent} own={r.rentOwn} onChange={e("rent")} readOnly={ro} /></td>
      </>
    );
  };

  // Filas con la cabecera de grupo intercalada.
  const lines = rows.flatMap((r, i) => (i === 0 || rows[i - 1].group !== r.group ? [{ group: r.groupLabel, key: `g-${r.group}`, row: r }, { row: r }] : [{ row: r }]));
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full min-w-[1010px] border-collapse text-xs">
        <colgroup>
          <col className="w-[104px]" />
          <col className="w-[92px]" />
          <col className="w-[98px]" />
          <col className="w-[98px]" />
          <col className="w-[98px]" />
          <col className="w-[98px]" />
          <col className="w-[84px]" />
          <col className="w-[98px]" />
          <col className="w-[92px]" />
          <col className="w-[104px]" />
          <col className="w-[58px]" />
          <col className="w-[84px]" />
        </colgroup>
        <thead className="bg-[var(--surface-alt)]">
          <tr>
            <th className={`${TH} sticky left-0 z-10 bg-[var(--surface-alt)]`} rowSpan={2}>Unidad</th>
            <th className={TH} rowSpan={2}>Estado</th>
            <th className={`${TH} border-l border-line text-brand`} colSpan={3}>Previsión</th>
            <th className={`${TH} border-l border-line`} style={{ color: "var(--positive)" }} colSpan={5}>Realidad</th>
            <th className={`${TH} border-l border-line`} colSpan={2}>Alquiler</th>
          </tr>
          <tr>
            <th className={`${TH} border-l border-line`}>Terminación</th>
            <th className={TH}>Señal</th>
            <th className={TH}>Venta</th>
            <th className={`${TH} border-l border-line`}>Señal</th>
            <th className={`${TH} text-right`}>Señal €</th>
            <th className={TH}>Venta</th>
            <th className={`${TH} text-right`}>Precio €</th>
            <th className={TH}>Comprador</th>
            <th className={`${TH} border-l border-line text-center`}>Destino</th>
            <th className={`${TH} text-right`}>Renta/mes</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) =>
            "group" in l ? (
              <tr key={l.key} className="border-t border-line bg-white">
                <td colSpan={12} className="px-1.5 pb-0.5 pt-2">
                  <span className="sticky left-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-subtle">{l.group}</span>
                </td>
              </tr>
            ) : (
              <tr key={l.row.key} className="border-t border-line/60 hover:bg-[var(--surface-alt)]/60">
                <th scope="row" className="sticky left-0 z-[1] bg-white px-1.5 py-0.5 text-left text-xs font-semibold text-ink">
                  <span className="block truncate" title={l.row.virtual ? "Unidad del Proyecto sin ficha: se crea al editar un dato" : l.row.title}>
                    {l.row.title}
                  </span>
                </th>
                {cells(l.row)}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

export default UnitsTable;

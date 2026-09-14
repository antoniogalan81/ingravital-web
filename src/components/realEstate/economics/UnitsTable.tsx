"use client";

// UNIDADES con edición directa (Proyecto › Unidades y Seguimiento › Ventas), igual que la APP.
// Una fila por unidad (ficha de venta o unidad del Proyecto aún sin ficha). Clic en un valor para
// cambiarlo: PREVISIÓN (terminación, venta), SEÑAL REAL (importe, fecha), VENTA REAL (precio,
// fecha, comprador) y ALQUILER (destino y renta). Con «Seleccionar» se marcan varias unidades
// (una, un grupo o todas) y «Editar seleccionadas» cambia solo los campos tocados.
// Al poner un importe de señal o de venta sin su fecha se abre el calendario para elegirla.

import { useMemo, useState } from "react";
import type { REOperation, REResults } from "@/src/lib/realEstate";
import { RE_SALE_STATUS_LABEL, RE_SALE_STATUSES, type RESaleStatus } from "@/src/lib/realEstateTracking";
import { projectUnitRows, type UnitField, type UnitPatch, type UnitRow } from "@/src/lib/unitEditing";
import { CalendarOverlay, InlineAmount, InlineDate, InlineSelect, InlineText, InlineToggle } from "@/src/components/ui/InlineEdit";
import { UnitsBulkDialog } from "./UnitsBulkDialog";

const STATUS_OPTIONS = RE_SALE_STATUSES.map((s) => ({ value: s, label: RE_SALE_STATUS_LABEL[s] }));

export type UnitEdit = (row: UnitRow, field: UnitField, value: string | number | boolean | null) => void;
export type UnitBulkEdit = (rows: UnitRow[], patch: UnitPatch) => void;

const TH = "px-1.5 py-1 text-left text-[10px] font-bold uppercase tracking-wide text-ink-subtle whitespace-nowrap";
const TD = "px-0.5 py-0.5 align-middle";

/** Clave estable de una unidad (no cambia cuando una unidad sin ficha pasa a tenerla). */
const selKey = (r: Pick<UnitRow, "group" | "title">) => `${r.group}|${r.title}`;

export function UnitsTable({ op, results, onEdit, onBulkEdit, overlayRoot, readOnly = false }: { op: REOperation; results: REResults; onEdit: UnitEdit; onBulkEdit?: UnitBulkEdit; overlayRoot?: HTMLElement | null; readOnly?: boolean }) {
  const rows = useMemo(() => projectUnitRows(op, results), [op, results]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [autoDate, setAutoDate] = useState<{ key: string; field: "depositDate" | "saleDate" } | null>(null);
  if (!rows.length) return <p className="text-xs text-ink-subtle">Todavía no hay unidades. Añádelas arriba con su tipología.</p>;
  const ro = readOnly;
  const canSelect = !ro && !!onBulkEdit;
  const selectedRows = rows.filter((r) => selected.has(selKey(r)));
  const allSelected = selectedRows.length === rows.length;
  const setKeys = (keys: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
      return next;
    });
  const stop = () => {
    setSelecting(false);
    setSelected(new Set());
    setBulkOpen(false);
  };

  const cells = (r: UnitRow) => {
    const e = (field: UnitField) => (v: string | number | boolean | null) => {
      onEdit(r, field, v);
      if (field === "deposit" && v != null && !r.depositDate) setAutoDate({ key: selKey(r), field: "depositDate" });
      if (field === "price" && v != null && !r.saleDate) setAutoDate({ key: selKey(r), field: "saleDate" });
    };
    const date = (field: UnitField, label: string, value?: string) => <InlineDate label={`${label} · ${r.title}`} value={value} onChange={e(field)} readOnly={ro} overlayRoot={overlayRoot} />;
    return (
      <>
        <td className={TD}>
          <InlineSelect<RESaleStatus> label={`Estado · ${r.title}`} value={r.status} options={STATUS_OPTIONS} onChange={e("status")} readOnly={ro} />
        </td>
        <td className={`${TD} border-l border-line`}>{date("completionDateEstimated", "Terminación prevista", r.completionDateEstimated)}</td>
        <td className={TD}>{date("saleDateEstimated", "Venta prevista", r.saleDateEstimated)}</td>
        <td className={`${TD} border-l border-line`}><InlineAmount label={`Importe de la señal · ${r.title}`} value={r.deposit} onChange={e("deposit")} readOnly={ro} /></td>
        <td className={TD}>{date("depositDate", "Fecha de la señal", r.depositDate)}</td>
        <td className={`${TD} border-l border-line`}><InlineAmount label={`Precio de venta · ${r.title}`} value={r.price} own={r.priceOwn} onChange={e("price")} readOnly={ro} /></td>
        <td className={TD}>{date("saleDate", "Fecha de venta", r.saleDate)}</td>
        <td className={TD}><InlineText label={`Comprador · ${r.title}`} value={r.buyer} onChange={e("buyer")} readOnly={ro} placeholder="Nombre" /></td>
        <td className={`${TD} border-l border-line text-center`}><InlineToggle label={`Destinada al alquiler · ${r.title}`} value={r.forRent} onChange={e("forRent")} readOnly={ro} /></td>
        <td className={TD}><InlineAmount label={`Renta mensual · ${r.title}`} value={r.rent} own={r.rentOwn} onChange={e("rent")} readOnly={ro} /></td>
      </>
    );
  };

  const box = (state: "on" | "off" | "mixed") => (
    <span aria-hidden="true" className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-black leading-none ${state === "off" ? "border-slate-400 bg-white" : "border-[var(--brand)] bg-[var(--brand)] text-white"}`}>
      {state === "on" ? "✓" : state === "mixed" ? "–" : ""}
    </span>
  );

  // Filas con la cabecera de grupo intercalada.
  const lines = rows.flatMap((r, i): ({ group: string; key: string; keys: string[]; row: UnitRow } | { row: UnitRow })[] =>
    i === 0 || rows[i - 1].group !== r.group ? [{ group: r.groupLabel, key: `g-${r.group}`, keys: rows.filter((x) => x.group === r.group).map(selKey), row: r }, { row: r }] : [{ row: r }],
  );
  const autoTarget = autoDate ? rows.find((r) => selKey(r) === autoDate.key) : undefined;
  return (
    <div className="space-y-2">
      {canSelect ? (
        selecting ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-xs font-extrabold text-ink">{selectedRows.length === 1 ? "1 seleccionada" : `${selectedRows.length} seleccionadas`}</span>
            <button type="button" onClick={() => (allSelected ? setSelected(new Set()) : setKeys(rows.map(selKey), true))} className="text-xs font-bold text-brand hover:underline">
              {allSelected ? "Deseleccionar todas" : "Seleccionar todas"}
            </button>
            <button type="button" onClick={stop} className="text-xs font-bold text-ink-subtle hover:underline">Cancelar</button>
            <button type="button" disabled={!selectedRows.length} onClick={() => setBulkOpen(true)} className="ml-auto rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
              {selectedRows.length ? `Editar seleccionadas (${selectedRows.length})` : "Marca las unidades a editar"}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-ink-subtle">Clic en un dato para editarlo.</p>
            <button type="button" onClick={() => setSelecting(true)} className="rounded-full border border-[var(--brand)] px-3 py-1 text-xs font-bold text-brand hover:bg-[var(--brand-soft)]">Seleccionar</button>
          </div>
        )
      ) : null}
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[1010px] border-collapse text-xs">
          <colgroup>
            <col className="w-[116px]" />
            <col className="w-[92px]" />
            <col className="w-[98px]" />
            <col className="w-[98px]" />
            <col className="w-[88px]" />
            <col className="w-[98px]" />
            <col className="w-[102px]" />
            <col className="w-[98px]" />
            <col className="w-[104px]" />
            <col className="w-[58px]" />
            <col className="w-[84px]" />
          </colgroup>
          <thead className="sticky top-0 z-20 bg-[var(--surface-alt)]">
            <tr>
              <th className={`${TH} sticky left-0 z-10 bg-[var(--surface-alt)]`} rowSpan={2}>Unidad</th>
              <th className={TH} rowSpan={2}>Estado</th>
              <th className={`${TH} border-l border-line text-brand`} colSpan={2}>Previsión</th>
              <th className={`${TH} border-l border-line`} style={{ color: "var(--positive)" }} colSpan={2}>Señal real</th>
              <th className={`${TH} border-l border-line`} style={{ color: "var(--positive)" }} colSpan={3}>Venta real</th>
              <th className={`${TH} border-l border-line`} colSpan={2}>Alquiler</th>
            </tr>
            <tr>
              <th className={`${TH} border-l border-line`}>Terminación</th>
              <th className={TH}>Venta</th>
              <th className={`${TH} border-l border-line text-right`}>Importe €</th>
              <th className={TH}>Fecha</th>
              <th className={`${TH} border-l border-line text-right`}>Precio €</th>
              <th className={TH}>Fecha</th>
              <th className={TH}>Comprador</th>
              <th className={`${TH} border-l border-line text-center`}>Destino</th>
              <th className={`${TH} text-right`}>Renta/mes</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              if ("group" in l) {
                const on = l.keys.filter((k) => selected.has(k)).length;
                return (
                  <tr key={l.key} className="border-t border-line bg-white">
                    <td colSpan={11} className="px-1.5 pb-0.5 pt-2">
                      {selecting ? (
                        <button type="button" role="checkbox" aria-checked={on === l.keys.length ? true : on ? "mixed" : false} aria-label={`Seleccionar todas: ${l.group}`} onClick={() => setKeys(l.keys, on < l.keys.length)} className="sticky left-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-subtle">
                          {box(on === l.keys.length ? "on" : on ? "mixed" : "off")}
                          {l.group}
                        </button>
                      ) : (
                        <span className="sticky left-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-subtle">{l.group}</span>
                      )}
                    </td>
                  </tr>
                );
              }
              const isOn = selected.has(selKey(l.row));
              return (
                <tr key={l.row.key} className={`border-t border-line/60 ${isOn ? "bg-[var(--brand-soft)]" : "hover:bg-[var(--surface-alt)]/60"}`}>
                  <th scope="row" className={`sticky left-0 z-[1] px-1.5 py-0.5 text-left text-xs font-semibold text-ink ${isOn ? "bg-[var(--brand-soft)]" : "bg-white"}`}>
                    {selecting ? (
                      <button type="button" role="checkbox" aria-checked={isOn} aria-label={`Seleccionar ${l.row.title}`} onClick={() => setKeys([selKey(l.row)], !isOn)} className="flex w-full items-center gap-1.5 text-left">
                        {box(isOn ? "on" : "off")}
                        <span className="truncate">{l.row.title}</span>
                      </button>
                    ) : (
                      <span className="block truncate" title={l.row.virtual ? "Unidad del Proyecto sin ficha: se crea al editar un dato" : l.row.title}>
                        {l.row.title}
                      </span>
                    )}
                  </th>
                  {cells(l.row)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {bulkOpen && selectedRows.length && onBulkEdit ? (
        <UnitsBulkDialog
          rows={selectedRows}
          onClose={() => setBulkOpen(false)}
          onApply={(patch) => {
            onBulkEdit(selectedRows, patch);
            stop();
          }}
        />
      ) : null}
      {autoDate && autoTarget ? (
        <CalendarOverlay
          target={overlayRoot ?? (typeof document !== "undefined" ? document.body : null)}
          onClose={() => setAutoDate(null)}
          onPick={(iso) => {
            if (iso) onEdit(autoTarget, autoDate.field, iso);
            setAutoDate(null);
          }}
        />
      ) : null}
    </div>
  );
}

export default UnitsTable;

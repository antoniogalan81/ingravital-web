"use client";

// UNIDADES (Seguimiento operativo › Unidades y ventas), igual que la APP. Una fila por unidad
// (ficha de venta o unidad del Proyecto aún sin ficha) con SOLO los datos de su ficha:
// Estado · Previsión (terminación, venta) · Valores (venta, alquiler) · Señal (importe, fecha) ·
// Cierre (precio o renta y fecha). Clic en un dato para cambiarlo; ✎ abre la ficha completa;
// «Seleccionar» marca varias unidades (una, un grupo o todas) y «Editar seleccionadas» abre la
// MISMA ficha. Elegir Vendido o Alquilado pide precio o renta y fecha antes de aplicarlo.

import { useMemo, useState } from "react";
import type { REOperation, REResults } from "@/src/lib/realEstate";
import { RE_SALE_STATUS_LABEL, RE_SALE_STATUSES, type RESaleStatus } from "@/src/lib/realEstateTracking";
import { formatEsDate, projectUnitRows, type UnitField, type UnitPatch, type UnitRow } from "@/src/lib/unitEditing";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import { CalendarOverlay, InlineAmount, InlineDate, InlineSelect } from "@/src/components/ui/InlineEdit";
import { UnitEditorDialog } from "./UnitEditorDialog";

const STATUS_OPTIONS = RE_SALE_STATUSES.map((s) => ({ value: s, label: RE_SALE_STATUS_LABEL[s] }));

export type UnitEdit = (row: UnitRow, field: UnitField, value: string | number | boolean | null) => void;
export type UnitBulkEdit = (rows: UnitRow[], patch: UnitPatch) => void;

const TH = "px-1.5 py-1 text-left text-[10px] font-bold uppercase tracking-wide text-ink-subtle whitespace-nowrap";
const TD = "px-0.5 py-0.5 align-middle";

/** Clave estable de una unidad: su ficha o, si aún no tiene, su grupo y nombre. */
const selKey = (r: Pick<UnitRow, "group" | "saleId" | "title">) => r.saleId ?? `${r.group}|${r.title}`;

type Editor = { rows: UnitRow[]; presetStatus?: RESaleStatus; closing?: boolean };

export function UnitsTable({ op, results, onEdit, onBulkEdit, onRemove, overlayRoot, readOnly = false }: { op: REOperation; results: REResults; onEdit: UnitEdit; onBulkEdit: UnitBulkEdit; onRemove?: (saleId: string) => void; overlayRoot?: HTMLElement | null; readOnly?: boolean }) {
  const rows = useMemo(() => projectUnitRows(op, results), [op, results]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [askDeposit, setAskDeposit] = useState<string | null>(null);
  if (!rows.length) return <p className="text-xs text-ink-subtle">Todavía no hay unidades. Añádelas en Proyecto › Unidades con su tipología.</p>;
  const ro = readOnly;
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
  };

  const cells = (r: UnitRow) => {
    const e = (field: UnitField) => (v: string | number | boolean | null) => {
      onEdit(r, field, v);
      // Importe de señal sin fecha: se pide la fecha (sin fecha no cuenta como cobrado).
      if (field === "deposit" && v != null && !r.depositDate) setAskDeposit(r.saleId ?? `${r.group}|${r.title}`);
    };
    const date = (field: UnitField, label: string, value?: string) => <InlineDate label={`${label} · ${r.title}`} value={value} onChange={e(field)} readOnly={ro} overlayRoot={overlayRoot} />;
    const closed = r.status === "VENDIDO" ? { amount: r.price, date: r.saleDate, unit: "" } : r.status === "ALQUILADO" ? { amount: r.rent, date: r.rentDate, unit: "/mes" } : null;
    return (
      <>
        <td className={TD}>
          <InlineSelect<RESaleStatus>
            label={`Estado · ${r.title}`}
            value={r.status}
            options={STATUS_OPTIONS}
            readOnly={ro}
            onChange={(v) => (v === "VENDIDO" || v === "ALQUILADO" ? setEditor({ rows: [r], presetStatus: v, closing: true }) : onEdit(r, "status", v))}
          />
        </td>
        <td className={`${TD} border-l border-line`}>{date("completionDateEstimated", "Terminación prevista", r.completionDateEstimated)}</td>
        <td className={TD}>{date("saleDateEstimated", "Venta prevista", r.saleDateEstimated)}</td>
        <td className={`${TD} border-l border-line`}><InlineAmount label={`Precio de venta · ${r.title}`} value={r.price} own={r.priceOwn} onChange={e("price")} readOnly={ro} /></td>
        <td className={TD}><InlineAmount label={`Renta mensual · ${r.title}`} value={r.rent} own={r.rentOwn} onChange={e("rent")} readOnly={ro} /></td>
        <td className={`${TD} border-l border-line`}><InlineAmount label={`Importe de la señal · ${r.title}`} value={r.deposit} onChange={e("deposit")} readOnly={ro} /></td>
        <td className={TD}>{date("depositDate", "Fecha de la señal", r.depositDate)}</td>
        <td className={`${TD} border-l border-line`}>
          {closed ? (
            <button type="button" disabled={ro} onClick={() => setEditor({ rows: [r], presetStatus: r.status, closing: true })} aria-label={`Cierre · ${r.title}`} className="block w-full min-h-8 rounded-md px-1.5 py-1 text-left text-xs tabular-nums hover:bg-[var(--brand-soft)] disabled:hover:bg-transparent">
              <span className="whitespace-nowrap font-semibold text-ink">{closed.amount != null ? `${fmtEUR(closed.amount)}${closed.unit}` : "Falta importe"}</span>
              <span className={`ml-1 whitespace-nowrap ${closed.date ? "text-ink-subtle" : "font-semibold text-[var(--negative)]"}`}>{closed.date ? formatEsDate(closed.date) : "falta fecha"}</span>
            </button>
          ) : (
            <span className="block px-1.5 text-ink-subtle">—</span>
          )}
        </td>
      </>
    );
  };

  const box = (state: "on" | "off" | "mixed") => (
    <span aria-hidden="true" className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-black leading-none ${state === "off" ? "border-slate-400 bg-white" : "border-[var(--brand)] bg-[var(--brand)] text-white"}`}>
      {state === "on" ? "✓" : state === "mixed" ? "–" : ""}
    </span>
  );

  const lines = rows.flatMap((r, i): ({ group: string; key: string; keys: string[]; row: UnitRow } | { row: UnitRow })[] =>
    i === 0 || rows[i - 1].group !== r.group ? [{ group: r.groupLabel, key: `g-${r.group}`, keys: rows.filter((x) => x.group === r.group).map(selKey), row: r }, { row: r }] : [{ row: r }],
  );
  // Tras guardar el importe, la unidad sin ficha ya la tiene: se busca por su ficha o por grupo y nombre.
  const depositRow = askDeposit ? rows.find((r) => selKey(r) === askDeposit || `${r.group}|${r.title}` === askDeposit) : undefined;
  return (
    <div className="space-y-2">
      {ro ? null : selecting ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-xs font-extrabold text-ink">{selectedRows.length === 1 ? "1 seleccionada" : `${selectedRows.length} seleccionadas`}</span>
          <button type="button" onClick={() => (allSelected ? setSelected(new Set()) : setKeys(rows.map(selKey), true))} className="text-xs font-bold text-brand hover:underline">
            {allSelected ? "Deseleccionar todas" : "Seleccionar todas"}
          </button>
          <button type="button" onClick={stop} className="text-xs font-bold text-ink-subtle hover:underline">Cancelar</button>
          <button type="button" disabled={!selectedRows.length} onClick={() => setEditor({ rows: selectedRows })} className="ml-auto rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
            {selectedRows.length ? `Editar seleccionadas (${selectedRows.length})` : "Marca las unidades a editar"}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-ink-subtle">Clic en un dato para editarlo · ✎ ficha completa. La señal cuenta como cobrada cuando tiene fecha.</p>
          <button type="button" onClick={() => setSelecting(true)} className="shrink-0 rounded-full border border-[var(--brand)] px-3 py-1 text-xs font-bold text-brand hover:bg-[var(--brand-soft)]">Seleccionar</button>
        </div>
      )}
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[930px] border-collapse text-xs">
          <colgroup>
            <col className="w-[132px]" />
            <col className="w-[108px]" />
            <col className="w-[98px]" />
            <col className="w-[98px]" />
            <col className="w-[98px]" />
            <col className="w-[88px]" />
            <col className="w-[88px]" />
            <col className="w-[98px]" />
            <col className="w-[128px]" />
          </colgroup>
          <thead className="sticky top-0 z-20 bg-[var(--surface-alt)]">
            <tr>
              <th className={`${TH} sticky left-0 z-10 bg-[var(--surface-alt)]`} rowSpan={2}>Unidad</th>
              <th className={TH} rowSpan={2}>Estado</th>
              <th className={`${TH} border-l border-line text-brand`} colSpan={2}>Previsión</th>
              <th className={`${TH} border-l border-line`} colSpan={2}>Valores</th>
              <th className={`${TH} border-l border-line`} style={{ color: "var(--positive)" }} colSpan={2}>Señal</th>
              <th className={`${TH} border-l border-line`} style={{ color: "var(--positive)" }} rowSpan={2}>Cierre</th>
            </tr>
            <tr>
              <th className={`${TH} border-l border-line`}>Terminación</th>
              <th className={TH}>Venta</th>
              <th className={`${TH} border-l border-line text-right`}>Venta €</th>
              <th className={`${TH} text-right`}>Alquiler €/mes</th>
              <th className={`${TH} border-l border-line text-right`}>Importe €</th>
              <th className={TH}>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              if ("group" in l) {
                const on = l.keys.filter((k) => selected.has(k)).length;
                return (
                  <tr key={l.key} className="border-t border-line bg-white">
                    <td colSpan={9} className="px-1.5 pb-0.5 pt-2">
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
                      <span className="flex items-center gap-1">
                        {ro ? null : (
                          <button type="button" onClick={() => setEditor({ rows: [l.row] })} aria-label={`Editar todo: ${l.row.title}`} title="Ficha de la unidad" className="flex h-7 w-6 shrink-0 items-center justify-center rounded text-brand hover:bg-[var(--brand-soft)]">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 16.536 9 17l.464-3.536z" /></svg>
                          </button>
                        )}
                        <span className="truncate" title={l.row.virtual ? "Unidad del Proyecto sin ficha: se crea al editar un dato" : l.row.title}>{l.row.title}</span>
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
      {editor ? (
        <UnitEditorDialog
          rows={editor.rows}
          presetStatus={editor.presetStatus}
          closing={editor.closing}
          onClose={() => setEditor(null)}
          onRemove={onRemove && editor.rows[0]?.saleId ? () => { onRemove(editor.rows[0].saleId as string); setEditor(null); } : undefined}
          onApply={(patch) => {
            onBulkEdit(editor.rows, patch);
            setEditor(null);
            if (editor.rows.length > 1) stop();
          }}
        />
      ) : null}
      {askDeposit && depositRow ? (
        <CalendarOverlay
          target={overlayRoot ?? (typeof document !== "undefined" ? document.body : null)}
          onClose={() => setAskDeposit(null)}
          onPick={(iso) => {
            if (iso) onEdit(depositRow, "depositDate", iso);
            setAskDeposit(null);
          }}
        />
      ) : null}
    </div>
  );
}

export default UnitsTable;

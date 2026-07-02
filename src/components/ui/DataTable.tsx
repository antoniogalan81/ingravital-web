"use client";

// Tabla editable reutilizable (estilo hoja de cálculo). Es una PRIMITIVA de
// estructura: cabecera pegajosa, scroll horizontal, botón de añadir y borrado por
// fila. Las celdas editables las aporta el llamante vía `columns[].cell`, usando
// los inputs compartidos exportados abajo (evita duplicar lógica de edición).

import { useState, type ReactNode } from "react";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  width?: string; // p.ej. "8rem"
  align?: "left" | "right" | "center";
  cell: (row: T, index: number) => ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onAddRow,
  addLabel = "Añadir fila",
  onDeleteRow,
  onDuplicateRow,
  rowAccent,
  emptyText = "Sin datos. Añade la primera fila.",
  footer,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onAddRow?: () => void;
  addLabel?: string;
  onDeleteRow?: (row: T) => void;
  onDuplicateRow?: (row: T) => void;
  rowAccent?: (row: T) => string | undefined;
  emptyText?: string;
  footer?: ReactNode;
}) {
  const alignCls = (a?: string) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";
  const hasActions = !!(onDeleteRow || onDuplicateRow);

  return (
    <div className="flex flex-col gap-2">
      {onAddRow ? (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onAddRow}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition-colors"
            style={{ background: "var(--brand)" }}
          >
            <span className="text-base leading-none">+</span> {addLabel}
          </button>
          <span className="text-xs text-ink-subtle tabular-nums">{rows.length} filas</span>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-line" style={{ boxShadow: "var(--shadow-xs)" }}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width, minWidth: c.width } : undefined}
                  className={`re-th px-2.5 py-2.5 ${alignCls(c.align)}`}
                >
                  {c.header}
                </th>
              ))}
              {hasActions ? <th className="re-th w-16 px-2 py-2.5" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (hasActions ? 1 : 0)}
                  className="px-3 py-6 text-center text-sm text-ink-subtle"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const accent = rowAccent?.(row);
                return (
                  <tr
                    key={getRowId(row)}
                    className={`re-tr border-t border-line align-middle ${i % 2 === 1 ? "re-zebra" : ""}`}
                    style={accent ? { boxShadow: `inset 3px 0 0 ${accent}` } : undefined}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={`px-2 py-1.5 ${alignCls(c.align)}`}>
                        {c.cell(row, i)}
                      </td>
                    ))}
                    {hasActions ? (
                      <td className="px-1 py-1.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-0.5">
                          {onDuplicateRow ? (
                            <button
                              type="button"
                              onClick={() => onDuplicateRow(row)}
                              title="Duplicar fila"
                              className="p-1.5 text-slate-400 hover:text-brand rounded-md hover:bg-[var(--brand-soft)] transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          ) : null}
                          {onDeleteRow ? (
                            <button
                              type="button"
                              onClick={() => onDeleteRow(row)}
                              title="Eliminar fila"
                              className="p-1.5 text-slate-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
          {footer ? <tfoot>{footer}</tfoot> : null}
        </table>
      </div>
    </div>
  );
}

// ── Inputs de celda compartidos ─────────────────────────────────────────────────

const cellInputCls =
  "w-full bg-transparent px-1.5 py-1 text-sm text-ink rounded-md border border-transparent hover:border-line focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 transition-colors";

export function TextCellInput({
  value,
  onChange,
  placeholder,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${cellInputCls} placeholder:text-slate-400`}
    />
  );
}

const fmtNumEs = (v: number | undefined): string =>
  v == null || !Number.isFinite(v) ? "" : v.toLocaleString("es-ES", { maximumFractionDigits: 2 });

const parseNumEs = (s: string): number | undefined => {
  const clean = s.replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : undefined;
};

export function NumberCellInput({
  value,
  onChange,
  placeholder = "—",
  align = "right",
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  align?: "left" | "right";
}) {
  // Sin useEffect: fuera de foco el display deriva del prop `value`; durante la
  // edición se usa un buffer local. Evita el antipatrón setState-in-effect.
  const [buffer, setBuffer] = useState<string | null>(null);
  const display = buffer ?? fmtNumEs(value);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      placeholder={placeholder}
      onFocus={() => setBuffer(fmtNumEs(value).replace(/\./g, ""))}
      onChange={(e) => setBuffer(e.target.value)}
      onBlur={() => {
        const n = parseNumEs(buffer ?? "");
        onChange(n);
        setBuffer(null);
      }}
      className={`${cellInputCls} tabular-nums ${align === "right" ? "text-right" : "text-left"} placeholder:text-slate-300`}
    />
  );
}

export function SelectCellInput<V extends string>({
  value,
  onChange,
  options,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as V)}
      className={`${cellInputCls} cursor-pointer`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function DateCellInput({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <input
      type="date"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={`${cellInputCls} text-ink-muted`}
    />
  );
}

export default DataTable;

"use client";

// Vista TABLA de operaciones (gestión de un vistazo). Filas principales + subfilas
// de variantes expandibles. Columnas con datos reales (calcResults + seguimiento);
// lo no disponible se muestra "—" (no se inventa). Cambio de etapa inline con
// StageSelect. Abrir operación con la acción de fila (mantiene RealEstateModal).

import { Fragment } from "react";
import type { REOperation } from "@/src/lib/realEstate";
import { calcResults, fmtEUR, fmtPct, CATEGORY_INFO, type RealEstateCategory } from "@/src/lib/realEstateCalc";
import { expenseTotals, salesStats } from "@/src/lib/realEstateTrackingCalc";
import { stageOf, type PipelineStage } from "@/src/lib/pipeline";
import { formatShortDate } from "@/src/lib/date";
import { StageSelect } from "./pipeline/StageSelect";

export type OperationRow = {
  key: string;
  op: REOperation; // operación principal (o el "main" del grupo de variantes)
  groupId?: string; // presente si es un grupo con variantes
  variants: REOperation[]; // variantes (sin la principal)
};

const catLabel = (op: REOperation) => CATEGORY_INFO[(op._cat ?? "vivienda") as RealEstateCategory]?.label ?? "—";

function OpCells({
  op,
  onOpen,
  onChangeStage,
}: {
  op: REOperation;
  onOpen: (op: REOperation) => void;
  onChangeStage: (op: REOperation, stage: PipelineStage) => void;
}) {
  const res = calcResults(op);
  const exp = expenseTotals(op);
  const sales = salesStats(op);
  const num = (v: string) => <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{v}</td>;
  const colored = (v: string, positive: boolean) => (
    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold" style={{ color: positive ? "var(--positive)" : "var(--negative)" }}>
      {v}
    </td>
  );

  return (
    <>
      <td className="px-3 py-2 whitespace-nowrap text-ink-muted">{catLabel(op)}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <StageSelect stage={stageOf(op)} onChange={(s) => onChangeStage(op, s)} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-ink-muted max-w-[12rem] truncate">{op.address || "—"}</td>
      {num(fmtEUR(res.totalInvestment))}
      {num(fmtEUR(res.totalSales))}
      {colored(fmtEUR(res.saleBenefit), res.saleBenefit >= 0)}
      {colored(fmtPct(res.saleYield), res.saleYield >= 0)}
      {num(exp.real > 0 ? fmtEUR(exp.real) : "—")}
      {num(sales.hasData ? fmtEUR(sales.collected) : "—")}
      <td className="px-3 py-2 whitespace-nowrap text-ink-subtle">{formatShortDate(op.updatedAt) || "—"}</td>
      <td className="px-3 py-2 whitespace-nowrap text-right">
        <button
          type="button"
          onClick={() => onOpen(op)}
          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white transition-colors"
          style={{ background: "var(--brand)" }}
        >
          Abrir
        </button>
      </td>
    </>
  );
}

const HEADERS = [
  "Operación",
  "Tipo",
  "Etapa",
  "Ubicación",
  "Inversión total",
  "Ingresos est.",
  "Beneficio est.",
  "Rentab. est.",
  "Gastos reales",
  "Cobrado",
  "Actualizado",
  "",
];

export function OperationsTable({
  rows,
  onOpen,
  onChangeStage,
  expandedGroups,
  onToggleGroup,
}: {
  rows: OperationRow[];
  onOpen: (op: REOperation) => void;
  onChangeStage: (op: REOperation, stage: PipelineStage) => void;
  expandedGroups: Set<string>;
  onToggleGroup: (groupId: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-subtle py-6 text-center">No hay operaciones que coincidan con el filtro.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[var(--surface-alt)] sticky top-0">
            {HEADERS.map((h, i) => (
              <th
                key={i}
                className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle whitespace-nowrap ${
                  i >= 4 && i <= 9 ? "text-right" : "text-left"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const hasVariants = row.variants.length > 0;
            const expanded = row.groupId ? expandedGroups.has(row.groupId) : false;
            return (
              <Fragment key={row.key}>
                {/* Fila principal */}
                <tr className="border-t border-line hover:bg-[var(--surface-alt)]/60">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {hasVariants && row.groupId ? (
                        <button
                          type="button"
                          onClick={() => onToggleGroup(row.groupId as string)}
                          title={expanded ? "Contraer variantes" : "Expandir variantes"}
                          className="p-0.5 text-slate-400 hover:text-brand transition-colors"
                        >
                          <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      ) : (
                        <span className="inline-block w-5" />
                      )}
                      <button type="button" onClick={() => onOpen(row.op)} className="font-bold text-ink hover:text-brand text-left truncate max-w-[16rem]">
                        {row.op.name || "Operación"}
                      </button>
                      {hasVariants ? (
                        <span className="pill pill-neutral">{row.variants.length + 1} var.</span>
                      ) : null}
                      {row.op.isDraft ? <span className="pill pill-warning">Incompleta</span> : null}
                    </div>
                  </td>
                  <OpCells op={row.op} onOpen={onOpen} onChangeStage={onChangeStage} />
                </tr>

                {/* Subfilas de variantes */}
                {expanded &&
                  row.variants.map((v) => (
                    <tr key={v.id} className="border-t border-line bg-[var(--surface-alt)]/40">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 pl-6">
                          <span className="text-ink-subtle" style={{ color: "var(--line-strong)" }}>↳</span>
                          <button type="button" onClick={() => onOpen(v)} className="font-medium text-ink-muted hover:text-brand text-left truncate max-w-[14rem]">
                            {v.variantName || v.name || "Variante"}
                          </button>
                          <span className="pill pill-info">variante</span>
                        </div>
                      </td>
                      <OpCells op={v} onOpen={onOpen} onChangeStage={onChangeStage} />
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default OperationsTable;

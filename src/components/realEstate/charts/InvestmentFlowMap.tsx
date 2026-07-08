"use client";

// src/components/realEstate/charts/InvestmentFlowMap.tsx
// "Mapa visual de la inversión" para el detalle de una operación.
// Reutiliza REResults (calcResults) — NO recalcula ni inventa métricas.
// Muestra: composición de la inversión (barra apilada), capital propio vs
// financiación, y el flujo de resultado (venta y/o alquiler) según los datos
// reales disponibles. Cada bloque se oculta si no hay dato real.

import React from "react";
import type { REOperation, REResults } from "@/src/lib/realEstate";
import { fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";
import { StackedBar, SegmentLegend, COMPOSITION_COLORS, type Segment } from "./BarViz";

function buildComposition(op: REOperation, res: REResults): Segment[] {
  return [
    { label: "Compra", value: op.purchasePrice, color: COMPOSITION_COLORS.compra },
    { label: "Obra", value: res.obraTotal, color: COMPOSITION_COLORS.obra },
    { label: "Estructura y accesos", value: res.cimentacionAmt + res.escalerasAmt + res.accesosAmt, color: COMPOSITION_COLORS.estructura },
    { label: "Impuestos y tasas", value: res.purchaseTaxAmt + res.tasasAmt, color: COMPOSITION_COLORS.impuestos },
    { label: "Honorarios y desvíos", value: res.arquitectoAmt + res.desviacionesAmt, color: COMPOSITION_COLORS.honorarios },
    { label: "Mobiliario", value: res.furnitureCostTotal, color: COMPOSITION_COLORS.mobiliario },
  ];
}

/** Nodo de flujo: etiqueta arriba, importe abajo, con tono. */
function FlowNode({ label, value, tone }: { label: string; value: string; tone?: "cost" | "in" | "out" }) {
  const color = tone === "in" ? "var(--positive)" : tone === "out" ? "var(--brand)" : "var(--ink)";
  const bg = tone === "in" ? "var(--positive-soft)" : tone === "out" ? "var(--brand-soft)" : "var(--surface-alt)";
  return (
    <div className="flex-1 min-w-[84px] rounded-lg border border-line px-3 py-2 text-center" style={{ background: bg }}>
      <p className="text-[10px] uppercase tracking-wide font-bold text-ink-subtle truncate">{label}</p>
      <p className="text-sm font-extrabold tabular-nums mt-0.5" style={{ color }}>{value}</p>
    </div>
  );
}

function FlowArrow() {
  return (
    <span className="text-ink-subtle self-center text-lg leading-none px-0.5 select-none" aria-hidden>
      →
    </span>
  );
}

export function InvestmentFlowMap({ op, res }: { op: REOperation; res: REResults }) {
  const composition = buildComposition(op, res);
  const hasInvestment = res.totalInvestment > 0;
  const hasFinancing = op.financing?.enabled === true && res.totalFinanced > 0;
  const hasSale = res.totalSales > 0;
  const hasRent = res.monthlyRentIncome > 0;

  // Sin ningún dato real → estado vacío claro (no romper la pantalla).
  if (!hasInvestment && !hasSale && !hasRent) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-[var(--surface-alt)] p-4 text-center">
        <p className="text-sm font-bold text-ink">Mapa visual de la inversión</p>
        <p className="text-xs text-ink-muted mt-1">
          Introduce compra, costes o ingresos para ver el desglose visual.
        </p>
      </div>
    );
  }

  const ownPct = res.totalInvestment > 0 ? (Math.max(0, res.myInvestment) / res.totalInvestment) * 100 : 0;
  const finPct = res.totalInvestment > 0 ? (Math.max(0, res.totalFinanced) / res.totalInvestment) * 100 : 0;

  return (
    <div className="rounded-2xl border border-line bg-[var(--surface-alt)] p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-extrabold text-ink tracking-tight">Mapa visual de la inversión</h4>
        {hasInvestment && <span className="text-xs font-bold text-ink tabular-nums">{fmtEUR(res.totalInvestment)}</span>}
      </div>

      {/* Composición de la inversión */}
      {hasInvestment && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle mb-1.5">Composición de la inversión</p>
          <StackedBar segments={composition} height={16} />
          <SegmentLegend segments={composition} />
        </div>
      )}

      {/* Capital propio vs financiación */}
      {hasFinancing && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle mb-1.5">Capital propio vs financiación</p>
          <div className="w-full flex h-4 rounded-md overflow-hidden border border-line bg-white">
            <div style={{ width: `${ownPct}%`, background: "var(--brand)" }} title="Capital propio" />
            <div style={{ width: `${finPct}%`, background: "#B7791F" }} title="Financiación ajena" />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[11px]">
            <span className="flex items-center gap-1 text-ink-subtle">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--brand)" }} />
              Propio <span className="font-semibold text-ink tabular-nums">{fmtEUR(res.myInvestment)}</span>
            </span>
            <span className="flex items-center gap-1 text-ink-subtle">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#B7791F" }} />
              Financiado <span className="font-semibold text-ink tabular-nums">{fmtEUR(res.totalFinanced)}</span>
            </span>
          </div>
        </div>
      )}

      {/* Flujo de venta */}
      {hasSale && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle mb-1.5">Flujo de venta</p>
          <div className="flex items-stretch gap-1 flex-wrap sm:flex-nowrap">
            <FlowNode label="Inversión" value={fmtEUR(res.totalInvestment)} tone="cost" />
            <FlowArrow />
            <FlowNode label="Venta est." value={fmtEUR(res.totalSales)} tone="out" />
            <FlowArrow />
            <FlowNode
              label={res.saleBenefit >= 0 ? "Beneficio" : "Pérdida"}
              value={fmtEUR(res.saleBenefit)}
              tone={res.saleBenefit >= 0 ? "in" : "cost"}
            />
          </div>
          <p className="text-[11px] text-ink-muted mt-1.5">
            Rentabilidad de venta:{" "}
            <span className="font-bold tabular-nums" style={{ color: res.saleYield >= 0 ? "var(--positive)" : "var(--negative)" }}>
              {fmtPct(res.saleYield)}
            </span>
          </p>
        </div>
      )}

      {/* Flujo de alquiler */}
      {hasRent && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle mb-1.5">Flujo de alquiler (mensual)</p>
          <div className="flex items-stretch gap-1 flex-wrap sm:flex-nowrap">
            <FlowNode label="Renta bruta" value={`${fmtEUR(res.monthlyRentIncome)}`} tone="out" />
            {op.financing?.enabled && res.totalMonthlyPayment > 0 && (
              <>
                <FlowArrow />
                <FlowNode label="Cuota" value={`−${fmtEUR(res.totalMonthlyPayment)}`} tone="cost" />
              </>
            )}
            <FlowArrow />
            <FlowNode
              label="Cashflow"
              value={`${fmtEUR(res.monthlyRentBenefit)}`}
              tone={res.monthlyRentBenefit >= 0 ? "in" : "cost"}
            />
          </div>
          <p className="text-[11px] text-ink-muted mt-1.5">
            Rentabilidad de alquiler:{" "}
            <span className="font-bold tabular-nums" style={{ color: res.rentYield >= 0 ? "var(--positive)" : "var(--negative)" }}>
              {fmtPct(res.rentYield)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

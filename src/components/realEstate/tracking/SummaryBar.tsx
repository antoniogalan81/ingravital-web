"use client";

// Barra-resumen PERSISTENTE del workspace de seguimiento. Visible en todas las
// pestañas para entender la operación en 5 segundos: costes, pendiente de pago,
// presupuesto (estimado vs real), ventas (cobrado/pendiente) y rentabilidad
// (estimada + inversor), más una alerta de desviación. Nada inventado → "—".

import { useMemo } from "react";
import type { REOperation, REResults } from "@/src/lib/realEstate";
import { fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";
import { expenseTotals, profitability, salesStats } from "@/src/lib/realEstateTrackingCalc";

function Cell({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "positive" | "negative" | "accent";
}) {
  const color =
    tone === "positive" ? "var(--positive)" : tone === "negative" ? "var(--negative)" : tone === "accent" ? "var(--brand)" : "var(--ink)";
  return (
    <div className="min-w-0 px-3.5 py-2.5 border-r border-line last:border-r-0">
      <p className="text-[10px] uppercase tracking-wide font-bold text-ink-subtle whitespace-nowrap">{label}</p>
      <p className="text-lg font-extrabold tabular-nums leading-tight truncate" style={{ color }}>
        {value}
      </p>
      {sub ? <p className="text-[11px] text-ink-subtle truncate">{sub}</p> : null}
    </div>
  );
}

export function SummaryBar({ op, results }: { op: REOperation; results: REResults }) {
  const exp = useMemo(() => expenseTotals(op), [op]);
  const sales = useMemo(() => salesStats(op), [op]);
  const prof = useMemo(() => profitability(op, results), [op, results]);

  const costes = exp.real > 0 ? exp.real : results.totalInvestment;
  const budgetBase = Math.max(exp.estimated, exp.real, results.totalInvestment, 1);
  const estPct = Math.round((exp.estimated / budgetBase) * 100);
  const realPct = Math.round((exp.real / budgetBase) * 100);
  const overBudget = exp.hasData && exp.diff > 0;

  return (
    <div className="bg-white">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Cell label="Costes" value={fmtEUR(costes)} sub={exp.real > 0 ? "real" : "estimado"} />
        <Cell label="Pendiente pago" value={exp.hasData ? fmtEUR(exp.pending) : "—"} tone={exp.pending > 0 ? "accent" : "default"} />
        <Cell
          label="Ventas cobrado"
          value={sales.hasData ? fmtEUR(sales.collected) : "—"}
          sub={sales.hasData ? `pdte ${fmtEUR(sales.pendingIncome)}` : undefined}
          tone={sales.collected > 0 ? "positive" : "default"}
        />
        <Cell
          label="Rentab. estimada"
          value={fmtPct(prof.estimatedYield)}
          tone={prof.estimatedYield >= 0 ? "positive" : "negative"}
        />
        <Cell
          label="Rentab. inversor"
          value={prof.investorYield == null ? "—" : fmtPct(prof.investorYield)}
          sub={prof.investorSharePct == null ? "sin reparto" : `${Math.round(prof.investorSharePct * 100)}% benef.`}
          tone={prof.investorYield == null ? "default" : prof.investorYield >= 0 ? "positive" : "negative"}
        />
        <Cell
          label="Desviación"
          value={exp.hasData ? fmtEUR(exp.diff) : "—"}
          sub="real − estimado"
          tone={!exp.hasData ? "default" : exp.diff <= 0 ? "positive" : "negative"}
        />
      </div>

      {/* Barra presupuesto estimado vs real */}
      <div className="px-3.5 pb-2.5 pt-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wide font-bold text-ink-subtle">Presupuesto · estimado vs real</span>
          <span className="text-[11px] tabular-nums" style={{ color: overBudget ? "var(--negative)" : "var(--ink-subtle)" }}>
            {overBudget ? "Sobre presupuesto" : exp.hasData ? "Dentro" : "Sin gasto real"}
          </span>
        </div>
        <div className="relative h-2.5 w-full rounded-full bg-[var(--surface-alt)] overflow-hidden border border-line">
          <div className="absolute inset-y-0 left-0 rounded-full opacity-40" style={{ width: `${estPct}%`, background: "var(--ink-subtle)" }} />
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${realPct}%`, background: overBudget ? "var(--negative)" : "var(--positive)" }} />
        </div>
      </div>
    </div>
  );
}

export default SummaryBar;

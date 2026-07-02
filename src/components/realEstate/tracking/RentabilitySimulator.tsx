"use client";

// SIMULADOR de rentabilidad (local, NO modifica la operación). Reutiliza el mismo
// motor: scaleOp() de ScenariosPanel (escala venta/obra sin fórmulas nuevas),
// calcResults() y profitability(). Permite mover venta, coste de obra y % del
// inversor y ver beneficio/rentabilidad simulados y la diferencia vs. el escenario
// actual. Si faltan datos, muestra "—".

import { useMemo, useState } from "react";
import type { REOperation, REResults } from "@/src/lib/realEstate";
import { calcResults, fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";
import { profitability } from "@/src/lib/realEstateTrackingCalc";
import { scaleOp } from "../ScenariosPanel";

const eur = (v: number | null) => (v == null ? "—" : fmtEUR(v));
const pct = (v: number | null) => (v == null ? "—" : fmtPct(v));

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-ink-muted">{label}</span>
        <span className="text-xs font-bold tabular-nums text-ink">{value > 0 && suffix === "%" ? "+" : ""}{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--brand)]"
      />
    </div>
  );
}

function Metric({ label, value, delta, tone }: { label: string; value: string; delta?: string; tone?: "positive" | "negative" }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-line bg-[var(--surface)] px-3.5 py-3" style={{ boxShadow: "var(--shadow-xs)" }}>
      <p className="text-[10px] uppercase tracking-wide font-bold text-ink-subtle">{label}</p>
      <p className="text-xl font-extrabold tabular-nums tracking-tight leading-tight mt-1" style={{ color: tone === "negative" ? "var(--negative)" : tone === "positive" ? "var(--positive)" : "var(--ink)" }}>
        {value}
      </p>
      {delta ? <p className="text-[11px] tabular-nums mt-0.5 text-ink-subtle">{delta}</p> : null}
    </div>
  );
}

export function RentabilitySimulator({ op, results }: { op: REOperation; results: REResults }) {
  const [saleDelta, setSaleDelta] = useState(0); // % sobre venta
  const [obraDelta, setObraDelta] = useState(0); // % sobre coste de obra
  const baseInvPct = Math.round((op.investorSplit?.investorSharePct ?? 0));
  const [invPct, setInvPct] = useState(baseInvPct);

  const hasData = results.totalSales > 0 || results.totalInvestment > 0;

  const sim = useMemo(() => {
    const scaled = scaleOp(op, { sale: 1 + saleDelta / 100, obra: 1 + obraDelta / 100 });
    const simOp: REOperation = { ...scaled, investorSplit: { ...(op.investorSplit ?? {}), investorSharePct: invPct } };
    const r = calcResults(simOp);
    const p = profitability(simOp, r);
    return { r, p };
  }, [op, saleDelta, obraDelta, invPct]);

  const actual = useMemo(() => profitability(op, results), [op, results]);
  const benefitDelta = sim.p.estimatedBenefit - actual.estimatedBenefit;

  const reset = () => { setSaleDelta(0); setObraDelta(0); setInvPct(baseInvPct); };

  return (
    <div className="re-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Simulador de rentabilidad</p>
        <span className="pill pill-neutral">Local · no guarda</span>
      </div>

      {!hasData ? (
        <p className="text-sm text-ink-subtle">Faltan datos de venta e inversión para simular.</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <Slider label="Precio de venta" value={saleDelta} min={-30} max={30} step={1} suffix="%" onChange={setSaleDelta} />
            <Slider label="Coste de obra" value={obraDelta} min={-30} max={30} step={1} suffix="%" onChange={setObraDelta} />
            <Slider label="% inversor" value={invPct} min={0} max={100} step={1} suffix="%" onChange={setInvPct} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Metric
              label="Beneficio simulado"
              value={eur(sim.p.estimatedBenefit)}
              tone={sim.p.estimatedBenefit >= 0 ? "positive" : "negative"}
              delta={`${benefitDelta >= 0 ? "▲ +" : "▼ "}${fmtEUR(benefitDelta)} vs actual`}
            />
            <Metric label="Rentab. total" value={pct(sim.p.estimatedYield)} tone={sim.p.estimatedYield >= 0 ? "positive" : "negative"} />
            <Metric label="Benef. promotor" value={eur(sim.p.estimatedPromoterBenefit)} />
            <Metric label="Benef. inversor" value={eur(sim.p.estimatedInvestorBenefit)} />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[11px] text-ink-subtle">Escenario actual: beneficio {eur(actual.estimatedBenefit)} · rentab. {pct(actual.estimatedYield)}.</p>
            <button type="button" onClick={reset} className="text-xs font-semibold text-brand hover:underline">Restablecer</button>
          </div>
        </>
      )}
    </div>
  );
}

export default RentabilitySimulator;

"use client";

// src/components/realEstate/ScenariosPanel.tsx
// Sección "Escenarios y sensibilidad" del modal de inversión.
//
// REGLA: NO hay fórmulas nuevas ni motor paralelo. Se construyen copias
// TEMPORALES en memoria de la operación, se les aplican multiplicadores a
// inputs concretos (precio de venta, coste de obra, alquiler) y se recalculan
// con el MISMO calcResults() del motor. Nada se guarda ni toca Supabase.

import { useMemo } from "react";
import type { REOperation, REResults } from "@/src/lib/realEstate";
import { calcResults, fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";

export type Factors = { sale?: number; obra?: number; rent?: number };

// Copia profunda de la operación con multiplicadores aplicados SOLO a los
// inputs que el motor usa para venta / obra / alquiler. No persistida.
export function scaleOp(op: REOperation, f: Factors): REOperation {
  const sale = f.sale ?? 1;
  const obra = f.obra ?? 1;
  const rent = f.rent ?? 1;
  const clone: REOperation = JSON.parse(JSON.stringify(op));

  clone.units = (clone.units ?? []).map((u) => ({
    ...u,
    salePriceTotal: u.salePriceTotal != null ? Math.round(u.salePriceTotal * sale) : u.salePriceTotal,
    salePriceM2: u.salePriceM2 != null ? Math.round(u.salePriceM2 * sale) : u.salePriceM2,
    rentMonthly: u.rentMonthly != null ? Math.round(u.rentMonthly * rent) : u.rentMonthly,
    pricePerRoom: u.pricePerRoom != null ? Math.round(u.pricePerRoom * rent) : u.pricePerRoom,
  }));

  const c = clone.costs;
  if (c) {
    const sc = (v: number | undefined) => (v != null ? Math.round(v * obra) : v);
    c.obraViviendaPriceM2 = sc(c.obraViviendaPriceM2);
    c.obraViviendaTotal = sc(c.obraViviendaTotal);
    c.obraGarajePriceM2 = sc(c.obraGarajePriceM2);
    c.obraGarajeTotal = sc(c.obraGarajeTotal);
    c.obraTrasterosPriceM2 = sc(c.obraTrasterosPriceM2);
    c.obraTrasterosTotal = sc(c.obraTrasterosTotal);
  }
  return clone;
}

// ── helpers de presentación ────────────────────────────────────────────────
function toneColor(curr: number, base: number, higherBetter = true): string {
  if (!Number.isFinite(curr) || !Number.isFinite(base) || curr === base) return "var(--ink)";
  const better = higherBetter ? curr > base : curr < base;
  return better ? "var(--positive)" : "var(--negative)";
}

function DeltaBadge({ curr, base, kind, higherBetter = true }: { curr: number; base: number; kind: "pct" | "eur"; higherBetter?: boolean }) {
  const diff = curr - base;
  if (!Number.isFinite(diff) || Math.abs(diff) < 1e-9) {
    return <span className="text-[11px] font-semibold text-ink-subtle">—</span>;
  }
  const up = diff > 0;
  const good = higherBetter ? up : !up;
  const color = good ? "var(--positive)" : "var(--negative)";
  const text = kind === "pct" ? `${up ? "+" : ""}${(diff * 100).toFixed(1)} pp` : `${up ? "+" : ""}${fmtEUR(diff)}`;
  return (
    <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
      {up ? "▲" : "▼"} {text}
    </span>
  );
}

export const SCN_FACTORS: Record<"cons" | "opt", Factors> = {
  cons: { sale: 0.9, obra: 1.1, rent: 0.9 },
  opt: { sale: 1.1, obra: 0.9, rent: 1.1 },
};

// Conjunto de escenarios (base/conservador/optimista) reutilizando calcResults().
// Misma lógica que usa el panel del modal — para reusar en el informe imprimible.
export function buildScenarioSet(op: REOperation): { base: REResults; cons: REResults; opt: REResults } {
  return {
    base: calcResults(op),
    cons: calcResults(scaleOp(op, SCN_FACTORS.cons)),
    opt: calcResults(scaleOp(op, SCN_FACTORS.opt)),
  };
}

export function ScenariosPanel({ op }: { op: REOperation }) {
  const { base, cons, opt, saleSteps, obraSteps, rentSteps, finEnabled } = useMemo(() => {
    const base = calcResults(op);
    const cons = calcResults(scaleOp(op, SCN_FACTORS.cons));
    const opt = calcResults(scaleOp(op, SCN_FACTORS.opt));
    const saleSteps = [-0.1, -0.05, 0, 0.05, 0.1].map((d) => ({ d, r: d === 0 ? base : calcResults(scaleOp(op, { sale: 1 + d })) }));
    const obraSteps = [-0.1, 0, 0.1].map((d) => ({ d, r: d === 0 ? base : calcResults(scaleOp(op, { obra: 1 + d })) }));
    const rentSteps = [-0.1, 0, 0.1].map((d) => ({ d, r: d === 0 ? base : calcResults(scaleOp(op, { rent: 1 + d })) }));
    return { base, cons, opt, saleSteps, obraSteps, rentSteps, finEnabled: op.financing?.enabled === true };
  }, [op]);

  const scenarios: { key: string; label: string; note: string; r: REResults; isBase?: boolean }[] = [
    { key: "cons", label: "Conservador", note: "Venta −10% · Obra +10% · Alq. −10%", r: cons },
    { key: "base", label: "Caso base", note: "Operación actual", r: base, isBase: true },
    { key: "opt", label: "Optimista", note: "Venta +10% · Obra −10% · Alq. +10%", r: opt },
  ];

  return (
    <div className="space-y-5">
      {/* Aviso */}
      <div className="flex items-center gap-2">
        <span className="pill pill-accent">Escenarios no guardados · simulación temporal</span>
      </div>

      {/* Caso base destacado */}
      <div className="rounded-2xl p-5 text-white" style={{ background: "var(--backdrop-deep)" }}>
        <p className="text-[11px] font-bold tracking-[0.12em]" style={{ color: "#8FA0B8" }}>CASO BASE · OPERACIÓN ACTUAL</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-4 mt-3">
          <BaseKpi label="Rentab. venta" value={fmtPct(base.saleYield)} />
          <BaseKpi label="Beneficio venta" value={fmtEUR(base.saleBenefit)} />
          <BaseKpi label="Rentab. alquiler" value={fmtPct(base.rentYield)} />
          <BaseKpi label="Cashflow/mes" value={fmtEUR(base.monthlyRentBenefit)} />
          <BaseKpi label="Inversión total" value={fmtEUR(base.totalInvestment)} />
          <BaseKpi label="Capital propio" value={fmtEUR(base.myInvestment)} />
          <BaseKpi label="Financiación" value={finEnabled ? fmtEUR(base.totalFinanced) : "—"} />
          <BaseKpi label="Ventas previstas" value={fmtEUR(base.totalSales)} />
        </div>
      </div>

      {/* Comparación conservador / base / optimista */}
      <div>
        <p className="section-label mb-2">Comparación de escenarios</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {scenarios.map((s) => (
            <div
              key={s.key}
              className="rounded-xl border p-4"
              style={{
                background: s.isBase ? "var(--surface-alt)" : "var(--surface)",
                borderColor: s.isBase ? "var(--line-strong)" : "var(--line)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-extrabold text-ink">{s.label}</span>
                {s.isBase && <span className="pill pill-neutral">Base</span>}
              </div>
              <p className="text-[10px] text-ink-subtle font-medium mb-3 leading-tight">{s.note}</p>

              <ScnRow label="Rentab. venta" value={fmtPct(s.r.saleYield)} valueColor={s.isBase ? "var(--ink)" : toneColor(s.r.saleYield, base.saleYield)}>
                {!s.isBase && <DeltaBadge curr={s.r.saleYield} base={base.saleYield} kind="pct" />}
              </ScnRow>
              <ScnRow label="Beneficio venta" value={fmtEUR(s.r.saleBenefit)} valueColor={s.isBase ? "var(--ink)" : toneColor(s.r.saleBenefit, base.saleBenefit)}>
                {!s.isBase && <DeltaBadge curr={s.r.saleBenefit} base={base.saleBenefit} kind="eur" />}
              </ScnRow>
              <ScnRow label="Rentab. alquiler" value={fmtPct(s.r.rentYield)} valueColor={s.isBase ? "var(--ink)" : toneColor(s.r.rentYield, base.rentYield)}>
                {!s.isBase && <DeltaBadge curr={s.r.rentYield} base={base.rentYield} kind="pct" />}
              </ScnRow>
              <ScnRow label="Cashflow/mes" value={fmtEUR(s.r.monthlyRentBenefit)} valueColor={s.isBase ? "var(--ink)" : toneColor(s.r.monthlyRentBenefit, base.monthlyRentBenefit)}>
                {!s.isBase && <DeltaBadge curr={s.r.monthlyRentBenefit} base={base.monthlyRentBenefit} kind="eur" />}
              </ScnRow>
              <ScnRow label="Inversión total" value={fmtEUR(s.r.totalInvestment)} valueColor="var(--ink-muted)" last />
            </div>
          ))}
        </div>
      </div>

      {/* Sensibilidad rápida */}
      <div>
        <p className="section-label mb-2">Sensibilidad rápida</p>
        <div className="space-y-3">
          <SensRow
            title="Precio de venta"
            steps={saleSteps.map((s) => ({ label: pctLabel(s.d), value: fmtPct(s.r.saleYield), sub: fmtEUR(s.r.saleBenefit), color: toneColor(s.r.saleYield, base.saleYield), isBase: s.d === 0 }))}
            metricLabel="Rentab. venta"
          />
          <SensRow
            title="Coste de obra"
            steps={obraSteps.map((s) => ({ label: pctLabel(s.d), value: fmtPct(s.r.saleYield), sub: fmtEUR(s.r.saleBenefit), color: toneColor(s.r.saleYield, base.saleYield), isBase: s.d === 0 }))}
            metricLabel="Rentab. venta"
          />
          <SensRow
            title="Alquiler"
            steps={rentSteps.map((s) => ({ label: pctLabel(s.d), value: fmtPct(s.r.rentYield), sub: `${fmtEUR(s.r.monthlyRentBenefit)}/mes`, color: toneColor(s.r.rentYield, base.rentYield), isBase: s.d === 0 }))}
            metricLabel="Rentab. alquiler"
          />
        </div>
      </div>

      {/* KPIs no calculados por el motor actual */}
      <div className="rounded-xl border border-line p-4" style={{ background: "var(--surface-alt)" }}>
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-subtle mb-2">Métricas avanzadas · no calculadas por el motor</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1.5">
          {["TIR", "Break-even", "Margen avanzado", "Plazo / duración"].map((m) => (
            <span key={m} className="text-xs text-ink-muted">
              {m}: <span className="font-semibold text-ink-subtle">No calculado</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── subcomponentes visuales ─────────────────────────────────────────────────
function BaseKpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "#8FA0B8" }}>{label}</p>
      <p className="text-lg font-extrabold tabular-nums mt-0.5" style={{ color: "#FFFFFF" }}>{value}</p>
    </div>
  );
}

function ScnRow({ label, value, valueColor, children, last }: { label: string; value: string; valueColor: string; children?: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 py-1.5 ${last ? "" : "border-b border-line"}`}>
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="flex items-center gap-2">
        {children}
        <span className="text-sm font-bold tabular-nums" style={{ color: valueColor }}>{value}</span>
      </span>
    </div>
  );
}

function SensRow({ title, steps, metricLabel }: { title: string; metricLabel: string; steps: { label: string; value: string; sub: string; color: string; isBase: boolean }[] }) {
  return (
    <div className="rounded-xl border border-line p-3" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-ink">{title}</span>
        <span className="text-[10px] uppercase tracking-wide font-semibold text-ink-subtle">{metricLabel}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {steps.map((st, i) => (
          <div
            key={i}
            className="flex-1 min-w-[78px] rounded-lg border px-2 py-2 text-center"
            style={{
              background: st.isBase ? "var(--surface-alt)" : "var(--surface)",
              borderColor: st.isBase ? "var(--line-strong)" : "var(--line)",
            }}
          >
            <div className="text-[10px] font-bold text-ink-subtle">{st.label}</div>
            <div className="text-sm font-extrabold tabular-nums mt-0.5" style={{ color: st.isBase ? "var(--ink)" : st.color }}>{st.value}</div>
            <div className="text-[10px] text-ink-subtle tabular-nums truncate">{st.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function pctLabel(d: number): string {
  if (d === 0) return "Base";
  return `${d > 0 ? "+" : ""}${Math.round(d * 100)}%`;
}

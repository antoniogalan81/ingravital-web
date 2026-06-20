"use client";

// PANEL — Dashboard de cartera (WEB). Paridad con APP/app/(tabs)/panel.tsx.
// Agrega KPIs de todas las operaciones reutilizando calcResults() (motor común).
// No define lógica financiera nueva: solo suma a nivel de cartera.

import Link from "next/link";
import { useMemo } from "react";
import AppGate from "@/components/AppGate";
import type { REOperation } from "@/src/lib/realEstate";
import { calcResults, fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";
import { useSync } from "@/src/sync/SyncContext";

function investBaseOf(op: REOperation, r: ReturnType<typeof calcResults>): number {
  return op.financing?.enabled && r.myInvestment > 0 ? r.myInvestment : r.totalInvestment;
}

function PanelContent() {
  const { realEstateOperations } = useSync();

  const { agg, ranked, count, draftCount } = useMemo(() => {
    const ops = (realEstateOperations ?? []).filter((o) => !o.isDraft && !o.deleted);
    const withRes = ops.map((op) => ({ op, r: calcResults(op) }));

    const agg = withRes.reduce(
      (a, { op, r }) => {
        a.totalInvestment += r.totalInvestment;
        a.myInvestment += r.myInvestment;
        a.totalFinanced += r.totalFinanced;
        a.saleBenefit += r.saleBenefit;
        a.totalSales += r.totalSales;
        a.monthlyRentBenefit += r.monthlyRentBenefit;
        a.base += investBaseOf(op, r);
        return a;
      },
      { totalInvestment: 0, myInvestment: 0, totalFinanced: 0, saleBenefit: 0, totalSales: 0, monthlyRentBenefit: 0, base: 0 }
    );

    const saleYield = agg.base > 0 ? agg.saleBenefit / agg.base : 0;
    const rentYield = agg.base > 0 ? (agg.monthlyRentBenefit * 12) / agg.base : 0;
    const ranked = [...withRes].sort((x, y) => y.r.saleYield - x.r.saleYield).slice(0, 5);

    return {
      agg: { ...agg, saleYield, rentYield },
      ranked,
      count: ops.length,
      draftCount: (realEstateOperations ?? []).filter((o) => o.isDraft && !o.deleted).length,
    };
  }, [realEstateOperations]);

  const financedPct = agg.totalInvestment > 0 ? agg.totalFinanced / agg.totalInvestment : 0;
  const ownPct = 1 - financedPct;

  if (count === 0) {
    return (
      <div className="re-card p-10 text-center">
        <h2 className="text-lg font-extrabold text-ink">Aún no hay operaciones</h2>
        <p className="text-sm text-ink-muted mt-2 max-w-md mx-auto leading-relaxed">
          Analiza tu primera operación inmobiliaria para ver aquí la rentabilidad y la evolución de tu cartera.
        </p>
        <Link
          href="/finanzas"
          className="inline-block mt-5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark transition-colors"
        >
          Analizar una operación
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hero patrimonio */}
      <div className="rounded-2xl p-6 sm:p-8 text-white" style={{ background: "var(--backdrop-deep)" }}>
        <p className="text-[11px] font-bold tracking-[0.12em]" style={{ color: "#8FA0B8" }}>
          INVERSIÓN TOTAL ANALIZADA
        </p>
        <p className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-1">{fmtEUR(agg.totalInvestment)}</p>

        <div className="flex items-center gap-6 mt-6">
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "#8FA0B8" }}>
              Capital propio
            </p>
            <p className="text-lg font-bold mt-0.5" style={{ color: "#E7ECF3" }}>
              {fmtEUR(agg.myInvestment)}
            </p>
          </div>
          <div className="h-9 w-px" style={{ background: "#2A3A52" }} />
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "#8FA0B8" }}>
              Financiación
            </p>
            <p className="text-lg font-bold mt-0.5" style={{ color: "#E7ECF3" }}>
              {fmtEUR(agg.totalFinanced)}
            </p>
          </div>
        </div>

        {/* Barra propio vs financiado */}
        <div className="flex h-2 rounded-full overflow-hidden mt-6" style={{ background: "#243248" }}>
          <div style={{ flex: Math.max(0.0001, ownPct), background: "#3D6FC4" }} />
          <div style={{ flex: Math.max(0.0001, financedPct), background: "var(--accent)" }} />
        </div>
        <div className="flex gap-6 mt-2 text-[11px] font-semibold" style={{ color: "#A9B6C9" }}>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: "#3D6FC4" }} /> Propio {fmtPct(ownPct)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} /> Financiado {fmtPct(financedPct)}
          </span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Rentab. venta" value={fmtPct(agg.saleYield)} sub={`${fmtEUR(agg.saleBenefit)} beneficio`} tone={agg.saleBenefit >= 0 ? "positive" : "negative"} />
        <Kpi label="Rentab. alquiler" value={fmtPct(agg.rentYield)} sub={`${fmtEUR(agg.monthlyRentBenefit)}/mes`} tone={agg.monthlyRentBenefit >= 0 ? "positive" : "negative"} />
        <Kpi label="Ventas previstas" value={fmtEUR(agg.totalSales)} sub="Si se vende todo" />
        <Kpi label="Operaciones" value={String(count)} sub={draftCount > 0 ? `${draftCount} en borrador` : "Analizadas"} tone="accent" />
      </div>

      {/* Mejores operaciones */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="section-label">Mejores por rentabilidad de venta</p>
          <Link href="/finanzas" className="text-sm font-semibold text-brand hover:underline">
            Ver todas
          </Link>
        </div>
        <div className="re-card overflow-hidden">
          {ranked.map(({ op, r }, i) => (
            <Link
              key={op.id}
              href="/finanzas"
              className={`flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--surface-alt)] transition-colors ${
                i < ranked.length - 1 ? "border-b border-line" : ""
              }`}
            >
              <span className="w-5 text-center text-sm font-extrabold text-ink-subtle">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-ink truncate">{op.name || "Sin nombre"}</p>
                <p className="text-xs text-ink-subtle font-medium truncate">
                  {fmtEUR(r.totalInvestment)} · {fmtEUR(r.saleBenefit)} beneficio
                </p>
              </div>
              <span className="text-[15px] font-extrabold" style={{ color: r.saleYield >= 0 ? "var(--positive)" : "var(--negative)" }}>
                {fmtPct(r.saleYield)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "positive" | "negative" | "accent" }) {
  const color = tone === "positive" ? "var(--positive)" : tone === "negative" ? "var(--negative)" : tone === "accent" ? "var(--accent)" : "var(--ink)";
  return (
    <div className="re-card p-4">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value mt-1" style={{ color }}>{value}</p>
      {sub && <p className="text-sm text-ink-muted font-medium mt-0.5">{sub}</p>}
    </div>
  );
}

export default function PanelPage() {
  return (
    <AppGate active="panel" label="Resumen de cartera" title="Panel">
      <PanelContent />
    </AppGate>
  );
}

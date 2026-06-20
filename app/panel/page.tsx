"use client";

// PANEL — Dashboard de cartera (WEB). Paridad con APP/app/(tabs)/panel.tsx.
// Agrega KPIs de todas las operaciones reutilizando calcResults() (motor común).
// No define lógica financiera nueva: solo suma a nivel de cartera.

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
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
      <div className="space-y-5">
        <div className="empty-state">
          <span className="empty-state-icon">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />
            </svg>
          </span>
          <h2 className="text-xl font-extrabold text-ink tracking-tight">Empieza creando tu primera operación</h2>
          <p className="text-sm text-ink-muted mt-2 max-w-md mx-auto leading-relaxed">
            Analiza una operación inmobiliaria para ver aquí la rentabilidad, el capital invertido y la evolución de tu cartera. Toda la información financiera en un solo panel.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <Link href="/finanzas" className="btn-primary">Analizar una operación</Link>
            <Link href="/oportunidades" className="btn-secondary">Ver oportunidades</Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {QUICK_ACCESS.map((q, i) => (
            <QuickAccess key={q.href} {...q} delay={i + 1} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hero patrimonio */}
      <div className="page-hero p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] font-bold tracking-[0.12em]" style={{ color: "#8FA0B8" }}>
            INVERSIÓN TOTAL ANALIZADA
          </p>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: "rgba(255,255,255,0.06)", color: "#A9B6C9", border: "1px solid rgba(255,255,255,0.1)" }}>
            {count} operación{count !== 1 ? "es" : ""}{draftCount > 0 ? ` · ${draftCount} en borrador` : ""}
          </span>
        </div>
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

      {/* Accesos directos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {QUICK_ACCESS.map((q) => (
          <QuickAccess key={q.href} {...q} />
        ))}
      </div>

      {/* Mejores operaciones */}
      <div>
        <div className="section-header">
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
    <div className="metric-card re-card-interactive">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value mt-1" style={{ color }}>{value}</p>
      {sub && <p className="text-sm text-ink-muted font-medium mt-0.5">{sub}</p>}
    </div>
  );
}

const QUICK_ACCESS = [
  {
    href: "/finanzas",
    title: "Inversiones",
    desc: "Calcula y compara escenarios",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l5-5 4 4 8-8M21 8v5h-5" />
      </svg>
    ),
  },
  {
    href: "/oportunidades",
    title: "Oportunidades",
    desc: "Operaciones seleccionadas",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 21l-4.9-2.8.9-5.5-4-3.9 5.5-.8L12 3z" />
      </svg>
    ),
  },
  {
    href: "/informes",
    title: "Informes",
    desc: "Documentación para decidir",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6M9 8h2M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
      </svg>
    ),
  },
  {
    href: "/inversores",
    title: "Inversores",
    desc: "Seguimiento de proyectos",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-1a4 4 0 00-3-3.87M9 20H4v-1a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-2a3 3 0 10-2.5-4.5" />
      </svg>
    ),
  },
] as const;

function QuickAccess({ href, title, desc, icon, delay }: { href: string; title: string; desc: string; icon: ReactNode; delay?: number }) {
  return (
    <Link href={href} className={`action-card${delay ? ` in-reveal in-delay-${delay}` : ""}`}>
      <span className="action-card-icon">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-bold text-ink leading-tight">{title}</span>
        <span className="block text-xs text-ink-subtle font-medium mt-0.5 truncate">{desc}</span>
      </span>
      <svg className="action-card-arrow w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

export default function PanelPage() {
  return (
    <AppGate active="panel" label="Resumen de cartera" title="Panel">
      <PanelContent />
    </AppGate>
  );
}

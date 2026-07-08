"use client";

// src/components/realEstate/charts/CompareDashboard.tsx
// Dashboard comparativo VISUAL que se muestra ARRIBA DEL TODO en la comparativa.
// Reutiliza REResults (calcResults) — NO recalcula ni inventa métricas.
// Solo usa métricas reales del motor: inversión total, financiación, cashflow,
// rentabilidad alquiler/venta, beneficio venta y ROI (beneficio/inversión).

import React, { useMemo } from "react";
import type { REOperation, REResults } from "@/src/lib/realEstate";
import { fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";
import { CompareBars, WinnerCard, type CompareItem } from "./BarViz";

export type CompareRow = { op: REOperation; res: REResults };

type MetricDef = {
  key: string;
  title: string;
  // "max" → mejor el mayor; "min" → mejor el menor (inversión).
  goal: "max" | "min";
  get: (r: CompareRow) => number;
  format: (v: number) => string;
  // Solo se dibuja si algún valor es significativo.
  active: (rows: CompareRow[]) => boolean;
};

const roiOf = (r: CompareRow) => (r.res.totalInvestment > 0 ? r.res.saleBenefit / r.res.totalInvestment : 0);

const METRICS: MetricDef[] = [
  {
    key: "saleBenefit",
    title: "Beneficio de venta",
    goal: "max",
    get: (r) => r.res.saleBenefit,
    format: fmtEUR,
    active: (rows) => rows.some((r) => r.res.totalSales > 0),
  },
  {
    key: "saleYield",
    title: "Rentabilidad de venta",
    goal: "max",
    get: (r) => r.res.saleYield,
    format: fmtPct,
    active: (rows) => rows.some((r) => r.res.totalSales > 0),
  },
  {
    key: "roi",
    title: "ROI (beneficio / inversión)",
    goal: "max",
    get: roiOf,
    format: fmtPct,
    active: (rows) => rows.some((r) => r.res.totalSales > 0 && r.res.totalInvestment > 0),
  },
  {
    key: "rentYield",
    title: "Rentabilidad de alquiler",
    goal: "max",
    get: (r) => r.res.rentYield,
    format: fmtPct,
    active: (rows) => rows.some((r) => r.res.monthlyRentIncome > 0),
  },
  {
    key: "cashflow",
    title: "Cashflow mensual",
    goal: "max",
    get: (r) => r.res.monthlyRentBenefit,
    format: (v) => `${fmtEUR(v)}/mes`,
    active: (rows) => rows.some((r) => r.res.monthlyRentIncome > 0),
  },
  {
    key: "totalInvestment",
    title: "Inversión total",
    goal: "min",
    get: (r) => r.res.totalInvestment,
    format: fmtEUR,
    active: (rows) => rows.some((r) => r.res.totalInvestment > 0),
  },
];

/** Índice de la fila ganadora para una métrica, o -1 si no hay ganador claro. */
function winnerIndex(rows: CompareRow[], m: MetricDef): number {
  let best = -1;
  let bestVal = m.goal === "max" ? -Infinity : Infinity;
  rows.forEach((r, i) => {
    const v = m.get(r);
    if (!Number.isFinite(v)) return;
    // Para "max" exigimos valor positivo (una métrica en 0/negativo no "gana").
    if (m.goal === "max" && v <= 0) return;
    if (m.goal === "min" && v <= 0) return;
    if (m.goal === "max" ? v > bestVal : v < bestVal) {
      bestVal = v;
      best = i;
    }
  });
  return best;
}

export function CompareDashboard({ rows, onOpenOp }: { rows: CompareRow[]; onOpenOp?: (id: string) => void }) {
  const activeMetrics = useMemo(() => METRICS.filter((m) => m.active(rows)), [rows]);

  // Ganador por métrica (para tarjetas KPI + resaltado de barras + cómputo global).
  const winners = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of activeMetrics) map.set(m.key, winnerIndex(rows, m));
    return map;
  }, [rows, activeMetrics]);

  // "Mejor global" transparente: la inversión que gana en más métricas reales.
  const overall = useMemo(() => {
    const wins = new Array(rows.length).fill(0);
    for (const m of activeMetrics) {
      const wi = winners.get(m.key);
      if (wi != null && wi >= 0) wins[wi] += 1;
    }
    let bestIdx = -1;
    let bestWins = 0;
    let tie = false;
    wins.forEach((w, i) => {
      if (w > bestWins) { bestWins = w; bestIdx = i; tie = false; }
      else if (w === bestWins && w > 0) { tie = true; }
    });
    return { idx: bestIdx, wins: bestWins, tie, total: activeMetrics.length };
  }, [rows, activeMetrics, winners]);

  if (rows.length < 2 || activeMetrics.length === 0) return null;

  const hasFinancing = rows.some((r) => r.res.totalFinanced > 0);

  return (
    <section className="mb-5 rounded-2xl border border-line bg-[var(--surface-alt)] p-4 sm:p-5" aria-label="Resumen comparativo visual">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-extrabold text-ink tracking-tight">Panel comparativo</h3>
        {overall.idx >= 0 && !overall.tie && (
          <span className="pill" style={{ background: "var(--positive-soft)", color: "var(--positive)" }}>
            ★ Mejor global: {rows[overall.idx].op.name} · {overall.wins}/{overall.total} métricas
          </span>
        )}
      </div>

      {/* Tarjetas KPI: ganador por métrica */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        {activeMetrics.map((m) => {
          const wi = winners.get(m.key) ?? -1;
          if (wi < 0) return null;
          const r = rows[wi];
          const tone = m.goal === "min" ? "info" : "positive";
          return (
            <WinnerCard
              key={m.key}
              label={m.goal === "min" ? "Menor inversión" : `Mejor ${m.title.toLowerCase()}`}
              opName={r.op.name}
              value={m.format(m.get(r))}
              tone={tone}
            />
          );
        })}
      </div>

      {/* Barras comparativas por métrica */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
        {activeMetrics.map((m) => {
          const wi = winners.get(m.key) ?? -1;
          const items: CompareItem[] = rows.map((r, i) => ({
            id: r.op.id,
            name: r.op.name || "Sin nombre",
            value: m.get(r),
            isBest: i === wi,
            isDraft: r.op.isDraft,
          }));
          return (
            <div key={m.key} className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle mb-1.5">
                {m.title}
                {m.goal === "min" && <span className="ml-1 font-normal normal-case text-ink-subtle">(menor es mejor)</span>}
              </p>
              <CompareBars items={items} format={m.format} onOpen={onOpenOp} />
            </div>
          );
        })}

        {/* Composición coste propio vs financiación (equilibrio) */}
        {hasFinancing && (
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle mb-1.5">
              Capital propio vs financiación
            </p>
            <div className="flex flex-col gap-2">
              {rows.map((r) => {
                const total = r.res.totalInvestment;
                const own = Math.max(0, r.res.myInvestment);
                const fin = Math.max(0, r.res.totalFinanced);
                const ownPct = total > 0 ? (own / total) * 100 : 0;
                const finPct = total > 0 ? (fin / total) * 100 : 0;
                return (
                  <div key={r.op.id} className="min-w-0">
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className="text-ink truncate max-w-[55%]">{r.op.name}</span>
                      <span className="text-ink-subtle tabular-nums">
                        {fmtEUR(own)} propio · {fmtEUR(fin)} financiado
                      </span>
                    </div>
                    <div className="w-full flex h-4 rounded-md overflow-hidden border border-line bg-[var(--surface-alt)]">
                      <div style={{ width: `${ownPct}%`, background: "var(--brand)" }} title="Capital propio" />
                      <div style={{ width: `${finPct}%`, background: "#B7791F" }} title="Financiación ajena" />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-ink-subtle">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--brand)" }} /> Capital propio</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#B7791F" }} /> Financiación</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

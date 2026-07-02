"use client";

// Cabecera de CARTERA para /finanzas — cockpit de portfolio. Agrega KPIs de datos
// REALES existentes (calcResults + agregados de seguimiento). Nada inventado: lo
// que no se puede calcular se muestra "—" o se omite. No persiste ni muta datos.

import { useMemo } from "react";
import type { REOperation } from "@/src/lib/realEstate";
import { calcResults, fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";
import { PIPELINE_STAGES, stageOf, stageDef, type PipelineStage } from "@/src/lib/pipeline";
import { computeOpAlerts, ALERT_COLOR, type AlertSeverity } from "@/src/lib/alerts";

// Etiquetas agregadas por tipo de alerta (para la cabecera de cartera).
const ALERT_AGG: Record<string, string> = {
  action_overdue: "con acción vencida",
  action_soon: "con acción próxima",
  stale: "sin actividad reciente",
  oferta_stale: "en oferta sin mover",
  no_key_data: "sin datos clave",
  over_cost: "con sobrecoste",
};

export function PortfolioHeader({ ops }: { ops: REOperation[] }) {
  const stats = useMemo(() => {
    let totalInvestment = 0;
    let totalSales = 0;
    let totalBenefit = 0;
    const byStage: Record<PipelineStage, number> = {
      comprado: 0, oferta: 0, interesante: 0, base: 0, estudio: 0, captacion: 0,
    };
    const alertCounts: Record<string, { count: number; severity: AlertSeverity }> = {};
    const nowIso = new Date().toISOString();

    for (const op of ops) {
      const r = calcResults(op);
      totalInvestment += r.totalInvestment;
      totalSales += r.totalSales;
      totalBenefit += r.saleBenefit;
      byStage[stageOf(op)] += 1;
      for (const a of computeOpAlerts(op, nowIso)) {
        const cur = alertCounts[a.key];
        alertCounts[a.key] = { count: (cur?.count ?? 0) + 1, severity: a.severity };
      }
    }

    const avgYield = totalInvestment > 0 ? totalBenefit / totalInvestment : null;
    return { totalInvestment, totalSales, totalBenefit, byStage, alertCounts, avgYield };
  }, [ops]);

  const total = ops.length;
  const maxStage = Math.max(total, 1);

  const alertList = Object.entries(stats.alertCounts)
    .filter(([k]) => ALERT_AGG[k])
    .map(([k, v]) => ({ key: k, label: `${v.count} ${ALERT_AGG[k]}`, severity: v.severity }));

  return (
    <div className="re-card in-reveal p-4 sm:p-5 mb-4" style={{ background: "linear-gradient(160deg, var(--brand-soft) 0%, var(--surface) 42%)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="section-label">Cartera</span>
          <span className="text-xs text-ink-subtle tabular-nums">{total} operación{total === 1 ? "" : "es"}</span>
        </div>
      </div>

      {/* KPIs económicos (cifra grande, jerarquía real) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Inversión estimada" value={fmtEUR(stats.totalInvestment)} />
        <Kpi label="Venta estimada" value={fmtEUR(stats.totalSales)} />
        <Kpi
          label="Beneficio estimado"
          value={fmtEUR(stats.totalBenefit)}
          color={stats.totalBenefit >= 0 ? "var(--positive)" : "var(--negative)"}
        />
        <Kpi
          label="Rentab. media est."
          value={stats.avgYield == null ? "—" : fmtPct(stats.avgYield)}
          color={stats.avgYield == null ? undefined : stats.avgYield >= 0 ? "var(--positive)" : "var(--negative)"}
          hint="beneficio / inversión"
        />
      </div>

      {/* Distribución por etapa: barra apilada + leyenda con conteos reales */}
      <div className="mt-4">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-line bg-[var(--surface-alt)]">
          {total > 0
            ? PIPELINE_STAGES.map((s) =>
                stats.byStage[s.key] > 0 ? (
                  <div
                    key={s.key}
                    className="bar-anim h-full"
                    style={{ width: `${(stats.byStage[s.key] / maxStage) * 100}%`, background: s.color }}
                    title={`${s.label}: ${stats.byStage[s.key]}`}
                  />
                ) : null,
              )
            : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {PIPELINE_STAGES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-xs">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: stageDef(s.key).color }} />
              <span className="text-ink-muted">{s.short}</span>
              <span className="tabular-nums font-bold text-ink">{stats.byStage[s.key]}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Alertas agregadas (solo si aplican; sin inventar) */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {alertList.length === 0 ? (
          <span className="pill pill-positive">Sin alertas</span>
        ) : (
          alertList.map((a) => (
            <span key={a.key} className="pill" style={{ background: ALERT_COLOR[a.severity].soft, color: ALERT_COLOR[a.severity].color }}>
              {a.label}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <div>
      <p className="kpi-label">{label}</p>
      <p className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight leading-tight" style={color ? { color } : { color: "var(--ink)" }}>
        {value}
      </p>
      {hint ? <p className="text-[11px] text-ink-subtle mt-0.5">{hint}</p> : null}
    </div>
  );
}

export default PortfolioHeader;

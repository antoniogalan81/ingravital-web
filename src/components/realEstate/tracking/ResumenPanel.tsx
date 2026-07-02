"use client";

// Panel RESUMEN del seguimiento: KPIs reales, barras de avance y desviaciones.
// Los importes salen del motor calcResults + agregados de gastos/ventas. Nada
// que no se pueda calcular se muestra como "—".

import { useMemo } from "react";
import type { REOperation, REResults } from "@/src/lib/realEstate";
import type { REProgress } from "@/src/lib/realEstateTracking";
import { fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";
import {
  expenseTotals,
  salesStats,
  progressMetrics,
  profitability,
} from "@/src/lib/realEstateTrackingCalc";
import { StatTile } from "@/src/components/ui/StatTile";
import { ProgressBar } from "@/src/components/ui/ProgressBar";
import { NumberCellInput, DateCellInput } from "@/src/components/ui/DataTable";

export function ResumenPanel({
  op,
  results,
  now,
  onChangeProgress,
}: {
  op: REOperation;
  results: REResults;
  now: string;
  onChangeProgress: (progress: REProgress) => void;
}) {
  const exp = useMemo(() => expenseTotals(op), [op]);
  const sales = useMemo(() => salesStats(op), [op]);
  const pm = useMemo(() => progressMetrics(op, results, now), [op, results, now]);
  const prof = useMemo(() => profitability(op, results), [op, results]);

  const progress = op.progress ?? {};
  const setProgress = (patch: Partial<REProgress>) => onChangeProgress({ ...progress, ...patch });

  // Costes totales: real si hay gasto real, si no estimado del motor.
  const costesTotales = exp.real > 0 ? exp.real : results.totalInvestment;
  const desviacionGasto = exp.hasData ? exp.diff : null;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <StatTile label="Costes totales" value={fmtEUR(costesTotales)} hint={exp.real > 0 ? "real" : "estimado"} />
        <StatTile
          label="Ingresos cobrados"
          value={sales.hasData ? fmtEUR(sales.collected) : "—"}
          tone={sales.collected > 0 ? "positive" : "default"}
        />
        <StatTile
          label="Pendiente de pagar"
          value={exp.hasData ? fmtEUR(exp.pending) : "—"}
          tone={exp.pending > 0 ? "accent" : "default"}
        />
        <StatTile
          label="Pendiente de cobrar"
          value={sales.hasData ? fmtEUR(sales.pendingIncome) : "—"}
          tone={sales.pendingIncome > 0 ? "accent" : "default"}
        />
        <StatTile
          label="Desviación gasto"
          value={desviacionGasto == null ? "—" : fmtEUR(desviacionGasto)}
          tone={desviacionGasto == null ? "default" : desviacionGasto <= 0 ? "positive" : "negative"}
          hint="real − estimado"
        />
        <StatTile
          label="Rentab. estimada"
          value={fmtPct(prof.estimatedYield)}
          tone={prof.estimatedYield >= 0 ? "positive" : "negative"}
        />
      </div>

      {/* Barras de avance */}
      <div className="re-card p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Avance</p>
        <ProgressBar label="Obra ejecutada" value={pm.obraPct} tone="brand" />
        <ProgressBar label="Licencias" value={pm.licenciasPct} tone="brand" />
        <ProgressBar label="Gastos pagados" value={pm.gastosPagadosPct} tone="positive" />
        <ProgressBar label="Ventas cerradas" value={pm.ventasCerradasPct} tone="positive" />
        <ProgressBar
          label="Tiempo transcurrido"
          value={pm.tiempoTranscurridoPct}
          tone="warning"
          sublabel={
            pm.daysRemaining != null
              ? `${pm.daysRemaining} días restantes (est.)`
              : "Define fechas de inicio y fin para estimar el tiempo"
          }
        />
      </div>

      {/* Edición de progreso y tiempos */}
      <div className="re-card p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Progreso y tiempos</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Obra ejecutada (%)">
            <NumberCellInput value={progress.obraPct} onChange={(v) => setProgress({ obraPct: v })} align="left" />
          </Field>
          <Field label="Licencias (%)">
            <NumberCellInput value={progress.licenciasPct} onChange={(v) => setProgress({ licenciasPct: v })} align="left" />
          </Field>
          <Field label="Inicio de obra">
            <DateCellInput value={progress.startDate} onChange={(v) => setProgress({ startDate: v })} />
          </Field>
          <Field label="Fin estimado">
            <DateCellInput value={progress.endDateEstimated} onChange={(v) => setProgress({ endDateEstimated: v })} />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-ink-subtle">{label}</label>
      <div className="rounded-lg border border-line px-1">{children}</div>
    </div>
  );
}

export default ResumenPanel;

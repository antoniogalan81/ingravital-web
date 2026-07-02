"use client";

// Panel RESUMEN = dashboard de la operación. Los KPIs numéricos viven en la
// SummaryBar persistente (siempre visible); aquí van: ALERTAS/desviaciones reales,
// barras de avance, próximos pasos, edición de progreso/tiempos y media.
// Nada que no se pueda calcular se muestra; las alertas solo aparecen si aplican.

import { useMemo } from "react";
import type { REOperation, REResults } from "@/src/lib/realEstate";
import {
  RE_MILESTONE_STATUS_LABEL,
  type REMediaItem,
  type REProgress,
} from "@/src/lib/realEstateTracking";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import {
  expenseTotals,
  salesStats,
  progressMetrics,
  profitability,
} from "@/src/lib/realEstateTrackingCalc";
import { ProgressBar } from "@/src/components/ui/ProgressBar";
import { NumberCellInput, DateCellInput } from "@/src/components/ui/DataTable";
import { MediaPanel } from "./MediaPanel";

type Alert = { tone: "negative" | "accent" | "info"; text: string };

export function ResumenPanel({
  op,
  results,
  now,
  onChangeProgress,
  onChangeMedia,
}: {
  op: REOperation;
  results: REResults;
  now: string;
  onChangeProgress: (progress: REProgress) => void;
  onChangeMedia: (media: REMediaItem[]) => void;
}) {
  const exp = useMemo(() => expenseTotals(op), [op]);
  const sales = useMemo(() => salesStats(op), [op]);
  const pm = useMemo(() => progressMetrics(op, results, now), [op, results, now]);
  const prof = useMemo(() => profitability(op, results), [op, results]);

  const progress = op.progress ?? {};
  const setProgress = (patch: Partial<REProgress>) => onChangeProgress({ ...progress, ...patch });

  const milestones = Array.isArray(op.milestones) ? op.milestones : [];
  const today = now.slice(0, 10);
  const overdue = milestones.filter(
    (m) => m.status !== "COMPLETADO" && m.dueDate != null && m.dueDate < today,
  );
  const deviated = milestones.filter((m) => m.status === "DESVIADO");
  const nextSteps = milestones.filter((m) => m.status === "PENDIENTE" || m.status === "EN_CURSO").slice(0, 4);

  // Alertas reales derivadas del estado actual (sin useMemo: React Compiler memoiza).
  const alerts: Alert[] = [];
  if (exp.hasData && exp.diff > 0) alerts.push({ tone: "negative", text: `Gasto real supera lo estimado en ${fmtEUR(exp.diff)}` });
  if (exp.pending > 0) alerts.push({ tone: "accent", text: `Pendiente de pagar: ${fmtEUR(exp.pending)}` });
  if (sales.pendingIncome > 0) alerts.push({ tone: "accent", text: `Pendiente de cobrar: ${fmtEUR(sales.pendingIncome)}` });
  if (deviated.length + overdue.length > 0)
    alerts.push({ tone: "negative", text: `${deviated.length + overdue.length} hito(s) desviado(s) o vencido(s)` });
  if (pm.tiempoTranscurridoPct != null && pm.tiempoTranscurridoPct >= 1 && (sales.soldPct == null || sales.soldPct < 1))
    alerts.push({ tone: "negative", text: "Plazo estimado superado y operación no cerrada" });
  if ((op.share?.enabled ?? false) && prof.investorSharePct == null)
    alerts.push({ tone: "info", text: "Configura el reparto para separar la rentabilidad del inversor" });

  return (
    <div className="space-y-5">
      {/* Alertas / desviaciones */}
      <div className="re-card p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle mb-2.5">Desviaciones y avisos</p>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--positive-soft)" }}>
            <svg className="w-4 h-4 shrink-0" style={{ color: "var(--positive)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium" style={{ color: "var(--positive)" }}>Todo en orden — la operación va según lo previsto.</span>
          </div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((al, i) => {
              const c = al.tone === "negative" ? "var(--negative)" : al.tone === "accent" ? "var(--brand)" : "var(--ink-muted)";
              const soft = al.tone === "negative" ? "var(--negative-soft)" : al.tone === "accent" ? "var(--brand-soft)" : "#f1f4f8";
              return (
                <li key={i} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: soft }}>
                  <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: c }} />
                  <span className="font-medium" style={{ color: c }}>{al.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Avance */}
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
            sublabel={pm.daysRemaining != null ? `${pm.daysRemaining} días restantes (est.)` : "Define fechas de inicio y fin"}
          />
        </div>

        {/* Próximos pasos + progreso editable */}
        <div className="space-y-4">
          <div className="re-card p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Próximos pasos</p>
            {nextSteps.length === 0 ? (
              <p className="text-sm text-ink-subtle">Sin hitos pendientes. Añádelos en Planificación.</p>
            ) : (
              <ul className="space-y-1.5">
                {nextSteps.map((m) => (
                  <li key={m.id} className="flex items-center justify-between">
                    <span className="text-sm text-ink truncate">{m.title || "Hito"}</span>
                    <span className="pill pill-neutral shrink-0">{RE_MILESTONE_STATUS_LABEL[m.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

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
      </div>

      {/* Media (estado visual / evolución) */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Estado visual · fotos y vídeos</p>
        <MediaPanel op={op} onChange={onChangeMedia} />
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

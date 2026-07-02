"use client";

// VISTA INVERSOR (solo lectura) = informe filtrado. Renderiza ÚNICAMENTE los datos
// cuya visibilidad ha activado el promotor. Los datos sensibles NO se muestran salvo
// activación explícita. Compartir resumen vía Web Share API / portapapeles (patrón
// seguro, sin dependencias nuevas ni PDF).

import { useMemo } from "react";
import { toast } from "sonner";
import type { REOperation, REResults } from "@/src/lib/realEstate";
import {
  RE_EXPENSE_CATEGORY_LABEL,
  RE_SALE_STATUS_LABEL,
  defaultShareSettings,
  type REVisibilityKey,
} from "@/src/lib/realEstateTracking";
import { fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";
import { expenseTotals, profitability, progressMetrics, salesStats } from "@/src/lib/realEstateTrackingCalc";
import { StatTile } from "@/src/components/ui/StatTile";
import { ProgressBar } from "@/src/components/ui/ProgressBar";

export function InvestorView({
  op,
  results,
  now,
  onClose,
}: {
  op: REOperation;
  results: REResults;
  now: string;
  onClose: () => void;
}) {
  const share = op.share ?? defaultShareSettings();
  const vis = share.visibility;
  const can = (k: REVisibilityKey) => vis[k] === true;

  const exp = useMemo(() => expenseTotals(op), [op]);
  const sales = useMemo(() => salesStats(op), [op]);
  const pm = useMemo(() => progressMetrics(op, results, now), [op, results, now]);
  const prof = useMemo(() => profitability(op, results), [op, results]);

  const shareSummary = async () => {
    const lines: string[] = [`Operación: ${op.name}`];
    if (op.address) lines.push(op.address);
    if (can("costesTotales")) lines.push(`Inversión total: ${fmtEUR(results.totalInvestment)}`);
    if (can("ingresos")) lines.push(`Ingresos cobrados: ${fmtEUR(sales.collected)}`);
    if (can("rentabilidadEstimada")) lines.push(`Rentabilidad estimada: ${fmtPct(results.saleYield)}`);
    if (can("rentabilidadReal") && prof.realYield != null) lines.push(`Rentabilidad real: ${fmtPct(prof.realYield)}`);
    lines.push("", "Informe generado desde Invergravital · datos según permisos del promotor.");
    const text = lines.join("\n");
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: op.name, text });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        toast.success("Resumen copiado al portapapeles");
      } else {
        toast.error("Compartir no está disponible en este navegador");
      }
    } catch {
      // El usuario canceló el diálogo de compartir; no es un error.
    }
  };

  const anyFinance = can("costesTotales") || can("ingresos") || can("pendientePago");
  const anyRent =
    can("rentabilidadEstimada") || can("rentabilidadReal") || can("rentabilidadPromotor") || can("rentabilidadInversor");

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex justify-center overflow-y-auto">
      <div className="min-h-full w-full max-w-3xl bg-white">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-5 py-3">
          <button type="button" onClick={onClose} className="p-2 -ml-2 text-slate-500 hover:text-ink rounded-lg hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-widest font-bold text-ink-subtle">Vista inversor</p>
            <p className="text-sm font-extrabold text-ink truncate max-w-[60vw]">{op.name}</p>
          </div>
          <button type="button" onClick={shareSummary} className="p-2 -mr-2 text-brand hover:bg-[var(--brand-soft)] rounded-lg" title="Compartir resumen">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Hero */}
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">{op.name || "Operación"}</h1>
            {op.address ? <p className="text-sm text-ink-subtle">{op.address}</p> : null}
          </div>

          {!share.enabled ? (
            <div className="rounded-xl border border-line bg-[var(--surface-alt)] p-3">
              <p className="text-sm text-ink-muted">
                Previsualización. La compartición está <b>desactivada</b>: actívala en el panel de Compartir para publicar esta vista.
              </p>
            </div>
          ) : null}

          {/* Resumen financiero (gated) */}
          {anyFinance ? (
            <Section title="Resumen financiero">
              <div className="grid grid-cols-2 gap-2.5">
                {can("costesTotales") ? <StatTile label="Costes totales" value={fmtEUR(results.totalInvestment)} /> : null}
                {can("ingresos") ? <StatTile label="Ingresos cobrados" value={fmtEUR(sales.collected)} tone="positive" /> : null}
                {can("pendientePago") ? <StatTile label="Pendiente pago" value={fmtEUR(exp.pending)} tone="accent" /> : null}
                {can("pendientePago") ? <StatTile label="Pendiente cobro" value={fmtEUR(sales.pendingIncome)} tone="accent" /> : null}
              </div>
            </Section>
          ) : null}

          {/* Avance (gated) */}
          {can("progreso") ? (
            <Section title="Avance">
              <div className="space-y-2.5">
                <ProgressBar label="Obra ejecutada" value={pm.obraPct} tone="brand" />
                <ProgressBar label="Licencias" value={pm.licenciasPct} tone="brand" />
                {sales.hasData ? <ProgressBar label="Ventas cerradas" value={pm.ventasCerradasPct} tone="positive" /> : null}
                {can("tiempos") ? (
                  <ProgressBar
                    label="Tiempo transcurrido"
                    value={pm.tiempoTranscurridoPct}
                    tone="warning"
                    sublabel={pm.daysRemaining != null ? `${pm.daysRemaining} días restantes (est.)` : undefined}
                  />
                ) : null}
              </div>
            </Section>
          ) : null}

          {/* Rentabilidad (gated por tipo) */}
          {anyRent ? (
            <Section title="Rentabilidad">
              <div className="re-card p-3">
                {can("rentabilidadEstimada") ? <Row label="Estimada" value={fmtPct(results.saleYield)} /> : null}
                {can("rentabilidadReal") ? <Row label="Real" value={prof.realYield == null ? "—" : fmtPct(prof.realYield)} /> : null}
                {can("rentabilidadPromotor") ? (
                  <Row label="Beneficio promotor (est.)" value={prof.estimatedPromoterBenefit == null ? "—" : fmtEUR(prof.estimatedPromoterBenefit)} />
                ) : null}
                {can("rentabilidadInversor") ? (
                  <Row label="Beneficio inversor (est.)" value={prof.estimatedInvestorBenefit == null ? "—" : fmtEUR(prof.estimatedInvestorBenefit)} />
                ) : null}
              </div>
            </Section>
          ) : null}

          {/* Ventas (gated) */}
          {can("ventas") && sales.hasData ? (
            <Section title="Estado de ventas">
              <div className="re-card p-3 divide-y divide-[var(--line)]">
                {(op.sales ?? []).map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{s.title || "Unidad"}</p>
                      {can("ventasPrecios") && (s.realPrice != null || s.estimatedPrice != null) ? (
                        <p className="text-xs text-ink-subtle">{fmtEUR((s.realPrice ?? s.estimatedPrice) as number)}</p>
                      ) : null}
                    </div>
                    <span className={`pill ${s.status === "VENDIDO" ? "pill-positive" : s.status === "DISPONIBLE" ? "pill-neutral" : "pill-info"}`}>
                      {RE_SALE_STATUS_LABEL[s.status]}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {/* Gastos (gated) */}
          {can("gastos") && exp.hasData ? (
            <Section title="Gastos">
              <div className="re-card p-3 divide-y divide-[var(--line)]">
                {(op.expenses ?? []).map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{e.concept || RE_EXPENSE_CATEGORY_LABEL[e.category]}</p>
                      <p className="text-xs text-ink-subtle">{RE_EXPENSE_CATEGORY_LABEL[e.category]}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {can("facturas") && (e.invoiceUri || e.invoiceName) && /^https?:\/\//i.test((e.invoiceUri || e.invoiceName) as string) ? (
                        <a href={(e.invoiceUri || e.invoiceName) as string} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand hover:underline">
                          Factura
                        </a>
                      ) : null}
                      {can("gastosImportes") ? <span className="text-sm font-bold tabular-nums text-ink">{fmtEUR((e.real ?? e.estimated ?? 0) as number)}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {/* Hitos (gated) */}
          {can("hitos") && (op.milestones ?? []).length > 0 ? (
            <Section title="Hitos">
              <div className="re-card p-3 divide-y divide-[var(--line)]">
                {(op.milestones ?? []).map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-2">
                    <span className="text-sm text-ink">{m.title || "Hito"}</span>
                    <span className={`pill ${m.status === "COMPLETADO" ? "pill-positive" : m.status === "DESVIADO" ? "pill-negative" : "pill-info"}`}>
                      {m.status}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {/* Media (gated) */}
          {can("media") && (op.media ?? []).length > 0 ? (
            <Section title="Fotos y vídeos">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {(op.media ?? []).map((m) =>
                  m.type === "FOTO" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={m.id} src={m.uri} alt={m.caption ?? "Foto"} className="aspect-video w-full rounded-lg object-cover border border-line" />
                  ) : (
                    <a key={m.id} href={m.uri} target="_blank" rel="noopener noreferrer" className="aspect-video w-full rounded-lg border border-line bg-[var(--surface-alt)] flex items-center justify-center text-brand text-sm font-semibold">
                      ▶ Vídeo
                    </a>
                  ),
                )}
              </div>
            </Section>
          ) : null}

          <p className="text-[11px] text-ink-subtle text-center pt-2">
            Informe generado desde Invergravital · datos según permisos del promotor.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-subtle">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--line)] last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-sm font-bold tabular-nums text-ink">{value}</span>
    </div>
  );
}

export default InvestorView;

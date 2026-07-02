"use client";

// src/components/realEstate/ReportDocument.tsx
// Dossier de inversión IMPRIMIBLE (A4). Vista premium en claro pensada para
// window.print() → "Guardar como PDF". Reutiliza calcResults() y la lógica de
// escenarios de ScenariosPanel. NO toca Supabase, NO inventa KPIs, NO crea
// fórmulas: todo sale del motor existente. Las cifras no calculadas se marcan
// "No calculado".

import { useMemo } from "react";
import type { REOperation } from "@/src/lib/realEstate";
import { calcResults, fmtEUR, fmtNum, fmtPct } from "@/src/lib/realEstateCalc";
import { buildScenarioSet } from "./ScenariosPanel";
import { RE_MILESTONE_STATUS_LABEL, RE_SALE_STATUS_LABEL, RE_SALE_STATUSES } from "@/src/lib/realEstateTracking";
import { expenseTotals, expensesByCategory, progressMetrics, profitability, salesStats } from "@/src/lib/realEstateTrackingCalc";

const CAT_LABEL: Record<string, string> = {
  vivienda: "Vivienda convencional",
  local: "Conversión de local",
  suelo: "Suelo / Edificio",
  adaptacion: "Adaptación en unidades",
};

const RIESGOS = [
  "Licencia de obra / actividad",
  "Desviación de coste de obra",
  "Plazo de comercialización",
  "Condiciones de financiación",
  "Precio y ritmo de venta",
  "Ocupación / nivel de alquiler",
  "Cambios normativos / urbanísticos",
];

const KPIS_NO_CALC = ["TIR", "Break-even", "Riesgo", "Margen avanzado", "Plazo / duración"];

export function reportSummaryText(op: REOperation): string {
  const r = calcResults(op);
  const lines = [
    `INFORME DE INVERSIÓN — ${op.name || "Operación"}`,
    op.address ? `Dirección: ${op.address}` : "",
    `Tipo: ${CAT_LABEL[op._cat ?? "vivienda"] ?? "Inversión inmobiliaria"}`,
    "",
    "RESUMEN EJECUTIVO",
    `· Inversión total: ${fmtEUR(r.totalInvestment)}`,
    `· Capital propio: ${fmtEUR(r.myInvestment)}`,
    `· Financiación: ${op.financing?.enabled ? fmtEUR(r.totalFinanced) : "—"}`,
    `· Ventas previstas: ${fmtEUR(r.totalSales)}`,
    `· Beneficio por venta: ${fmtEUR(r.saleBenefit)}`,
    `· Rentabilidad venta: ${fmtPct(r.saleYield)}`,
    `· Rentabilidad alquiler: ${fmtPct(r.rentYield)}`,
    `· Cashflow alquiler: ${fmtEUR(r.monthlyRentBenefit)}/mes`,
    "",
    "Informe preliminar · cifras estimadas, no vinculantes.",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  const color = tone === "positive" ? "var(--positive)" : tone === "negative" ? "var(--negative)" : "var(--ink)";
  return (
    <div className="rounded-lg border border-line p-3 report-card" style={{ background: "var(--surface-alt)" }}>
      <p className="text-[9px] uppercase tracking-wide font-bold text-ink-subtle">{label}</p>
      <p className="text-base font-extrabold tabular-nums mt-0.5" style={{ color }}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="report-section mt-6">
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-subtle border-b border-line pb-1.5 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  const color = tone === "positive" ? "var(--positive)" : tone === "negative" ? "var(--negative)" : "var(--ink)";
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#f1f4f8] last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-sm font-bold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}

export function ReportDocument({ op, generatedAt }: { op: REOperation; generatedAt?: string }) {
  const r = useMemo(() => calcResults(op), [op]);
  const scn = useMemo(() => buildScenarioSet(op), [op]);
  const finEnabled = op.financing?.enabled === true;
  const tipo = CAT_LABEL[op._cat ?? "vivienda"] ?? "Inversión inmobiliaria";

  const scnCols: { key: string; label: string; r: typeof r }[] = [
    { key: "cons", label: "Conservador", r: scn.cons },
    { key: "base", label: "Base", r: scn.base },
    { key: "opt", label: "Optimista", r: scn.opt },
  ];

  return (
    <div id="report-print-area" className="report-doc bg-white text-ink rounded-2xl border border-line overflow-hidden">
      {/* ── Cabecera ── */}
      <header className="px-8 pt-8 pb-5 border-b border-line">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold tracking-[0.18em] text-brand">INVERGRAVITAL · INFORME DE INVERSIÓN</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink mt-2">{op.name || "Operación sin nombre"}</h1>
            {op.address && <p className="text-sm text-ink-subtle mt-1">{op.address}</p>}
            <p className="text-sm text-ink-muted mt-1">{tipo}</p>
          </div>
          <div className="text-right shrink-0">
            <span className="pill pill-accent">Informe preliminar</span>
            <p className="text-[11px] text-ink-subtle mt-2">Generado el {generatedAt ?? "—"}</p>
          </div>
        </div>
      </header>

      <div className="px-8 pb-8">
        {/* ── Resumen ejecutivo ── */}
        <Section title="Resumen ejecutivo">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Inversión total" value={fmtEUR(r.totalInvestment)} />
            <Kpi label="Capital propio" value={fmtEUR(r.myInvestment)} />
            <Kpi label="Financiación" value={finEnabled ? fmtEUR(r.totalFinanced) : "—"} />
            <Kpi label="Ventas previstas" value={fmtEUR(r.totalSales)} />
            <Kpi label="Beneficio venta" value={fmtEUR(r.saleBenefit)} tone={r.saleBenefit >= 0 ? "positive" : "negative"} />
            <Kpi label="Rentab. venta" value={fmtPct(r.saleYield)} tone={r.saleYield >= 0 ? "positive" : "negative"} />
            <Kpi label="Rentab. alquiler" value={fmtPct(r.rentYield)} tone={r.rentYield >= 0 ? "positive" : "negative"} />
            <Kpi label="Cashflow/mes" value={fmtEUR(r.monthlyRentBenefit)} tone={r.monthlyRentBenefit >= 0 ? "positive" : "negative"} />
          </div>
        </Section>

        <div className="grid sm:grid-cols-2 gap-x-8">
          {/* ── Datos de compra ── */}
          <Section title="Datos de compra">
            <Row label="Precio de compra" value={fmtEUR(op.purchasePrice)} />
            <Row label="Impuesto de compra" value={fmtEUR(r.purchaseTaxAmt)} />
            {op.m2Plot ? <Row label="m² parcela" value={`${fmtNum(op.m2Plot)} m²`} /> : null}
            {op.m2Buildable ? <Row label="m² edificables" value={`${fmtNum(op.m2Buildable)} m²`} /> : null}
            <Row label="Notaría / registro / gestoría" value="Incluido en tasas" />
          </Section>

          {/* ── Costes ── */}
          <Section title="Costes">
            <Row label="Obra (total)" value={fmtEUR(r.obraTotal)} />
            {r.cimentacionAmt > 0 ? <Row label="Cimentación" value={fmtEUR(r.cimentacionAmt)} /> : null}
            {r.escalerasAmt > 0 ? <Row label="Escaleras" value={fmtEUR(r.escalerasAmt)} /> : null}
            {r.accesosAmt > 0 ? <Row label="Accesos" value={fmtEUR(r.accesosAmt)} /> : null}
            <Row label="Arquitecto / honorarios" value={fmtEUR(r.arquitectoAmt)} />
            <Row label="Licencias y tasas" value={fmtEUR(r.tasasAmt)} />
            {r.desviacionesAmt > 0 ? <Row label="Desviaciones" value={fmtEUR(r.desviacionesAmt)} /> : null}
            {r.furnitureCostTotal > 0 ? <Row label="Mobiliario" value={fmtEUR(r.furnitureCostTotal)} /> : null}
          </Section>

          {/* ── Financiación ── */}
          <Section title="Financiación">
            {finEnabled ? (
              <>
                <Row label="Importe financiado" value={fmtEUR(r.totalFinanced)} />
                <Row label="Aportación propia" value={fmtEUR(r.myInvestment)} />
                <Row label="Financiación compra" value={fmtEUR(r.compraAmount)} />
                <Row label="Financiación obra" value={fmtEUR(r.obraFinAmount)} />
                <Row label="Cuota mensual total" value={`${fmtEUR(r.totalMonthlyPayment)}/mes`} />
              </>
            ) : (
              <Row label="Financiación" value="Sin financiación" />
            )}
          </Section>

          {/* ── Venta / alquiler ── */}
          <Section title="Venta y alquiler">
            <Row label="Ventas previstas" value={fmtEUR(r.totalSales)} />
            <Row label="Resultado por venta" value={fmtEUR(r.saleBenefit)} tone={r.saleBenefit >= 0 ? "positive" : "negative"} />
            <Row label="Rentabilidad venta" value={fmtPct(r.saleYield)} tone={r.saleYield >= 0 ? "positive" : "negative"} />
            <Row label="Ingreso alquiler" value={`${fmtEUR(r.monthlyRentIncome)}/mes`} />
            <Row label="Resultado alquiler" value={`${fmtEUR(r.monthlyRentBenefit)}/mes`} tone={r.monthlyRentBenefit >= 0 ? "positive" : "negative"} />
            <Row label="Rentabilidad alquiler" value={fmtPct(r.rentYield)} tone={r.rentYield >= 0 ? "positive" : "negative"} />
          </Section>
        </div>

        {/* ── Seguimiento (solo si la operación tiene datos de gestión) ── */}
        <TrackingReportSections op={op} />

        {/* ── Escenarios ── */}
        <Section title="Escenarios (simulación · no vinculante)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-[11px] font-bold uppercase tracking-wide text-ink-subtle py-2 pr-3">Métrica</th>
                  {scnCols.map((c) => (
                    <th key={c.key} className="text-right text-[11px] font-bold uppercase tracking-wide py-2 px-3" style={{ color: c.key === "base" ? "var(--ink)" : "var(--ink-subtle)" }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  { label: "Rentab. venta", get: (x: typeof r) => fmtPct(x.saleYield) },
                  { label: "Beneficio venta", get: (x: typeof r) => fmtEUR(x.saleBenefit) },
                  { label: "Rentab. alquiler", get: (x: typeof r) => fmtPct(x.rentYield) },
                  { label: "Cashflow/mes", get: (x: typeof r) => fmtEUR(x.monthlyRentBenefit) },
                  { label: "Inversión total", get: (x: typeof r) => fmtEUR(x.totalInvestment) },
                ]).map((row, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1.5 pr-3 text-ink-muted">{row.label}</td>
                    {scnCols.map((c) => (
                      <td key={c.key} className="py-1.5 px-3 text-right font-bold tabular-nums" style={{ color: c.key === "base" ? "var(--ink)" : "var(--ink-muted)" }}>
                        {row.get(c.r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-ink-subtle mt-2">Conservador: venta −10% · obra +10% · alquiler −10%. Optimista: inverso. Mismo motor de cálculo.</p>
        </Section>

        {/* ── Riesgos y pendientes ── */}
        <Section title="Riesgos y pendientes">
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5">
            {RIESGOS.map((rk) => (
              <li key={rk} className="flex items-center justify-between py-1 border-b border-[#f1f4f8]">
                <span className="text-sm text-ink-muted">{rk}</span>
                <span className="pill pill-neutral">Por completar</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* ── KPIs no calculados ── */}
        <Section title="Métricas avanzadas (no calculadas por el motor)">
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            {KPIS_NO_CALC.map((m) => (
              <span key={m} className="text-xs text-ink-muted">
                {m}: <span className="font-semibold text-ink-subtle">No calculado</span>
              </span>
            ))}
          </div>
        </Section>

        {/* ── Pie ── */}
        <footer className="mt-8 pt-3 border-t border-line">
          <p className="text-[11px] text-ink-subtle">
            Informe preliminar generado automáticamente{generatedAt ? ` el ${generatedAt}` : ""}. Cifras estimadas a partir de los datos
            introducidos; no constituyen oferta ni asesoramiento. Documento de análisis interno.
          </p>
        </footer>
      </div>
    </div>
  );
}

// ── Secciones de SEGUIMIENTO del informe (avance, gastos reales, ventas, hitos,
//    desviaciones, próximos pasos). Reutilizan el cálculo puro; solo se muestran si
//    la operación tiene datos de gestión. No inventan cifras: usan "—" si faltan. ──
function TrackingReportSections({ op }: { op: REOperation }) {
  const r = useMemo(() => calcResults(op), [op]);
  const now = useMemo(() => new Date().toISOString(), []);
  const exp = useMemo(() => expenseTotals(op), [op]);
  const byCat = useMemo(() => expensesByCategory(op), [op]);
  const sales = useMemo(() => salesStats(op), [op]);
  const pm = useMemo(() => progressMetrics(op, r, now), [op, r, now]);
  const prof = useMemo(() => profitability(op, r), [op, r]);

  const milestones = Array.isArray(op.milestones) ? op.milestones : [];
  const media = Array.isArray(op.media) ? op.media : [];
  const hasProgress = op.progress != null && (op.progress.obraPct != null || op.progress.licenciasPct != null || op.progress.startDate != null);
  const hasAny = exp.hasData || sales.hasData || milestones.length > 0 || media.length > 0 || hasProgress;
  if (!hasAny) return null;

  const pctTxt = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const nextSteps = milestones.filter((m) => m.status === "PENDIENTE" || m.status === "EN_CURSO");

  return (
    <>
      {(hasProgress || sales.hasData) && (
        <Section title="Estado de avance">
          <div className="grid sm:grid-cols-2 gap-x-8">
            <Row label="Obra ejecutada" value={pctTxt(pm.obraPct)} />
            <Row label="Licencias" value={pctTxt(pm.licenciasPct)} />
            <Row label="Ventas cerradas" value={pctTxt(pm.ventasCerradasPct)} />
            <Row label="Tiempo transcurrido" value={pctTxt(pm.tiempoTranscurridoPct)} />
          </div>
        </Section>
      )}

      {exp.hasData && (
        <Section title="Gastos (control real)">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
            <Kpi label="Estimado" value={fmtEUR(exp.estimated)} />
            <Kpi label="Real" value={fmtEUR(exp.real)} />
            <Kpi label="Diferencia" value={fmtEUR(exp.diff)} tone={exp.diff <= 0 ? "positive" : "negative"} />
            <Kpi label="Pendiente pago" value={fmtEUR(exp.pending)} />
          </div>
          {byCat.map((c) => (
            <Row key={c.category} label={c.label} value={`est. ${fmtEUR(c.estimated)} · real ${fmtEUR(c.real)}`} tone={c.diff <= 0 ? "positive" : "negative"} />
          ))}
        </Section>
      )}

      {sales.hasData && (
        <Section title="Ventas">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
            <Kpi label="Cobrado" value={fmtEUR(sales.collected)} tone="positive" />
            <Kpi label="Pendiente cobro" value={fmtEUR(sales.pendingIncome)} />
            <Kpi label="Cerradas" value={`${sales.soldCount}/${sales.count}`} />
            <Kpi label="Venta real" value={sales.soldCount > 0 ? fmtEUR(sales.totalReal) : "—"} />
          </div>
          {RE_SALE_STATUSES.map((s) =>
            sales.byStatus[s] > 0 ? <Row key={s} label={RE_SALE_STATUS_LABEL[s]} value={String(sales.byStatus[s])} /> : null,
          )}
        </Section>
      )}

      {milestones.length > 0 && (
        <Section title="Hitos y tiempos">
          {milestones.map((m) => (
            <Row key={m.id} label={`${m.title || "Hito"} — ${RE_MILESTONE_STATUS_LABEL[m.status]}`} value={m.dueDate ? `prev. ${m.dueDate}${m.realDate ? ` · real ${m.realDate}` : ""}` : "—"} />
          ))}
        </Section>
      )}

      <Section title="Desviaciones">
        <Row label="Desviación de gasto (real − estimado)" value={exp.hasData ? fmtEUR(exp.diff) : "—"} tone={exp.hasData ? (exp.diff <= 0 ? "positive" : "negative") : undefined} />
        <Row label="Desviación de beneficio (real − estimado)" value={prof.deviation == null ? "—" : fmtEUR(prof.deviation)} tone={prof.deviation == null ? undefined : prof.deviation >= 0 ? "positive" : "negative"} />
      </Section>

      <Section title="Próximos pasos">
        {nextSteps.length > 0 ? (
          <ul className="space-y-1.5">
            {nextSteps.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-1 border-b border-[#f1f4f8]">
                <span className="text-sm text-ink-muted">{m.title || "Hito"}</span>
                <span className="pill pill-neutral">{RE_MILESTONE_STATUS_LABEL[m.status]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-subtle">Sin hitos pendientes registrados.</p>
        )}
      </Section>

      {media.length > 0 && (
        <Section title="Media">
          <Row label="Elementos" value={`${media.filter((m) => m.type === "FOTO").length} fotos · ${media.filter((m) => m.type === "VIDEO").length} vídeos`} />
        </Section>
      )}
    </>
  );
}

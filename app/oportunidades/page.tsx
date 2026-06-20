"use client";

// OPORTUNIDADES (WEB) — paridad con APP. El promotor publica operaciones y los
// inversores las exploran (rentabilidad, plazo, capital, riesgo, docs, estado) y
// expresan interés.
// ESTADO: estructura + diseño listos. Publicación, listado Supabase y flujo de
// interés/contratos PENDIENTES de backend.

import AppGate from "@/components/AppGate";
import { OPP_STATUS_LABEL, RISK_LABEL, type Opportunity } from "@/src/lib/opportunities";
import { fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";

const PREVIEW: Opportunity = {
  id: "preview",
  createdAt: "",
  updatedAt: "",
  title: "Edificio 6 viviendas · Centro",
  location: "Málaga",
  status: "EN_FONDEO",
  risk: "MEDIO",
  estimatedYield: 0.18,
  termMonths: 18,
  capitalRequired: 420000,
  minTicket: 25000,
  committedCapital: 273000,
  summary: "Compra y reforma integral de edificio para venta de 6 viviendas.",
  docCount: 7,
  interestedCount: 4,
};

const WILL_INCLUDE = [
  "Rentabilidad estimada y plazo",
  "Capital necesario y ticket mínimo",
  "Nivel de riesgo y documentación",
  "Estado del fondeo y nº de interesados",
  "Botón para expresar interés",
];

function OpportunityCard({ op }: { op: Opportunity }) {
  const progress = op.capitalRequired && op.capitalRequired > 0 ? Math.min(1, (op.committedCapital ?? 0) / op.capitalRequired) : 0;
  const riskClass = op.risk === "ALTO" ? "pill-negative" : op.risk === "MEDIO" ? "pill-warning" : "pill-positive";
  return (
    <div className="re-card re-card-interactive p-5 max-w-2xl">
      <div className="flex items-start gap-3">
        <h3 className="flex-1 text-lg font-extrabold text-ink tracking-tight">{op.title}</h3>
        <span className="pill pill-info">{OPP_STATUS_LABEL[op.status]}</span>
      </div>
      {op.location && <p className="text-sm text-ink-subtle font-medium mt-0.5">{op.location}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <Metric label="Rentab. est." value={op.estimatedYield != null ? fmtPct(op.estimatedYield) : "—"} strong />
        <Metric label="Plazo" value={op.termMonths != null ? `${op.termMonths} m` : "—"} />
        <Metric label="Capital" value={op.capitalRequired != null ? fmtEUR(op.capitalRequired) : "—"} />
        <Metric label="Ticket mín." value={op.minTicket != null ? fmtEUR(op.minTicket) : "—"} />
      </div>

      <div className="flex h-1.5 rounded-full overflow-hidden bg-[#e3e8ef] mt-4">
        <div style={{ flex: Math.max(0.0001, progress), background: "var(--positive)" }} />
        <div style={{ flex: Math.max(0.0001, 1 - progress) }} />
      </div>
      <p className="text-xs text-ink-subtle font-semibold mt-1.5">
        {fmtEUR(op.committedCapital ?? 0)} de {fmtEUR(op.capitalRequired ?? 0)} ({fmtPct(progress)})
      </p>

      <div className="flex flex-wrap items-center gap-3 mt-3">
        <span className={`pill ${riskClass}`}>{RISK_LABEL[op.risk]}</span>
        <span className="text-xs text-ink-subtle font-semibold">{op.docCount ?? 0} docs</span>
        <span className="text-xs text-ink-subtle font-semibold">{op.interestedCount ?? 0} interesados</span>
      </div>
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide font-bold text-ink-subtle">{label}</p>
      <p className="text-[15px] font-extrabold mt-0.5" style={strong ? { color: "var(--positive)" } : { color: "var(--ink)" }}>
        {value}
      </p>
    </div>
  );
}

export default function OportunidadesPage() {
  return (
    <AppGate
      active="oportunidades"
      label="Captación de inversores"
      title="Oportunidades"
      subtitle="Publica tus operaciones y deja que los inversores las exploren y expresen interés."
    >
      <div className="space-y-6 max-w-3xl">
        <div className="re-card p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <span className="empty-state-icon !m-0 !w-12 !h-12">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 21l-4.9-2.8.9-5.5-4-3.9 5.5-.8L12 3z" />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold text-ink tracking-tight">Oportunidades seleccionadas</h2>
                <span className="pill pill-accent">Próximamente</span>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed mt-2">
                Operaciones con análisis previo e información clara antes de invertir. La publicación y el flujo de
                interés se activarán al conectar el backend.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 mt-5 pt-5 border-t border-line">
            {WILL_INCLUDE.map((w) => (
              <div key={w} className="flex items-center gap-2.5 text-sm text-ink-muted font-medium">
                <svg className="w-4 h-4 shrink-0" style={{ color: "var(--brand)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {w}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="section-header">
            <p className="section-label">Vista previa de una oportunidad</p>
            <span className="text-xs text-ink-subtle font-semibold">Ejemplo ilustrativo</span>
          </div>
          <OpportunityCard op={PREVIEW} />
          <p className="text-xs text-ink-subtle mt-3 leading-relaxed max-w-2xl">
            Datos de ejemplo para mostrar el formato. No constituye una oferta ni una recomendación de inversión.
          </p>
        </div>
      </div>
    </AppGate>
  );
}

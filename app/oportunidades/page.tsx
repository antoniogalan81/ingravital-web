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
    <div className="re-card p-5 max-w-2xl">
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
      <div className="space-y-6 max-w-2xl">
        <div className="re-card p-5">
          <span className="pill pill-accent">Preparado · backend pendiente</span>
          <p className="text-sm text-ink-muted leading-relaxed mt-3">
            La estructura y el diseño están listos. La publicación real de oportunidades y el flujo de interés se
            activarán al conectar el backend.
          </p>
          <ul className="mt-3 space-y-1.5">
            {WILL_INCLUDE.map((w) => (
              <li key={w} className="flex items-center gap-2 text-sm text-ink-muted font-medium">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                {w}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="section-label mb-2">Vista previa de una oportunidad</p>
          <OpportunityCard op={PREVIEW} />
        </div>
      </div>
    </AppGate>
  );
}

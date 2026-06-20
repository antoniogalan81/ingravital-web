"use client";

// INVERSORES / SEGUIMIENTO DE PROYECTOS (WEB) — paridad con APP.
// El inversor sigue la evolución del proyecto (costes, tiempos, hitos, docs,
// fotos, desviaciones, actualizaciones) y sube su propia documentación.
// ESTADO: estructura + diseño listos. Auth de rol inversor, sync y subida de
// documentos PENDIENTES de backend.

import AppGate from "@/components/AppGate";
import {
  INVESTOR_STATUS_LABEL,
  type Investor,
  type ProjectMilestone,
} from "@/src/lib/investors";
import { fmtEUR } from "@/src/lib/realEstateCalc";

const PREVIEW_INVESTORS: Investor[] = [
  { id: "1", name: "Inversor A", status: "ACTIVO", committedCapital: 120000, projectsCount: 2, createdAt: "", updatedAt: "" },
  { id: "2", name: "Inversor B", status: "INTERESADO", committedCapital: 0, projectsCount: 0, createdAt: "", updatedAt: "" },
];

const PREVIEW_MILESTONES: (ProjectMilestone & { date: string })[] = [
  { id: "1", title: "Compra y escritura", status: "COMPLETADO", date: "Cerrado" },
  { id: "2", title: "Licencia de obra", status: "EN_CURSO", date: "En trámite" },
  { id: "3", title: "Ejecución de obra", status: "PENDIENTE", date: "Previsto" },
  { id: "4", title: "Comercialización y venta", status: "PENDIENTE", date: "Previsto" },
];

const MILESTONE_PILL: Record<ProjectMilestone["status"], string> = {
  COMPLETADO: "pill-positive",
  EN_CURSO: "pill-warning",
  PENDIENTE: "pill-neutral",
  DESVIADO: "pill-negative",
};
const MILESTONE_LABEL: Record<ProjectMilestone["status"], string> = {
  COMPLETADO: "Completado",
  EN_CURSO: "En curso",
  PENDIENTE: "Pendiente",
  DESVIADO: "Desviado",
};

function dotColor(status: ProjectMilestone["status"]): string {
  return status === "COMPLETADO" ? "var(--positive)" : status === "EN_CURSO" ? "var(--warning)" : status === "DESVIADO" ? "var(--negative)" : "#cbd3df";
}

const CAN_DO = [
  "Ver evolución, costes y tiempos del proyecto",
  "Consultar hitos, desviaciones y actualizaciones",
  "Acceder a documentos y fotos",
  "Subir su propia documentación",
];

export default function InversoresPage() {
  return (
    <AppGate
      active="inversores"
      label="Relación con inversores"
      title="Inversores"
      subtitle="Comparte proyectos con inversores y deja que sigan su evolución en tiempo real."
    >
      <div className="space-y-6 max-w-3xl">
        <div className="re-card p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <span className="empty-state-icon !m-0 !w-12 !h-12">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-1a4 4 0 00-3-3.87M9 20H4v-1a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-2a3 3 0 10-2.5-4.5" />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold text-ink tracking-tight">Área ordenada para inversores</h2>
                <span className="pill pill-accent">Próximamente</span>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed mt-2">
                Seguimiento profesional de cada proyecto y análisis claro antes de invertir. El acceso por rol de
                inversor y la subida de documentos se activarán al conectar el backend.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 mt-5 pt-5 border-t border-line">
            {CAN_DO.map((c) => (
              <div key={c} className="flex items-center gap-2.5 text-sm text-ink-muted font-medium">
                <svg className="w-4 h-4 shrink-0" style={{ color: "var(--brand)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {c}
              </div>
            ))}
          </div>
        </div>

        {/* Inversores */}
        <div>
          <div className="section-header">
            <p className="section-label">Inversores · vista previa</p>
            <span className="text-xs text-ink-subtle font-semibold">Ejemplo ilustrativo</span>
          </div>
          <div className="re-card overflow-hidden">
            {PREVIEW_INVESTORS.map((inv, i) => (
              <div key={inv.id} className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[var(--surface-alt)] ${i < PREVIEW_INVESTORS.length - 1 ? "border-b border-line" : ""}`}>
                <div className="w-10 h-10 rounded-full grid place-items-center font-extrabold" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                  {inv.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-ink">{inv.name}</p>
                  <p className="text-xs text-ink-subtle font-medium">
                    {inv.committedCapital ? `${fmtEUR(inv.committedCapital)} comprometido` : "Sin compromiso aún"}
                    {inv.projectsCount ? ` · ${inv.projectsCount} proyectos` : ""}
                  </p>
                </div>
                <span className={`pill ${inv.status === "ACTIVO" ? "pill-positive" : "pill-info"}`}>{INVESTOR_STATUS_LABEL[inv.status]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Seguimiento de proyecto */}
        <div>
          <div className="section-header">
            <p className="section-label">Seguimiento de proyecto · vista previa</p>
            <span className="text-xs text-ink-subtle font-semibold">Ejemplo ilustrativo</span>
          </div>
          <div className="re-card p-5">
            {PREVIEW_MILESTONES.map((m, i) => (
              <div key={m.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="w-3 h-3 rounded-full mt-1" style={{ background: dotColor(m.status) }} />
                  {i < PREVIEW_MILESTONES.length - 1 && <span className="w-0.5 flex-1 my-1" style={{ background: "var(--line)" }} />}
                </div>
                <div className="flex-1 pb-5">
                  <p className="text-[15px] font-bold text-ink">{m.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`pill ${MILESTONE_PILL[m.status]}`}>{MILESTONE_LABEL[m.status]}</span>
                    <span className="text-xs text-ink-subtle font-medium">{m.date}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Documentos */}
        <div>
          <p className="section-label mb-2">Documentos</p>
          <div className="re-card p-5 space-y-3">
            <p className="text-sm text-ink-muted">Los documentos del proyecto aparecerán aquí.</p>
            <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-6 text-sm font-semibold" style={{ borderColor: "var(--line-strong)", color: "var(--brand)" }}>
              Subida de documentos · próximamente
            </div>
          </div>
        </div>
      </div>
    </AppGate>
  );
}

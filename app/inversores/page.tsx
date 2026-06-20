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
      <div className="space-y-6 max-w-2xl">
        <div className="re-card p-5">
          <span className="pill pill-accent">Preparado · backend pendiente</span>
          <ul className="mt-3 space-y-1.5">
            {CAN_DO.map((c) => (
              <li key={c} className="flex items-center gap-2 text-sm text-ink-muted font-medium">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                {c}
              </li>
            ))}
          </ul>
        </div>

        {/* Inversores */}
        <div>
          <p className="section-label mb-2">Inversores · vista previa</p>
          <div className="re-card overflow-hidden">
            {PREVIEW_INVESTORS.map((inv, i) => (
              <div key={inv.id} className={`flex items-center gap-4 px-5 py-4 ${i < PREVIEW_INVESTORS.length - 1 ? "border-b border-line" : ""}`}>
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
          <p className="section-label mb-2">Seguimiento de proyecto · vista previa</p>
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

"use client";

// WORKSPACE del área INVERSORES de una operación (WEB).
// Una operación tiene tres áreas: PROYECTO y SEGUIMIENTO OPERATIVO viven en la ficha
// (RealEstateModal) y este workspace es INVERSORES. Ventas, gastos e hitos NO se editan
// aquí: se leen de los datos canónicos de la operación y se editan en Seguimiento operativo.
// Ocupa toda la pantalla (no drawer-sobre-drawer): cabecera, BARRA-RESUMEN persistente y
// pestañas: Resumen · Económico · Ventas · Hitos · Inversores · Informe.
// No mantiene estado de datos propio: lee `op` (draft vivo del editor) y persiste lo que
// es propio de esta área con `onPersist(patch)` → el editor hace commit (JSON sync).

import { useEffect, useMemo, useState } from "react";
import type { REOperation } from "@/src/lib/realEstate";
import { calcResults } from "@/src/lib/realEstateCalc";
import type { REInvestorSplit } from "@/src/lib/realEstateTracking";
import { stageOf } from "@/src/lib/pipeline";
import { StageBadge } from "../pipeline/StageBadge";
import { SummaryBar } from "./SummaryBar";
import { ResumenPanel } from "./ResumenPanel";
import { ProjectExpenses } from "../economics/ProjectExpenses";
import { ProjectSales } from "../economics/ProjectSales";
import { projectExpenseSummary, projectSalesSummary } from "@/src/lib/projectEconomics";
import { HitosPanel } from "./HitosPanel";
import { InversoresPanel } from "./InversoresPanel";
import { InformePanel } from "./InformePanel";

type TabKey = "resumen" | "economico" | "ventas" | "hitos" | "inversores" | "informe";

const TABS: { key: TabKey; label: string }[] = [
  { key: "resumen", label: "Resumen" },
  { key: "economico", label: "Económico" },
  { key: "ventas", label: "Ventas" },
  { key: "hitos", label: "Hitos" },
  { key: "inversores", label: "Inversores" },
  { key: "informe", label: "Informe" },
];

// Bronce de la marca oscurecido: --accent no llega a 4.5:1 como texto sobre blanco.
export const INVESTOR_COLOR = "#86652a";

export type OperationArea = "proyecto" | "seguimiento" | "inversores";
/** Secciones de Seguimiento operativo a las que se puede saltar desde otra área. */
export type TrackingSection = "gastos" | "ventas" | "hitos" | "avance";

const AREAS: { key: OperationArea; title: string; subtitle: string; color: string; soft: string }[] = [
  { key: "proyecto", title: "Proyecto", subtitle: "Estructura, previsión y rentabilidad", color: "var(--brand)", soft: "var(--brand-soft)" },
  { key: "seguimiento", title: "Seguimiento operativo", subtitle: "Ventas, gastos, hitos y evolución real", color: "var(--positive)", soft: "var(--positive-soft)" },
  { key: "inversores", title: "Inversores", subtitle: "Preparación y comunicación de la inversión", color: INVESTOR_COLOR, soft: "var(--accent-soft)" },
];

/**
 * Selector de las tres áreas de una operación. Lo usan la ficha (Proyecto y Seguimiento
 * operativo) y este workspace (Inversores); pulsar un área inactiva navega a ella.
 */
export function AreaSwitch({ active, onSelect }: { active: OperationArea; onSelect: (area: OperationArea) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Área de trabajo">
      {AREAS.map((a) => {
        const isActive = a.key === active;
        return (
          <button
            key={a.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => !isActive && onSelect(a.key)}
            className={`min-w-0 rounded-xl border-2 px-2.5 py-2 text-left transition-colors ${isActive ? "cursor-default" : "border-line bg-white hover:bg-[var(--surface-alt)]"}`}
            style={isActive ? { borderColor: a.color, background: a.soft } : undefined}
          >
            <span className="block text-sm font-extrabold leading-tight" style={{ color: isActive ? a.color : "var(--ink)" }}>{a.title}</span>
            <span className="block text-[11px] leading-tight mt-0.5 text-ink-subtle">{a.subtitle}</span>
          </button>
        );
      })}
    </div>
  );
}

function QuickAction({ label, onClick, primary = false }: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
        primary ? "text-white" : "border border-line text-ink hover:bg-[var(--surface-alt)]"
      }`}
      style={primary ? { background: "var(--brand)" } : undefined}
    >
      {label}
    </button>
  );
}

/** Ventas, gastos e hitos se editan en Seguimiento operativo; aquí se consultan los mismos datos. */
function EditInSeguimiento({ title, subtitle, onClick }: { title: string; subtitle: string; onClick?: () => void }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h3 className="text-sm font-extrabold text-ink">{title}</h3>
        <p className="text-[11px] text-ink-subtle mt-0.5">{subtitle}</p>
      </div>
      {onClick ? (
        <button type="button" onClick={onClick} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-brand hover:bg-[var(--brand-soft)]">
          Editar en Seguimiento operativo
        </button>
      ) : null}
    </div>
  );
}

export function TrackingModal({
  op,
  onPersist,
  onClose,
  onSelectArea,
  onEditInSeguimiento,
}: {
  op: REOperation;
  onPersist: (patch: Partial<REOperation>) => void;
  onClose: () => void;
  /** Vuelve a la ficha en el área indicada. */
  onSelectArea: (area: Exclude<OperationArea, "inversores">) => void;
  /** Abre Seguimiento operativo en la sección indicada (única vía de edición de estos datos). */
  onEditInSeguimiento?: (section: TrackingSection) => void;
}) {
  const [tab, setTab] = useState<TabKey>("resumen");
  const edit = (section: TrackingSection) => (onEditInSeguimiento ? () => onEditInSeguimiento(section) : undefined);

  const results = useMemo(() => calcResults(op), [op]);
  const now = useMemo(() => new Date().toISOString(), []);
  const expenseSummary = useMemo(() => projectExpenseSummary(op, results), [op, results]);
  const salesSummary = useMemo(() => projectSalesSummary(op, results, now), [op, results, now]);
  const generatedAt = useMemo(
    () => new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }),
    [],
  );

  // Escape para cerrar + bloqueo de scroll del fondo mientras el workspace está abierto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white" role="dialog" aria-modal="true" aria-labelledby="tracking-modal-title">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col min-h-0">
        {/* Zona superior fija (cabecera + resumen + tabs) con elevación */}
        <div className="flex-shrink-0 bg-white relative z-10" style={{ boxShadow: "var(--shadow-sm)" }}>
          {/* Header + acciones rápidas */}
          <div className="flex flex-col gap-3 border-b border-line px-4 sm:px-6 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: INVESTOR_COLOR }}>
                  Inversores <span className="text-ink-subtle">· Preparación y comunicación de la inversión</span>
                </p>
                <div className="flex items-center gap-2.5 mt-1 min-w-0">
                  <h2 id="tracking-modal-title" className="text-2xl font-extrabold text-ink tracking-tight truncate">{op.name || "Operación"}</h2>
                  <StageBadge stage={stageOf(op)} />
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-[var(--surface-alt)] transition-colors flex-shrink-0"
                title="Cerrar (Esc)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cerrar
              </button>
            </div>
            <AreaSwitch active="inversores" onSelect={(area) => area !== "inversores" && onSelectArea(area)} />
            {/* Accesos rápidos a las vistas de esta área */}
            <div className="flex flex-wrap items-center gap-2">
              <QuickAction label="Media" onClick={() => setTab("resumen")} />
              <QuickAction label="Vista inversor" onClick={() => setTab("inversores")} />
              <QuickAction label="Informe" onClick={() => setTab("informe")} />
            </div>
          </div>

          {/* Barra-resumen persistente */}
          <div className="border-b border-line">
            <SummaryBar op={op} results={results} />
          </div>

          {/* Tabs */}
          <div className="flex overflow-x-auto gap-1.5 px-4 sm:px-6 py-2.5 bg-[var(--surface-alt)]">
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`px-3.5 py-1.5 text-sm font-semibold rounded-full whitespace-nowrap border transition-colors flex-shrink-0 ${
                    active ? "border-transparent text-white shadow-sm" : "border-line bg-white text-ink-muted hover:text-brand hover:border-brand hover:bg-[var(--brand-soft)]"
                  }`}
                  style={active ? { background: "var(--brand)" } : undefined}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div key={tab} className="reveal-fast flex-1 overflow-y-auto px-4 sm:px-6 py-5 bg-[var(--surface-alt)]">
          {tab === "resumen" && (
            <section className="space-y-3">
              <EditInSeguimiento title="Avance y evolución" subtitle="Progreso, plazos, fotos y vídeos. Son los datos de Seguimiento operativo." onClick={edit("avance")} />
              <ResumenPanel op={op} results={results} now={now} />
            </section>
          )}
          {tab === "economico" && (
            <section className="space-y-3">
              <EditInSeguimiento title="Gastos" subtitle="Previsto y real por categoría. Son los datos de Seguimiento operativo." onClick={edit("gastos")} />
              <ProjectExpenses summary={expenseSummary} />
            </section>
          )}
          {tab === "ventas" && (
            <section className="space-y-3">
              <EditInSeguimiento title="Ventas" subtitle="Unidades, fechas previstas y reales, y cobros. Son los datos de Seguimiento operativo." onClick={edit("ventas")} />
              <ProjectSales summary={salesSummary} />
            </section>
          )}
          {tab === "hitos" && (
            <section className="space-y-3">
              <EditInSeguimiento title="Hitos" subtitle="Plazos previstos y reales. Son los datos de Seguimiento operativo." onClick={edit("hitos")} />
              <HitosPanel op={op} />
            </section>
          )}
          {tab === "inversores" && (
            <InversoresPanel
              op={op}
              results={results}
              onChangeSplit={(investorSplit: REInvestorSplit) => onPersist({ investorSplit })}
              onOpenCrm={() => window.open("/inversores", "_blank", "noopener")}
            />
          )}
          {tab === "informe" && <InformePanel op={op} generatedAt={generatedAt} onPreviewInvestor={() => setTab("inversores")} />}
        </div>
      </div>

    </div>
  );
}

export default TrackingModal;

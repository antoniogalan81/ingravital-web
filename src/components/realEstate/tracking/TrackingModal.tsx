"use client";

// WORKSPACE del área INVERSORES de una operación (WEB) — rediseño UX.
// "Gestión del proyecto" es la ficha principal de la operación (RealEstateModal); este
// workspace es el área Inversores y conserva su contenido tal cual (pendiente de definir).
// Selector de área arriba: "Gestión del proyecto" vuelve a la ficha.
// Ocupa toda la pantalla (no drawer-sobre-drawer): cabecera con acciones rápidas,
// BARRA-RESUMEN persistente (KPIs + presupuesto + desviación visible en todas las
// pestañas) y 6 pestañas agrupadas por uso real:
//   Resumen · Económico · Ventas · Planificación · Inversores · Informe.
// No mantiene estado de datos propio: lee `op` (draft vivo del editor) y persiste
// cada cambio con `onPersist(patch)` → el editor hace commit (JSON sync).

import { useCallback, useEffect, useMemo, useState } from "react";
import type { REOperation } from "@/src/lib/realEstate";
import { calcResults } from "@/src/lib/realEstateCalc";
import {
  type REInvestorSplit,
  type REMediaItem,
  type REMilestone,
  type REProgress,
} from "@/src/lib/realEstateTracking";
import { stageOf } from "@/src/lib/pipeline";
import { StageBadge } from "../pipeline/StageBadge";
import { SummaryBar } from "./SummaryBar";
import { InicioPanel } from "./InicioPanel";
import { ResumenPanel } from "./ResumenPanel";
import { ProjectExpenses } from "../economics/ProjectExpenses";
import { ProjectSales } from "../economics/ProjectSales";
import { projectExpenseSummary, projectSalesSummary } from "@/src/lib/projectEconomics";
import { HitosPanel } from "./HitosPanel";
import { InversoresPanel } from "./InversoresPanel";
import { InformePanel } from "./InformePanel";
import { QuickEntryModal, type QuickKind } from "./QuickEntryModal";

type TabKey = "inicio" | "resumen" | "economico" | "ventas" | "planificacion" | "inversores" | "informe";

const TABS: { key: TabKey; label: string }[] = [
  { key: "inicio", label: "Inicio" },
  { key: "resumen", label: "Resumen" },
  { key: "economico", label: "Económico" },
  { key: "ventas", label: "Ventas" },
  { key: "planificacion", label: "Planificación" },
  { key: "inversores", label: "Inversores" },
  { key: "informe", label: "Informe" },
];

// Bronce de la marca oscurecido: --accent no llega a 4.5:1 como texto sobre blanco.
export const INVESTOR_COLOR = "#86652a";

/**
 * Selector de las dos áreas de una operación. Lo usan la ficha (Gestión del proyecto) y
 * este workspace (Inversores); pulsar el área inactiva navega a la otra pantalla.
 */
export function AreaSwitch({
  active,
  onGestion,
  onInversores,
}: {
  active: "gestion" | "inversores";
  onGestion?: () => void;
  onInversores?: () => void;
}) {
  const areas = [
    { key: "gestion" as const, title: "Gestión del proyecto", subtitle: "Área del promotor · Uso interno", color: "var(--brand)", soft: "var(--brand-soft)", onClick: onGestion },
    { key: "inversores" as const, title: "Inversores", subtitle: "Preparación y gestión de la inversión externa", color: INVESTOR_COLOR, soft: "var(--accent-soft)", onClick: onInversores },
  ];
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Área de trabajo">
      {areas.map((a) => {
        const isActive = a.key === active;
        return (
          <button
            key={a.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => !isActive && a.onClick?.()}
            className={`min-w-0 rounded-xl border-2 px-3 py-2 text-left transition-colors ${isActive ? "cursor-default" : "border-line bg-white hover:bg-[var(--surface-alt)]"}`}
            style={isActive ? { borderColor: a.color, background: a.soft } : undefined}
          >
            <span className="block text-sm font-extrabold leading-tight truncate" style={{ color: isActive ? a.color : "var(--ink)" }}>{a.title}</span>
            <span className="block text-[11px] leading-tight mt-0.5 text-ink-subtle truncate">{a.subtitle}</span>
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

/** Gastos y ventas se editan en Gestión del proyecto; aquí se consultan con los mismos resúmenes. */
function EditInGestion({ title, subtitle, onClick }: { title: string; subtitle: string; onClick?: () => void }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h3 className="text-sm font-extrabold text-ink">{title}</h3>
        <p className="text-[11px] text-ink-subtle mt-0.5">{subtitle}</p>
      </div>
      {onClick ? (
        <button type="button" onClick={onClick} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-brand hover:bg-[var(--brand-soft)]">
          Editar en Gestión del proyecto
        </button>
      ) : null}
    </div>
  );
}

export function TrackingModal({
  op,
  onPersist,
  onClose,
  onEditInGestion,
}: {
  op: REOperation;
  onPersist: (patch: Partial<REOperation>) => void;
  onClose: () => void;
  /** Abre Gestión del proyecto en la sección indicada (única fuente de gastos y ventas). */
  onEditInGestion?: (section: "gastos" | "ventas") => void;
}) {
  const [tab, setTab] = useState<TabKey>("inicio");
  const [quick, setQuickState] = useState<QuickKind | null>(null);
  const setQuick = useCallback(
    (kind: QuickKind | null) => {
      if (kind === "gasto" || kind === "venta") onEditInGestion?.(kind === "gasto" ? "gastos" : "ventas");
      else setQuickState(kind);
    },
    [onEditInGestion],
  );

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
      // Esc cierra primero el modal de entrada rápida / preview (gestionados aparte).
      if (e.key === "Escape" && !quick) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, quick]);

  // Entrada rápida de hitos → añade al MISMO array de la operación (JSON sync).
  const saveMilestone = useCallback(
    (m: REMilestone) => onPersist({ milestones: [...(op.milestones ?? []), m] }),
    [op.milestones, onPersist],
  );

  // Navegación desde el Inicio rápido a la pestaña avanzada correspondiente.
  const navigate = useCallback((target: TabKey) => setTab(target), []);

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
                  Inversores <span className="text-ink-subtle">· Preparación y gestión de la inversión externa</span>
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
            <AreaSwitch active="inversores" onGestion={onClose} />
            {/* Acciones rápidas: crear (primarias, abren entrada rápida) · ver (secundarias) */}
            <div className="flex flex-wrap items-center gap-2">
              <QuickAction label="+ Hito" onClick={() => setQuick("hito")} primary />
              <span className="mx-0.5 h-5 w-px bg-[var(--line)]" aria-hidden />
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
          {tab === "inicio" && (
            <InicioPanel op={op} onQuick={(k) => setQuick(k)} onNavigate={(target) => navigate(target)} />
          )}
          {tab === "resumen" && (
            <ResumenPanel
              op={op}
              results={results}
              now={now}
              onChangeProgress={(progress: REProgress) => onPersist({ progress })}
              onChangeMedia={(media: REMediaItem[]) => onPersist({ media })}
              onChangeManagement={(patch) => onPersist(patch)}
            />
          )}
          {tab === "economico" && (
            <section className="space-y-3">
              <EditInGestion title="Gastos" subtitle="Previsto y real por categoría. Son los datos de Gestión del proyecto." onClick={onEditInGestion ? () => onEditInGestion("gastos") : undefined} />
              <ProjectExpenses summary={expenseSummary} />
            </section>
          )}
          {tab === "ventas" && (
            <section className="space-y-3">
              <EditInGestion title="Ventas" subtitle="Unidades, fechas previstas y reales, y cobros. Son los datos de Gestión del proyecto." onClick={onEditInGestion ? () => onEditInGestion("ventas") : undefined} />
              <ProjectSales summary={salesSummary} />
            </section>
          )}
          {tab === "planificacion" && <HitosPanel op={op} onChange={(milestones: REMilestone[]) => onPersist({ milestones })} onQuickAdd={() => setQuick("hito")} />}
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

      {quick ? (
        <QuickEntryModal
          key={quick}
          onSaveMilestone={saveMilestone}
          onClose={() => setQuick(null)}
        />
      ) : null}

    </div>
  );
}

export default TrackingModal;

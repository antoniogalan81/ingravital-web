"use client";

// WORKSPACE de SEGUIMIENTO Y GESTIÓN de una operación (WEB) — rediseño UX.
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
  makeExpense,
  makeMilestone,
  makeSale,
  type REExpense,
  type REInvestorSplit,
  type REMediaItem,
  type REMilestone,
  type REProgress,
  type RESale,
  type REShareSettings,
} from "@/src/lib/realEstateTracking";
import { SummaryBar } from "./SummaryBar";
import { ResumenPanel } from "./ResumenPanel";
import { GastosPanel } from "./GastosPanel";
import { VentasPanel } from "./VentasPanel";
import { HitosPanel } from "./HitosPanel";
import { InversoresPanel } from "./InversoresPanel";
import { InformePanel } from "./InformePanel";
import { InvestorView } from "./InvestorView";

type TabKey = "resumen" | "economico" | "ventas" | "planificacion" | "inversores" | "informe";

const TABS: { key: TabKey; label: string }[] = [
  { key: "resumen", label: "Resumen" },
  { key: "economico", label: "Económico" },
  { key: "ventas", label: "Ventas" },
  { key: "planificacion", label: "Planificación" },
  { key: "inversores", label: "Inversores" },
  { key: "informe", label: "Informe" },
];

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

export function TrackingModal({
  op,
  onPersist,
  onClose,
}: {
  op: REOperation;
  onPersist: (patch: Partial<REOperation>) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("resumen");
  const [previewOpen, setPreviewOpen] = useState(false);

  const results = useMemo(() => calcResults(op), [op]);
  const now = useMemo(() => new Date().toISOString(), []);
  const generatedAt = useMemo(
    () => new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }),
    [],
  );

  // Escape para cerrar + bloqueo de scroll del fondo mientras el workspace está abierto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !previewOpen) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, previewOpen]);

  // Acciones rápidas: añaden fila y saltan a la pestaña correspondiente.
  const addGasto = useCallback(() => {
    onPersist({ expenses: [...(op.expenses ?? []), makeExpense()] });
    setTab("economico");
  }, [op.expenses, onPersist]);
  const addVenta = useCallback(() => {
    onPersist({ sales: [...(op.sales ?? []), makeSale()] });
    setTab("ventas");
  }, [op.sales, onPersist]);
  const addHito = useCallback(() => {
    onPersist({ milestones: [...(op.milestones ?? []), makeMilestone()] });
    setTab("planificacion");
  }, [op.milestones, onPersist]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col min-h-0">
        {/* Header + acciones rápidas */}
        <div className="flex flex-col gap-3 border-b border-line px-4 sm:px-6 py-3 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-bold text-ink-subtle">Seguimiento y gestión</p>
              <h2 className="text-xl font-extrabold text-ink tracking-tight truncate">{op.name || "Operación"}</h2>
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide font-bold text-ink-subtle mr-1">Acciones rápidas</span>
            <QuickAction label="+ Gasto" onClick={addGasto} primary />
            <QuickAction label="+ Venta" onClick={addVenta} primary />
            <QuickAction label="+ Hito" onClick={addHito} primary />
            <QuickAction label="Media" onClick={() => setTab("resumen")} />
            <QuickAction label="Vista inversor" onClick={() => setPreviewOpen(true)} />
            <QuickAction label="Informe" onClick={() => setTab("informe")} />
          </div>
        </div>

        {/* Barra-resumen persistente */}
        <div className="border-b border-line flex-shrink-0">
          <SummaryBar op={op} results={results} />
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto gap-1.5 px-4 sm:px-6 py-2 border-b border-line bg-white flex-shrink-0">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-3.5 py-1.5 text-sm font-semibold rounded-full whitespace-nowrap border transition-colors flex-shrink-0 ${
                  active ? "border-transparent text-white" : "border-line text-ink-muted hover:text-brand hover:border-brand hover:bg-[var(--brand-soft)]"
                }`}
                style={active ? { background: "var(--brand)" } : undefined}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 bg-[var(--surface-alt)]">
          {tab === "resumen" && (
            <ResumenPanel
              op={op}
              results={results}
              now={now}
              onChangeProgress={(progress: REProgress) => onPersist({ progress })}
              onChangeMedia={(media: REMediaItem[]) => onPersist({ media })}
            />
          )}
          {tab === "economico" && <GastosPanel op={op} onChange={(expenses: REExpense[]) => onPersist({ expenses })} />}
          {tab === "ventas" && <VentasPanel op={op} results={results} onChange={(sales: RESale[]) => onPersist({ sales })} />}
          {tab === "planificacion" && <HitosPanel op={op} onChange={(milestones: REMilestone[]) => onPersist({ milestones })} />}
          {tab === "inversores" && (
            <InversoresPanel
              op={op}
              results={results}
              onChangeSplit={(investorSplit: REInvestorSplit) => onPersist({ investorSplit })}
              onChangeShare={(share: REShareSettings) => onPersist({ share })}
              onPreview={() => setPreviewOpen(true)}
            />
          )}
          {tab === "informe" && <InformePanel op={op} generatedAt={generatedAt} onPreviewInvestor={() => setPreviewOpen(true)} />}
        </div>
      </div>

      {previewOpen ? <InvestorView op={op} results={results} now={now} onClose={() => setPreviewOpen(false)} /> : null}
    </div>
  );
}

export default TrackingModal;

"use client";

// INICIO RÁPIDO — capa guía SOBRE el módulo de seguimiento (no lo sustituye).
// Muestra el estado de completitud, un checklist real de "qué falta" (solo con
// datos reales de la operación) y acciones rápidas agrupadas con botones grandes.
// Toda acción delega en los callbacks del TrackingModal: abre entrada rápida o
// navega a la pestaña avanzada correspondiente. No calcula nada que no sea real.

import type { REOperation } from "@/src/lib/realEstate";
import { ProgressBar } from "@/src/components/ui/ProgressBar";
import type { QuickKind } from "./QuickEntryModal";

export type InicioNavTarget = "resumen" | "economico" | "ventas" | "planificacion" | "inversores" | "informe";

type ChecklistItem = {
  key: string;
  done: boolean;
  label: string;
  hint: string;
  actionLabel: string;
  onAction: () => void;
};

export function InicioPanel({
  op,
  onQuick,
  onNavigate,
}: {
  op: REOperation;
  onQuick: (kind: QuickKind) => void;
  onNavigate: (target: InicioNavTarget) => void;
}) {
  const expenses = Array.isArray(op.expenses) ? op.expenses : [];
  const sales = Array.isArray(op.sales) ? op.sales : [];
  const milestones = Array.isArray(op.milestones) ? op.milestones : [];
  const media = Array.isArray(op.media) ? op.media : [];
  const progress = op.progress ?? {};
  const split = op.investorSplit ?? {};

  const hasProgress =
    progress.obraPct != null || progress.licenciasPct != null || !!progress.startDate || !!progress.endDateEstimated;
  const hasInvestor = split.investorCapital != null || split.investorSharePct != null;

  const items: ChecklistItem[] = [
    {
      key: "gastos",
      done: expenses.length > 0,
      label: "Registrar gastos",
      hint: "Añade el primer gasto para comparar estimado vs real.",
      actionLabel: "Añadir gasto",
      onAction: () => onQuick("gasto"),
    },
    {
      key: "ventas",
      done: sales.length > 0,
      label: "Definir ventas o unidades",
      hint: "Registra las unidades y su estado comercial para seguir los ingresos.",
      actionLabel: "Añadir venta",
      onAction: () => onQuick("venta"),
    },
    {
      key: "hitos",
      done: milestones.length > 0,
      label: "Planificar hitos",
      hint: "Marca las fechas clave (licencias, obra, entrega) y detecta desviaciones.",
      actionLabel: "Añadir hito",
      onAction: () => onQuick("hito"),
    },
    {
      key: "progreso",
      done: hasProgress,
      label: "Indicar avance y plazos",
      hint: "Añade el % de obra y las fechas de inicio y fin estimado.",
      actionLabel: "Abrir Resumen",
      onAction: () => onNavigate("resumen"),
    },
    {
      key: "media",
      done: media.length > 0,
      label: "Subir fotos o vídeos",
      hint: "Documenta el estado visual y la evolución de la operación.",
      actionLabel: "Subir media",
      onAction: () => onNavigate("resumen"),
    },
    {
      key: "inversor",
      done: hasInvestor,
      label: "Configurar reparto con inversores",
      hint: "Define capital y % para separar la rentabilidad del promotor y del inversor.",
      actionLabel: "Configurar",
      onAction: () => onNavigate("inversores"),
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = total > 0 ? doneCount / total : 0;
  const pending = items.filter((i) => !i.done);

  return (
    <div className="space-y-5">
      {/* Completitud */}
      <div className="re-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Estado del seguimiento</p>
            <h3 className="text-2xl font-extrabold text-ink tracking-tight mt-1">
              {doneCount} de {total} bloques con datos
            </h3>
            <p className="text-sm text-ink-muted mt-1">
              {pending.length === 0
                ? "Seguimiento completo. Mantén los datos al día conforme avance la operación."
                : "Completa los bloques pendientes para tener el control estimado vs real."}
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="kpi-hero" style={{ color: "var(--brand)" }}>{Math.round(pct * 100)}%</span>
          </div>
        </div>
        <div className="mt-4">
          <ProgressBar label="" value={pct} tone={pct >= 1 ? "positive" : "brand"} />
        </div>
      </div>

      {/* Qué falta */}
      <div className="re-card p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Qué falta</p>
        {pending.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--positive-soft)" }}>
            <svg className="w-4 h-4 shrink-0" style={{ color: "var(--positive)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium" style={{ color: "var(--positive)" }}>Todos los bloques tienen datos.</span>
          </div>
        ) : (
          <ul className="space-y-2">
            {pending.map((it) => (
              <li key={it.key} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{it.label}</p>
                  <p className="text-xs text-ink-subtle mt-0.5">{it.hint}</p>
                </div>
                <button
                  type="button"
                  onClick={it.onAction}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap transition-colors shrink-0"
                  style={{ background: "var(--brand)" }}
                >
                  {it.actionLabel}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Acciones rápidas agrupadas */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Registrar datos</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <BigAction icon="💶" title="Añadir gasto" hint="Concepto, importe, estado" onClick={() => onQuick("gasto")} />
          <BigAction icon="🏷️" title="Añadir venta" hint="Unidad, precio, comprador" onClick={() => onQuick("venta")} />
          <BigAction icon="📌" title="Añadir hito" hint="Fecha prevista y real" onClick={() => onQuick("hito")} />
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Documentar y compartir</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <BigAction icon="📄" title="Subir factura" hint="Adjunta facturas a los gastos" onClick={() => onNavigate("economico")} />
          <BigAction icon="📷" title="Subir foto / vídeo" hint="Estado visual y evolución" onClick={() => onNavigate("resumen")} />
          <BigAction icon="🤝" title="Configurar inversor" hint="Reparto y compartición" onClick={() => onNavigate("inversores")} />
          <BigAction icon="📊" title="Generar informe" hint="Resumen para inversores" onClick={() => onNavigate("informe")} />
        </div>
      </div>

      {/* Acceso a la vista avanzada */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
        <p className="text-sm text-ink-muted">¿Prefieres el detalle completo? Abre el panel avanzado.</p>
        <button
          type="button"
          onClick={() => onNavigate("resumen")}
          className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-ink hover:bg-[var(--surface-alt)] transition-colors whitespace-nowrap"
        >
          Vista avanzada
        </button>
      </div>
    </div>
  );
}

function BigAction({ icon, title, hint, onClick }: { icon: string; title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="re-card re-card-interactive text-left flex items-start gap-3 p-4">
      <span className="text-2xl leading-none shrink-0" aria-hidden>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-ink tracking-tight">{title}</span>
        <span className="block text-xs text-ink-subtle mt-0.5">{hint}</span>
      </span>
    </button>
  );
}

export default InicioPanel;

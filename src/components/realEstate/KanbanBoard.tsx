"use client";

// Vista KANBAN de operaciones por etapa del pipeline. Columnas en el orden del
// embudo (Comprado → Captación). Arrastre HTML5 nativo entre columnas para cambiar
// `pipelineStage` (persiste vía onChangeStage del contenedor). Sin dependencias.
//
// Cada tarjeta es un REPRESENTANTE (operación suelta o principal de un grupo de
// variantes). Cambiar la etapa de un grupo la aplica a TODO el grupo (lo gestiona
// el contenedor) para no partir el mismo negocio entre columnas.

import { useMemo, useState } from "react";
import type { REOperation } from "@/src/lib/realEstate";
import { calcResults, fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";
import { PIPELINE_STAGES, stageOf, type PipelineStage } from "@/src/lib/pipeline";
import { priorityDef, temperatureDef } from "@/src/lib/management";
import { computeOpAlerts, sortAlerts, ALERT_COLOR } from "@/src/lib/alerts";

function DueChip({ due }: { due: string }) {
  return <span className="text-[10px] tabular-nums text-ink-subtle">{due}</span>;
}

function KanbanCard({
  op,
  now,
  onOpen,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  op: REOperation;
  now: string;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const res = useMemo(() => calcResults(op), [op]);
  const alerts = sortAlerts(computeOpAlerts(op, now)).slice(0, 2);
  const prio = priorityDef(op.priority);
  const temp = temperatureDef(op.temperature);
  const heroIsYield = res.totalSales > 0;

  const dueDays = op.nextActionDueDate ? Math.round((Date.parse(op.nextActionDueDate) - Date.parse(now.slice(0, 10))) / 86_400_000) : null;
  const dueLabel =
    dueDays == null ? null : dueDays < 0 ? `vencida (${Math.abs(dueDays)}d)` : dueDays === 0 ? "hoy" : `en ${dueDays}d`;
  const dueColor = dueDays == null ? undefined : dueDays < 0 ? "var(--negative)" : dueDays <= 7 ? "var(--warning)" : "var(--ink-subtle)";

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", op.id); e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      aria-label={`Abrir operación ${op.name || "sin nombre"}`}
      className={`re-card p-3 cursor-grab active:cursor-grabbing hover:border-[var(--line-strong)] transition-colors ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-ink leading-tight truncate">{op.name || "Operación"}</p>
        {op.variantGroupId ? <span className="pill pill-neutral shrink-0">var.</span> : null}
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide font-bold text-ink-subtle">{heroIsYield ? "Rentab. venta" : "Inversión"}</p>
          <p className="text-lg font-extrabold tabular-nums tracking-tight leading-none" style={{ color: heroIsYield ? (res.saleYield >= 0 ? "var(--positive)" : "var(--negative)") : "var(--ink)" }}>
            {heroIsYield ? fmtPct(res.saleYield) : fmtEUR(res.totalInvestment)}
          </p>
        </div>
        <p className="text-[11px] tabular-nums text-ink-subtle text-right">{fmtEUR(res.totalInvestment)}</p>
      </div>

      {(prio || temp) ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {prio ? <span className="pill" style={{ background: prio.soft, color: prio.color }}>{prio.label}</span> : null}
          {temp ? <span className="pill" style={{ background: temp.soft, color: temp.color }}>{temp.icon} {temp.label}</span> : null}
          {typeof op.probability === "number" ? <span className="text-[10px] tabular-nums text-ink-subtle">{Math.round(op.probability)}%</span> : null}
        </div>
      ) : null}

      {op.nextActionText && op.nextActionText.trim() ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-ink-muted truncate">→ {op.nextActionText}</span>
          {dueLabel ? <span className="shrink-0 text-[10px] font-semibold tabular-nums" style={{ color: dueColor }}>{dueLabel}</span> : <DueChip due="" />}
        </div>
      ) : null}

      {alerts.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {alerts.map((a) => (
            <span key={a.key} className="pill" style={{ background: ALERT_COLOR[a.severity].soft, color: ALERT_COLOR[a.severity].color }}>{a.text}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function KanbanBoard({
  deals,
  now,
  onChangeStage,
  onOpen,
}: {
  deals: REOperation[];
  now: string;
  onChangeStage: (op: REOperation, stage: PipelineStage) => void;
  onOpen: (op: REOperation) => void;
}) {
  const [overCol, setOverCol] = useState<PipelineStage | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const map = {} as Record<PipelineStage, REOperation[]>;
    for (const s of PIPELINE_STAGES) map[s.key] = [];
    for (const op of deals) map[stageOf(op)].push(op);
    return map;
  }, [deals]);

  const handleDrop = (stage: PipelineStage) => (e: React.DragEvent) => {
    e.preventDefault();
    setOverCol(null);
    const id = e.dataTransfer.getData("text/plain");
    const op = deals.find((d) => d.id === id);
    if (op && stageOf(op) !== stage) onChangeStage(op, stage);
    setDraggingId(null);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {PIPELINE_STAGES.map((s) => {
        const items = byStage[s.key];
        const inv = items.reduce((sum, op) => sum + calcResults(op).totalInvestment, 0);
        const ben = items.reduce((sum, op) => sum + calcResults(op).saleBenefit, 0);
        const isOver = overCol === s.key;
        return (
          <div
            key={s.key}
            onDragOver={(e) => { e.preventDefault(); setOverCol(s.key); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol((c) => (c === s.key ? null : c)); }}
            onDrop={handleDrop(s.key)}
            className={`flex-shrink-0 w-[17rem] rounded-[var(--radius-lg)] border p-2.5 transition-colors ${isOver ? "border-brand bg-[var(--brand-soft)]" : "border-line bg-[var(--surface-alt)]"}`}
          >
            {/* Cabecera de columna */}
            <div className="px-1 pb-2.5" style={{ borderBottom: `2px solid ${s.color}` }}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-ink">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.short}
                </span>
                <span className="pill pill-neutral tabular-nums">{items.length}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums">
                <span className="text-ink-subtle">Inv. {items.length ? fmtEUR(inv) : "—"}</span>
                <span style={{ color: items.length ? (ben >= 0 ? "var(--positive)" : "var(--negative)") : "var(--ink-subtle)" }}>
                  Ben. {items.length ? fmtEUR(ben) : "—"}
                </span>
              </div>
            </div>

            {/* Tarjetas */}
            <div className="mt-2.5 space-y-2 min-h-[3rem]">
              {items.length === 0 ? (
                <p className="text-[11px] text-ink-subtle text-center py-4">Suelta aquí para mover a {s.short}</p>
              ) : (
                items.map((op) => (
                  <KanbanCard
                    key={op.id}
                    op={op}
                    now={now}
                    onOpen={() => onOpen(op)}
                    onDragStart={() => setDraggingId(op.id)}
                    onDragEnd={() => { setDraggingId(null); setOverCol(null); }}
                    dragging={draggingId === op.id}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default KanbanBoard;

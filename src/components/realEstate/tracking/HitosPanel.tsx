"use client";

// Panel HITOS y tiempos. Cada hito: estado, fecha prevista, fecha real y
// desviación (días) calculada. Plantillas base de una promoción. Persiste `milestones`.

import { useMemo } from "react";
import type { REOperation } from "@/src/lib/realEstate";
import {
  RE_MILESTONE_STATUS_LABEL,
  RE_MILESTONE_STATUSES,
  RE_MILESTONE_TEMPLATES,
  makeMilestone,
  type REMilestone,
  type REMilestoneStatus,
} from "@/src/lib/realEstateTracking";
import {
  DataTable,
  TextCellInput,
  SelectCellInput,
  DateCellInput,
  NumberCellInput,
  type DataTableColumn,
} from "@/src/components/ui/DataTable";
import { ProgressBar } from "@/src/components/ui/ProgressBar";

const STATUS_OPTS = RE_MILESTONE_STATUSES.map((s) => ({ value: s, label: RE_MILESTONE_STATUS_LABEL[s] }));

const MS_STYLE: Record<REMilestoneStatus, { color: string; soft: string }> = {
  PENDIENTE: { color: "var(--ink-subtle)", soft: "#f1f4f8" },
  EN_CURSO: { color: "var(--brand)", soft: "var(--brand-soft)" },
  COMPLETADO: { color: "var(--positive)", soft: "var(--positive-soft)" },
  DESVIADO: { color: "var(--negative)", soft: "var(--negative-soft)" },
};

function daysDeviation(due?: string, real?: string): number | null {
  if (!due || !real) return null;
  const a = Date.parse(due);
  const b = Date.parse(real);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export function HitosPanel({
  op,
  onChange,
}: {
  op: REOperation;
  onChange: (milestones: REMilestone[]) => void;
}) {
  const milestones = useMemo(() => (Array.isArray(op.milestones) ? op.milestones : []), [op.milestones]);

  const completedPct = milestones.length
    ? milestones.filter((m) => m.status === "COMPLETADO").length / milestones.length
    : null;

  const update = (id: string, patch: Partial<REMilestone>) =>
    onChange(milestones.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m)));

  const add = (title: string) => onChange([...milestones, makeMilestone(title)]);

  const remove = (row: REMilestone) => onChange(milestones.filter((m) => m.id !== row.id));

  const usedTitles = new Set(milestones.map((m) => m.title.trim().toLowerCase()));
  const availableTemplates = RE_MILESTONE_TEMPLATES.filter((t) => !usedTitles.has(t.toLowerCase()));

  const columns: DataTableColumn<REMilestone>[] = [
    {
      key: "title",
      header: "Hito",
      width: "12rem",
      cell: (r) => <TextCellInput value={r.title} placeholder="Nombre del hito" onChange={(v) => update(r.id, { title: v })} />,
    },
    {
      key: "status",
      header: "Estado",
      width: "9rem",
      cell: (r) => (
        <SelectCellInput<REMilestoneStatus> value={r.status} options={STATUS_OPTS} onChange={(v) => update(r.id, { status: v })} />
      ),
    },
    {
      key: "dueDate",
      header: "Prevista",
      width: "9rem",
      cell: (r) => <DateCellInput value={r.dueDate} onChange={(v) => update(r.id, { dueDate: v })} />,
    },
    {
      key: "realDate",
      header: "Real",
      width: "9rem",
      cell: (r) => <DateCellInput value={r.realDate} onChange={(v) => update(r.id, { realDate: v })} />,
    },
    {
      key: "deviation",
      header: "Desviación",
      width: "8rem",
      align: "right",
      cell: (r) => {
        const dev = daysDeviation(r.dueDate, r.realDate);
        if (dev == null) return <span className="text-ink-subtle">—</span>;
        const label = dev === 0 ? "En fecha" : dev > 0 ? `+${dev} d` : `${dev} d`;
        return (
          <span className="tabular-nums font-semibold" style={{ color: dev <= 0 ? "var(--positive)" : "var(--negative)" }}>
            {label}
          </span>
        );
      },
    },
    {
      key: "amountPending",
      header: "Pago pend.",
      width: "8rem",
      align: "right",
      cell: (r) => <NumberCellInput value={r.amountPending} onChange={(v) => update(r.id, { amountPending: v })} />,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="re-card p-4">
        <ProgressBar
          label="Hitos completados"
          value={completedPct}
          tone="positive"
          sublabel={
            milestones.length
              ? `${milestones.filter((m) => m.status === "COMPLETADO").length}/${milestones.length} completados`
              : "Añade hitos para seguir el avance"
          }
        />
      </div>

      {/* Cronología (timeline ligero, solo lectura) */}
      {milestones.length > 0 ? (
        <div className="re-card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle mb-3">Cronología</p>
          <ol className="relative ml-1 border-l border-line space-y-4">
            {milestones.map((m) => {
              const dev = daysDeviation(m.dueDate, m.realDate);
              const st = MS_STYLE[m.status];
              return (
                <li key={m.id} className="relative pl-5">
                  <span className="absolute -left-[6.5px] top-1 h-3 w-3 rounded-full border-2 border-white" style={{ background: st.color }} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink truncate">{m.title || "Hito"}</span>
                    <span className="pill" style={{ background: st.soft, color: st.color }}>{RE_MILESTONE_STATUS_LABEL[m.status]}</span>
                  </div>
                  <div className="text-xs text-ink-subtle mt-0.5">
                    {m.dueDate ? `Prev. ${m.dueDate}` : "Sin fecha prevista"}
                    {m.realDate ? ` · Real ${m.realDate}` : ""}
                    {dev != null ? (
                      <span style={{ color: dev <= 0 ? "var(--positive)" : "var(--negative)" }}>
                        {" · "}
                        {dev === 0 ? "En fecha" : dev > 0 ? `+${dev} d` : `${dev} d`}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={milestones}
        getRowId={(r) => r.id}
        onAddRow={() => add("")}
        addLabel="Añadir hito"
        onDeleteRow={remove}
        emptyText="Sin hitos. Usa las plantillas o añade uno."
      />

      {availableTemplates.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-subtle">Plantillas:</span>
          {availableTemplates.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => add(t)}
              className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-muted hover:text-brand hover:border-brand hover:bg-[var(--brand-soft)] transition-colors"
            >
              + {t}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default HitosPanel;

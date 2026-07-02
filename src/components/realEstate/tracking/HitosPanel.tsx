"use client";

// Panel HITOS y tiempos. Cada hito: estado, fecha prevista, fecha real y
// desviación (días) calculada. Plantillas base de una promoción. Persiste `milestones`.

import { useMemo } from "react";
import type { REOperation } from "@/src/lib/realEstate";
import {
  RE_MILESTONE_STATUS_LABEL,
  RE_MILESTONE_STATUSES,
  RE_MILESTONE_TEMPLATES,
  newTrackingId,
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

  const add = (title: string) => {
    const nowIso = new Date().toISOString();
    const row: REMilestone = {
      id: newTrackingId("ms"),
      title,
      status: "PENDIENTE",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    onChange([...milestones, row]);
  };

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

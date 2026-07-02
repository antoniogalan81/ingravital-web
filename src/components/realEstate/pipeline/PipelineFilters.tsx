"use client";

// Filtros de etapa tipo chips, con contador por etapa y opción de limpiar.
// "Sin clasificar" solo aparece si hay operaciones sin etapa (no se inventa).

import { PIPELINE_STAGES, UNCLASSIFIED_DEF, type StageFilter } from "@/src/lib/pipeline";

export type StageCounts = Record<string, number>; // claves: "all" | "none" | PipelineStage

export function PipelineFilters({
  counts,
  active,
  onChange,
}: {
  counts: StageCounts;
  active: StageFilter;
  onChange: (f: StageFilter) => void;
}) {
  const chips: { key: StageFilter; label: string; color?: string; soft?: string }[] = [
    { key: "all", label: "Todas" },
    ...PIPELINE_STAGES.map((s) => ({ key: s.key as StageFilter, label: s.short, color: s.color, soft: s.soft })),
  ];
  if ((counts.none ?? 0) > 0) {
    chips.push({ key: "none", label: UNCLASSIFIED_DEF.short, color: UNCLASSIFIED_DEF.color, soft: UNCLASSIFIED_DEF.soft });
  }

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {chips.map((c) => {
        const isActive = c.key === active;
        const count = counts[c.key] ?? 0;
        const activeStyle =
          c.key === "all"
            ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }
            : { background: c.soft, color: c.color, borderColor: c.color };
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0"
            style={isActive ? activeStyle : { borderColor: "var(--line)", color: "var(--ink-muted)", background: "#fff" }}
          >
            {c.color && c.key !== "all" ? (
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
            ) : null}
            {c.label}
            <span className="tabular-nums opacity-70">{count}</span>
          </button>
        );
      })}
      {active !== "all" ? (
        <button
          type="button"
          onClick={() => onChange("all")}
          className="ml-1 text-xs font-semibold text-ink-subtle hover:text-ink whitespace-nowrap flex-shrink-0"
        >
          Limpiar
        </button>
      ) : null}
    </div>
  );
}

export default PipelineFilters;

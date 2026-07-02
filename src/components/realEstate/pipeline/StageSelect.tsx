"use client";

// Selector rápido de etapa: badge pulsable → dropdown con las etapas → guarda.
// Sin modal. `data-no-drag` + stopPropagation para no disparar abrir/arrastrar la
// tarjeta o fila que lo contiene.

import { useState } from "react";
import { PIPELINE_STAGES, stageDef, type PipelineStage } from "@/src/lib/pipeline";

export function StageSelect({
  stage,
  onChange,
  align = "left",
}: {
  stage: PipelineStage;
  onChange: (stage: PipelineStage) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const def = stageDef(stage);

  return (
    <span className="relative inline-block" data-no-drag onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Cambiar etapa"
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-80"
        style={{ background: def.soft, color: def.color }}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: def.color }} />
        {def.short}
        <span className="text-[9px] opacity-70">▾</span>
      </button>

      {open ? (
        <>
          <span className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <span
            className={`absolute top-full z-50 mt-1 block w-52 rounded-xl border border-line bg-white p-1 shadow-lg ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {PIPELINE_STAGES.map((s) => {
              const active = s.key === stage;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!active) onChange(s.key);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-alt)] ${
                    active ? "font-bold" : "font-medium text-ink"
                  }`}
                >
                  <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="flex-1 truncate">{s.label}</span>
                  {active ? <span style={{ color: s.color }}>✓</span> : null}
                </button>
              );
            })}
          </span>
        </>
      ) : null}
    </span>
  );
}

export default StageSelect;

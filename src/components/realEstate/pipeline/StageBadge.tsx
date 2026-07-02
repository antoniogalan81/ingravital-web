"use client";

// Badge de etapa (solo presentación). Usa color/soft de la definición de etapa.

import { stageDef, type PipelineStage } from "@/src/lib/pipeline";

export function StageBadge({
  stage,
  className = "",
}: {
  stage: PipelineStage | null;
  className?: string;
}) {
  const def = stageDef(stage);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${className}`}
      style={{ background: def.soft, color: def.color }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: def.color }} />
      {def.short}
    </span>
  );
}

export default StageBadge;

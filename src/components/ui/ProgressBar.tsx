"use client";

// Barra de progreso reutilizable. `value` es 0..1. Si es null → "no disponible"
// (nunca inventa un 0 como si fuera dato real).

type Tone = "brand" | "positive" | "warning" | "negative" | "neutral";

const TONE_VAR: Record<Tone, string> = {
  brand: "var(--brand)",
  positive: "var(--positive)",
  warning: "var(--warning, #b45309)",
  negative: "var(--negative)",
  neutral: "var(--ink-subtle)",
};

export function ProgressBar({
  label,
  value,
  tone = "brand",
  sublabel,
}: {
  label: string;
  value: number | null;
  tone?: Tone;
  sublabel?: string;
}) {
  const pct = value == null ? null : Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-muted">{label}</span>
        <span className="text-xs font-bold tabular-nums text-ink">
          {pct == null ? "—" : `${pct}%`}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-[var(--surface-alt)] overflow-hidden border border-line">
        {pct == null ? null : (
          <div
            className="bar-anim h-full rounded-full transition-[width] duration-500"
            style={{ width: `${pct}%`, background: TONE_VAR[tone] }}
          />
        )}
      </div>
      {sublabel ? <span className="text-[11px] text-ink-subtle">{sublabel}</span> : null}
    </div>
  );
}

export default ProgressBar;

"use client";

// KPI / estadística reutilizable. El valor ya viene formateado por el llamante
// (fmtEUR/fmtPct) o como "—" cuando no es calculable.

type Tone = "default" | "positive" | "negative" | "accent";

const COLOR: Record<Tone, string> = {
  default: "var(--ink)",
  positive: "var(--positive)",
  negative: "var(--negative)",
  accent: "var(--brand)",
};

export function StatTile({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: string;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-[var(--surface-alt)] p-3">
      <p className="text-[10px] uppercase tracking-wide font-bold text-ink-subtle">{label}</p>
      <p className="text-base font-extrabold tabular-nums mt-0.5" style={{ color: COLOR[tone] }}>
        {value}
      </p>
      {hint ? <p className="text-[11px] text-ink-subtle mt-0.5">{hint}</p> : null}
    </div>
  );
}

export default StatTile;

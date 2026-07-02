"use client";

// Alternador de vista: tarjetas / tabla. Segmentado, compacto.

export type ViewMode = "kanban" | "cards" | "table";

export function ViewModeToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const opts: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    {
      key: "kanban",
      label: "Kanban",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="11" rx="1.5" /><rect x="17" y="4" width="4" height="7" rx="1.5" />
        </svg>
      ),
    },
    {
      key: "cards",
      label: "Tarjetas",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      ),
    },
    {
      key: "table",
      label: "Tabla",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" />
        </svg>
      ),
    },
  ];
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
      {opts.map((o) => {
        const active = o.key === mode;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            title={o.label}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              active ? "text-white" : "text-ink-muted hover:text-ink"
            }`}
            style={active ? { background: "var(--brand)" } : undefined}
          >
            {o.icon}
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default ViewModeToggle;

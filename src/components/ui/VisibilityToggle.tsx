"use client";

// Toggle de visibilidad granular reutilizable (usado en el panel de Compartir).
// `sensitive` marca los datos financieros que van OCULTOS por defecto.

export function VisibilityToggle({
  label,
  visible,
  onChange,
  sensitive = false,
  disabled = false,
}: {
  label: string;
  visible: boolean;
  onChange: (visible: boolean) => void;
  sensitive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={visible}
      disabled={disabled}
      onClick={() => onChange(!visible)}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-left transition-colors ${
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-[var(--surface-alt)]"
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-ink truncate">{label}</span>
        {sensitive ? <span className="pill pill-warning shrink-0">Sensible</span> : null}
      </span>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          visible ? "bg-[var(--brand)]" : "bg-slate-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            visible ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export default VisibilityToggle;

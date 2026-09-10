"use client";

// Qué ve el inversor. A diferencia del sistema anterior, aquí NO hay que republicar:
// la BD aplica esta configuración en el momento en que el inversor lee, así que
// apagar un interruptor le retira el dato (y el archivo asociado) de inmediato.

import { useMemo } from "react";
import { VISIBILITY_DEFS, type VisibilityKey, type VisibilityMap } from "@/src/lib/investorPlatform/types";

function Toggle({
  label,
  sensitive,
  checked,
  onChange,
}: {
  label: string;
  sensitive: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer group">
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-ink truncate group-hover:text-ink">{label}</span>
        {sensitive ? (
          <span className="pill pill-warning shrink-0 !text-[10px] !px-1.5 !py-0.5">Sensible</span>
        ) : null}
      </span>
      <span className="relative shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="block h-5 w-9 rounded-full bg-[var(--line-strong)] transition-colors peer-checked:bg-[var(--brand)] peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/40"
        />
        <span
          aria-hidden
          className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4"
        />
      </span>
    </label>
  );
}

export function VisibilityPanel({
  visibility,
  onChange,
  title = "Qué puede ver el inversor",
  description,
}: {
  visibility: VisibilityMap;
  onChange: (next: VisibilityMap) => void;
  title?: string;
  description?: string;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, typeof VISIBILITY_DEFS>();
    for (const def of VISIBILITY_DEFS) {
      const arr = map.get(def.group) ?? [];
      arr.push(def);
      map.set(def.group, arr);
    }
    return Array.from(map.entries());
  }, []);

  const set = (key: VisibilityKey, value: boolean) => onChange({ ...visibility, [key]: value });
  const visibleCount = VISIBILITY_DEFS.filter((d) => visibility[d.key] === true).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">{title}</p>
          <p className="text-[11px] text-ink-subtle mt-0.5">
            {description ??
              `${visibleCount} de ${VISIBILITY_DEFS.length} datos visibles. Los cambios se aplican al instante.`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              onChange(
                Object.fromEntries(VISIBILITY_DEFS.map((d) => [d.key, !d.sensitive])) as VisibilityMap,
              )
            }
            className="text-xs font-semibold text-brand hover:underline"
          >
            Solo lo no sensible
          </button>
          <button
            type="button"
            onClick={() => onChange(Object.fromEntries(VISIBILITY_DEFS.map((d) => [d.key, false])) as VisibilityMap)}
            className="text-xs font-semibold text-ink-muted hover:text-ink"
          >
            Ocultar todo
          </button>
        </div>
      </div>

      {groups.map(([group, defs]) => (
        <div key={group} className="re-card p-4">
          <p className="text-xs font-bold text-ink mb-1.5">{group}</p>
          <div className="divide-y divide-[var(--line)]">
            {defs.map((def) => (
              <Toggle
                key={def.key}
                label={def.label}
                sensitive={def.sensitive}
                checked={visibility[def.key] === true}
                onChange={(v) => set(def.key, v)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default VisibilityPanel;

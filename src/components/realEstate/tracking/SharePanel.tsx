"use client";

// Panel COMPARTIR. Activa la compartición, gestiona destinatarios (se guardan en la
// operación) y controla la visibilidad granular. Los datos SENSIBLES van ocultos por
// defecto. Botón para previsualizar la vista inversor.
//
// NOTA: el acceso real de un inversor como SEGUNDO USUARIO (login propio viendo la
// operación en solo lectura) requiere una tabla `shares` + RLS cross-user, que NO
// existe todavía → queda documentado como pendiente. Aquí se configuran permisos y
// se previsualiza; el enlace real de inversor no se activa sin ese backend.

import { useMemo } from "react";
import type { REOperation } from "@/src/lib/realEstate";
import {
  RE_VISIBILITY_DEFS,
  defaultShareSettings,
  newTrackingId,
  type REShareRecipient,
  type REShareSettings,
  type REVisibilityKey,
} from "@/src/lib/realEstateTracking";
import { VisibilityToggle } from "@/src/components/ui/VisibilityToggle";

export function SharePanel({
  op,
  onChange,
  onPreview,
}: {
  op: REOperation;
  onChange: (share: REShareSettings) => void;
  onPreview: () => void;
}) {
  const share = useMemo(() => op.share ?? defaultShareSettings(), [op.share]);
  const recipients = share.recipients ?? [];

  const setVisible = (key: REVisibilityKey, visible: boolean) =>
    onChange({ ...share, visibility: { ...share.visibility, [key]: visible } });

  const setEnabled = (enabled: boolean) => onChange({ ...share, enabled });

  const addRecipient = () =>
    onChange({
      ...share,
      recipients: [...recipients, { id: newTrackingId("rcp"), name: "", email: "" }],
    });

  const updateRecipient = (id: string, patch: Partial<REShareRecipient>) =>
    onChange({ ...share, recipients: recipients.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const removeRecipient = (id: string) =>
    onChange({ ...share, recipients: recipients.filter((r) => r.id !== id) });

  const visibleCount = Object.values(share.visibility).filter(Boolean).length;

  // Agrupar defs por `group` conservando el orden.
  const groups = useMemo(() => {
    const map = new Map<string, typeof RE_VISIBILITY_DEFS>();
    for (const def of RE_VISIBILITY_DEFS) {
      const arr = map.get(def.group) ?? [];
      arr.push(def);
      map.set(def.group, arr);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <div className="space-y-5">
      {/* Activar + previsualizar */}
      <div className="re-card p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">Compartir con inversores</p>
          <p className="text-xs text-ink-muted mt-0.5">
            {share.enabled ? "Activada" : "Desactivada"} · {visibleCount} datos visibles
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onPreview}
            className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-[var(--surface-alt)] transition-colors"
          >
            Previsualizar
          </button>
          <button
            type="button"
            onClick={() => setEnabled(!share.enabled)}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors"
            style={{ background: share.enabled ? "var(--negative)" : "var(--brand)" }}
          >
            {share.enabled ? "Desactivar" : "Activar"}
          </button>
        </div>
      </div>

      {/* Destinatarios */}
      <div className="re-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Personas autorizadas</p>
          <button type="button" onClick={addRecipient} className="text-sm font-semibold text-brand hover:underline">
            + Añadir
          </button>
        </div>
        {recipients.length === 0 ? (
          <p className="text-sm text-ink-subtle">Sin destinatarios. Añade a quién quieres dar acceso.</p>
        ) : (
          <div className="space-y-2">
            {recipients.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={r.name}
                  onChange={(e) => updateRecipient(r.id, { name: e.target.value })}
                  placeholder="Nombre"
                  className="flex-1 rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
                <input
                  type="email"
                  value={r.email ?? ""}
                  onChange={(e) => updateRecipient(r.id, { email: e.target.value })}
                  placeholder="email@ejemplo.com"
                  className="flex-1 rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={() => removeRecipient(r.id)}
                  className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                  title="Quitar"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-ink-subtle">
          El acceso real del inversor con su propio usuario (solo lectura) requiere backend de compartición
          (tabla <code>shares</code> + RLS) — pendiente. Aquí defines permisos y previsualizas.
        </p>
      </div>

      {/* Visibilidad granular */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Visibilidad para el inversor</p>
        {groups.map(([group, defs]) => (
          <div key={group} className="re-card p-4 space-y-2">
            <p className="text-xs font-bold text-ink">{group}</p>
            <div className="space-y-1.5">
              {defs.map((def) => (
                <VisibilityToggle
                  key={def.key}
                  label={def.label}
                  sensitive={def.sensitive}
                  visible={share.visibility[def.key] === true}
                  onChange={(v) => setVisible(def.key, v)}
                />
              ))}
            </div>
          </div>
        ))}
        <p className="text-[11px] text-ink-subtle">
          Los datos marcados como <b>sensibles</b> están ocultos por defecto. Actívalos solo si quieres que el inversor los vea.
        </p>
      </div>
    </div>
  );
}

export default SharePanel;

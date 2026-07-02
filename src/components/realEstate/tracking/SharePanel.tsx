"use client";

// Panel COMPARTIR — real. Controla la visibilidad granular (sensibles ocultos por
// defecto) y gestiona SHARES REALES (tabla investment_shares vía RLS): crear enlace
// por email, listar, revocar/reactivar, republicar snapshot y copiar enlace. El
// inversor solo verá el SNAPSHOT filtrado (nunca el JSON completo de la operación).
// Si el backend (migración) no está aplicado, se muestra el error real, sin fingir.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { REOperation } from "@/src/lib/realEstate";
import { calcResults } from "@/src/lib/realEstateCalc";
import {
  RE_VISIBILITY_DEFS,
  defaultShareSettings,
  type REShareSettings,
  type REVisibilityKey,
} from "@/src/lib/realEstateTracking";
import { VisibilityToggle } from "@/src/components/ui/VisibilityToggle";
import {
  buildInvestorSnapshot,
  createShare,
  deleteShare,
  listSharesForOperation,
  setShareStatus,
  updateSharePayload,
  type InvestmentShare,
} from "@/src/lib/shares";

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
  const setVisible = (key: REVisibilityKey, visible: boolean) =>
    onChange({ ...share, visibility: { ...share.visibility, [key]: visible } });
  const setEnabled = (enabled: boolean) => onChange({ ...share, enabled });
  const visibleCount = Object.values(share.visibility).filter(Boolean).length;

  const [shares, setShares] = useState<InvestmentShare[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listSharesForOperation(op.id)
      .then((rows) => { setShares(rows); setLoadErr(null); })
      .catch((e) => setLoadErr(e instanceof Error ? e.message : "No se pudieron cargar los accesos."));
  }, [op.id]);

  useEffect(() => { load(); }, [load]);

  const snapshotNow = () => buildInvestorSnapshot(op, calcResults(op), new Date().toISOString());

  const create = async () => {
    setBusy(true);
    try {
      await createShare({ operationId: op.id, investorEmail: email.trim() || undefined, visibility: share.visibility, payload: snapshotNow() });
      toast.success("Acceso de inversor creado", email.trim() ? { description: email.trim() } : undefined);
      setEmail("");
      if (!share.enabled) setEnabled(true);
      load();
    } catch (e) {
      toast.error("No se pudo crear el acceso", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const republish = async (s: InvestmentShare) => {
    try {
      await updateSharePayload(s.id, share.visibility, snapshotNow());
      toast.success("Snapshot republicado");
      load();
    } catch (e) {
      toast.error("No se pudo republicar", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const toggleStatus = async (s: InvestmentShare) => {
    try {
      await setShareStatus(s.id, s.status === "active" ? "revoked" : "active");
      load();
    } catch (e) {
      toast.error("No se pudo cambiar el estado", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const remove = async (s: InvestmentShare) => {
    try { await deleteShare(s.id); load(); } catch (e) {
      toast.error("No se pudo eliminar", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const copyLink = async () => {
    const link = typeof window !== "undefined" ? `${window.location.origin}/inversor` : "/inversor";
    try { await navigator.clipboard.writeText(link); toast.success("Enlace copiado", { description: link }); }
    catch { toast.error("No se pudo copiar el enlace"); }
  };

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
      {/* Estado + previsualizar */}
      <div className="re-card p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">Compartir con inversores</p>
          <p className="text-xs text-ink-muted mt-0.5">{share.enabled ? "Activada" : "Desactivada"} · {visibleCount} datos visibles · {shares.filter((s) => s.status === "active").length} acceso(s) activo(s)</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onPreview} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-[var(--surface-alt)] transition-colors">Previsualizar</button>
          <button type="button" onClick={() => setEnabled(!share.enabled)} className="rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors" style={{ background: share.enabled ? "var(--negative)" : "var(--brand)" }}>
            {share.enabled ? "Desactivar" : "Activar"}
          </button>
        </div>
      </div>

      {/* Accesos de inversor (reales) */}
      <div className="re-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Accesos de inversor</p>
          <button type="button" onClick={copyLink} className="text-xs font-semibold text-brand hover:underline">Copiar enlace inversor</button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@inversor.com"
            className="flex-1 min-w-[12rem] rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          <button type="button" onClick={create} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60" style={{ background: "var(--brand)" }}>
            {busy ? "Creando…" : "Dar acceso"}
          </button>
        </div>

        {loadErr ? (
          <p className="text-xs text-[var(--negative)]">Backend de compartición no disponible: {loadErr} (aplica la migración de shares).</p>
        ) : shares.length === 0 ? (
          <p className="text-sm text-ink-subtle">Sin accesos. Da acceso a un inversor por su email.</p>
        ) : (
          <div className="space-y-2">
            {shares.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink truncate">{s.investorEmail || "Sin email"}</p>
                  <p className="text-[11px] text-ink-subtle">{s.status === "active" ? "Activo" : "Revocado"} · creado {s.createdAt?.slice(0, 10)}</p>
                </div>
                <span className={`pill ${s.status === "active" ? "pill-positive" : "pill-neutral"}`}>{s.status === "active" ? "Activo" : "Revocado"}</span>
                <button type="button" onClick={() => republish(s)} title="Republicar snapshot con la visibilidad actual" className="text-xs font-semibold text-brand hover:underline">Republicar</button>
                <button type="button" onClick={() => toggleStatus(s)} className="text-xs font-semibold text-ink-muted hover:text-ink">{s.status === "active" ? "Revocar" : "Reactivar"}</button>
                <button type="button" onClick={() => remove(s)} title="Eliminar acceso" className="p-1 text-slate-400 hover:text-red-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-ink-subtle">
          El inversor accede iniciando sesión con el email invitado en <code>/inversor</code> y solo ve el <b>snapshot</b> publicado (datos ya filtrados por la visibilidad de abajo). Tras cambiar datos, usa <b>Republicar</b>.
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
                <VisibilityToggle key={def.key} label={def.label} sensitive={def.sensitive} visible={share.visibility[def.key] === true} onChange={(v) => setVisible(def.key, v)} />
              ))}
            </div>
          </div>
        ))}
        <p className="text-[11px] text-ink-subtle">Los datos <b>sensibles</b> están ocultos por defecto. Al crear/republicar un acceso se guarda un snapshot con solo lo visible.</p>
      </div>
    </div>
  );
}

export default SharePanel;

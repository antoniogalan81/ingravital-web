"use client";

// /inversor — Vista del INVERSOR autenticado. Lista las operaciones compartidas con
// él (investment_shares activos vía RLS por email/uid) y muestra el SNAPSHOT ya
// filtrado por el propietario. No accede al JSON de la operación. Solo lectura.

import { useEffect, useState } from "react";
import AppGate from "@/components/AppGate";
import { listMyInvestorShares, type InvestmentShare, type InvestorSnapshot } from "@/src/lib/shares";
import { InvestorSnapshotView } from "@/src/components/realEstate/InvestorSnapshotView";

export default function InversorPage() {
  return (
    <AppGate active="inversores" label="Acceso de inversor" title="Vista inversor" subtitle="Operaciones que se han compartido contigo.">
      <InversorContent />
    </AppGate>
  );
}

function hasSnapshot(p: InvestmentShare["payload"]): p is InvestorSnapshot {
  return typeof (p as InvestorSnapshot)?.name === "string";
}

function InversorContent() {
  const [shares, setShares] = useState<InvestmentShare[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listMyInvestorShares()
      .then((rows) => { if (active) { setShares(rows); setSelectedId(rows[0]?.id ?? null); } })
      .catch((e) => { if (active) setErr(e instanceof Error ? e.message : "No se pudieron cargar los accesos."); });
    return () => { active = false; };
  }, []);

  if (err) {
    return (
      <div className="re-card p-5">
        <p className="text-sm text-[var(--negative)]">No se pudieron cargar tus accesos: {err}</p>
        <p className="text-xs text-ink-subtle mt-1">Si el backend de compartición aún no está aplicado, esta vista quedará vacía hasta entonces.</p>
      </div>
    );
  }
  if (shares === null) return <p className="text-sm text-ink-subtle">Cargando…</p>;
  if (shares.length === 0) {
    return (
      <div className="empty-state">
        <p className="text-lg font-extrabold text-ink tracking-tight mb-1">Sin operaciones compartidas</p>
        <p className="text-sm text-ink-muted max-w-md mx-auto">Cuando un promotor te dé acceso a una operación, aparecerá aquí en solo lectura.</p>
      </div>
    );
  }

  const selected = shares.find((s) => s.id === selectedId) ?? shares[0];

  return (
    <div className="grid lg:grid-cols-[16rem_1fr] gap-4 items-start">
      {/* Lista de operaciones compartidas */}
      <div className="re-card p-2 space-y-1">
        {shares.map((s) => {
          const name = hasSnapshot(s.payload) ? s.payload.name : "Operación";
          const active = s.id === selected.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${active ? "text-white" : "text-ink hover:bg-[var(--surface-alt)]"}`}
              style={active ? { background: "var(--brand)" } : undefined}
            >
              <span className="font-semibold truncate block">{name}</span>
            </button>
          );
        })}
      </div>

      {/* Snapshot seleccionado */}
      <div className="reveal-fast">
        {hasSnapshot(selected.payload) ? (
          <InvestorSnapshotView snapshot={selected.payload} />
        ) : (
          <p className="text-sm text-ink-subtle">Este acceso todavía no tiene contenido publicado. Pide al promotor que republique.</p>
        )}
      </div>
    </div>
  );
}

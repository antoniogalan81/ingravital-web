"use client";

// /i/historico — inversiones ya LIQUIDADAS. No se borra nada al terminar una
// operación: el inversor conserva capital, rentabilidad pactada, rentabilidad final
// y fechas como registro permanente.

import { useEffect, useMemo, useState } from "react";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import { listMyInvestments, type MyInvestment } from "@/src/lib/investorPlatform/service";
import { InvestmentCard, totalCapital } from "@/src/components/investor/InvestmentCard";

export default function HistoricoPage() {
  const [items, setItems] = useState<MyInvestment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listMyInvestments()
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "No se pudo cargar el histórico.");
      });
    return () => {
      active = false;
    };
  }, []);

  const closed = useMemo(
    () => (items ?? []).filter((i) => i.status === "liquidada" || i.status === "cancelada"),
    [items],
  );

  const returned = useMemo(
    () => closed.reduce((s, i) => s + (i.returnedAmount ?? 0), 0),
    [closed],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-ink tracking-tight">Histórico</h1>
        <p className="text-sm text-ink-muted mt-1">Operaciones finalizadas y su resultado real.</p>
      </div>

      {error ? (
        <div className="re-card p-5">
          <p className="text-sm text-[var(--negative)]">{error}</p>
        </div>
      ) : items === null ? (
        <p className="text-sm text-ink-subtle">Cargando…</p>
      ) : closed.length === 0 ? (
        <div className="empty-state">
          <p className="text-lg font-extrabold text-ink tracking-tight mb-1">Todavía no hay histórico</p>
          <p className="text-sm text-ink-muted max-w-md mx-auto">
            Cuando una de tus inversiones se liquide, quedará aquí con su resultado final.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="re-card p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle">
                Capital invertido
              </p>
              <p className="text-2xl font-extrabold tabular-nums text-ink tracking-tight mt-0.5">
                {fmtEUR(totalCapital(closed))}
              </p>
            </div>
            <div className="re-card p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle">
                Total devuelto
              </p>
              <p
                className="text-2xl font-extrabold tabular-nums tracking-tight mt-0.5"
                style={{ color: "var(--positive)" }}
              >
                {returned > 0 ? fmtEUR(returned) : "—"}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {closed.map((v) => (
              <InvestmentCard key={v.id} investment={v} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

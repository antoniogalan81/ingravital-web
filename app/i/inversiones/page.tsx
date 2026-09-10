"use client";

// /i/inversiones — MIS INVERSIONES: operaciones en las que el inversor YA participa.
// Solo aparecen aquí las que el promotor ha registrado como inversión real; recibir
// una oportunidad nunca crea una fila en esta lista.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import { listMyInvestments, type MyInvestment } from "@/src/lib/investorPlatform/service";
import { InvestmentCard, totalCapital } from "@/src/components/investor/InvestmentCard";

export default function MisInversionesPage() {
  const [items, setItems] = useState<MyInvestment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listMyInvestments()
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "No se pudieron cargar tus inversiones.");
      });
    return () => {
      active = false;
    };
  }, []);

  const live = useMemo(
    () => (items ?? []).filter((i) => i.status !== "liquidada" && i.status !== "cancelada"),
    [items],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-ink tracking-tight">Mis inversiones</h1>
        <p className="text-sm text-ink-muted mt-1">Operaciones en las que has aportado capital.</p>
      </div>

      {error ? (
        <div className="re-card p-5">
          <p className="text-sm text-[var(--negative)]">{error}</p>
        </div>
      ) : items === null ? (
        <p className="text-sm text-ink-subtle">Cargando…</p>
      ) : live.length === 0 ? (
        <div className="empty-state">
          <p className="text-lg font-extrabold text-ink tracking-tight mb-1">Sin inversiones activas</p>
          <p className="text-sm text-ink-muted max-w-md mx-auto">
            Cuando participes en una operación, aparecerá aquí con su seguimiento.
          </p>
          <Link href="/i" className="btn-primary mt-5 inline-flex">
            Ver oportunidades
          </Link>
        </div>
      ) : (
        <>
          <div className="re-card p-5 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle">
                Capital invertido
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-ink tracking-tight mt-0.5">
                {fmtEUR(totalCapital(live))}
              </p>
            </div>
            <p className="text-sm text-ink-muted">
              {live.length} {live.length === 1 ? "operación activa" : "operaciones activas"}
            </p>
          </div>

          <div className="space-y-3">
            {live.map((v) => (
              <InvestmentCard key={v.id} investment={v} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

"use client";

// OPORTUNIDADES (promotor) — las ofertas que ha preparado a partir de sus operaciones.
//
// Es la vista del PROMOTOR. La del inversor es otra distinta (`/i`), y solo muestra
// lo que le han compartido. Aquí no hay ni un dato inventado: si no hay
// oportunidades, se explica cómo se crea la primera.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppGate from "@/components/AppGate";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import { listInvestments, listOpportunities } from "@/src/lib/investorPlatform/service";
import {
  INVESTMENT_MODEL_LABEL,
  OPPORTUNITY_STATUS_LABEL,
  fundingState,
  type Investment,
  type Opportunity,
  type OpportunityStatus,
} from "@/src/lib/investorPlatform/types";

const STATUS_PILL: Record<OpportunityStatus, string> = {
  borrador: "pill-neutral",
  publicada: "pill-info",
  en_captacion: "pill-warning",
  cubierta: "pill-positive",
  cerrada: "pill-neutral",
  liquidada: "pill-neutral",
};

function OpportunityCard({
  opportunity,
  investments,
}: {
  opportunity: Opportunity;
  investments: Investment[];
}) {
  const funding = fundingState(opportunity.targetCapital, investments);
  const pct = funding.pctFinanciado == null ? null : Math.round(funding.pctFinanciado * 100);

  return (
    <article className="re-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-ink tracking-tight leading-snug truncate">
            {opportunity.title}
          </h2>
          <p className="text-xs text-ink-subtle mt-0.5">
            {[opportunity.location, INVESTMENT_MODEL_LABEL[opportunity.investmentModel]]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className={`pill ${STATUS_PILL[opportunity.status]} shrink-0`}>
          {OPPORTUNITY_STATUS_LABEL[opportunity.status]}
        </span>
      </div>

      {pct != null ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-semibold text-ink">Financiado</span>
            <span className="tabular-nums text-ink-muted">{pct}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-[var(--surface-alt)] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--brand)" }} />
          </div>
        </div>
      ) : null}

      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-line pt-3">
        {[
          ["Objetivo", funding.objetivo == null ? "—" : fmtEUR(funding.objetivo)],
          ["Invertido", fmtEUR(funding.invertido)],
          ["Comprometido", fmtEUR(funding.comprometido)],
          ["Inversores", String(funding.inversores)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-subtle">{label}</dt>
            <dd className="text-sm font-bold tabular-nums text-ink mt-0.5">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-[11px] text-ink-subtle">
        Se gestiona desde la operación: <b>Inversiones → abrir la operación → Seguimiento → Inversores</b>.
      </p>
    </article>
  );
}

function OportunidadesContent() {
  const [opportunities, setOpportunities] = useState<Opportunity[] | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([listOpportunities(), listInvestments()])
      .then(([opps, inv]) => {
        setOpportunities(opps);
        setInvestments(inv);
        setError(null);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudieron cargar las oportunidades."),
      );
  }, []);

  useEffect(() => load(), [load]);

  const byOpportunity = useMemo(() => {
    const map = new Map<string, Investment[]>();
    for (const i of investments) {
      const arr = map.get(i.opportunityId) ?? [];
      arr.push(i);
      map.set(i.opportunityId, arr);
    }
    return map;
  }, [investments]);

  const totals = useMemo(() => {
    const objetivo = (opportunities ?? []).reduce((s, o) => s + (o.targetCapital ?? 0), 0);
    const captado = investments
      .filter((i) => i.status !== "cancelada")
      .reduce((s, i) => s + i.amount, 0);
    return { objetivo, captado };
  }, [opportunities, investments]);

  if (error) {
    return (
      <div className="re-card p-5 space-y-2">
        <p className="text-sm text-[var(--negative)]">{error}</p>
        <button type="button" onClick={load} className="text-sm font-semibold text-brand hover:underline">
          Reintentar
        </button>
      </div>
    );
  }
  if (opportunities === null) return <p className="text-sm text-ink-subtle">Cargando…</p>;

  if (opportunities.length === 0) {
    return (
      <div className="empty-state max-w-xl">
        <h2 className="text-xl font-extrabold text-ink tracking-tight">Todavía no hay oportunidades</h2>
        <p className="text-sm text-ink-muted mt-2 max-w-md mx-auto leading-relaxed">
          Una operación no se convierte en oportunidad sola. Abre la operación que quieras financiar,
          entra en <b>Seguimiento → Inversores</b> y pulsa <b>Preparar para inversores</b>.
        </p>
        <Link href="/finanzas" className="btn-primary mt-6">
          Ir a mis operaciones
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="re-card p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle">
            Capital objetivo
          </p>
          <p className="text-2xl font-extrabold tabular-nums text-ink tracking-tight mt-0.5">
            {totals.objetivo > 0 ? fmtEUR(totals.objetivo) : "—"}
          </p>
        </div>
        <div className="re-card p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle">Captado</p>
          <p
            className="text-2xl font-extrabold tabular-nums tracking-tight mt-0.5"
            style={{ color: "var(--positive)" }}
          >
            {totals.captado > 0 ? fmtEUR(totals.captado) : "—"}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {opportunities.map((o) => (
          <OpportunityCard key={o.id} opportunity={o} investments={byOpportunity.get(o.id) ?? []} />
        ))}
      </div>
    </div>
  );
}

export default function OportunidadesPage() {
  return (
    <AppGate
      active="oportunidades"
      label="Captación de capital"
      title="Oportunidades"
      subtitle="Las ofertas que has preparado para inversores y su estado real de captación."
    >
      <OportunidadesContent />
    </AppGate>
  );
}

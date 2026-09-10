"use client";

// /i — Oportunidades RECIBIDAS por el inversor.
// Son operaciones que le han compartido y en las que TODAVÍA NO participa.
// Lo que ya ha financiado vive en /i/inversiones.

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import { listMyOpportunities, type InvestorOpportunityCard } from "@/src/lib/investorPlatform/service";
import {
  INVESTMENT_MODEL_LABEL,
  type InterestValue,
} from "@/src/lib/investorPlatform/types";

const INTEREST_PILL: Record<InterestValue, { cls: string; label: string }> = {
  interesado: { cls: "pill-positive", label: "Has mostrado interés" },
  mas_info: { cls: "pill-warning", label: "Has pedido más información" },
  descartada: { cls: "pill-neutral", label: "La has descartado" },
};

export default function OportunidadesRecibidasPage() {
  const [cards, setCards] = useState<InvestorOpportunityCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listMyOpportunities()
      .then((rows) => {
        if (active) setCards(rows);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "No se pudieron cargar tus oportunidades.");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-ink tracking-tight">Oportunidades</h1>
        <p className="text-sm text-ink-muted mt-1">
          Operaciones que te han compartido. Verlas no implica ningún compromiso.
        </p>
      </div>

      {error ? (
        <div className="re-card p-5">
          <p className="text-sm text-[var(--negative)]">{error}</p>
        </div>
      ) : cards === null ? (
        <p className="text-sm text-ink-subtle">Cargando…</p>
      ) : cards.length === 0 ? (
        <div className="empty-state">
          <p className="text-lg font-extrabold text-ink tracking-tight mb-1">
            Todavía no tienes oportunidades
          </p>
          <p className="text-sm text-ink-muted max-w-md mx-auto">
            Cuando un promotor te comparta una operación, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((c) => {
            const interest = c.interest ? INTEREST_PILL[c.interest] : null;
            return (
              <Link
                key={c.invitationId}
                href={`/i/oportunidad/${c.invitationId}`}
                className="re-card re-card-interactive p-5 block"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="pill pill-info">{INVESTMENT_MODEL_LABEL[c.investmentModel]}</span>
                  {c.location ? <span className="pill pill-neutral">{c.location}</span> : null}
                  {!c.firstViewedAt ? <span className="pill pill-accent">Nueva</span> : null}
                </div>

                <h2 className="mt-2.5 text-lg font-extrabold text-ink tracking-tight leading-snug">
                  {c.title}
                </h2>
                {c.summary ? (
                  <p className="mt-1 text-sm text-ink-muted line-clamp-2 leading-relaxed">{c.summary}</p>
                ) : null}

                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-subtle">Rentab.</dt>
                    <dd className="text-sm font-extrabold tabular-nums text-ink">
                      {c.offeredYieldPct == null ? "—" : `${c.offeredYieldPct}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-subtle">Plazo</dt>
                    <dd className="text-sm font-extrabold tabular-nums text-ink">
                      {c.termMonths == null ? "—" : `${c.termMonths} m`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-subtle">Mínimo</dt>
                    <dd className="text-sm font-extrabold tabular-nums text-ink">
                      {c.minTicket == null ? "—" : fmtEUR(c.minTicket)}
                    </dd>
                  </div>
                </dl>

                {interest ? (
                  <span className={`pill ${interest.cls} mt-3 inline-flex`}>{interest.label}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

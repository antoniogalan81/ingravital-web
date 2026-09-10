"use client";

// Ficha de una inversión REAL del inversor. La usan «Mis inversiones» (vivas) y
// «Histórico» (liquidadas), que solo se diferencian en qué datos tienen sentido:
// una inversión viva muestra lo pactado; una liquidada, además, el resultado final.

import Link from "next/link";
import { fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";
import { INVESTMENT_STATUS_LABEL } from "@/src/lib/investorPlatform/types";
import type { MyInvestment } from "@/src/lib/investorPlatform/service";

const STATUS_PILL: Record<string, string> = {
  comprometida: "pill-warning",
  desembolsada: "pill-info",
  activa: "pill-positive",
  liquidada: "pill-neutral",
  cancelada: "pill-negative",
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-subtle">{label}</dt>
      <dd className="text-sm font-bold tabular-nums text-ink mt-0.5">{value}</dd>
    </div>
  );
}

export function InvestmentCard({ investment: v }: { investment: MyInvestment }) {
  const settled = v.status === "liquidada";
  // La rentabilidad PACTADA y la FINAL son métricas distintas: no se mezclan.
  const pactada = v.agreedYieldPct == null ? "—" : `${v.agreedYieldPct}%`;
  const final = v.finalYieldPct == null ? "—" : `${v.finalYieldPct}%`;

  return (
    <article className="re-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold text-ink tracking-tight leading-snug">{v.title}</h3>
          {v.location ? <p className="text-xs text-ink-subtle mt-0.5">{v.location}</p> : null}
        </div>
        <span className={`pill ${STATUS_PILL[v.status] ?? "pill-neutral"} shrink-0`}>
          {INVESTMENT_STATUS_LABEL[v.status]}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-line pt-3">
        <Field label="Capital aportado" value={fmtEUR(v.amount)} />
        <Field label="Rentab. pactada" value={pactada} />
        {settled ? (
          <>
            <Field label="Rentab. final" value={final} />
            <Field label="Devuelto" value={v.returnedAmount == null ? "—" : fmtEUR(v.returnedAmount)} />
          </>
        ) : (
          <>
            <Field label="Plazo" value={v.termMonths == null ? "—" : `${v.termMonths} meses`} />
            <Field label="Devolución prevista" value={v.expectedReturnDate ?? "—"} />
          </>
        )}
      </dl>

      {(v.guarantee || v.conditions) && (
        <div className="mt-3 border-t border-line pt-3 space-y-1.5">
          {v.guarantee ? (
            <p className="text-xs text-ink-muted">
              <b className="text-ink">Garantía:</b> {v.guarantee}
            </p>
          ) : null}
          {v.conditions ? (
            <p className="text-xs text-ink-muted">
              <b className="text-ink">Condiciones:</b> {v.conditions}
            </p>
          ) : null}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-ink-subtle">
          {settled
            ? v.returnedAt
              ? `Liquidada el ${v.returnedAt}`
              : "Liquidada"
            : v.investedAt
              ? `Invertida el ${v.investedAt}`
              : null}
        </p>
        {v.invitationId ? (
          <Link
            href={`/i/oportunidad/${v.invitationId}`}
            className="text-xs font-semibold text-brand hover:underline"
          >
            Ver seguimiento del proyecto
          </Link>
        ) : null}
      </div>
    </article>
  );
}

/** Suma de capital de un conjunto de inversiones. */
export function totalCapital(items: MyInvestment[]): number {
  return items.reduce((s, i) => s + i.amount, 0);
}

export { fmtPct };

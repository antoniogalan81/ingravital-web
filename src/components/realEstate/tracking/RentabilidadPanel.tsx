"use client";

// Panel RENTABILIDAD. Separa SIEMPRE: total de la operación / promotor / inversor,
// y estimada / real / desviación. No mezcla rentabilidad global con la del inversor.
// Si un dato no es calculable → "—" (nunca cálculo falso).

import { useMemo } from "react";
import type { REOperation, REResults } from "@/src/lib/realEstate";
import type { REInvestorSplit } from "@/src/lib/realEstateTracking";
import { fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";
import { profitability } from "@/src/lib/realEstateTrackingCalc";
import { StatTile } from "@/src/components/ui/StatTile";
import { NumberCellInput } from "@/src/components/ui/DataTable";
import { RentabilitySimulator } from "./RentabilitySimulator";

const eur = (v: number | null) => (v == null ? "—" : fmtEUR(v));
const pct = (v: number | null) => (v == null ? "—" : fmtPct(v));

export function RentabilidadPanel({
  op,
  results,
  onChange,
}: {
  op: REOperation;
  results: REResults;
  onChange: (split: REInvestorSplit) => void;
}) {
  const prof = useMemo(() => profitability(op, results), [op, results]);
  const split = op.investorSplit ?? {};
  const setSplit = (patch: Partial<REInvestorSplit>) => onChange({ ...split, ...patch });

  const promoterPctLabel = prof.promoterSharePct == null ? "—" : `${Math.round(prof.promoterSharePct * 100)}%`;
  const investorPctLabel = prof.investorSharePct == null ? "—" : `${Math.round(prof.investorSharePct * 100)}%`;

  return (
    <div className="space-y-5">
      {/* Total de la operación */}
      <Block title="Rentabilidad total de la operación" accent="var(--brand)">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <StatTile label="Beneficio estimado" value={eur(prof.estimatedBenefit)} tone={prof.estimatedBenefit >= 0 ? "positive" : "negative"} />
          <StatTile label="Beneficio real" value={eur(prof.realBenefit)} tone={prof.realBenefit == null ? "default" : prof.realBenefit >= 0 ? "positive" : "negative"} />
          <StatTile label="Desviación" value={eur(prof.deviation)} tone={prof.deviation == null ? "default" : prof.deviation >= 0 ? "positive" : "negative"} hint="real − estimado" />
          <StatTile label="Rentab. estimada" value={pct(prof.estimatedYield)} tone={prof.estimatedYield >= 0 ? "positive" : "negative"} />
          <StatTile label="Rentab. real" value={pct(prof.realYield)} tone={prof.realYield == null ? "default" : prof.realYield >= 0 ? "positive" : "negative"} />
        </div>
      </Block>

      {/* Reparto promotor / inversor */}
      <Block title="Reparto promotor / inversor">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Capital del inversor (€)">
            <NumberCellInput value={split.investorCapital} onChange={(v) => setSplit({ investorCapital: v })} align="left" />
          </Field>
          <Field label="% beneficio para el inversor">
            <NumberCellInput value={split.investorSharePct} onChange={(v) => setSplit({ investorSharePct: v })} align="left" />
          </Field>
        </div>
        <p className="text-xs text-ink-subtle mt-2">
          Reparto actual — Inversor: <b>{investorPctLabel}</b> · Promotor: <b>{promoterPctLabel}</b>.
          {prof.investorSharePct == null ? " Define el % para separar la rentabilidad." : ""}
        </p>
      </Block>

      {/* Promotor */}
      <Block title="Rentabilidad del promotor" accent="#0f766e">
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile label="Beneficio estimado" value={eur(prof.estimatedPromoterBenefit)} tone={prof.estimatedPromoterBenefit == null ? "default" : "positive"} />
          <StatTile label="Beneficio real" value={eur(prof.realPromoterBenefit)} tone={prof.realPromoterBenefit == null ? "default" : "positive"} />
        </div>
      </Block>

      {/* Inversor */}
      <Block title="Rentabilidad del inversor" accent="var(--accent)">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <StatTile label="Beneficio estimado" value={eur(prof.estimatedInvestorBenefit)} tone={prof.estimatedInvestorBenefit == null ? "default" : "positive"} />
          <StatTile label="Beneficio real" value={eur(prof.realInvestorBenefit)} tone={prof.realInvestorBenefit == null ? "default" : "positive"} />
          <StatTile label="Rentab. inversor" value={pct(prof.investorYield)} tone={prof.investorYield == null ? "default" : prof.investorYield >= 0 ? "positive" : "negative"} hint="sobre su capital" />
        </div>
      </Block>

      {/* Simulador (local, no persiste) */}
      <RentabilitySimulator op={op} results={results} />
    </div>
  );
}

function Block({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="re-card p-4 space-y-3" style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}>
      <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle flex items-center gap-1.5">
        {accent ? <span className="inline-block h-2 w-2 rounded-full" style={{ background: accent }} /> : null}
        {title}
      </p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-ink-subtle">{label}</label>
      <div className="rounded-lg border border-line px-1">{children}</div>
    </div>
  );
}

export default RentabilidadPanel;

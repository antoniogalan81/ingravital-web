"use client";

// Pestaña INVERSORES de una operación.
//
//  · Rentabilidad → reparto promotor/inversor. Es análisis INTERNO del promotor y
//    no sale de aquí salvo que se active explícitamente su visibilidad.
//  · Oportunidad  → toda la relación con inversores: oferta, presentación,
//    visibilidad, destinatarios e inversiones reales.
//
// El antiguo `SharePanel` (que escribía `investment_shares` y una lista paralela
// `share.recipients`) queda sustituido por `OpportunityPanel`: una sola fuente de
// verdad. Ver docs/INVERSORES.md.

import type { REOperation, REResults } from "@/src/lib/realEstate";
import type { REInvestorSplit } from "@/src/lib/realEstateTracking";
import { RentabilidadPanel } from "./RentabilidadPanel";
import { OpportunityPanel } from "@/src/components/opportunity/OpportunityPanel";

export function InversoresPanel({
  op,
  results,
  onChangeSplit,
  onOpenCrm,
}: {
  op: REOperation;
  results: REResults;
  onChangeSplit: (split: REInvestorSplit) => void;
  onOpenCrm: () => void;
}) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-extrabold text-ink">Rentabilidad y reparto</h3>
          <p className="text-[11px] text-ink-subtle mt-0.5">
            Cálculo interno. Solo se comparte lo que actives en la visibilidad de la oportunidad.
          </p>
        </div>
        <RentabilidadPanel op={op} results={results} onChange={onChangeSplit} />
      </section>

      <section className="space-y-3 border-t border-line pt-6">
        <h3 className="text-sm font-extrabold text-ink">Oportunidad de inversión</h3>
        <OpportunityPanel op={op} results={results} onOpenCrm={onOpenCrm} />
      </section>
    </div>
  );
}

export default InversoresPanel;

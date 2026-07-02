"use client";

// Pestaña INVERSORES: agrupa lo relativo al inversor en un solo lugar —
// rentabilidad separada (total/promotor/inversor) + compartición y visibilidad
// granular + previsualización de la vista inversor. Reutiliza los paneles
// existentes (no duplica lógica).

import type { REOperation, REResults } from "@/src/lib/realEstate";
import type { REInvestorSplit, REShareSettings } from "@/src/lib/realEstateTracking";
import { RentabilidadPanel } from "./RentabilidadPanel";
import { SharePanel } from "./SharePanel";

export function InversoresPanel({
  op,
  results,
  onChangeSplit,
  onChangeShare,
  onPreview,
}: {
  op: REOperation;
  results: REResults;
  onChangeSplit: (split: REInvestorSplit) => void;
  onChangeShare: (share: REShareSettings) => void;
  onPreview: () => void;
}) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-extrabold text-ink">Rentabilidad</h3>
        <RentabilidadPanel op={op} results={results} onChange={onChangeSplit} />
      </section>

      <section className="space-y-3 border-t border-line pt-6">
        <h3 className="text-sm font-extrabold text-ink">Compartir con inversores</h3>
        <SharePanel op={op} onChange={onChangeShare} onPreview={onPreview} />
      </section>
    </div>
  );
}

export default InversoresPanel;

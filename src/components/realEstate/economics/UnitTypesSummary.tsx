"use client";

// BASE del Proyecto frente a VALOR ACTUAL por tipología. La base se define en las Unidades;
// los precios y rentas propios de cada unidad se ajustan en Seguimiento operativo y el
// Proyecto calcula con el total y la media actuales (`projectUnitTypes`).

import { fmtEUR } from "@/src/lib/realEstateCalc";
import { formatEs, type UnitTypeValues, type UnitTypeView } from "@/src/lib/projectEconomics";

// Medias y bases con céntimos (181.666,67 €); los totales, en euros como el resto de la ficha.
const fmtUnit = (v: number) => `${formatEs(v, 2)} €`;
/** Desviación de la media actual frente a la base: "+1.666,67 €/ud (+0,93 %)". */
const fmtDeviation = (v: UnitTypeValues, unit: string) => {
  if (v.deviation == null || Math.abs(v.deviation) < 0.005) return null;
  const sign = v.deviation > 0 ? "+" : "−";
  const pct = v.deviationPct != null ? ` (${sign}${formatEs(Math.abs(v.deviationPct * 100), 2)} %)` : "";
  return `${sign}${fmtUnit(Math.abs(v.deviation))}${unit}${pct}`;
};

function Values({ label, v, overridden, unit }: { label: string; v: UnitTypeValues; overridden: number; unit: string }) {
  const deviation = fmtDeviation(v, unit);
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="text-sm tabular-nums text-ink">
        <span className="font-extrabold">{fmtEUR(v.total)}</span>
        {v.average != null ? <span className="text-ink-muted"> · media {fmtUnit(v.average)}{unit}</span> : null}
      </p>
      <p className="text-[11px] tabular-nums text-ink-subtle">
        Base {v.base != null ? `${fmtUnit(v.base)}${unit}` : "—"}
        {deviation ? <span className="font-semibold" style={{ color: "var(--brand)" }}>{` · desviación ${deviation}`}</span> : null}
        {overridden ? <span>{` · ${overridden} con valor propio`}</span> : null}
      </p>
    </div>
  );
}

export function UnitTypesSummary({ types, split = false }: { types: UnitTypeView[]; split?: boolean }) {
  if (!types.length) return null;
  const saleUnits = types.reduce((n, t) => n + t.saleUnits, 0);
  const rentUnits = types.reduce((n, t) => n + t.rentUnits, 0);
  const uds = (n: number) => `${n} ud${n === 1 ? "" : "s"}`;
  return (
    <div className="rounded-xl border border-line bg-[var(--surface-alt)] px-3.5 py-3 space-y-2.5">
      <div>
        <p className="text-xs font-bold text-ink">Base prevista y valor actual</p>
        <p className="text-[11px] text-ink-subtle">La base se define aquí. El precio o la renta propios de cada unidad se ajustan en Seguimiento operativo y la rentabilidad usa el valor actual.</p>
        <p className="mt-1 text-[11px] font-semibold text-ink-muted" data-testid="rent-split">
          {split
            ? `Reparto por unidad: ${uds(saleUnits)} a venta · ${uds(rentUnits)} a alquiler. Cada unidad cuenta solo en su destino.`
            : "Comparativa: venta si se venden todas, renta si se alquilan todas. Marca «Destinada al alquiler» en una unidad para repartir."}
        </p>
      </div>
      <ul className="divide-y divide-[var(--line)]">
        {types.map((t) => (
          <li key={t.key} className="grid gap-2 py-2 sm:grid-cols-[8rem_1fr_1fr]">
            <p className="text-sm font-bold text-ink">
              {t.label} <span className="font-normal text-ink-subtle tabular-nums">· {t.units} ud{t.units === 1 ? "" : "s"}</span>
            </p>
            <Values label={split ? `Venta · ${uds(t.saleUnits)}` : "Venta"} v={t.sale} overridden={t.overridden.sale} unit="/ud" />
            {t.rent.total > 0 || t.overridden.rent || (split && t.rentUnits > 0) ? <Values label={split ? `Alquiler · ${uds(t.rentUnits)}` : "Renta"} v={t.rent} overridden={t.overridden.rent} unit="/mes" /> : <div />}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default UnitTypesSummary;

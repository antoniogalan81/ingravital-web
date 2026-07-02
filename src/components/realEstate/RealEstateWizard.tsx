"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { REOperation, REUnit } from "@/src/lib/realEstate";
import { DEFAULT_TASAS } from "@/src/lib/realEstate";
import { fmtEUR, fmtNum, calcFrench, calcTINFromCuota } from "@/src/lib/realEstateCalc";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WizardCategory = "suelo" | "local" | "vivienda" | "adaptacion";
type Mode = "standard" | "avanzada";
type Strategy = "venta" | "alquiler" | "ambos";
type RentType = "TRADICIONAL" | "HABITACIONES";

type ViviendaW = {
  id: string;
  title: string;
  numUnits: number;
  m2Unit?: number;
  m2CommonAreas?: number;
  strategy: Strategy;
  rentType: RentType;
  salePriceTotal?: number;
  salePriceM2?: number;
  rentMonthly?: number;
  numHabitaciones?: number;
  m2PerRoom?: number;
  pricePerRoom?: number;
};

type GarajeW = {
  title: string;
  numPlazas: number;
  m2PerPlaza: number;
  m2Access?: number;
  strategy: Strategy;
  salePriceTotal?: number;
  rentMonthly?: number;
};

type TrasteroW = {
  title: string;
  numTrasteros: number;
  m2PerUnit: number;
  m2Access?: number;
  strategy: Strategy;
  salePriceTotal?: number;
  rentMonthly?: number;
};

type WizardData = {
  name: string;
  address?: string;
  link?: string;
  purchasePrice: number;
  m2Plot?: number;
  m2Buildable?: number;
  viviendas: ViviendaW[];
  garaje: GarajeW;
  trastero: TrasteroW;
  obra: {
    cimentacionPriceM2?: number;
    cimentacionTotal?: number;
    escalerasM2?: number;
    escalerasPriceM2?: number;
    escalerasTotal?: number;
    accesosM2?: number;
    accesosPriceM2?: number;
    accesosTotal?: number;
    obraViviendaPriceM2?: number;
    obraViviendaTotal?: number;
    obraGarajePriceM2?: number;
    obraGarajeTotal?: number;
    obraTrasterosPriceM2?: number;
    obraTrasterosTotal?: number;
  };
  costes: {
    arquitectoPct: number;
    arquitectoTotal?: number;
    desviacionesPct?: number;
    desviacionesTotal?: number;
    purchaseTaxPct: number;
    purchaseTaxTotal?: number;
    licenciasTotal?: number;
    furnitureCostPerUnit?: number;
  };
  financiacion: {
    enabled: boolean;
    compraPct: number;
    compraAmount?: number;
    compraInterest: number;
    compraYears?: number;
    obraPct: number;
    obraAmount?: number;
    obraInterest: number;
    obraYears?: number;
  };
};

// ─── Step definitions ─────────────────────────────────────────────────────────

type StepId = "datos" | "vivienda" | "garaje" | "trastero" | "obra" | "costes" | "coste" | "financiacion";

function getSteps(cat: WizardCategory, mode: Mode = "standard"): StepId[] {
  if (cat === "local" && mode === "standard") {
    return ["datos", "vivienda", "garaje", "trastero", "coste", "financiacion"];
  }
  if (cat === "adaptacion" && mode === "standard") {
    return ["datos", "vivienda", "coste", "financiacion"];
  }
  if (cat === "suelo" || cat === "local") {
    return ["datos", "vivienda", "garaje", "trastero", "obra", "costes", "financiacion"];
  }
  if (cat === "vivienda" && mode === "standard") {
    return ["datos", "vivienda", "coste", "financiacion"];
  }
  return ["datos", "vivienda", "obra", "costes", "financiacion"];
}

const STEP_LABELS: Record<StepId, string> = {
  datos: "Datos",
  vivienda: "Vivienda",
  garaje: "Garaje",
  trastero: "Trastero",
  obra: "Obra",
  costes: "Costes",
  coste: "Coste",
  financiacion: "Financiación",
};

// ─── Hydration: WizardData → REOperation ─────────────────────────────────────

// MAPEO FINAL:
// wizard.name                     → op.name
// wizard.address                  → op.address          (avanzada)
// wizard.link                     → op.link             (avanzada)
// wizard.purchasePrice            → op.purchasePrice
// wizard.m2Plot                   → op.m2Plot           (suelo avanzada)
// wizard.m2Buildable              → op.m2Buildable      (suelo=edificable; local/viv/adapt=útil proxy)
// wizard.viviendas[].numUnits     → unit.numUnits
// wizard.viviendas[].m2Unit       → unit.m2Unit         (avanzada)
// wizard.viviendas[].salePriceTotal → unit.salePriceTotal
// wizard.viviendas[].rentMonthly  → unit.rentMonthly
// wizard.viviendas[].rentType     → unit.rentType
// wizard.viviendas[].m2PerRoom    → unit.m2PerRoom
// wizard.viviendas[].pricePerRoom → unit.pricePerRoom
// wizard.garaje.numPlazas*m2PerPlaza → unit.m2Unit (GARAJE)
// wizard.garaje.m2PerPlaza        → unit.m2PerPlaza
// wizard.trastero.numTrasteros*m2PerUnit → unit.m2Total (TRASTERO)
// wizard.trastero.m2PerUnit       → unit.m2PerUnit
// wizard.obra.*                   → costs.obra*
// wizard.costes.arquitectoPct     → costs.arquitectoPct
// wizard.costes.purchaseTaxPct    → costs.purchaseTaxPct
// wizard.costes.licenciasTotal    → costs.tasasTotal
// wizard.financiacion.*           → financing.*

export function hydrateOperation(
  base: REOperation,
  data: WizardData,
  cat: WizardCategory
): REOperation {
  const units: REUnit[] = [];

  data.viviendas.forEach((v, i) => {
    const unit: REUnit = {
      id: `${base.id}_viv_${i}`,
      type: "VIVIENDA",
      title: v.title || `Vivienda ${i + 1}`,
      numUnits: v.numUnits,
      m2Unit: v.m2Unit,
      m2CommonAreas: v.m2CommonAreas,
      rentType: v.rentType,
      numHabitaciones: v.numHabitaciones,
      m2PerRoom: v.rentType === "HABITACIONES" ? v.m2PerRoom : undefined,
      pricePerRoom: v.rentType === "HABITACIONES" ? v.pricePerRoom : undefined,
      salePriceTotal: (v.strategy === "venta" || v.strategy === "ambos") ? v.salePriceTotal : undefined,
      salePriceM2: (v.strategy === "venta" || v.strategy === "ambos") ? v.salePriceM2 : undefined,
      rentMonthly: (v.strategy === "alquiler" || v.strategy === "ambos") ? v.rentMonthly : undefined,
    };
    units.push(unit);
  });

  if ((cat === "suelo" || cat === "local") && data.garaje.numPlazas > 0) {
    const g = data.garaje;
    const m2PerPlaza = g.m2PerPlaza || 12.5;
    const m2Access = g.m2Access || 0;
    units.push({
      id: `${base.id}_gar`,
      type: "GARAJE",
      title: g.title || "Garaje",
      m2Unit: g.numPlazas * m2PerPlaza + m2Access,
      m2Access,
      m2PerPlaza,
      salePriceTotal: (g.strategy === "venta" || g.strategy === "ambos") ? g.salePriceTotal : undefined,
      rentMonthly: (g.strategy === "alquiler" || g.strategy === "ambos") ? g.rentMonthly : undefined,
    });
  }

  if ((cat === "suelo" || cat === "local") && data.trastero.numTrasteros > 0) {
    const t = data.trastero;
    const m2PerUnit = t.m2PerUnit || 5;
    const m2Access = t.m2Access || 0;
    units.push({
      id: `${base.id}_tras`,
      type: "TRASTERO",
      title: t.title || "Trastero",
      m2Total: t.numTrasteros * m2PerUnit + m2Access,
      m2Access,
      m2PerUnit,
      salePriceTotal: (t.strategy === "venta" || t.strategy === "ambos") ? t.salePriceTotal : undefined,
      rentMonthly: (t.strategy === "alquiler" || t.strategy === "ambos") ? t.rentMonthly : undefined,
    });
  }

  const hasCim = cat === "suelo";
  const hasEscAcc = cat === "suelo" || cat === "local";
  const hasAcc = hasEscAcc || cat === "adaptacion";

  return {
    ...base,
    name: data.name,
    address: data.address || undefined,
    link: data.link || undefined,
    purchasePrice: data.purchasePrice,
    m2Plot: cat === "suelo" ? (data.m2Plot ?? data.m2Buildable) : undefined,
    m2Buildable: data.m2Buildable ?? data.m2Plot,
    units,
    costs: {
      ...base.costs,
      purchaseTaxPct: data.costes.purchaseTaxPct,
      cimentacionPriceM2: hasCim ? data.obra.cimentacionPriceM2 : undefined,
      cimentacionTotal: hasCim ? data.obra.cimentacionTotal : undefined,
      escalerasM2: hasEscAcc ? data.obra.escalerasM2 : undefined,
      escalerasPriceM2: hasEscAcc ? data.obra.escalerasPriceM2 : undefined,
      escalerasTotal: hasEscAcc ? data.obra.escalerasTotal : undefined,
      accesosM2: hasAcc ? data.obra.accesosM2 : undefined,
      accesosPriceM2: hasAcc ? data.obra.accesosPriceM2 : undefined,
      accesosTotal: hasAcc ? data.obra.accesosTotal : undefined,
      obraViviendaPriceM2: data.obra.obraViviendaPriceM2,
      obraViviendaTotal: data.obra.obraViviendaTotal,
      obraGarajePriceM2: data.obra.obraGarajePriceM2,
      obraGarajeTotal: data.obra.obraGarajeTotal,
      obraTrasterosPriceM2: data.obra.obraTrasterosPriceM2,
      obraTrasterosTotal: data.obra.obraTrasterosTotal,
      arquitectoPct: data.costes.arquitectoPct,
      arquitectoTotal: data.costes.arquitectoTotal,
      desviacionesPct: data.costes.desviacionesPct,
      desviacionesTotal: data.costes.desviacionesTotal,
      purchaseTaxTotal: data.costes.purchaseTaxTotal,
      tasas: DEFAULT_TASAS.map((t) => ({ ...t })),
      tasasTotal: data.costes.licenciasTotal,
      furnitureCostPerUnit: data.costes.furnitureCostPerUnit,
    },
    financing: {
      enabled: data.financiacion.enabled,
      compra: {
        pct: data.financiacion.compraPct,
        amount: data.financiacion.compraAmount,
        interest: data.financiacion.compraInterest,
        years: data.financiacion.compraYears,
      },
      obra: {
        pct: data.financiacion.obraPct,
        amount: data.financiacion.obraAmount,
        interest: data.financiacion.obraInterest,
        years: data.financiacion.obraYears,
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

// ─── Default data ─────────────────────────────────────────────────────────────

function defaultVivienda(i = 0): ViviendaW {
  return {
    id: `v_${Date.now()}_${i}`,
    title: `Vivienda ${i + 1}`,
    numUnits: 1,
    rentType: "TRADICIONAL",
    strategy: "venta",
  };
}

const DEFAULT_DATA: WizardData = {
  name: "",
  purchasePrice: 0,
  viviendas: [defaultVivienda(0)],
  garaje: { title: "Garaje", numPlazas: 0, m2PerPlaza: 12.5, strategy: "venta" },
  trastero: { title: "Trastero", numTrasteros: 0, m2PerUnit: 5, strategy: "venta" },
  obra: {},
  costes: { arquitectoPct: 3, purchaseTaxPct: 8 },
  financiacion: {
    enabled: false,
    compraPct: 60,
    compraInterest: 5.1,
    compraYears: 20,
    obraPct: 60,
    obraInterest: 5.1,
    obraYears: 20,
  },
};

// ─── NumInput (local) ─────────────────────────────────────────────────────────

function NumInput({
  value, onChange, placeholder = "0", suffix, className = "",
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  suffix?: string;
  className?: string;
}) {
  const fmt = (v: number | undefined) => (v == null || v === 0 ? "" : v.toLocaleString("es-ES", { maximumFractionDigits: 2 }));
  const parse = (s: string) => { const n = parseFloat(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : undefined; };
  const [local, setLocal] = useState(() => fmt(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setLocal(fmt(value)); }, [value]);
  return (
    <div className="relative flex items-center">
      <input
        type="text" inputMode="decimal" value={local} placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={() => { focused.current = true; setLocal(local.replace(/\./g, "")); }}
        onBlur={() => { focused.current = false; const n = parse(local); onChange(n); setLocal(fmt(n)); }}
        className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors ${suffix ? "pr-8" : ""} ${className}`}
      />
      {suffix && <span className="absolute right-2.5 text-xs text-slate-400 pointer-events-none">{suffix}</span>}
    </div>
  );
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-slate-500">{children}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function ToggleGroup<T extends string>({
  options, value, onChange,
}: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-lg border transition-colors ${
            value === o.v ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Step: Datos ──────────────────────────────────────────────────────────────

function StepDatos({
  data, set, cat, mode,
}: { data: WizardData; set: (p: Partial<WizardData>) => void; cat: WizardCategory; mode: Mode }) {
  const isAvz = mode === "avanzada";
  const isSuelo = cat === "suelo";
  const m2Label = isSuelo ? "M² edificables" : "M² útiles";

  return (
    <div className="space-y-4">
      <Field label="Nombre del proyecto">
        <input
          type="text" value={data.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Ej: Edificio Ronda, 4"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
        />
      </Field>

      {isAvz && (
        <>
          <Field label="Dirección">
            <input
              type="text" value={data.address ?? ""}
              onChange={(e) => set({ address: e.target.value })}
              placeholder="Calle y número"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
          </Field>
          <Field label="Enlace (portal, idealista…)">
            <input
              type="text" value={data.link ?? ""}
              onChange={(e) => set({ link: e.target.value })}
              placeholder="https://…"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
          </Field>
        </>
      )}

      <Field label="Precio de compra">
        <NumInput value={data.purchasePrice || undefined} onChange={(v) => set({ purchasePrice: v ?? 0 })} suffix="€" />
      </Field>

      {isSuelo && isAvz && (
        <Field label="M² parcela">
          <NumInput
            value={data.m2Plot}
            onChange={(v) => set({ m2Plot: v, ...(!data.m2Buildable && v != null ? { m2Buildable: v } : {}) })}
            suffix="m²"
          />
        </Field>
      )}

      <Field label={m2Label}>
        <NumInput
          value={data.m2Buildable}
          onChange={(v) => set({ m2Buildable: v, ...(isSuelo && isAvz && !data.m2Plot && v != null ? { m2Plot: v } : {}) })}
          suffix="m²"
        />
      </Field>
    </div>
  );
}

// ─── Step: Vivienda ───────────────────────────────────────────────────────────

function ViviendaForm({
  v, onChange, mode, isMulti, cat,
}: { v: ViviendaW; onChange: (p: Partial<ViviendaW>) => void; mode: Mode; isMulti?: boolean; cat?: WizardCategory }) {
  const isAvz = mode === "avanzada";
  const isSueloStd = (cat === "suelo" || cat === "local" || cat === "adaptacion") && mode === "standard";
  const isViviendaAvz = cat === "vivienda" && mode === "avanzada";
  const isViviendaStd = cat === "vivienda" && mode === "standard";
  // calcPanel: whether the "Calcular número de habitaciones" panel is expanded
  const [calcPanelOpen, setCalcPanelOpen] = useState(() => !!v.m2PerRoom);

  // ── Lógica de cálculo por habitaciones — idéntica al modal de edición ──────
  const numUnitsVal = v.numUnits ?? 1;
  const usablePerUnit = (v.m2Unit ?? 0) - (v.m2CommonAreas ?? 0);
  const roomsPerUnit = v.m2PerRoom && v.m2PerRoom > 0
    ? Math.max(0, Math.floor(usablePerUnit / v.m2PerRoom))
    : 0;
  const rooms = roomsPerUnit * numUnitsVal;
  const effectiveRoomsPerUnit = v.m2PerRoom && v.m2PerRoom > 0 ? roomsPerUnit : (v.numHabitaciones ?? 0);
  const monthlyRooms = effectiveRoomsPerUnit * (v.pricePerRoom ?? 0);
  const m2SobrantesPerUnit = v.m2PerRoom && v.m2PerRoom > 0
    ? usablePerUnit - roomsPerUnit * v.m2PerRoom
    : 0;

  return (
    <div className="bg-slate-50 rounded-xl p-4 space-y-3">
      {isMulti && (
        <Field label="Nombre">
          <input
            type="text" value={v.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Ej: Piso 2 dormitorios"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </Field>
      )}

      <div className="flex items-center gap-2">
        {isAvz && (
          <>
            <span className="text-xs font-medium text-slate-500 w-32 shrink-0">M² total vivienda</span>
            <NumInput value={v.m2Unit} onChange={(n) => onChange({ m2Unit: n })} suffix="m²" className="w-28" />
          </>
        )}
        {cat !== "vivienda" && (
          <>
            <span className="text-xs font-medium text-slate-500 shrink-0 ml-2">Nº unidades</span>
            <NumInput value={v.numUnits} onChange={(n) => onChange({ numUnits: Math.max(1, Math.round(n ?? 1)) })} className="w-20" />
          </>
        )}
      </div>

      <Field label="Estrategia">
        <ToggleGroup
          options={[{ v: "venta", label: "Venta" }, { v: "alquiler", label: "Alquiler" }, { v: "ambos", label: "Ambos" }]}
          value={v.strategy}
          onChange={(s) => onChange({ strategy: s })}
        />
      </Field>

      {(v.strategy === "venta" || v.strategy === "ambos") && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-slate-500">PVP venta / ud.</div>
          {isSueloStd ? (
            <div className="flex items-center gap-2">
              <NumInput
                value={v.salePriceTotal}
                onChange={(n) => onChange({ salePriceTotal: n })}
                suffix="€"
              />
              {(v.salePriceTotal ?? 0) > 0 && (
                <>
                  <span className="text-xs text-slate-500 shrink-0">Venta total</span>
                  <span className="text-sm font-bold text-blue-600 tabular-nums shrink-0">{fmtEUR((v.salePriceTotal ?? 0) * (v.numUnits ?? 1))}</span>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <NumInput
                  value={v.salePriceTotal}
                  onChange={(n) => onChange({
                    salePriceTotal: n,
                    salePriceM2: n != null && v.m2Unit ? Math.round((n / v.m2Unit) * 100) / 100 : v.salePriceM2,
                  })}
                  suffix="€"
                />
                <span className="text-slate-400 text-xs">↔</span>
                <NumInput
                  value={v.salePriceM2}
                  onChange={(n) => onChange({
                    salePriceM2: n,
                    salePriceTotal: n != null && v.m2Unit ? Math.round(n * v.m2Unit) : v.salePriceTotal,
                  })}
                  suffix="€/m²"
                />
              </div>
              {(v.salePriceTotal ?? 0) > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Venta total</span>
                  <span className="text-sm font-bold text-blue-600 tabular-nums">{fmtEUR((v.salePriceTotal ?? 0) * (v.numUnits ?? 1))}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {(v.strategy === "alquiler" || v.strategy === "ambos") && (
        <>
          <Field label="Tipo alquiler">
            <ToggleGroup
              options={[{ v: "TRADICIONAL", label: "Tradicional" }, { v: "HABITACIONES", label: "Habitaciones" }]}
              value={v.rentType}
              onChange={(t) => onChange({ rentType: t })}
            />
          </Field>

          {v.rentType === "TRADICIONAL" && (
            <>
              <Row2>
                <Field label="Renta/mes">
                  <NumInput value={v.rentMonthly} onChange={(n) => onChange({ rentMonthly: n })} suffix="€" />
                </Field>
                <Field label="Nº habitaciones">
                  <div className="flex items-center gap-2">
                    <NumInput value={v.numHabitaciones} onChange={(n) => onChange({ numHabitaciones: n })} />
                    <span className="text-xs text-slate-400 shrink-0">{v.numHabitaciones ?? 0}/{(v.numHabitaciones ?? 0) * (v.numUnits ?? 1)}</span>
                  </div>
                </Field>
              </Row2>
              {(v.rentMonthly ?? 0) > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Ingresos alquiler</span>
                  <span className="text-sm font-bold text-blue-600 tabular-nums">{fmtEUR((v.rentMonthly ?? 0) * (v.numUnits ?? 1))}</span>
                </div>
              )}
            </>
          )}

          {v.rentType === "HABITACIONES" && (
            <>
              {isViviendaStd ? (
                <>
                  {/* vivienda/standard: Nº hab + PVP/hab en misma línea, Ingreso total debajo */}
                  <Row2>
                    <Field label="Nº de habitaciones">
                      <NumInput
                        value={v.numHabitaciones}
                        onChange={(n) => onChange({ numHabitaciones: Math.max(0, Math.round(n ?? 0)), m2PerRoom: undefined, m2CommonAreas: undefined })}
                      />
                    </Field>
                    <Field label="PVP/hab">
                      <NumInput value={v.pricePerRoom} onChange={(n) => onChange({ pricePerRoom: n })} suffix="€/mes" />
                    </Field>
                  </Row2>
                  {(v.numHabitaciones ?? 0) > 0 && (v.pricePerRoom ?? 0) > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Ingreso total</span>
                      <span className="text-sm font-bold text-blue-600 tabular-nums">{fmtEUR((v.numHabitaciones ?? 0) * (v.pricePerRoom ?? 0))}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Nº de habitaciones */}
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-500">Nº de habitaciones</span>
                    <div className="flex items-center gap-2">
                      <NumInput
                        value={v.numHabitaciones}
                        onChange={(n) => onChange({ numHabitaciones: Math.max(0, Math.round(n ?? 0)), m2PerRoom: undefined, m2CommonAreas: undefined })}
                      />
                      {isSueloStd ? (
                        <span className="text-xs text-slate-400 shrink-0">Hab totales <span className="font-bold text-blue-600">{effectiveRoomsPerUnit * numUnitsVal}</span></span>
                      ) : (
                        <span className="text-xs text-slate-400 shrink-0">{effectiveRoomsPerUnit}/{effectiveRoomsPerUnit * numUnitsVal}</span>
                      )}
                      {!isSueloStd && !isViviendaAvz && cat !== "adaptacion" && (
                        <button
                          type="button"
                          onClick={() => setCalcPanelOpen((o) => !o)}
                          className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 bg-white hover:bg-blue-50 rounded-full px-3 py-1.5 transition-colors"
                        >
                          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6M9 12h1m4 0h1M9 17h1m4 0h1M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
                          </svg>
                          Calcular nº hab…
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Panel de cálculo M² — solo en no-suelo-std, no-vivienda-avz y no-adaptacion */}
                  {!isSueloStd && !isViviendaAvz && cat !== "adaptacion" && calcPanelOpen && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-slate-500">M²/hab.</span>
                        <NumInput
                          value={v.m2PerRoom}
                          onChange={(n) => {
                            const newRoomsPerUnit = n && n > 0
                              ? Math.max(0, Math.floor(((v.m2Unit ?? 0) - (v.m2CommonAreas ?? 0)) / n))
                              : 0;
                            onChange({ m2PerRoom: n, numHabitaciones: newRoomsPerUnit });
                          }}
                          suffix="m²"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-slate-500">M² comunes</span>
                        <NumInput
                          value={v.m2CommonAreas}
                          onChange={(n) => {
                            const newUsable = (v.m2Unit ?? 0) - (n ?? 0);
                            const newRoomsPerUnit = v.m2PerRoom && v.m2PerRoom > 0
                              ? Math.max(0, Math.floor(newUsable / v.m2PerRoom))
                              : 0;
                            onChange({ m2CommonAreas: n, numHabitaciones: newRoomsPerUnit });
                          }}
                          suffix="m²"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-slate-500">M² sobrante</span>
                        <div className="px-3 py-2 text-sm border border-slate-100 rounded-lg text-slate-600 bg-slate-50 tabular-nums">
                          {fmtNum(Math.max(0, m2SobrantesPerUnit))} m²
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PVP/hab + Ing./mes — misma fila */}
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-500">PVP/hab</span>
                    <div className="flex items-center gap-2">
                      <NumInput value={v.pricePerRoom} onChange={(n) => onChange({ pricePerRoom: n })} suffix="€/mes" />
                      {(v.pricePerRoom ?? 0) > 0 && (
                        <span className="text-sm font-bold text-blue-600 tabular-nums shrink-0">{fmtEUR(monthlyRooms * numUnitsVal)}</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function StepVivienda({
  data, set, cat, mode,
}: { data: WizardData; set: (p: Partial<WizardData>) => void; cat: WizardCategory; mode: Mode }) {
  const isMulti = cat === "adaptacion" || cat === "suelo" || cat === "local";

  const updateViv = useCallback((id: string, patch: Partial<ViviendaW>) => {
    set({ viviendas: data.viviendas.map((v) => (v.id === id ? { ...v, ...patch } : v)) });
  }, [data.viviendas, set]);

  const addViv = useCallback(() => {
    const last = data.viviendas[data.viviendas.length - 1];
    const newViv: ViviendaW = last
      ? { ...last, id: `v_${Date.now()}_${data.viviendas.length}`, title: `Vivienda ${data.viviendas.length + 1}` }
      : defaultVivienda(data.viviendas.length);
    set({ viviendas: [...data.viviendas, newViv] });
  }, [data.viviendas, set]);

  const removeViv = useCallback((id: string) => {
    if (data.viviendas.length > 1) set({ viviendas: data.viviendas.filter((v) => v.id !== id) });
  }, [data.viviendas, set]);

  return (
    <div className="space-y-3">
      {data.viviendas.map((v) => (
        <div key={v.id}>
          <ViviendaForm v={v} onChange={(p) => updateViv(v.id, p)} mode={mode} isMulti={isMulti} cat={cat} />
          {isMulti && data.viviendas.length > 1 && (
            <button
              type="button" onClick={() => removeViv(v.id)}
              className="mt-1 text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              Eliminar
            </button>
          )}
        </div>
      ))}
      {isMulti && (
        <button
          type="button" onClick={addViv}
          className="w-full py-2 text-xs font-medium text-blue-600 border border-dashed border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
        >
          + Añadir otra vivienda
        </button>
      )}
    </div>
  );
}

// ─── Step: Garaje ─────────────────────────────────────────────────────────────

function StepGaraje({
  data, set, mode, cat,
}: { data: WizardData; set: (p: Partial<WizardData>) => void; mode: Mode; cat: WizardCategory }) {
  const g = data.garaje;
  const upd = (p: Partial<GarajeW>) => set({ garaje: { ...g, ...p } });
  const isAvz = mode === "avanzada";
  const isSueloStd = (cat === "suelo" || cat === "local") && mode === "standard";

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">Deja Nº plazas en 0 si no hay garaje.</p>

      {/* Fila 1: título editable + Nº de plazas */}
      <div className="flex items-center gap-3">
        <input
          type="text" value={g.title}
          onChange={(e) => upd({ title: e.target.value })}
          className="text-sm font-semibold text-slate-700 shrink-0 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-400 focus:outline-none transition-colors"
        />
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs font-medium text-slate-500 shrink-0">Nº de plazas</span>
          <NumInput value={g.numPlazas || undefined} onChange={(n) => upd({ numPlazas: Math.max(0, Math.round(n ?? 0)) })} className="w-24" />
        </div>
      </div>

      {/* M² — solo en no-suelo-std */}
      {!isSueloStd && (
        <Row2>
          <Field label="M² por plaza">
            <NumInput value={g.m2PerPlaza} onChange={(n) => upd({ m2PerPlaza: n ?? 12.5 })} suffix="m²" />
          </Field>
          <Field label="M² accesos totales">
            <NumInput value={g.m2Access} onChange={(n) => upd({ m2Access: n })} suffix="m²" />
          </Field>
        </Row2>
      )}

      <Field label="Estrategia">
        <ToggleGroup
          options={[{ v: "venta", label: "Venta" }, { v: "alquiler", label: "Alquiler" }, { v: "ambos", label: "Ambos" }]}
          value={g.strategy} onChange={(s) => upd({ strategy: s })}
        />
      </Field>
      {(g.strategy === "venta" || g.strategy === "ambos") && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-slate-500">Precio de venta / plaza</div>
          <div className="flex items-center gap-3">
            <NumInput value={g.salePriceTotal} onChange={(n) => upd({ salePriceTotal: n })} suffix="€" />
            {(g.salePriceTotal ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-slate-400">Total</span>
                <span className="text-sm font-bold text-blue-600 tabular-nums">{fmtEUR((g.numPlazas || 0) * (g.salePriceTotal ?? 0))}</span>
              </div>
            )}
          </div>
        </div>
      )}
      {(g.strategy === "alquiler" || g.strategy === "ambos") && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-slate-500">Renta mensual / plaza</div>
          <div className="flex items-center gap-3">
            <NumInput value={g.rentMonthly} onChange={(n) => upd({ rentMonthly: n })} suffix="€/mes" />
            {(g.rentMonthly ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-slate-400">Total</span>
                <span className="text-sm font-bold text-blue-600 tabular-nums">{fmtEUR((g.numPlazas || 0) * (g.rentMonthly ?? 0))}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step: Trastero ───────────────────────────────────────────────────────────

function StepTrastero({
  data, set, mode, cat,
}: { data: WizardData; set: (p: Partial<WizardData>) => void; mode: Mode; cat: WizardCategory }) {
  const t = data.trastero;
  const upd = (p: Partial<TrasteroW>) => set({ trastero: { ...t, ...p } });
  const isAvz = mode === "avanzada";
  const isSueloStd = (cat === "suelo" || cat === "local") && mode === "standard";

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">Deja Nº trasteros en 0 si no hay trasteros.</p>

      {/* Fila 1: título editable + Nº de trasteros */}
      <div className="flex items-center gap-3">
        <input
          type="text" value={t.title}
          onChange={(e) => upd({ title: e.target.value })}
          className="text-sm font-semibold text-slate-700 shrink-0 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-400 focus:outline-none transition-colors"
        />
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs font-medium text-slate-500 shrink-0">Nº de trasteros</span>
          <NumInput value={t.numTrasteros || undefined} onChange={(n) => upd({ numTrasteros: Math.max(0, Math.round(n ?? 0)) })} className="w-24" />
        </div>
      </div>

      {/* M² — solo en no-suelo-std */}
      {!isSueloStd && (
        <Row2>
          <Field label="M² por trastero">
            <NumInput value={t.m2PerUnit} onChange={(n) => upd({ m2PerUnit: n ?? 5 })} suffix="m²" />
          </Field>
          <Field label="M² accesos totales">
            <NumInput value={t.m2Access} onChange={(n) => upd({ m2Access: n })} suffix="m²" />
          </Field>
        </Row2>
      )}

      <Field label="Estrategia">
        <ToggleGroup
          options={[{ v: "venta", label: "Venta" }, { v: "alquiler", label: "Alquiler" }, { v: "ambos", label: "Ambos" }]}
          value={t.strategy} onChange={(s) => upd({ strategy: s })}
        />
      </Field>
      {(t.strategy === "venta" || t.strategy === "ambos") && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-slate-500">Precio de venta / trastero</div>
          <div className="flex items-center gap-3">
            <NumInput value={t.salePriceTotal} onChange={(n) => upd({ salePriceTotal: n })} suffix="€" />
            {(t.salePriceTotal ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-slate-400">Total</span>
                <span className="text-sm font-bold text-blue-600 tabular-nums">{fmtEUR((t.numTrasteros || 0) * (t.salePriceTotal ?? 0))}</span>
              </div>
            )}
          </div>
        </div>
      )}
      {(t.strategy === "alquiler" || t.strategy === "ambos") && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-slate-500">Renta mensual / trastero</div>
          <div className="flex items-center gap-3">
            <NumInput value={t.rentMonthly} onChange={(n) => upd({ rentMonthly: n })} suffix="€/mes" />
            {(t.rentMonthly ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-slate-400">Total</span>
                <span className="text-sm font-bold text-blue-600 tabular-nums">{fmtEUR((t.numTrasteros || 0) * (t.rentMonthly ?? 0))}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step: Obra ───────────────────────────────────────────────────────────────

function StepObra({
  data, set, cat, mode,
}: { data: WizardData; set: (p: Partial<WizardData>) => void; cat: WizardCategory; mode: Mode }) {
  const o = data.obra;
  const upd = (p: Partial<WizardData["obra"]>) => set({ obra: { ...o, ...p } });
  const hasGar = (cat === "suelo" || cat === "local") && data.garaje.numPlazas > 0;
  const hasTras = (cat === "suelo" || cat === "local") && data.trastero.numTrasteros > 0;
  const hasCim = cat === "suelo";
  const hasEsc = cat === "suelo" || cat === "local";
  const isSueloStd = cat === "suelo" && mode === "standard";

  const vivM2 = data.viviendas.reduce((s, v) => s + (v.m2Unit ?? 0) * (v.numUnits || 1), 0);
  const garM2 = hasGar ? data.garaje.numPlazas * (data.garaje.m2PerPlaza || 12.5) + (data.garaje.m2Access || 0) : 0;
  const trasM2 = hasTras ? data.trastero.numTrasteros * (data.trastero.m2PerUnit || 5) + (data.trastero.m2Access || 0) : 0;

  const cimM2 = data.m2Plot ?? 0;

  return (
    <div className="space-y-4">
      {hasCim && (
        <div>
          <Label>Cimentación{!isSueloStd && cimM2 > 0 ? ` (${Math.round(cimM2)} m²)` : ""}</Label>
          <div className="flex items-center gap-2 mt-1">
            {!isSueloStd && (
              <>
                <NumInput
                  value={o.cimentacionPriceM2}
                  onChange={(n) => upd({ cimentacionPriceM2: n, cimentacionTotal: n != null && cimM2 > 0 ? Math.round(n * cimM2) : o.cimentacionTotal })}
                  suffix="€/m²"
                />
                <span className="text-slate-400 text-xs">↔</span>
              </>
            )}
            <NumInput
              value={o.cimentacionTotal}
              onChange={(n) => upd({ cimentacionTotal: n, cimentacionPriceM2: n != null && cimM2 > 0 ? Math.round((n / cimM2) * 100) / 100 : o.cimentacionPriceM2 })}
              suffix="€"
            />
          </div>
        </div>
      )}
      {hasEsc && (
        <div>
          <Label>Escaleras</Label>
          <div className="flex items-center gap-2 mt-1">
            {!isSueloStd && (
              <>
                <NumInput
                  value={o.escalerasM2}
                  onChange={(n) => upd({
                    escalerasM2: n,
                    escalerasTotal: n != null && (o.escalerasPriceM2 ?? 0) > 0 ? Math.round(n * (o.escalerasPriceM2 ?? 0)) : o.escalerasTotal,
                  })}
                  suffix="m²"
                />
                <span className="text-slate-400 text-xs">↔</span>
                <NumInput
                  value={o.escalerasPriceM2}
                  onChange={(n) => upd({
                    escalerasPriceM2: n,
                    escalerasTotal: n != null && (o.escalerasM2 ?? 0) > 0 ? Math.round(n * (o.escalerasM2 ?? 0)) : o.escalerasTotal,
                  })}
                  suffix="€/m²"
                />
                <span className="text-slate-400 text-xs">↔</span>
              </>
            )}
            <NumInput
              value={o.escalerasTotal}
              onChange={(n) => upd({
                escalerasTotal: n,
                escalerasPriceM2: n != null && (o.escalerasM2 ?? 0) > 0 ? Math.round((n / (o.escalerasM2 ?? 0)) * 100) / 100 : o.escalerasPriceM2,
              })}
              suffix="€"
            />
          </div>
        </div>
      )}
      {hasEsc && (
        <div>
          <Label>Accesos</Label>
          <div className="flex items-center gap-2 mt-1">
            {!isSueloStd && (
              <>
                <NumInput
                  value={o.accesosM2}
                  onChange={(n) => upd({
                    accesosM2: n,
                    accesosTotal: n != null && (o.accesosPriceM2 ?? 0) > 0 ? Math.round(n * (o.accesosPriceM2 ?? 0)) : o.accesosTotal,
                  })}
                  suffix="m²"
                />
                <span className="text-slate-400 text-xs">↔</span>
                <NumInput
                  value={o.accesosPriceM2}
                  onChange={(n) => upd({
                    accesosPriceM2: n,
                    accesosTotal: n != null && (o.accesosM2 ?? 0) > 0 ? Math.round(n * (o.accesosM2 ?? 0)) : o.accesosTotal,
                  })}
                  suffix="€/m²"
                />
                <span className="text-slate-400 text-xs">↔</span>
              </>
            )}
            <NumInput
              value={o.accesosTotal}
              onChange={(n) => upd({
                accesosTotal: n,
                accesosPriceM2: n != null && (o.accesosM2 ?? 0) > 0 ? Math.round((n / (o.accesosM2 ?? 0)) * 100) / 100 : o.accesosPriceM2,
              })}
              suffix="€"
            />
          </div>
        </div>
      )}
      {data.viviendas.length > 0 && (
        <div>
          <Label>Obra vivienda{!isSueloStd && vivM2 > 0 ? ` (${Math.round(vivM2)} m²)` : ""}</Label>
          <div className="flex items-center gap-2 mt-1">
            {!isSueloStd && (
              <>
                <NumInput
                  value={o.obraViviendaPriceM2}
                  onChange={(n) => upd({ obraViviendaPriceM2: n, obraViviendaTotal: n != null && vivM2 > 0 ? Math.round(n * vivM2) : o.obraViviendaTotal })}
                  suffix="€/m²"
                />
                <span className="text-slate-400 text-xs">↔</span>
              </>
            )}
            <NumInput
              value={o.obraViviendaTotal}
              onChange={(n) => upd({ obraViviendaTotal: n, obraViviendaPriceM2: n != null && vivM2 > 0 ? Math.round((n / vivM2) * 100) / 100 : o.obraViviendaPriceM2 })}
              suffix="€"
            />
          </div>
        </div>
      )}
      {hasGar && (
        <div>
          <Label>Obra garaje{!isSueloStd && garM2 > 0 ? ` (${Math.round(garM2)} m²)` : ""}</Label>
          <div className="flex items-center gap-2 mt-1">
            {!isSueloStd && (
              <>
                <NumInput
                  value={o.obraGarajePriceM2}
                  onChange={(n) => upd({ obraGarajePriceM2: n, obraGarajeTotal: n != null && garM2 > 0 ? Math.round(n * garM2) : o.obraGarajeTotal })}
                  suffix="€/m²"
                />
                <span className="text-slate-400 text-xs">↔</span>
              </>
            )}
            <NumInput
              value={o.obraGarajeTotal}
              onChange={(n) => upd({ obraGarajeTotal: n, obraGarajePriceM2: n != null && garM2 > 0 ? Math.round((n / garM2) * 100) / 100 : o.obraGarajePriceM2 })}
              suffix="€"
            />
          </div>
        </div>
      )}
      {hasTras && (
        <div>
          <Label>Obra trastero{!isSueloStd && trasM2 > 0 ? ` (${Math.round(trasM2)} m²)` : ""}</Label>
          <div className="flex items-center gap-2 mt-1">
            {!isSueloStd && (
              <>
                <NumInput
                  value={o.obraTrasterosPriceM2}
                  onChange={(n) => upd({ obraTrasterosPriceM2: n, obraTrasterosTotal: n != null && trasM2 > 0 ? Math.round(n * trasM2) : o.obraTrasterosTotal })}
                  suffix="€/m²"
                />
                <span className="text-slate-400 text-xs">↔</span>
              </>
            )}
            <NumInput
              value={o.obraTrasterosTotal}
              onChange={(n) => upd({ obraTrasterosTotal: n, obraTrasterosPriceM2: n != null && trasM2 > 0 ? Math.round((n / trasM2) * 100) / 100 : o.obraTrasterosPriceM2 })}
              suffix="€"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step: Costes ─────────────────────────────────────────────────────────────

function StepCostes({
  data, set, mode, cat,
}: { data: WizardData; set: (p: Partial<WizardData>) => void; mode: Mode; cat: WizardCategory }) {
  const c = data.costes;
  const upd = (p: Partial<WizardData["costes"]>) => set({ costes: { ...c, ...p } });
  const isStd = mode === "standard";
  const isViviendaAvz = cat === "vivienda" && mode === "avanzada";

  const obraEst = (data.obra.obraViviendaTotal ?? 0) + (data.obra.obraGarajeTotal ?? 0)
    + (data.obra.obraTrasterosTotal ?? 0) + (data.obra.cimentacionTotal ?? 0)
    + (data.obra.escalerasTotal ?? 0) + (data.obra.accesosTotal ?? 0);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-medium text-slate-500 mb-1">Arquitecto</div>
        <div className="flex items-center gap-2">
          {!isStd && (
            <>
              <NumInput
                value={c.arquitectoPct}
                onChange={(n) => upd({ arquitectoPct: n ?? 3, arquitectoTotal: undefined })}
                suffix="%"
                className="w-20"
              />
              <span className="text-slate-400 text-xs">↔</span>
            </>
          )}
          <NumInput
            value={c.arquitectoTotal ?? (obraEst > 0 ? Math.round((c.arquitectoPct / 100) * obraEst) : undefined)}
            onChange={(n) => upd({
              arquitectoTotal: n,
              arquitectoPct: n != null && obraEst > 0 ? Math.round((n / obraEst) * 10000) / 100 : c.arquitectoPct,
            })}
            suffix="€"
          />
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-slate-500 mb-1">Desviaciones</div>
        <div className="flex items-center gap-2">
          {!isStd && (
            <>
              <NumInput
                value={c.desviacionesPct}
                onChange={(n) => upd({ desviacionesPct: n, desviacionesTotal: undefined })}
                suffix="%"
                className="w-20"
              />
              <span className="text-slate-400 text-xs">↔</span>
            </>
          )}
          <NumInput
            value={c.desviacionesTotal ?? (obraEst > 0 && c.desviacionesPct ? Math.round((c.desviacionesPct / 100) * obraEst) : undefined)}
            onChange={(n) => upd({
              desviacionesTotal: n,
              desviacionesPct: n != null && obraEst > 0 ? Math.round((n / obraEst) * 10000) / 100 : c.desviacionesPct,
            })}
            suffix="€"
          />
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-slate-500 mb-1">Impuesto compra</div>
        <div className="flex items-center gap-2">
          {!isStd && (
            <>
              <NumInput
                value={c.purchaseTaxPct}
                onChange={(n) => upd({ purchaseTaxPct: n ?? 8, purchaseTaxTotal: undefined })}
                suffix="%"
                className="w-20"
              />
              <span className="text-slate-400 text-xs">↔</span>
            </>
          )}
          <NumInput
            value={c.purchaseTaxTotal ?? (data.purchasePrice > 0 ? Math.round((c.purchaseTaxPct / 100) * data.purchasePrice) : undefined)}
            onChange={(n) => upd({
              purchaseTaxTotal: n,
              purchaseTaxPct: n != null && data.purchasePrice > 0 ? Math.round((n / data.purchasePrice) * 10000) / 100 : c.purchaseTaxPct,
            })}
            suffix="€"
          />
        </div>
      </div>
      {!isViviendaAvz && (
        <>
          <Field label="Tasas y licencias — total (opcional)">
            <NumInput
              value={c.licenciasTotal}
              onChange={(n) => upd({ licenciasTotal: n })}
              suffix="€"
              placeholder="Auto (calculado)"
            />
          </Field>
          <p className="text-xs text-slate-400">
            Si dejas vacío las tasas se calculan automáticamente con los porcentajes por defecto.
          </p>
        </>
      )}
      <Field label="Mobiliario por vivienda (opcional)">
        <NumInput
          value={c.furnitureCostPerUnit}
          onChange={(n) => upd({ furnitureCostPerUnit: n })}
          suffix="€/viv"
          placeholder="0"
        />
      </Field>
    </div>
  );
}

// ─── Step: Coste (local/standard — Obra + Costes fusionados) ─────────────────

function StepCoste({
  data, set, cat,
}: { data: WizardData; set: (p: Partial<WizardData>) => void; cat: WizardCategory }) {
  const o = data.obra;
  const c = data.costes;
  const updO = (p: Partial<WizardData["obra"]>) => set({ obra: { ...o, ...p } });
  const updC = (p: Partial<WizardData["costes"]>) => set({ costes: { ...c, ...p } });

  const hasGar = (cat === "suelo" || cat === "local") && data.garaje.numPlazas > 0;
  const hasTras = (cat === "suelo" || cat === "local") && data.trastero.numTrasteros > 0;

  const obraEst = (o.obraViviendaTotal ?? 0) + (o.obraGarajeTotal ?? 0)
    + (o.obraTrasterosTotal ?? 0) + (o.escalerasTotal ?? 0) + (o.accesosTotal ?? 0);

  if (cat === "adaptacion") {
    return (
      <div className="space-y-3">
        {/* Obra accesos — solo (sin escalera) */}
        <Field label="Obra accesos">
          <NumInput value={o.accesosTotal} onChange={(n) => updO({ accesosTotal: n })} suffix="€" />
        </Field>

        {/* Obra vivienda */}
        <Field label="Obra vivienda">
          <NumInput value={o.obraViviendaTotal} onChange={(n) => updO({ obraViviendaTotal: n })} suffix="€" />
        </Field>

        {/* Arquitecto | Desviaciones */}
        <Row2>
          <Field label="Arquitecto">
            <NumInput
              value={c.arquitectoTotal ?? (obraEst > 0 ? Math.round((c.arquitectoPct / 100) * obraEst) : undefined)}
              onChange={(n) => updC({ arquitectoTotal: n, arquitectoPct: n != null && obraEst > 0 ? Math.round((n / obraEst) * 10000) / 100 : c.arquitectoPct })}
              suffix="€"
            />
          </Field>
          <Field label="Desviaciones">
            <NumInput
              value={c.desviacionesTotal ?? (obraEst > 0 && c.desviacionesPct ? Math.round((c.desviacionesPct / 100) * obraEst) : undefined)}
              onChange={(n) => updC({ desviacionesTotal: n, desviacionesPct: n != null && obraEst > 0 ? Math.round((n / obraEst) * 10000) / 100 : c.desviacionesPct })}
              suffix="€"
            />
          </Field>
        </Row2>

        {/* Impuesto compra | Tasas y licencias */}
        <Row2>
          <Field label="Impuesto compra">
            <NumInput
              value={c.purchaseTaxTotal ?? (data.purchasePrice > 0 ? Math.round((c.purchaseTaxPct / 100) * data.purchasePrice) : undefined)}
              onChange={(n) => updC({ purchaseTaxTotal: n, purchaseTaxPct: n != null && data.purchasePrice > 0 ? Math.round((n / data.purchasePrice) * 10000) / 100 : c.purchaseTaxPct })}
              suffix="€"
            />
          </Field>
          <Field label="Tasas y licencias">
            <NumInput value={c.licenciasTotal} onChange={(n) => updC({ licenciasTotal: n })} suffix="€" placeholder="Auto" />
          </Field>
        </Row2>
        <Field label="Mobiliario por vivienda (opcional)">
          <NumInput value={c.furnitureCostPerUnit} onChange={(n) => updC({ furnitureCostPerUnit: n })} suffix="€/viv" placeholder="0" />
        </Field>
      </div>
    );
  }

  if (cat === "vivienda") {
    return (
      <div className="space-y-3">
        {/* Obra vivienda | Arquitecto */}
        <Row2>
          <Field label="Obra vivienda">
            <NumInput value={o.obraViviendaTotal} onChange={(n) => updO({ obraViviendaTotal: n })} suffix="€" />
          </Field>
          <Field label="Arquitecto">
            <NumInput
              value={c.arquitectoTotal ?? (obraEst > 0 ? Math.round((c.arquitectoPct / 100) * obraEst) : undefined)}
              onChange={(n) => updC({ arquitectoTotal: n, arquitectoPct: n != null && obraEst > 0 ? Math.round((n / obraEst) * 10000) / 100 : c.arquitectoPct })}
              suffix="€"
            />
          </Field>
        </Row2>
        {/* Impuesto compra: % + total misma línea */}
        <div>
          <Label>Impuesto compra</Label>
          <div className="flex items-center gap-2 mt-1">
            <NumInput
              value={c.purchaseTaxPct}
              onChange={(n) => updC({ purchaseTaxPct: n ?? 8, purchaseTaxTotal: undefined })}
              suffix="%"
              className="w-20"
            />
            <span className="text-slate-400 text-xs">→</span>
            <NumInput
              value={c.purchaseTaxTotal ?? (data.purchasePrice > 0 ? Math.round((c.purchaseTaxPct / 100) * data.purchasePrice) : undefined)}
              onChange={(n) => updC({ purchaseTaxTotal: n, purchaseTaxPct: n != null && data.purchasePrice > 0 ? Math.round((n / data.purchasePrice) * 10000) / 100 : c.purchaseTaxPct })}
              suffix="€"
            />
          </div>
        </div>
        {/* Tasas y licencias — auto */}
        <Field label="Tasas y licencias — total (opcional)">
          <NumInput value={c.licenciasTotal} onChange={(n) => updC({ licenciasTotal: n })} suffix="€" placeholder="Auto (calculado)" />
        </Field>
        <Field label="Mobiliario por vivienda (opcional)">
          <NumInput value={c.furnitureCostPerUnit} onChange={(n) => updC({ furnitureCostPerUnit: n })} suffix="€/viv" placeholder="0" />
        </Field>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Obra accesos | Obra escalera */}
      <Row2>
        <Field label="Obra accesos">
          <NumInput value={o.accesosTotal} onChange={(n) => updO({ accesosTotal: n })} suffix="€" />
        </Field>
        <Field label="Obra escalera">
          <NumInput value={o.escalerasTotal} onChange={(n) => updO({ escalerasTotal: n })} suffix="€" />
        </Field>
      </Row2>

      {/* Obra vivienda */}
      <Field label="Obra vivienda">
        <NumInput value={o.obraViviendaTotal} onChange={(n) => updO({ obraViviendaTotal: n })} suffix="€" />
      </Field>

      {/* Obra garaje | Obra trastero */}
      {(hasGar || hasTras) && (
        <div className={`grid gap-3 ${hasGar && hasTras ? "grid-cols-2" : "grid-cols-1"}`}>
          {hasGar && (
            <Field label="Obra garaje">
              <NumInput value={o.obraGarajeTotal} onChange={(n) => updO({ obraGarajeTotal: n })} suffix="€" />
            </Field>
          )}
          {hasTras && (
            <Field label="Obra trastero">
              <NumInput value={o.obraTrasterosTotal} onChange={(n) => updO({ obraTrasterosTotal: n })} suffix="€" />
            </Field>
          )}
        </div>
      )}

      {/* Arquitecto | Desviaciones */}
      <Row2>
        <Field label="Arquitecto">
          <NumInput
            value={c.arquitectoTotal ?? (obraEst > 0 ? Math.round((c.arquitectoPct / 100) * obraEst) : undefined)}
            onChange={(n) => updC({ arquitectoTotal: n, arquitectoPct: n != null && obraEst > 0 ? Math.round((n / obraEst) * 10000) / 100 : c.arquitectoPct })}
            suffix="€"
          />
        </Field>
        <Field label="Desviaciones">
          <NumInput
            value={c.desviacionesTotal ?? (obraEst > 0 && c.desviacionesPct ? Math.round((c.desviacionesPct / 100) * obraEst) : undefined)}
            onChange={(n) => updC({ desviacionesTotal: n, desviacionesPct: n != null && obraEst > 0 ? Math.round((n / obraEst) * 10000) / 100 : c.desviacionesPct })}
            suffix="€"
          />
        </Field>
      </Row2>

      {/* Impuesto compra | Tasas y licencias */}
      <Row2>
        <Field label="Impuesto compra">
          <NumInput
            value={c.purchaseTaxTotal ?? (data.purchasePrice > 0 ? Math.round((c.purchaseTaxPct / 100) * data.purchasePrice) : undefined)}
            onChange={(n) => updC({ purchaseTaxTotal: n, purchaseTaxPct: n != null && data.purchasePrice > 0 ? Math.round((n / data.purchasePrice) * 10000) / 100 : c.purchaseTaxPct })}
            suffix="€"
          />
        </Field>
        <Field label="Tasas y licencias">
          <NumInput value={c.licenciasTotal} onChange={(n) => updC({ licenciasTotal: n })} suffix="€" placeholder="Auto" />
        </Field>
      </Row2>
      <Field label="Mobiliario por vivienda (opcional)">
        <NumInput value={c.furnitureCostPerUnit} onChange={(n) => updC({ furnitureCostPerUnit: n })} suffix="€/viv" placeholder="0" />
      </Field>
    </div>
  );
}

// ─── Step: Financiación ───────────────────────────────────────────────────────

function StepFinanciacion({
  data, set,
}: { data: WizardData; set: (p: Partial<WizardData>) => void; mode: Mode }) {
  const f = data.financiacion;
  const upd = (p: Partial<WizardData["financiacion"]>) => set({ financiacion: { ...f, ...p } });

  const obraEst = (data.obra.obraViviendaTotal ?? 0) + (data.obra.obraGarajeTotal ?? 0)
    + (data.obra.obraTrasterosTotal ?? 0) + (data.obra.cimentacionTotal ?? 0)
    + (data.obra.escalerasTotal ?? 0) + (data.obra.accesosTotal ?? 0);

  const compraAmt = f.compraAmount != null ? f.compraAmount : (f.compraPct / 100) * data.purchasePrice;
  const obraAmt   = f.obraAmount   != null ? f.obraAmount   : (f.obraPct   / 100) * obraEst;

  const compraMonthly = f.compraYears && f.compraYears > 0
    ? calcFrench(compraAmt, f.compraInterest, f.compraYears) : 0;
  const obraMonthly = f.obraYears && f.obraYears > 0
    ? calcFrench(obraAmt, f.obraInterest, f.obraYears) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Activar financiación</span>
        <button
          type="button"
          onClick={() => upd({ enabled: !f.enabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${f.enabled ? "bg-blue-600" : "bg-slate-200"}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${f.enabled ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>
      {f.enabled && (
        <>
          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Préstamo compra</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 shrink-0">Importe</span>
              <NumInput value={f.compraPct} onChange={(n) => upd({ compraPct: n ?? 60, compraAmount: n != null ? (n / 100) * data.purchasePrice : undefined })} suffix="%" className="w-16" />
              <span className="text-slate-400 text-sm">↔</span>
              <NumInput value={compraAmt || undefined} onChange={(n) => upd({ compraAmount: n, compraPct: n != null && data.purchasePrice > 0 ? Math.round((n / data.purchasePrice) * 10000) / 100 : f.compraPct })} suffix="€" />
            </div>
            <Row2>
              <Field label="TIN anual">
                <NumInput value={f.compraInterest} onChange={(n) => upd({ compraInterest: n ?? 5.1 })} suffix="%" />
              </Field>
              <Field label="Plazo (años)">
                <NumInput value={f.compraYears} onChange={(n) => upd({ compraYears: n })} suffix="años" />
              </Field>
            </Row2>
            <Field label="Cuota/mes">
              <NumInput
                value={compraMonthly || undefined}
                onChange={(n) => {
                  if (n == null) return;
                  const tin = calcTINFromCuota(compraAmt, f.compraYears ?? 0, n);
                  upd({ compraInterest: Math.round(tin * 1000) / 1000 });
                }}
                suffix="€"
              />
            </Field>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Préstamo obra</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 shrink-0">Importe</span>
              <NumInput value={f.obraPct} onChange={(n) => upd({ obraPct: n ?? 60, obraAmount: n != null ? (n / 100) * obraEst : undefined })} suffix="%" className="w-16" />
              <span className="text-slate-400 text-sm">↔</span>
              <NumInput value={obraAmt || undefined} onChange={(n) => upd({ obraAmount: n, obraPct: n != null && obraEst > 0 ? Math.round((n / obraEst) * 10000) / 100 : f.obraPct })} suffix="€" />
            </div>
            <Row2>
              <Field label="TIN anual">
                <NumInput value={f.obraInterest} onChange={(n) => upd({ obraInterest: n ?? 5.1 })} suffix="%" />
              </Field>
              <Field label="Plazo (años)">
                <NumInput value={f.obraYears} onChange={(n) => upd({ obraYears: n })} suffix="años" />
              </Field>
            </Row2>
            <Field label="Cuota/mes">
              <NumInput
                value={obraMonthly || undefined}
                onChange={(n) => {
                  if (n == null) return;
                  const tin = calcTINFromCuota(obraAmt, f.obraYears ?? 0, n);
                  upd({ obraInterest: Math.round(tin * 1000) / 1000 });
                }}
                suffix="€"
              />
            </Field>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

const CATEGORIES: { id: WizardCategory; label: string; desc: string; icon: string }[] = [
  { id: "vivienda",   label: "Vivienda convencional",     desc: "Una sola vivienda: compra, reforma y venta o alquiler",            icon: "🏠" },
  { id: "local",      label: "Conversión de local",       desc: "Transformar un local en viviendas, garajes o trasteros",           icon: "🔄" },
  { id: "suelo",      label: "Suelo / Edificio",         desc: "Construcción nueva completa con viviendas, garajes y trasteros",   icon: "🏗️" },
  { id: "adaptacion", label: "Adaptación en unidades",   desc: "Dividir una vivienda en varias unidades independientes",           icon: "🔧" },
];

export interface RealEstateWizardProps {
  baseOp: REOperation;
  onDone: (op: REOperation) => void;
  onCancel: () => void;
}

export function RealEstateWizard({ baseOp, onDone, onCancel }: RealEstateWizardProps) {
  const savedDraft = baseOp._wizardDraft;
  const [phase, setPhase] = useState<"category" | "mode" | "form">(() =>
    savedDraft ? "form" : "category"
  );
  const [cat, setCat] = useState<WizardCategory | null>(() =>
    savedDraft ? (savedDraft.cat as WizardCategory) : null
  );
  const [mode, setMode] = useState<Mode>(() =>
    savedDraft ? (savedDraft.mode as Mode) : "standard"
  );
  const [stepIdx, setStepIdx] = useState(() => {
    if (savedDraft) {
      const steps = getSteps(savedDraft.cat as WizardCategory, savedDraft.mode as Mode);
      const idx = steps.indexOf(savedDraft.step as StepId);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });
  const [data, setData] = useState<WizardData>(() => {
    if (savedDraft?.data) return savedDraft.data as WizardData;
    return { ...DEFAULT_DATA, name: baseOp.name !== "Nueva operación" ? baseOp.name : "" };
  });
  const [showTypeChanger, setShowTypeChanger] = useState(false);

  const steps = cat ? getSteps(cat, mode) : [];
  const currentStep = steps[stepIdx] as StepId | undefined;
  const isLast = stepIdx === steps.length - 1;

  const set = useCallback((p: Partial<WizardData>) => setData((d) => ({ ...d, ...p })), []);

  const canCreate = (): boolean =>
    phase === "form" && !!cat && data.name.trim().length > 0 && data.purchasePrice > 0;

  const canNext = (): boolean => {
    if (phase === "category") return cat !== null;
    if (phase === "mode") return true;
    if (phase === "form" && isLast) return false;
    if (currentStep === "datos") return data.name.trim().length > 0 && data.purchasePrice > 0;
    return true;
  };

  const handleNext = () => {
    if (phase === "category") {
      setData((d) => ({
        ...d,
        financiacion: {
          ...d.financiacion,
          compraPct: cat === "vivienda" ? 80 : 60,
          obraPct: 60,
          compraYears: d.financiacion.compraYears ?? 20,
          obraYears: d.financiacion.obraYears ?? 20,
        },
      }));
      setPhase("mode");
      return;
    }
    if (phase === "mode") { setPhase("form"); setStepIdx(0); return; }
    if (!isLast) setStepIdx((i) => i + 1);
  };

  const handleCreate = () => {
    if (!cat || !canCreate()) return;
    const hydrated = hydrateOperation(baseOp, data, cat);
    onDone({ ...hydrated, isDraft: undefined, _wizardDraft: undefined, _cat: cat });
  };

  const handleSaveDraft = () => {
    if (!cat) return;
    const hydrated = hydrateOperation(baseOp, data, cat);
    onDone({
      ...hydrated,
      isDraft: true,
      _cat: cat,
      _wizardDraft: { cat, mode, step: currentStep ?? "datos", data },
    });
  };

  const handleTypeChangeRequest = (newCat: WizardCategory) => {
    if (newCat === cat) { setShowTypeChanger(false); return; }
    const hasData = data.purchasePrice > 0 || data.name.trim().length > 0;
    if (hasData) {
      if (!confirm("Cambiar el tipo puede ajustar algunos campos no compatibles. Los datos comunes se conservarán. ¿Cambiar tipo?")) {
        setShowTypeChanger(false);
        return;
      }
    }
    setCat(newCat);
    setStepIdx(0);
    setShowTypeChanger(false);
  };

  const handleBack = () => {
    if (phase === "form" && stepIdx > 0) { setStepIdx((i) => i - 1); return; }
    if (phase === "form") { setPhase("mode"); return; }
    if (phase === "mode") { setPhase("category"); return; }
  };

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Si el usuario cierra el wizard mientras ya estaba en el formulario, guarda
  // automáticamente como borrador en lugar de eliminar la operación.
  const handleCancelOrClose = useCallback(() => {
    if (phase === "form" && cat) {
      const hydrated = hydrateOperation(baseOp, data, cat);
      onDone({
        ...hydrated,
        isDraft: true,
        _cat: cat,
        _wizardDraft: { cat, mode, step: currentStep ?? "datos", data },
      });
    } else {
      onCancel();
    }
  }, [phase, cat, baseOp, data, mode, currentStep, onDone, onCancel]);

  const isResumingDraft = !!savedDraft;

  // Cerrar con Escape (guarda borrador si procede, igual que el botón/backdrop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancelOrClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCancelOrClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div className="absolute inset-0 bg-black/40" onClick={handleCancelOrClose} />
      <div className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="relative flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 id="wizard-title" className="text-base font-bold text-slate-900">
              {isResumingDraft ? "Continuar borrador" : "Nueva operación"}
            </h2>
            {phase === "form" && cat && (
              <button
                type="button"
                onClick={() => setShowTypeChanger((v) => !v)}
                className="flex items-center gap-1 mt-0.5 text-xs text-slate-400 hover:text-blue-600 transition-colors group"
              >
                <span>{CATEGORIES.find((c) => c.id === cat)?.icon}</span>
                <span>{CATEGORIES.find((c) => c.id === cat)?.label}</span>
                <span className="text-[10px] opacity-60 group-hover:opacity-100">▾</span>
              </button>
            )}
          </div>
          <button type="button" onClick={handleCancelOrClose} aria-label="Cerrar" className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Type changer dropdown */}
          {showTypeChanger && (
            <div className="absolute top-full left-4 z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-2 w-72">
              <p className="text-xs text-slate-500 font-medium px-2 py-1 mb-1">Cambiar tipo</p>
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleTypeChangeRequest(c.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left ${cat === c.id ? "bg-blue-50" : ""}`}
                >
                  <span className="text-xl">{c.icon}</span>
                  <div>
                    <div className={`text-sm font-medium ${cat === c.id ? "text-blue-600" : "text-slate-800"}`}>{c.label}</div>
                    <div className="text-xs text-slate-400">{c.desc}</div>
                  </div>
                  {cat === c.id && <span className="ml-auto text-blue-500 text-sm">✓</span>}
                </button>
              ))}
              <button type="button" onClick={() => setShowTypeChanger(false)} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 text-xs p-1">✕</button>
            </div>
          )}
        </div>

        {/* Progress (form only) */}
        {phase === "form" && steps.length > 0 && (
          <div className="flex items-center gap-1 px-5 py-2 border-b border-slate-100 flex-shrink-0 overflow-x-auto">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setStepIdx(i)}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
                    i === stepIdx ? "bg-blue-600 text-white" :
                    i < stepIdx ? "bg-blue-100 text-blue-700 hover:bg-blue-200" :
                    "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {STEP_LABELS[s]}
                </button>
                {i < steps.length - 1 && <span className="text-slate-300 text-xs">›</span>}
              </div>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">

          {/* Phase: category */}
          {phase === "category" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 mb-4">¿Qué tipo de inversión es?</p>
              {CATEGORIES.map((c) => (
                <button
                  key={c.id} type="button"
                  onClick={() => setCat(c.id)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    cat === c.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{c.icon}</span>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{c.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{c.desc}</div>
                    </div>
                    {cat === c.id && (
                      <svg className="w-5 h-5 text-blue-500 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Phase: mode */}
          {phase === "mode" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 mb-4">¿Con cuánto detalle quieres configurarlo?</p>
              {([
                { id: "standard" as Mode, label: "Standard", desc: "Campos esenciales. Rápido de rellenar." },
                { id: "avanzada" as Mode, label: "Avanzada", desc: "Todos los campos: m², precios, títulos, intereses..." },
              ]).map((m) => (
                <button
                  key={m.id} type="button"
                  onClick={() => setMode(m.id)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    mode === m.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-900">{m.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{m.desc}</div>
                    </div>
                    {mode === m.id && (
                      <svg className="w-5 h-5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Phase: form steps */}
          {phase === "form" && cat && currentStep === "datos" && (
            <StepDatos data={data} set={set} cat={cat} mode={mode} />
          )}
          {phase === "form" && cat && currentStep === "vivienda" && (
            <StepVivienda data={data} set={set} cat={cat} mode={mode} />
          )}
          {phase === "form" && cat && currentStep === "garaje" && (
            <StepGaraje data={data} set={set} mode={mode} cat={cat} />
          )}
          {phase === "form" && cat && currentStep === "trastero" && (
            <StepTrastero data={data} set={set} mode={mode} cat={cat} />
          )}
          {phase === "form" && cat && currentStep === "obra" && (
            <StepObra data={data} set={set} cat={cat} mode={mode as Mode} />
          )}
          {phase === "form" && cat && currentStep === "costes" && (
            <StepCostes data={data} set={set} mode={mode} cat={cat} />
          )}
          {phase === "form" && cat && currentStep === "coste" && (
            <StepCoste data={data} set={set} cat={cat} />
          )}
          {phase === "form" && cat && currentStep === "financiacion" && (
            <StepFinanciacion data={data} set={set} mode={mode} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 flex-shrink-0">
          <button
            type="button"
            onClick={phase === "category" ? onCancel : handleBack}
            className="px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shrink-0"
          >
            Atrás
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={phase !== "form" || !cat}
            className={`px-3 py-2 text-sm border rounded-lg transition-colors shrink-0 ${
              phase === "form" && cat
                ? "text-slate-600 border-slate-200 hover:bg-slate-50"
                : "text-slate-300 border-slate-100 cursor-not-allowed"
            }`}
          >
            Guardar borrador
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleNext}
            disabled={!canNext()}
            className={`px-3 py-2 text-sm font-medium border rounded-lg transition-colors shrink-0 ${
              canNext()
                ? "text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100"
                : "text-slate-300 border-slate-100 cursor-not-allowed"
            }`}
          >
            Siguiente →
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate()}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors shrink-0 ${
              canCreate()
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            Crear operación
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Drawer as Vaul } from "vaul";
import { toast } from "sonner";
import type { REOperation, REUnit, UnitType } from "@/src/lib/realEstate";
import { DEFAULT_TASAS } from "@/src/lib/realEstate";
import { calcResults, calcNumTrasteros, calcNumPlazas, calcTINFromCuota, fmtEUR, fmtNum, fmtPct, convertRealEstateOperationType } from "@/src/lib/realEstateCalc";
import { ScenariosPanel } from "./ScenariosPanel";
import { TrackingModal } from "./tracking/TrackingModal";

type RealEstateCategory = "vivienda" | "local" | "suelo" | "adaptacion";

const RE_CATEGORIES: { id: RealEstateCategory; label: string; icon: string; desc: string }[] = [
  { id: "vivienda",   label: "Vivienda convencional",  icon: "🏠", desc: "Compra y reforma de viviendas" },
  { id: "local",      label: "Conversión de local",    icon: "🔄", desc: "Local a uso residencial" },
  { id: "suelo",      label: "Suelo / Edificio",       icon: "🏗️", desc: "Edificación sobre suelo" },
  { id: "adaptacion", label: "Adaptación en unidades", icon: "🔧", desc: "División o adaptación de espacios" },
];

// ==================== NUM INPUT ====================

interface NumInputProps {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  suffix?: string;
  className?: string;
}

const fmtDisplay = (v: number | undefined): string => {
  if (v == null || v === 0) return "";
  return v.toLocaleString("es-ES", { maximumFractionDigits: 2 });
};

const parseSpanish = (s: string): number => {
  const clean = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
};

function NumInput({ value, onChange, placeholder = "0", suffix, className = "" }: NumInputProps) {
  const [local, setLocal] = useState(() => fmtDisplay(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(fmtDisplay(value));
  }, [value]);

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        inputMode="decimal"
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={() => {
          focused.current = true;
          // Strip thousands separators (dots) but keep decimal comma
          setLocal(local.replace(/\./g, ""));
        }}
        onBlur={() => {
          focused.current = false;
          const num = parseSpanish(local);
          onChange(num !== 0 ? num : undefined);
          setLocal(fmtDisplay(num));
        }}
        className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors ${suffix ? "pr-8" : ""} ${className}`}
      />
      {suffix && (
        <span className="absolute right-2.5 text-xs text-slate-400 pointer-events-none">{suffix}</span>
      )}
    </div>
  );
}

// ==================== SECTION BLOCK ====================

interface SectionBlockProps {
  title: string;
  badge?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  id?: string;
}

function SectionBlock({ title, badge, open, onToggle, children, id }: SectionBlockProps) {
  return (
    <div id={id} className="re-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[var(--surface-alt)] transition-colors text-left"
      >
        <span className="text-sm font-bold text-ink tracking-tight">{title}</span>
        <div className="flex items-center gap-2.5">
          {badge && <span className="text-sm font-bold text-ink-muted tabular-nums">{badge}</span>}
          <svg
            className={`w-4 h-4 text-ink-subtle transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && <div className="px-5 py-4 space-y-3 border-t border-line bg-white">{children}</div>}
    </div>
  );
}

// ==================== FIELD HELPERS ====================

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function BiRow({
  label,
  leftLabel,
  rightLabel,
  leftValue,
  rightValue,
  onLeftChange,
  onRightChange,
  leftSuffix,
  rightSuffix,
}: {
  label: string;
  leftLabel?: string;
  rightLabel?: string;
  leftValue: number | undefined;
  rightValue: number | undefined;
  onLeftChange: (v: number | undefined) => void;
  onRightChange: (v: number | undefined) => void;
  leftSuffix?: string;
  rightSuffix?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 mb-1 block">{label}</label>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
        <div>
          {leftLabel && <div className="text-[10px] text-slate-400 mb-0.5">{leftLabel}</div>}
          <NumInput value={leftValue} onChange={onLeftChange} suffix={leftSuffix} />
        </div>
        <span className="text-slate-400 text-sm">↔</span>
        <div>
          {rightLabel && <div className="text-[10px] text-slate-400 mb-0.5">{rightLabel}</div>}
          <NumInput value={rightValue} onChange={onRightChange} suffix={rightSuffix} />
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "positive" | "info" | "accent" }) {
  const valueColor =
    tone === "positive" ? "var(--positive)" :
    tone === "info" ? "var(--brand)" :
    tone === "accent" ? "var(--accent)" :
    "var(--ink)";
  return (
    <div className="rounded-xl border border-line p-3" style={{ background: "var(--surface-alt)" }}>
      <div className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wide mb-1">{label}</div>
      <div className="text-lg font-extrabold tabular-nums" style={{ color: valueColor }}>{value}</div>
      {sub && <div className="text-xs text-ink-muted tabular-nums mt-0.5">{sub}</div>}
    </div>
  );
}

function ResultRow({ label, value, positive, negative }: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  const valClass = positive ? "text-positive" : negative ? "text-negative" : "text-ink";
  return (
    <div className="flex items-center justify-between py-2 border-b border-line last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${valClass}`}>{value}</span>
    </div>
  );
}

function ResultPair({ label1, value1, label2, value2, pos1, neg1, pos2, neg2 }: {
  label1: string; value1: string; label2: string; value2: string;
  pos1?: boolean; neg1?: boolean; pos2?: boolean; neg2?: boolean;
}) {
  const c1 = pos1 ? "text-positive" : neg1 ? "text-negative" : "text-ink";
  const c2 = pos2 ? "text-positive" : neg2 ? "text-negative" : "text-ink";
  return (
    <div className="grid grid-cols-2 gap-2 py-2 border-b border-line">
      <div>
        <div className="text-xs text-ink-subtle truncate">{label1}</div>
        <div className={`text-sm font-bold tabular-nums ${c1}`}>{value1}</div>
      </div>
      <div>
        <div className="text-xs text-ink-subtle truncate">{label2}</div>
        <div className={`text-sm font-bold tabular-nums ${c2}`}>{value2}</div>
      </div>
    </div>
  );
}

function TasaRow({
  tasa,
  obraTotal,
  onChange,
}: {
  tasa: { label: string; pct: number; amount?: number };
  obraTotal: number;
  onChange: (t: { label: string; pct: number; amount?: number }) => void;
}) {
  const isManual = tasa.amount != null;
  const importe = tasa.amount ?? (tasa.pct / 100) * obraTotal;
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
      <span className="text-xs text-slate-700 leading-tight">{tasa.label}</span>
      {isManual ? (
        <button
          type="button"
          onClick={() => onChange({ ...tasa, amount: undefined })}
          className="px-2 py-0.5 text-xs font-semibold text-orange-600 border border-orange-200 rounded hover:bg-orange-50 transition-colors"
        >
          Reset
        </button>
      ) : <div />}
      <NumInput
        value={tasa.pct}
        onChange={(v) => onChange({ ...tasa, pct: v ?? 0, amount: (v ?? 0) / 100 * obraTotal })}
        suffix="%"
        className="w-20"
      />
      <NumInput
        value={importe}
        onChange={(v) => onChange({ ...tasa, amount: v, pct: v != null && obraTotal > 0 ? (v / obraTotal) * 100 : tasa.pct })}
        suffix="€"
        className="w-24"
      />
    </div>
  );
}

// ==================== UNIT CARD ====================

function UnitCard({
  unit,
  onUpdate,
  onRemove,
}: {
  unit: REUnit;
  onUpdate: (patch: Partial<REUnit>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [roomsMode, setRoomsMode] = useState<"manual" | "calc">(() =>
    unit.rentType === "HABITACIONES" && !unit.m2PerRoom && (unit.numHabitaciones ?? 0) > 0 ? "manual" : "calc"
  );

  const rentType = unit.rentType ?? "TRADICIONAL";

  // TRASTERO: auto-calc
  const numTrasteros = unit.type === "TRASTERO"
    ? calcNumTrasteros(unit.m2Total ?? 0, unit.m2Access ?? 0, unit.m2PerUnit ?? 0)
    : 0;

  // GARAJE: auto-calc plazas
  const numPlazas = unit.type === "GARAJE"
    ? calcNumPlazas(unit.m2Unit ?? 0, unit.m2Access ?? 0, unit.m2PerPlaza ?? 12.5)
    : 0;

  // VIVIENDA: multiplicador (nº de viviendas iguales)
  const numUnitsVal = unit.type === "VIVIENDA" ? Math.max(1, Math.round(unit.numUnits ?? 1)) : 1;
  // VIVIENDA HABITACIONES: auto-calc rooms
  const usablePerUnit = (unit.m2Unit ?? 0) - (unit.m2CommonAreas ?? 0);
  const roomsPerUnit = unit.type === "VIVIENDA" && rentType === "HABITACIONES" && unit.m2PerRoom && unit.m2PerRoom > 0
    ? Math.max(0, Math.floor(usablePerUnit / unit.m2PerRoom))
    : 0;
  const rooms = roomsPerUnit * numUnitsVal;
  const monthlyRooms = roomsPerUnit * (unit.pricePerRoom ?? 0);
  const m2SobrantesPerUnit = unit.type === "VIVIENDA" && rentType === "HABITACIONES" && unit.m2PerRoom && unit.m2PerRoom > 0
    ? usablePerUnit - roomsPerUnit * unit.m2PerRoom
    : 0;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2.5 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 w-16 shrink-0">
            {unit.type}
          </span>
          <span className="text-sm font-medium text-slate-800 truncate">{unit.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {(() => {
            const total =
              unit.type === "VIVIENDA" ? (unit.salePriceTotal ?? 0) * numUnitsVal :
              unit.type === "GARAJE"   ? (unit.salePriceTotal ?? 0) * numPlazas :
                                         (unit.salePriceTotal ?? 0) * numTrasteros;
            return total > 0 ? (
              <span className="text-xs font-semibold text-blue-600 tabular-nums">{fmtEUR(total)}</span>
            ) : null;
          })()}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="text-red-400 hover:text-red-600 transition-colors p-1 rounded"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {open && (
        <div className="px-3 py-3 bg-white space-y-3">
          <FieldRow label="Título">
            <input
              type="text"
              value={unit.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
          </FieldRow>

          {/* ── VIVIENDA ─────────────────────────────────────────────── */}
          {unit.type === "VIVIENDA" && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 w-32 shrink-0">M² total vivienda</span>
                <NumInput value={unit.m2Unit} onChange={(v) => onUpdate({ m2Unit: v })} suffix="m²" className="w-28" />
                <span className="text-xs font-medium text-slate-500 shrink-0 ml-2">Nº unidades</span>
                <NumInput value={unit.numUnits ?? 1} onChange={(v) => onUpdate({ numUnits: Math.max(1, Math.round(v ?? 1)) })} className="w-16" />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 shrink-0">Venta</span>
                <NumInput
                  value={unit.salePriceM2}
                  onChange={(v) => onUpdate({ salePriceM2: v, salePriceTotal: v != null && unit.m2Unit ? Math.round(v * unit.m2Unit) : unit.salePriceTotal })}
                  suffix="€/m²"
                />
                <span className="text-slate-400 text-sm">↔</span>
                <NumInput
                  value={unit.salePriceTotal}
                  onChange={(v) => onUpdate({ salePriceTotal: v, salePriceM2: v != null && unit.m2Unit ? Math.round((v / unit.m2Unit) * 100) / 100 : unit.salePriceM2 })}
                  suffix="€"
                />
                <span className="text-slate-400 text-xs shrink-0">→</span>
                <span className="text-sm font-bold text-blue-600 tabular-nums shrink-0">{fmtEUR((unit.salePriceTotal ?? 0) * numUnitsVal)}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 shrink-0 w-20">Alquiler</span>
                <button
                  type="button"
                  onClick={() => onUpdate({ rentType: "TRADICIONAL" })}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${rentType === "TRADICIONAL" ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  Tradicional
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate({ rentType: "HABITACIONES" })}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${rentType === "HABITACIONES" ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  Por habitaciones
                </button>
              </div>

              {rentType === "TRADICIONAL" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 shrink-0">Nº hab.</span>
                    <NumInput value={unit.numHabitaciones} onChange={(v) => onUpdate({ numHabitaciones: v })} className="w-16" />
                    <span className="text-xs text-slate-400 shrink-0">{unit.numHabitaciones ?? 0}/{(unit.numHabitaciones ?? 0) * numUnitsVal}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 shrink-0">PVP alq.</span>
                    <NumInput value={unit.rentMonthly} onChange={(v) => onUpdate({ rentMonthly: v })} suffix="€/mes" />
                  </div>
                </div>
              )}

              {rentType === "HABITACIONES" && (
                <>
                  {/* Fila 1: Nº de habitaciones (izq) + botón Calcular nº hab… (der) */}
                  <div className="flex items-end gap-3">
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-slate-500">Nº de habitaciones</span>
                      <div className="flex items-center gap-2">
                        <NumInput
                          value={unit.numHabitaciones}
                          onChange={(v) => onUpdate({ numHabitaciones: Math.max(0, Math.round(v ?? 0)), m2PerRoom: undefined, m2CommonAreas: undefined })}
                          className="w-20"
                        />
                        <span className="text-xs text-slate-400 shrink-0">
                          {roomsMode === "calc" ? roomsPerUnit : (unit.numHabitaciones ?? 0)}/{roomsMode === "calc" ? rooms : (unit.numHabitaciones ?? 0) * numUnitsVal}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRoomsMode(roomsMode === "calc" ? "manual" : "calc")}
                      className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 bg-white hover:bg-blue-50 rounded-full px-3 py-1.5 mb-0.5 transition-colors"
                    >
                      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6M9 12h1m4 0h1M9 17h1m4 0h1M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
                      </svg>
                      Calcular nº hab…
                    </button>
                  </div>

                  {/* Fila 2: panel de cálculo M² — visible al activar */}
                  {roomsMode === "calc" && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-slate-500">M²/hab.</span>
                        <NumInput
                          value={unit.m2PerRoom}
                          onChange={(v) => {
                            const newRoomsPerUnit = v && v > 0 ? Math.max(0, Math.floor(((unit.m2Unit ?? 0) - (unit.m2CommonAreas ?? 0)) / v)) : 0;
                            onUpdate({ m2PerRoom: v, numHabitaciones: newRoomsPerUnit });
                          }}
                          suffix="m²"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-slate-500">M² comunes</span>
                        <NumInput
                          value={unit.m2CommonAreas}
                          onChange={(v) => {
                            const newUsable = (unit.m2Unit ?? 0) - (v ?? 0);
                            const newRoomsPerUnit = unit.m2PerRoom && unit.m2PerRoom > 0 ? Math.max(0, Math.floor(newUsable / unit.m2PerRoom)) : 0;
                            onUpdate({ m2CommonAreas: v, numHabitaciones: newRoomsPerUnit });
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

                  {/* Fila 3: PVP/hab + Ing./mes en la misma fila */}
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-500">PVP/hab</span>
                    <div className="flex items-center gap-2">
                      <NumInput value={unit.pricePerRoom} onChange={(v) => onUpdate({ pricePerRoom: v })} suffix="€/mes" />
                      {(unit.pricePerRoom ?? 0) > 0 && (
                        <span className="text-sm font-bold text-blue-600 tabular-nums shrink-0">
                          {fmtEUR((roomsMode === "calc" ? roomsPerUnit : (unit.numHabitaciones ?? 0)) * (unit.pricePerRoom ?? 0) * numUnitsVal)}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── GARAJE ───────────────────────────────────────────────── */}
          {unit.type === "GARAJE" && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700 w-20 shrink-0">Garaje</span>
                <span className="text-xs font-medium text-slate-500 shrink-0">Nº de plazas</span>
                <NumInput
                  value={numPlazas || undefined}
                  onChange={(v) => {
                    const n = Math.max(0, Math.round(v ?? 0));
                    onUpdate({ m2Unit: n * (unit.m2PerPlaza ?? 12.5) + (unit.m2Access ?? 0) });
                  }}
                  className="w-20"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 w-20 shrink-0">M²/plaza</span>
                <NumInput value={unit.m2PerPlaza ?? 12.5} onChange={(v) => onUpdate({ m2PerPlaza: v })} suffix="m²" className="w-24" />
                <span className="text-xs font-medium text-slate-500 shrink-0 ml-2">M² accesos totales</span>
                <NumInput value={unit.m2Access} onChange={(v) => onUpdate({ m2Access: v })} suffix="m²" className="w-24" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 w-20 shrink-0">M² totales</span>
                <NumInput value={unit.m2Unit} onChange={(v) => onUpdate({ m2Unit: v })} suffix="m²" className="w-24" />
                <span className="text-xs font-medium text-slate-500 shrink-0 ml-2">Renta/mes</span>
                <NumInput value={unit.rentMonthly} onChange={(v) => onUpdate({ rentMonthly: v })} suffix="€/mes" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 w-20 shrink-0">PVP venta</span>
                <NumInput value={unit.salePriceTotal} onChange={(v) => onUpdate({ salePriceTotal: v })} suffix="€" className="w-24" />
                <span className="text-slate-400 text-xs shrink-0">→</span>
                <span className="text-sm font-bold text-blue-600 tabular-nums shrink-0">{fmtEUR(numPlazas * (unit.salePriceTotal ?? 0))}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>Alq./mes: <strong className="text-slate-900">{fmtEUR(numPlazas * (unit.rentMonthly ?? 0))}</strong></span>
              </div>
            </>
          )}

          {/* ── TRASTERO ─────────────────────────────────────────────── */}
          {unit.type === "TRASTERO" && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700 w-20 shrink-0">Trastero</span>
                <span className="text-xs font-medium text-slate-500 shrink-0">Nº de trasteros</span>
                <NumInput
                  value={numTrasteros || undefined}
                  onChange={(v) => {
                    const n = Math.max(0, Math.round(v ?? 0));
                    onUpdate({ m2Total: n * (unit.m2PerUnit ?? 0) + (unit.m2Access ?? 0) });
                  }}
                  className="w-20"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 w-20 shrink-0">M²/trastero</span>
                <NumInput value={unit.m2PerUnit} onChange={(v) => onUpdate({ m2PerUnit: v })} suffix="m²" className="w-24" />
                <span className="text-xs font-medium text-slate-500 shrink-0 ml-2">M² accesos totales</span>
                <NumInput value={unit.m2Access} onChange={(v) => onUpdate({ m2Access: v })} suffix="m²" className="w-24" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 w-20 shrink-0">M² totales</span>
                <NumInput value={unit.m2Total} onChange={(v) => onUpdate({ m2Total: v })} suffix="m²" className="w-24" />
                <span className="text-xs font-medium text-slate-500 shrink-0 ml-2">Renta/mes</span>
                <NumInput value={unit.rentMonthly} onChange={(v) => onUpdate({ rentMonthly: v })} suffix="€/mes" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 w-20 shrink-0">PVP venta</span>
                <NumInput value={unit.salePriceTotal} onChange={(v) => onUpdate({ salePriceTotal: v })} suffix="€" className="w-24" />
                <span className="text-slate-400 text-xs shrink-0">→</span>
                <span className="text-sm font-bold text-blue-600 tabular-nums shrink-0">{fmtEUR(numTrasteros * (unit.salePriceTotal ?? 0))}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>Alq./mes: <strong className="text-slate-900">{fmtEUR(numTrasteros * (unit.rentMonthly ?? 0))}</strong></span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== SECTION NAV CONFIG ====================

const SECTION_NAV = [
  { key: "resumen" as const, label: "Resumen" },
  { key: "datos" as const, label: "Datos" },
  { key: "unidades" as const, label: "Unidades" },
  { key: "m2" as const, label: "M²" },
  { key: "obra" as const, label: "Obra" },
  { key: "otros" as const, label: "Costes" },
  { key: "impuestos" as const, label: "Impuestos" },
  { key: "financiacion" as const, label: "Financiación" },
  { key: "resultados" as const, label: "Resultados" },
  { key: "escenarios" as const, label: "Escenarios" },
] as const;

// ==================== MAIN MODAL ====================

interface RealEstateModalProps {
  op: REOperation;
  onSave: (op: REOperation) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (op: REOperation) => void;
  onClose: () => void;
}

export function RealEstateModal({ op, onSave, onDelete, onDuplicate, onClose }: RealEstateModalProps) {
  const [draft, setDraft] = useState<REOperation>(() => JSON.parse(JSON.stringify(op)));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isManualTasasTotal, setIsManualTasasTotal] = useState(false);
  const [showTypeChanger, setShowTypeChanger] = useState(false);

  // El guardado es autosave (cada commit). Marcamos si hubo cambios para confirmar
  // con un único toast al cerrar, en lugar de uno por cada pulsación.
  const dirtyRef = useRef(false);

  // Drawer abierto al montar; al cerrar, animamos la salida antes de desmontar (onClose).
  const [drawerOpen, setDrawerOpen] = useState(true);
  // Hub de SEGUIMIENTO Y GESTIÓN (gastos, ventas, hitos, rentabilidad, media, compartir, informe).
  const [showTracking, setShowTracking] = useState(false);
  const handleClose = useCallback(() => {
    if (dirtyRef.current) {
      dirtyRef.current = false;
      toast.success("Operación guardada");
    }
    setDrawerOpen(false);
    // Coincide con la duración de la animación de vaul (0.5s) para no cortar la salida.
    setTimeout(onClose, 500);
  }, [onClose]);

  const currentCat = (draft._cat ?? "vivienda") as RealEstateCategory;

  const handleTypeChange = (newCat: RealEstateCategory) => {
    if (newCat === currentCat) { setShowTypeChanger(false); return; }
    const hasData = draft.purchasePrice > 0 || draft.units.some((u) => u.m2Unit || u.m2Total);
    const doChange = () => { commit(convertRealEstateOperationType(draft, newCat)); setShowTypeChanger(false); };
    if (hasData) {
      if (!confirm("Cambiar el tipo puede ajustar algunos campos no compatibles. Los datos comunes se conservarán. ¿Cambiar tipo?")) {
        setShowTypeChanger(false);
        return;
      }
    }
    doChange();
  };
  const [open, setOpen] = useState({
    resumen: true,
    datos: false,
    unidades: false,
    m2: false,
    obra: false,
    otros: false,
    impuestos: false,
    financiacion: false,
    resultados: false,
    escenarios: false,
    tasas: false,
  });

  // Sync draft if op changes externally
  useEffect(() => {
    setDraft(JSON.parse(JSON.stringify(op)));
  }, [op.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const res = useMemo(() => calcResults(draft), [draft]);

  const commit = useCallback(
    (patch: Partial<REOperation>) => {
      const updated = { ...draft, ...patch, updatedAt: new Date().toISOString() };
      setDraft(updated);
      onSave(updated);
      dirtyRef.current = true;
    },
    [draft, onSave]
  );

  const setCosts = useCallback(
    (patch: Partial<typeof draft.costs>) => {
      commit({ costs: { ...draft.costs, ...patch } });
    },
    [commit, draft.costs]
  );

  const setFinancing = useCallback(
    (patch: Partial<typeof draft.financing>) => {
      commit({ financing: { ...draft.financing, ...patch } });
    },
    [commit, draft.financing]
  );

  const updateUnit = useCallback(
    (id: string, patch: Partial<REUnit>) => {
      commit({
        units: draft.units.map((u) => (u.id === id ? { ...u, ...patch } : u)),
      });
    },
    [commit, draft.units]
  );

  const removeUnit = useCallback(
    (id: string) => {
      commit({ units: draft.units.filter((u) => u.id !== id) });
    },
    [commit, draft.units]
  );

  const addUnit = useCallback(
    (type: UnitType) => {
      const sameType = draft.units.filter((u) => u.type === type);
      const last = sameType[sameType.length - 1];
      const n = sameType.length + 1;
      const label = type === "VIVIENDA" ? "Vivienda" : type === "GARAJE" ? "Garaje" : "Trastero";
      const newUnit: REUnit = last
        ? { ...last, id: `unit_${Date.now()}`, title: `${label} ${n}` }
        : { id: `unit_${Date.now()}`, type, title: `${label} ${n}` };
      commit({ units: [...draft.units, newUnit] });
    },
    [commit, draft.units]
  );

  const toggleSection = (key: keyof typeof open) => {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };


  const n0 = (v: number | undefined | null) => (Number.isFinite(v as number) ? (v as number) : 0);

  const viviendaM2Total   = draft.units.filter((u) => u.type === "VIVIENDA").reduce((s, u) => s + n0(u.m2Unit) * Math.max(1, Math.round(n0(u.numUnits ?? 1))), 0);
  const garajeM2Total     = draft.units.filter((u) => u.type === "GARAJE").reduce((s, u) => s + n0(u.m2Unit), 0);
  const trasteroM2Total   = draft.units.filter((u) => u.type === "TRASTERO").reduce((s, u) => s + n0(u.m2Total ?? u.m2Unit), 0);

  const nViviendas        = draft.units.filter((u) => u.type === "VIVIENDA").reduce((s, u) => s + Math.max(1, Math.round(u.numUnits ?? 1)), 0);
  const nGarajes          = res.unitResults.filter((u) => u.type === "GARAJE").reduce((s, u) => s + u.numPlazas, 0);
  const nTrasteros        = res.unitResults.filter((u) => u.type === "TRASTERO").reduce((s, u) => s + u.numTrasteros, 0);
  const hasHabitaciones   = draft.units.some((u) => u.type === "VIVIENDA" && u.rentType === "HABITACIONES");
  const nHabitaciones     = res.unitResults
    .filter((u) => u.type === "VIVIENDA" && (u.rentType ?? "TRADICIONAL") === "HABITACIONES")
    .reduce((s, u) => s + u.rooms, 0);

  const unitSummary = (() => {
    const parts: string[] = [];
    if (nViviendas > 0) {
      parts.push(hasHabitaciones && nHabitaciones > 0
        ? `${nViviendas} viv / ${nHabitaciones} hab`
        : `${nViviendas} viv`);
    }
    if (nGarajes > 0) parts.push(`${nGarajes} aparc`);
    if (nTrasteros > 0) parts.push(`${nTrasteros} trast`);
    return parts.length > 0 ? parts.join(" + ") : undefined;
  })();

  return (
    <Vaul.Root open={drawerOpen} onOpenChange={(o) => { if (!o) handleClose(); }} direction="right">
      <Vaul.Portal>
        {/* Backdrop */}
        <Vaul.Overlay className="fixed inset-0 z-50 bg-black/40" />

        {/* Panel lateral deslizante */}
        <Vaul.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 w-full max-w-4xl bg-white shadow-2xl flex flex-col overflow-hidden outline-none"
        >
          <Vaul.Title className="sr-only">{draft.name || "Detalle de operación"}</Vaul.Title>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => commit({ name: e.target.value })}
            className="text-xl font-extrabold text-ink tracking-tight bg-transparent border-0 outline-none focus:ring-0 w-full placeholder:text-ink-subtle"
            placeholder="Nombre de la operación"
          />
          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            {onDuplicate && (
              <button
                type="button"
                onClick={() => onDuplicate(draft)}
                className="p-2 text-slate-400 hover:text-indigo-500 transition-colors rounded-lg hover:bg-indigo-50"
                title="Duplicar operación"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            )}
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                title="Eliminar"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600">¿Eliminar?</span>
                <button
                  type="button"
                  onClick={() => onDelete(draft.id)}
                  className="px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Sí
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  No
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Type badge row */}
        <div className="flex items-center gap-2 px-6 py-2 border-b border-slate-100 bg-white relative">
          <button
            type="button"
            onClick={() => setShowTypeChanger(!showTypeChanger)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 transition-colors group"
          >
            <span className="text-base">{RE_CATEGORIES.find(c => c.id === currentCat)?.icon}</span>
            <span className="font-medium">{RE_CATEGORIES.find(c => c.id === currentCat)?.label}</span>
            <span className="text-[10px] opacity-60 group-hover:opacity-100">▾</span>
          </button>

          {/* Type changer dropdown */}
          {showTypeChanger && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowTypeChanger(false)} />
              <div className="absolute top-full left-4 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-2 w-72">
                <p className="text-xs text-slate-500 font-medium px-2 py-1 mb-1">Cambiar tipo de inversión</p>
                {RE_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleTypeChange(c.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left ${currentCat === c.id ? "bg-blue-50" : ""}`}
                  >
                    <span className="text-xl">{c.icon}</span>
                    <div>
                      <div className={`text-sm font-medium ${currentCat === c.id ? "text-blue-600" : "text-slate-800"}`}>{c.label}</div>
                      <div className="text-xs text-slate-400">{c.desc}</div>
                    </div>
                    {currentCat === c.id && <span className="ml-auto text-blue-500 text-sm">✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── SEGUIMIENTO Y GESTIÓN — acceso destacado y fijo al abrir la operación ── */}
        <div className="px-4 py-2.5 border-b border-slate-100 bg-white flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowTracking(true)}
            className="group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-white transition-colors"
            style={{ background: "var(--brand)" }}
          >
            <svg className="w-5 h-5 flex-shrink-0 opacity-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold leading-tight">Seguimiento y gestión</span>
              <span className="block text-xs text-white/85 leading-tight mt-0.5">
                Gastos · Ventas · Hitos · Rentabilidad · Media · Compartir · Informe
              </span>
            </span>
            <span className="text-xl font-light opacity-80 transition-transform group-hover:translate-x-0.5">›</span>
          </button>
        </div>

        {/* Section nav */}
        <div className="flex overflow-x-auto gap-1.5 px-4 py-2 border-b border-slate-100 flex-shrink-0 bg-white">
          {SECTION_NAV.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                setOpen((prev) => ({ ...prev, [s.key]: true }));
                requestAnimationFrame(() => {
                  document.getElementById(`section-${s.key}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                });
              }}
              className="px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap border border-line text-ink-muted hover:text-brand hover:border-brand hover:bg-[var(--brand-soft)] transition-colors flex-shrink-0"
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">

          {/* ── SECCIÓN 1: RESUMEN ── */}
          <SectionBlock id="section-resumen" title="Resumen" open={open.resumen} onToggle={() => toggleSection("resumen")}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <KPI label="Inversión total" value={fmtEUR(res.totalInvestment)} />
              <KPI label="Mi inversión" value={fmtEUR(res.myInvestment)} />
              <KPI label="Financiado" value={fmtEUR(res.totalFinanced)} />
              <KPI
                label="Alquiler"
                value={fmtPct(res.rentYield)}
                sub={`${fmtEUR(res.monthlyRentBenefit)}/mes`}
                tone="positive"
              />
              <KPI
                label="Venta"
                value={fmtPct(res.saleYield)}
                sub={fmtEUR(res.saleBenefit)}
                tone="info"
              />
              {draft.financing.enabled && (
                <KPI
                  label="Cuota mensual"
                  value={fmtEUR(res.totalMonthlyPayment)}
                />
              )}
              {nViviendas > 0 && (
                <KPI label="Nº viv / hab" value={hasHabitaciones ? `${nViviendas} / ${nHabitaciones}` : String(nViviendas)} />
              )}
              {nGarajes > 0 && <KPI label="Nº garajes" value={String(nGarajes)} />}
              {nTrasteros > 0 && <KPI label="Nº trasteros" value={String(nTrasteros)} />}
            </div>
          </SectionBlock>

          {/* ── SECCIÓN 2: DATOS INMUEBLE ── */}
          <SectionBlock id="section-datos" title="Datos inmueble" open={open.datos} onToggle={() => toggleSection("datos")}>
            <FieldRow label="Nombre">
              <input
                type="text"
                value={draft.name}
                onChange={(e) => commit({ name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
            </FieldRow>
            <FieldRow label="Dirección">
              <input
                type="text"
                value={draft.address ?? ""}
                onChange={(e) => commit({ address: e.target.value || undefined })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
            </FieldRow>
            <FieldRow label="Enlace">
              <input
                type="text"
                value={draft.link ?? ""}
                onChange={(e) => commit({ link: e.target.value || undefined })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
            </FieldRow>
            <FieldRow label="Precio de compra">
              <NumInput
                value={draft.purchasePrice}
                onChange={(v) => commit({ purchasePrice: v ?? 0 })}
                suffix="€"
              />
            </FieldRow>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="M² parcela">
                <NumInput value={draft.m2Plot} onChange={(v) => commit({ m2Plot: v })} suffix="m²" />
              </FieldRow>
              <FieldRow label="M² edificables">
                <NumInput value={draft.m2Buildable} onChange={(v) => commit({ m2Buildable: v })} suffix="m²" />
              </FieldRow>
            </div>
          </SectionBlock>

          {/* ── SECCIÓN 3: UNIDADES ── */}
          <SectionBlock id="section-unidades" title="Unidades" badge={unitSummary} open={open.unidades} onToggle={() => toggleSection("unidades")}>
            <div className="space-y-2">
              {[...draft.units]
                .sort((a, b) => {
                  const order: Record<string, number> = { VIVIENDA: 0, GARAJE: 1, TRASTERO: 2 };
                  return (order[a.type] ?? 0) - (order[b.type] ?? 0);
                })
                .map((u) => (
                  <UnitCard
                    key={u.id}
                    unit={u}
                    onUpdate={(patch) => updateUnit(u.id, patch)}
                    onRemove={() => removeUnit(u.id)}
                  />
                ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => addUnit("VIVIENDA")} className="flex-1 py-2 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                + Vivienda
              </button>
              <button type="button" onClick={() => addUnit("GARAJE")} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                + Garaje
              </button>
              <button type="button" onClick={() => addUnit("TRASTERO")} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                + Trastero
              </button>
            </div>
          </SectionBlock>

          {/* ── SECCIÓN 4: M² SUPERFICIES ── */}
          <SectionBlock id="section-m2" title="M² superficies" badge={`${fmtNum(viviendaM2Total + garajeM2Total + trasteroM2Total)} m²`} open={open.m2} onToggle={() => toggleSection("m2")}>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div className="flex items-center gap-2"><span className="text-xs text-slate-500">M² parcela</span><span className="text-sm font-semibold text-slate-900 tabular-nums">{fmtNum(draft.m2Plot ?? 0)} m²</span></div>
                <div className="flex items-center gap-2"><span className="text-xs text-slate-500">M² edificables</span><span className="text-sm font-semibold text-slate-900 tabular-nums">{fmtNum(draft.m2Buildable ?? 0)} m²</span></div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">M² viviendas</span><span className="text-sm font-semibold text-slate-900 tabular-nums">{fmtNum(viviendaM2Total)} m²</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div className="flex items-center gap-2"><span className="text-xs text-slate-500">M² garajes</span><span className="text-sm font-semibold text-slate-900 tabular-nums">{fmtNum(garajeM2Total)} m²</span></div>
                <div className="flex items-center gap-2"><span className="text-xs text-slate-500">M² trasteros</span><span className="text-sm font-semibold text-slate-900 tabular-nums">{fmtNum(trasteroM2Total)} m²</span></div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div className="flex items-center gap-2"><span className="text-xs text-slate-500">M² escalera</span><span className="text-sm font-semibold text-slate-900 tabular-nums">{fmtNum(draft.costs.escalerasM2 ?? 0)} m²</span></div>
                <div className="flex items-center gap-2"><span className="text-xs text-slate-500">M² accesos</span><span className="text-sm font-semibold text-slate-900 tabular-nums">{fmtNum(draft.costs.accesosM2 ?? 0)} m²</span></div>
              </div>
            </div>
          </SectionBlock>

          {/* ── SECCIÓN 5: OBRA ── */}
          <SectionBlock
            id="section-obra"
            title="Obra"
            badge={fmtEUR(res.obraBase)}
            open={open.obra}
            onToggle={() => toggleSection("obra")}
          >
            <div className="space-y-2">
              {/* Cimentación — visible si hay m² parcela o valores previos */}
              {(n0(draft.m2Plot) > 0 || draft.costs.cimentacionPriceM2 != null || draft.costs.cimentacionTotal != null) && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 w-24 shrink-0">Cimentación</span>
                  <NumInput
                    value={draft.costs.cimentacionPriceM2 ?? (draft.costs.cimentacionTotal != null && n0(draft.m2Plot) > 0 ? Math.round((draft.costs.cimentacionTotal / n0(draft.m2Plot)) * 100) / 100 : undefined)}
                    onChange={(v) => setCosts({ cimentacionPriceM2: v, cimentacionTotal: v != null && n0(draft.m2Plot) > 0 ? Math.round(v * n0(draft.m2Plot)) : undefined })}
                    suffix="€/m²" className="w-24"
                  />
                  <span className="text-slate-400 text-xs">↔</span>
                  <NumInput
                    value={draft.costs.cimentacionTotal ?? (res.cimentacionAmt > 0 ? res.cimentacionAmt : undefined)}
                    onChange={(v) => setCosts({ cimentacionTotal: v, cimentacionPriceM2: v != null && n0(draft.m2Plot) > 0 ? Math.round((v / n0(draft.m2Plot)) * 100) / 100 : undefined })}
                    suffix="€"
                  />
                </div>
              )}
              {/* Escaleras */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 w-24 shrink-0">Escaleras</span>
                <NumInput
                  value={draft.costs.escalerasM2}
                  onChange={(v) => setCosts({ escalerasM2: v, escalerasTotal: undefined })}
                  suffix="m²" className="w-20"
                />
                <NumInput
                  value={draft.costs.escalerasPriceM2 ?? (draft.costs.escalerasTotal != null && n0(draft.costs.escalerasM2) > 0 ? Math.round((draft.costs.escalerasTotal / n0(draft.costs.escalerasM2)) * 100) / 100 : undefined)}
                  onChange={(v) => setCosts({ escalerasPriceM2: v, escalerasTotal: undefined })}
                  suffix="€/m²" className="w-24"
                />
                <span className="text-slate-400 text-xs">↔</span>
                <NumInput
                  value={draft.costs.escalerasTotal ?? (res.escalerasAmt > 0 ? res.escalerasAmt : undefined)}
                  onChange={(v) => setCosts({ escalerasTotal: v, escalerasPriceM2: n0(draft.costs.escalerasM2) > 0 && v != null ? Math.round((v / n0(draft.costs.escalerasM2)) * 100) / 100 : undefined })}
                  suffix="€"
                />
              </div>
              {/* Accesos */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 w-24 shrink-0">Accesos</span>
                <NumInput
                  value={draft.costs.accesosM2}
                  onChange={(v) => setCosts({ accesosM2: v, accesosTotal: undefined })}
                  suffix="m²" className="w-20"
                />
                <NumInput
                  value={draft.costs.accesosPriceM2 ?? (draft.costs.accesosTotal != null && n0(draft.costs.accesosM2) > 0 ? Math.round((draft.costs.accesosTotal / n0(draft.costs.accesosM2)) * 100) / 100 : undefined)}
                  onChange={(v) => setCosts({ accesosPriceM2: v, accesosTotal: undefined })}
                  suffix="€/m²" className="w-24"
                />
                <span className="text-slate-400 text-xs">↔</span>
                <NumInput
                  value={draft.costs.accesosTotal ?? (res.accesosAmt > 0 ? res.accesosAmt : undefined)}
                  onChange={(v) => setCosts({ accesosTotal: v, accesosPriceM2: n0(draft.costs.accesosM2) > 0 && v != null ? Math.round((v / n0(draft.costs.accesosM2)) * 100) / 100 : undefined })}
                  suffix="€"
                />
              </div>
              {/* Vivienda */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 w-24 shrink-0">Vivienda</span>
                {viviendaM2Total > 0 && <span className="text-xs text-slate-400 shrink-0">{fmtNum(viviendaM2Total)}m²</span>}
                <NumInput
                  value={draft.costs.obraViviendaPriceM2 ?? (draft.costs.obraViviendaTotal != null && viviendaM2Total > 0 ? Math.round((draft.costs.obraViviendaTotal / viviendaM2Total) * 100) / 100 : undefined)}
                  onChange={(v) => setCosts({ obraViviendaPriceM2: v, obraViviendaTotal: undefined })}
                  suffix="€/m²" className="w-24"
                />
                <span className="text-slate-400 text-xs">↔</span>
                <NumInput
                  value={draft.costs.obraViviendaTotal ?? (res.obraViviendaAmt > 0 ? res.obraViviendaAmt : undefined)}
                  onChange={(v) => setCosts({ obraViviendaTotal: v, obraViviendaPriceM2: viviendaM2Total > 0 && v != null ? Math.round((v / viviendaM2Total) * 100) / 100 : undefined })}
                  suffix="€"
                />
              </div>
              {/* Garaje — visible si hay unidades garaje o valores previos */}
              {(garajeM2Total > 0 || draft.costs.obraGarajePriceM2 != null || draft.costs.obraGarajeTotal != null) && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 w-24 shrink-0">Garaje</span>
                  {garajeM2Total > 0 && <span className="text-xs text-slate-400 shrink-0">{fmtNum(garajeM2Total)}m²</span>}
                  <NumInput
                    value={draft.costs.obraGarajePriceM2 ?? (draft.costs.obraGarajeTotal != null && garajeM2Total > 0 ? Math.round((draft.costs.obraGarajeTotal / garajeM2Total) * 100) / 100 : undefined)}
                    onChange={(v) => setCosts({ obraGarajePriceM2: v, obraGarajeTotal: undefined })}
                    suffix="€/m²" className="w-24"
                  />
                  <span className="text-slate-400 text-xs">↔</span>
                  <NumInput
                    value={draft.costs.obraGarajeTotal ?? (res.obraGarajeAmt > 0 ? res.obraGarajeAmt : undefined)}
                    onChange={(v) => setCosts({ obraGarajeTotal: v, obraGarajePriceM2: garajeM2Total > 0 && v != null ? Math.round((v / garajeM2Total) * 100) / 100 : undefined })}
                    suffix="€"
                  />
                </div>
              )}
              {/* Trastero — visible si hay unidades trastero o valores previos */}
              {(trasteroM2Total > 0 || draft.costs.obraTrasterosPriceM2 != null || draft.costs.obraTrasterosTotal != null) && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 w-24 shrink-0">Trastero</span>
                  {trasteroM2Total > 0 && <span className="text-xs text-slate-400 shrink-0">{fmtNum(trasteroM2Total)}m²</span>}
                  <NumInput
                    value={draft.costs.obraTrasterosPriceM2 ?? (draft.costs.obraTrasterosTotal != null && trasteroM2Total > 0 ? Math.round((draft.costs.obraTrasterosTotal / trasteroM2Total) * 100) / 100 : undefined)}
                    onChange={(v) => setCosts({ obraTrasterosPriceM2: v, obraTrasterosTotal: undefined })}
                    suffix="€/m²" className="w-24"
                  />
                  <span className="text-slate-400 text-xs">↔</span>
                  <NumInput
                    value={draft.costs.obraTrasterosTotal ?? (res.obraTrasterosAmt > 0 ? res.obraTrasterosAmt : undefined)}
                    onChange={(v) => setCosts({ obraTrasterosTotal: v, obraTrasterosPriceM2: trasteroM2Total > 0 && v != null ? Math.round((v / trasteroM2Total) * 100) / 100 : undefined })}
                    suffix="€"
                  />
                </div>
              )}
            </div>
          </SectionBlock>

          {/* ── SECCIÓN OTROS ── */}
          <SectionBlock
            id="section-otros"
            title="Otros costes"
            badge={fmtEUR(res.arquitectoAmt + res.desviacionesAmt)}
            open={open.otros}
            onToggle={() => toggleSection("otros")}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium text-slate-500 mb-1">Arquitecto</div>
                <div className="flex items-center gap-1">
                  <NumInput value={draft.costs.arquitectoPct} onChange={(v) => setCosts({ arquitectoPct: v ?? 0, arquitectoTotal: undefined })} suffix="%" className="w-16" />
                  <span className="text-slate-400 text-xs">↔</span>
                  <NumInput value={draft.costs.arquitectoTotal ?? res.arquitectoAmt} onChange={(v) => { const base = res.obraBase; setCosts({ arquitectoTotal: v, arquitectoPct: v != null && base > 0 ? Math.round((v / base) * 10000) / 100 : draft.costs.arquitectoPct }); }} suffix="€" />
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 mb-1">Desviaciones</div>
                <div className="flex items-center gap-1">
                  <NumInput value={draft.costs.desviacionesPct} onChange={(v) => setCosts({ desviacionesPct: v, desviacionesTotal: undefined })} suffix="%" className="w-16" />
                  <span className="text-slate-400 text-xs">↔</span>
                  <NumInput value={draft.costs.desviacionesTotal ?? res.desviacionesAmt} onChange={(v) => { const base = res.obraBase; setCosts({ desviacionesTotal: v, desviacionesPct: v != null && base > 0 ? Math.round((v / base) * 10000) / 100 : draft.costs.desviacionesPct }); }} suffix="€" />
                </div>
              </div>
            </div>
          </SectionBlock>

          {/* ── SECCIÓN 5: IMPUESTOS ── */}
          <SectionBlock
            id="section-impuestos"
            title="Impuestos"
            badge={fmtEUR(res.purchaseTaxAmt + res.tasasAmt)}
            open={open.impuestos}
            onToggle={() => toggleSection("impuestos")}
          >
            <div className="space-y-3">
              <BiRow
                label="Impuesto de compra"
                leftLabel="%" rightLabel="€ total"
                leftValue={draft.costs.purchaseTaxPct}
                rightValue={draft.costs.purchaseTaxTotal ?? res.purchaseTaxAmt}
                leftSuffix="%"
                rightSuffix="€"
                onLeftChange={(v) => setCosts({ purchaseTaxPct: v ?? 0, purchaseTaxTotal: undefined })}
                onRightChange={(v) => setCosts({ purchaseTaxTotal: v, purchaseTaxPct: v != null && draft.purchasePrice > 0 ? Math.round((v / draft.purchasePrice) * 10000) / 100 : draft.costs.purchaseTaxPct })}
              />
              {/* Tasas y licencias */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">Tasas y licencias</span>
                  {isManualTasasTotal && (
                    <button
                      type="button"
                      onClick={() => {
                        const defaultTasas = DEFAULT_TASAS.map((d) => ({ label: d.label, pct: d.pct }));
                        setIsManualTasasTotal(false);
                        setCosts({ tasasTotal: undefined, tasas: defaultTasas });
                      }}
                      className="px-2 py-0.5 text-xs font-semibold text-orange-600 border border-orange-200 rounded hover:bg-orange-50 transition-colors"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <NumInput
                    value={isManualTasasTotal ? draft.costs.tasasTotal : res.tasasAmt}
                    onChange={(v) => {
                      if (v != null && v > 0) {
                        setIsManualTasasTotal(true);
                        setCosts({ tasasTotal: v, tasas: draft.costs.tasas.map((t) => ({ ...t, amount: 0, pct: 0 })) });
                      } else {
                        setIsManualTasasTotal(false);
                        setCosts({ tasasTotal: undefined });
                      }
                    }}
                    suffix="€"
                    className="w-28"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSection("tasas")}
                    className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <svg
                      className={`w-4 h-4 transition-transform ${open.tasas ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
              {open.tasas && (
                <div className="space-y-2">
                  {draft.costs.tasas.map((t, i) => (
                    <TasaRow
                      key={i}
                      tasa={t}
                      obraTotal={isManualTasasTotal ? 0 : res.obraBase}
                      onChange={(updated) => {
                        setIsManualTasasTotal(false);
                        const newTasas = draft.costs.tasas.map((x, j) => (j === i ? updated : x));
                        setCosts({ tasas: newTasas, tasasTotal: undefined });
                      }}
                    />
                  ))}
                </div>
              )}
              {/* Mobiliario por vivienda */}
              <div className="flex items-center justify-between gap-2 mt-3">
                <span className="text-xs font-medium text-slate-500">Mobiliario por vivienda</span>
                <div className="flex items-center gap-2">
                  <NumInput
                    value={draft.costs.furnitureCostPerUnit}
                    onChange={(v) => setCosts({ furnitureCostPerUnit: v ?? undefined })}
                    suffix="€/viv"
                    className="w-28"
                  />
                  {res.furnitureCostTotal > 0 && (
                    <span className="text-xs text-slate-400">= {fmtEUR(res.furnitureCostTotal)}</span>
                  )}
                </div>
              </div>
            </div>
          </SectionBlock>

          {/* ── SECCIÓN 8: FINANCIACIÓN ── */}
          <SectionBlock id="section-financiacion" title="Financiación" badge={draft.financing.enabled ? fmtEUR(res.totalFinanced) : undefined} open={open.financiacion} onToggle={() => toggleSection("financiacion")}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-700">Financiación habilitada</span>
              <button
                type="button"
                onClick={() => setFinancing({ enabled: !draft.financing.enabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${draft.financing.enabled ? "bg-brand" : "bg-slate-200"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${draft.financing.enabled ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
            </div>

            {draft.financing.enabled && (
              <div className="space-y-4">
                {/* Compra */}
                <div className="rounded-xl border border-line p-3 space-y-2" style={{ background: "var(--surface-alt)" }}>
                  <div className="text-xs font-bold text-ink-muted uppercase tracking-wide">Préstamo compra</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 shrink-0">Importe</span>
                    <NumInput value={draft.financing.compra.pct} onChange={(v) => setFinancing({ compra: { ...draft.financing.compra, pct: v ?? 0, amount: v != null ? (v / 100) * draft.purchasePrice : undefined } })} suffix="%" className="w-16" />
                    <span className="text-slate-400 text-sm">↔</span>
                    <NumInput value={draft.financing.compra.amount ?? res.compraAmount} onChange={(v) => setFinancing({ compra: { ...draft.financing.compra, amount: v, pct: v != null && draft.purchasePrice > 0 ? Math.round((v / draft.purchasePrice) * 10000) / 100 : draft.financing.compra.pct } })} suffix="€" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <FieldRow label="TIN anual">
                      <NumInput value={draft.financing.compra.interest} onChange={(v) => setFinancing({ compra: { ...draft.financing.compra, interest: v ?? 0 } })} suffix="%" />
                    </FieldRow>
                    <FieldRow label="Plazo (años)">
                      <NumInput value={draft.financing.compra.years} onChange={(v) => setFinancing({ compra: { ...draft.financing.compra, years: v } })} suffix="años" />
                    </FieldRow>
                    <FieldRow label="Cuota/mes">
                      <NumInput
                        value={res.compraMonthly || undefined}
                        onChange={(v) => {
                          if (v == null) return;
                          const tin = calcTINFromCuota(res.compraAmount, draft.financing.compra.years ?? 0, v);
                          setFinancing({ compra: { ...draft.financing.compra, interest: Math.round(tin * 1000) / 1000 } });
                        }}
                        suffix="€"
                      />
                    </FieldRow>
                  </div>
                </div>

                {/* Obra */}
                <div className="rounded-xl border border-line p-3 space-y-2" style={{ background: "var(--surface-alt)" }}>
                  <div className="text-xs font-bold text-ink-muted uppercase tracking-wide">Préstamo obra</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 shrink-0">Importe</span>
                    <NumInput value={draft.financing.obra.pct} onChange={(v) => setFinancing({ obra: { ...draft.financing.obra, pct: v ?? 0, amount: undefined } })} suffix="%" className="w-16" />
                    <span className="text-slate-400 text-sm">↔</span>
                    <NumInput value={draft.financing.obra.amount ?? res.obraFinAmount} onChange={(v) => setFinancing({ obra: { ...draft.financing.obra, amount: v, pct: v != null && res.obraBase > 0 ? Math.round((v / res.obraBase) * 10000) / 100 : draft.financing.obra.pct } })} suffix="€" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <FieldRow label="TIN anual">
                      <NumInput value={draft.financing.obra.interest} onChange={(v) => setFinancing({ obra: { ...draft.financing.obra, interest: v ?? 0 } })} suffix="%" />
                    </FieldRow>
                    <FieldRow label="Plazo (años)">
                      <NumInput value={draft.financing.obra.years} onChange={(v) => setFinancing({ obra: { ...draft.financing.obra, years: v } })} suffix="años" />
                    </FieldRow>
                    <FieldRow label="Cuota/mes">
                      <NumInput
                        value={res.obraMonthly || undefined}
                        onChange={(v) => {
                          if (v == null) return;
                          const tin = calcTINFromCuota(res.obraFinAmount, draft.financing.obra.years ?? 0, v);
                          setFinancing({ obra: { ...draft.financing.obra, interest: Math.round(tin * 1000) / 1000 } });
                        }}
                        suffix="€"
                      />
                    </FieldRow>
                  </div>
                </div>
              </div>
            )}
          </SectionBlock>

          {/* ── SECCIÓN 9: RESULTADOS ── */}
          <SectionBlock id="section-resultados" title="Resultados detallados" badge={res.totalSales > 0 ? fmtEUR(res.totalSales) : undefined} open={open.resultados} onToggle={() => toggleSection("resultados")}>
            <div className="space-y-0">
              <ResultRow label="Inversión total" value={fmtEUR(res.totalInvestment)} />
              <ResultPair label1="Rent. venta" value1={fmtPct(res.saleYield)} label2="Benef. venta" value2={fmtEUR(res.saleBenefit)} pos1={res.saleYield > 0} neg1={res.saleYield < 0} pos2={res.saleBenefit >= 0} neg2={res.saleBenefit < 0} />
              <ResultPair label1="Rent. alquiler" value1={fmtPct(res.rentYield)} label2="Benef./mes" value2={fmtEUR(res.monthlyRentBenefit)} pos1={res.rentYield > 0} neg1={res.rentYield < 0} pos2={res.monthlyRentBenefit >= 0} neg2={res.monthlyRentBenefit < 0} />
              <ResultPair label1="Inv. mía" value1={fmtEUR(res.myInvestment)} label2="Financiado" value2={fmtEUR(res.totalFinanced)} />
              <ResultPair label1="Ingreso alquiler" value1={fmtEUR(res.monthlyRentIncome)} label2="Hipoteca" value2={fmtEUR(res.totalMonthlyPayment)} />
              <div className="border-t border-slate-200 pt-1 mt-1" />
              <ResultPair
                label1={hasHabitaciones ? `Viv / Hab` : "Nº viviendas"}
                value1={hasHabitaciones ? `${nViviendas} / ${nHabitaciones}` : String(nViviendas)}
                label2="Garajes / Trast."
                value2={`${nGarajes} / ${nTrasteros}`}
              />
              <div className="border-t border-slate-200 pt-1 mt-1" />
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide py-1">Obra</div>
              <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-100">
                <div><div className="text-xs text-slate-500 truncate">Viviendas</div><div className="text-sm font-semibold tabular-nums">{fmtEUR(res.obraViviendaAmt)}</div></div>
                <div><div className="text-xs text-slate-500 truncate">Garajes</div><div className="text-sm font-semibold tabular-nums">{fmtEUR(res.obraGarajeAmt)}</div></div>
                <div><div className="text-xs text-slate-500 truncate">Trasteros</div><div className="text-sm font-semibold tabular-nums">{fmtEUR(res.obraTrasterosAmt)}</div></div>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-100">
                <div><div className="text-xs text-slate-500 truncate">Cimentación</div><div className="text-sm font-semibold tabular-nums">{fmtEUR(res.cimentacionAmt)}</div></div>
                <div><div className="text-xs text-slate-500 truncate">Accesos</div><div className="text-sm font-semibold tabular-nums">{fmtEUR(res.accesosAmt)}</div></div>
                <div><div className="text-xs text-slate-500 truncate">Escaleras</div><div className="text-sm font-semibold tabular-nums">{fmtEUR(res.escalerasAmt)}</div></div>
              </div>
              <div className="grid grid-cols-2 gap-2 py-1.5 border-b border-slate-100">
                <div><div className="text-xs text-slate-500 truncate">Arquitecto</div><div className="text-sm font-semibold tabular-nums">{fmtEUR(res.arquitectoAmt)}</div></div>
                <div><div className="text-xs text-slate-500 truncate">Desviaciones</div><div className="text-sm font-semibold tabular-nums">{res.desviacionesAmt > 0 ? fmtEUR(res.desviacionesAmt) : "—"}</div></div>
              </div>
              <div className="border-t border-slate-200 pt-1 mt-1" />
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide py-1">Impuestos</div>
              <ResultPair label1="Impuesto compra" value1={fmtEUR(res.purchaseTaxAmt)} label2="Tasas y licencias" value2={fmtEUR(res.tasasAmt)} />
            </div>
          </SectionBlock>

          {/* ── SECCIÓN 10: ESCENARIOS Y SENSIBILIDAD ── */}
          <SectionBlock id="section-escenarios" title="Escenarios y sensibilidad" open={open.escenarios} onToggle={() => toggleSection("escenarios")}>
            <ScenariosPanel op={draft} />
          </SectionBlock>

        </div>

        {showTracking && (
          <TrackingModal op={draft} onPersist={commit} onClose={() => setShowTracking(false)} />
        )}
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  );
}

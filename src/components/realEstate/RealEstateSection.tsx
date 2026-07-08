"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useSync } from "@/src/sync/SyncContext";
import { calcResults, fmtEUR, fmtPct, CATEGORY_INFO, convertRealEstateOperationType, type RealEstateCategory } from "@/src/lib/realEstateCalc";
import type { REOperation, REResults } from "@/src/lib/realEstate";
import { DEFAULT_TASAS } from "@/src/lib/realEstate";
import { formatShortDate } from "@/src/lib/date";
import { RealEstateModal } from "./RealEstateModal";
import { RealEstateWizard } from "./RealEstateWizard";
import { stageOf, stagePriority, type PipelineStage, type StageFilter, PIPELINE_STAGES, stageDef } from "@/src/lib/pipeline";
import { StageSelect } from "./pipeline/StageSelect";
import { StageBadge } from "./pipeline/StageBadge";
import { PipelineFilters, type StageCounts } from "./pipeline/PipelineFilters";
import { ViewModeToggle, type ViewMode } from "./pipeline/ViewModeToggle";
import { OperationsTable, type OperationRow } from "./OperationsTable";
import { PortfolioHeader } from "./PortfolioHeader";
import { CompareDashboard } from "./charts/CompareDashboard";
import { KanbanBoard } from "./KanbanBoard";
import { priorityDef, temperatureDef } from "@/src/lib/management";
import { expenseTotals, salesStats } from "@/src/lib/realEstateTrackingCalc";

function generateId(): string {
  return crypto.randomUUID();
}

function createDefaultOperation(): REOperation {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name: "Nueva operación",
    purchasePrice: 0,
    units: [],
    costs: {
      purchaseTaxPct: 8,
      arquitectoPct: 3,
      tasas: DEFAULT_TASAS.map((t) => ({ ...t })),
    },
    financing: {
      enabled: false,
      compra: { pct: 80, interest: 5.1 },
      obra: { pct: 60, interest: 5.1 },
    },
    createdAt: now,
    updatedAt: now,
  };
}

// Remove variant metadata fields cleanly
function stripVariantFields(op: REOperation): Omit<REOperation, "variantGroupId" | "variantGroupName" | "variantName" | "isMainVariant"> {
  const { variantGroupId: _g, variantGroupName: _gn, variantName: _vn, isMainVariant: _im, ...rest } = op;
  return rest;
}

// ── CompareModal ──────────────────────────────────────────────────────────────

type CompareRow = { op: REOperation; res: REResults };

type CompareSubField = {
  label: string;
  getValue: (r: CompareRow) => string;
  getRaw: (r: CompareRow) => number;
};

type CompareField = {
  label: string;
  category: "rent" | "sale" | "common";
  getValue: (r: CompareRow) => string;
  isBest?: (r: CompareRow, i: number) => boolean;
  isMin?: boolean;
  shouldShow?: (rows: CompareRow[]) => boolean;
  expandKey?: string;
  subFields?: CompareSubField[];
};

const _n0 = (v: number | undefined | null): number =>
  Number.isFinite(v as number) ? (v as number) : 0;

function formatUnitSummaryWeb(op: REOperation, res: REResults): string {
  const nViviendas = op.units
    .filter((u) => u.type === "VIVIENDA")
    .reduce((s, u) => s + Math.max(1, Math.round(_n0(u.numUnits ?? 1))), 0);
  const nGarajes = res.unitResults
    .filter((u) => u.type === "GARAJE")
    .reduce((s, u) => s + u.numPlazas, 0);
  const nTrasteros = res.unitResults
    .filter((u) => u.type === "TRASTERO")
    .reduce((s, u) => s + u.numTrasteros, 0);
  const hasHabitaciones = op.units.some(
    (u) => u.type === "VIVIENDA" && u.rentType === "HABITACIONES"
  );
  const nHab = res.unitResults
    .filter((u) => u.type === "VIVIENDA" && u.rentType === "HABITACIONES")
    .reduce((s, u) => s + u.rooms, 0);

  const parts: string[] = [];
  if (nViviendas > 0)
    parts.push(hasHabitaciones && nHab > 0 ? `${nViviendas} viv / ${nHab} hab` : `${nViviendas} viv`);
  if (nGarajes > 0) parts.push(`${nGarajes} aparc`);
  if (nTrasteros > 0) parts.push(`${nTrasteros} trast`);
  return parts.length > 0 ? parts.join(" + ") : "—";
}

const RE_TYPE_ORDER: RealEstateCategory[] = ["vivienda", "local", "suelo", "adaptacion"];

/**
 * Selector de tipo rápido. Al pulsar una tarjeta se crea la operación con ese
 * tipo y se abre el editor inmediatamente (sin wizard multipaso).
 */
function TypePickerModal({ onPick, onClose }: { onPick: (cat: RealEstateCategory) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-full bg-white shadow-2xl flex flex-col overflow-hidden sm:mt-16 sm:rounded-2xl in-reveal">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0 gap-4">
          <div>
            <h2 className="text-base font-extrabold text-ink tracking-tight">Nueva operación</h2>
            <p className="text-xs text-slate-500 mt-0.5">Elige el tipo y empieza a rellenar al instante.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {RE_TYPE_ORDER.map((cat) => {
              const info = CATEGORY_INFO[cat];
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onPick(cat)}
                  className="re-card re-card-interactive text-left flex items-start gap-3 p-4 group"
                >
                  <span className="text-2xl leading-none shrink-0" aria-hidden>{info.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-ink tracking-tight">{info.label}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">{info.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompareModal({ ops, onClose, onOpenOp }: { ops: REOperation[]; onClose: () => void; onOpenOp?: (op: REOperation) => void }) {
  const [showRent, setShowRent] = useState(true);
  const [showSale, setShowSale] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Cerrar con Escape + bloquear scroll del fondo mientras el modal está abierto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const toggleExpand = useCallback((key: string) => {
    setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const rows: CompareRow[] = useMemo(() => ops.map((op) => ({ op, res: calcResults(op) })), [ops]);

  const safeMax = (vals: number[]) => { const pos = vals.filter((v) => v > 0 && Number.isFinite(v)); return pos.length ? Math.max(...pos) : null; };
  const safeMin = (vals: number[]) => { const pos = vals.filter((v) => v > 0 && Number.isFinite(v)); return pos.length ? Math.min(...pos) : null; };

  const maxRentYield  = safeMax(rows.map((r) => r.res.rentYield));
  const maxCashflow   = safeMax(rows.map((r) => r.res.monthlyRentBenefit));
  const maxBenefit    = safeMax(rows.map((r) => r.res.saleBenefit));
  const maxSaleYield  = safeMax(rows.map((r) => r.res.saleYield));
  const minInvest     = safeMin(rows.map((r) => r.res.totalInvestment));
  const maxTotalROI   = safeMax(rows.map((r) => r.res.totalInvestment > 0 ? r.res.saleBenefit / r.res.totalInvestment : 0));

  const fmtOr = (v: number, fmt: (n: number) => string) =>
    !Number.isFinite(v) || v === 0 ? "—" : fmt(v);

  const cashflowSubFields: CompareSubField[] = [
    {
      label: "Alq. viviendas",
      getRaw: (r) => r.res.unitResults
        .filter((u) => u.type === "VIVIENDA" && (u.rentType ?? "TRADICIONAL") === "TRADICIONAL")
        .reduce((s, u) => s + _n0(u.rentMonthly) * Math.max(1, Math.round(_n0(u.numUnits ?? 1))), 0),
      getValue: (r) => {
        const v = r.res.unitResults
          .filter((u) => u.type === "VIVIENDA" && (u.rentType ?? "TRADICIONAL") === "TRADICIONAL")
          .reduce((s, u) => s + _n0(u.rentMonthly) * Math.max(1, Math.round(_n0(u.numUnits ?? 1))), 0);
        return fmtOr(v, fmtEUR);
      },
    },
    {
      label: "Alq. habitaciones",
      getRaw: (r) => r.res.unitResults
        .filter((u) => u.type === "VIVIENDA" && u.rentType === "HABITACIONES")
        .reduce((s, u) => s + u.monthlyIncomeRooms, 0),
      getValue: (r) => {
        const v = r.res.unitResults
          .filter((u) => u.type === "VIVIENDA" && u.rentType === "HABITACIONES")
          .reduce((s, u) => s + u.monthlyIncomeRooms, 0);
        return fmtOr(v, fmtEUR);
      },
    },
    {
      label: "Alq. garajes",
      getRaw: (r) => r.res.unitResults.filter((u) => u.type === "GARAJE").reduce((s, u) => s + _n0(u.rentMonthly) * u.numPlazas, 0),
      getValue: (r) => {
        const v = r.res.unitResults.filter((u) => u.type === "GARAJE").reduce((s, u) => s + _n0(u.rentMonthly) * u.numPlazas, 0);
        return fmtOr(v, fmtEUR);
      },
    },
    {
      label: "Alq. trasteros",
      getRaw: (r) => r.res.unitResults.filter((u) => u.type === "TRASTERO").reduce((s, u) => s + _n0(u.rentMonthly) * u.numTrasteros, 0),
      getValue: (r) => {
        const v = r.res.unitResults.filter((u) => u.type === "TRASTERO").reduce((s, u) => s + _n0(u.rentMonthly) * u.numTrasteros, 0);
        return fmtOr(v, fmtEUR);
      },
    },
    {
      label: "€/vivienda",
      getRaw: (r) => {
        const u = r.op.units.find((u) => u.type === "VIVIENDA" && (u.rentType ?? "TRADICIONAL") === "TRADICIONAL");
        return _n0(u?.rentMonthly);
      },
      getValue: (r) => {
        const u = r.op.units.find((u) => u.type === "VIVIENDA" && (u.rentType ?? "TRADICIONAL") === "TRADICIONAL");
        return fmtOr(_n0(u?.rentMonthly), (n) => `${fmtEUR(n)}/mes`);
      },
    },
    {
      label: "€/habitación",
      getRaw: (r) => {
        const u = r.op.units.find((u) => u.type === "VIVIENDA" && u.rentType === "HABITACIONES");
        return _n0(u?.pricePerRoom);
      },
      getValue: (r) => {
        const u = r.op.units.find((u) => u.type === "VIVIENDA" && u.rentType === "HABITACIONES");
        return fmtOr(_n0(u?.pricePerRoom), (n) => `${fmtEUR(n)}/mes`);
      },
    },
    {
      label: "€/aparcamiento",
      getRaw: (r) => {
        const u = r.op.units.find((u) => u.type === "GARAJE");
        return _n0(u?.rentMonthly);
      },
      getValue: (r) => {
        const u = r.op.units.find((u) => u.type === "GARAJE");
        return fmtOr(_n0(u?.rentMonthly), (n) => `${fmtEUR(n)}/mes`);
      },
    },
    {
      label: "€/trastero",
      getRaw: (r) => {
        const u = r.op.units.find((u) => u.type === "TRASTERO");
        return _n0(u?.rentMonthly);
      },
      getValue: (r) => {
        const u = r.op.units.find((u) => u.type === "TRASTERO");
        return fmtOr(_n0(u?.rentMonthly), (n) => `${fmtEUR(n)}/mes`);
      },
    },
  ];

  const obraSubFields: CompareSubField[] = [
    { label: "Obra vivienda",  getRaw: (r) => r.res.obraViviendaAmt,    getValue: (r) => fmtOr(r.res.obraViviendaAmt, fmtEUR) },
    { label: "Obra garaje",    getRaw: (r) => r.res.obraGarajeAmt,      getValue: (r) => fmtOr(r.res.obraGarajeAmt, fmtEUR) },
    { label: "Obra trasteros", getRaw: (r) => r.res.obraTrasterosAmt,   getValue: (r) => fmtOr(r.res.obraTrasterosAmt, fmtEUR) },
    { label: "Cimentación",    getRaw: (r) => r.res.cimentacionAmt,     getValue: (r) => fmtOr(r.res.cimentacionAmt, fmtEUR) },
    { label: "Escaleras",      getRaw: (r) => r.res.escalerasAmt,       getValue: (r) => fmtOr(r.res.escalerasAmt, fmtEUR) },
    { label: "Accesos",        getRaw: (r) => r.res.accesosAmt,         getValue: (r) => fmtOr(r.res.accesosAmt, fmtEUR) },
    { label: "Mobiliario",     getRaw: (r) => r.res.furnitureCostTotal, getValue: (r) => fmtOr(r.res.furnitureCostTotal, fmtEUR) },
  ];

  const otroSubFields: CompareSubField[] = [
    { label: "Arquitecto",      getRaw: (r) => r.res.arquitectoAmt,   getValue: (r) => fmtOr(r.res.arquitectoAmt, fmtEUR) },
    { label: "Imp. compra",     getRaw: (r) => r.res.purchaseTaxAmt,  getValue: (r) => fmtOr(r.res.purchaseTaxAmt, fmtEUR) },
    { label: "Tasas y licencias", getRaw: (r) => r.res.tasasAmt,      getValue: (r) => fmtOr(r.res.tasasAmt, fmtEUR) },
    { label: "Desviaciones",    getRaw: (r) => r.res.desviacionesAmt, getValue: (r) => fmtOr(r.res.desviacionesAmt, fmtEUR) },
  ];

  const fields: CompareField[] = [
    {
      label: "Unidades",
      category: "common",
      getValue: (r) => formatUnitSummaryWeb(r.op, r.res),
    },
    {
      label: "Rent. alquiler",
      category: "rent",
      getValue: (r) => r.res.rentYield > 0 ? fmtPct(r.res.rentYield) : "—",
      isBest: (r) => maxRentYield !== null && r.res.rentYield === maxRentYield,
    },
    {
      label: "Cashflow/mes",
      category: "rent",
      getValue: (r) => r.res.monthlyRentBenefit > 0 ? fmtEUR(r.res.monthlyRentBenefit) : "—",
      isBest: (r) => maxCashflow !== null && r.res.monthlyRentBenefit === maxCashflow,
      expandKey: "cashflow",
      subFields: cashflowSubFields,
    },
    {
      label: "Hipoteca/mes",
      category: "rent",
      getValue: (r) => r.op.financing.enabled && r.res.totalMonthlyPayment > 0
        ? fmtEUR(r.res.totalMonthlyPayment)
        : "—",
      shouldShow: (rws) => rws.some((r) => r.op.financing.enabled && r.res.totalMonthlyPayment > 0),
    },
    {
      label: "Ben. bruto/mes",
      category: "rent",
      getValue: (r) => r.res.monthlyRentIncome > 0 ? fmtEUR(r.res.monthlyRentIncome) : "—",
    },
    {
      label: "Rent. venta",
      category: "sale",
      getValue: (r) => fmtOr(r.res.saleYield, fmtPct),
      isBest: (r) => maxSaleYield !== null && r.res.saleYield === maxSaleYield,
    },
    {
      label: "Beneficio venta",
      category: "sale",
      getValue: (r) => fmtOr(r.res.saleBenefit, fmtEUR),
      isBest: (r) => maxBenefit !== null && r.res.saleBenefit === maxBenefit,
    },
    {
      label: "Inversión total",
      category: "common",
      getValue: (r) => fmtOr(r.res.totalInvestment, fmtEUR),
      isBest: (r) => minInvest !== null && r.res.totalInvestment === minInvest,
      isMin: true,
    },
    {
      label: "Mi inversión",
      category: "common",
      getValue: (r) => fmtOr(r.res.myInvestment, fmtEUR),
    },
    {
      label: "Financiado",
      category: "common",
      getValue: (r) => fmtOr(r.res.totalFinanced, fmtEUR),
      shouldShow: (rws) => rws.some((r) => r.res.totalFinanced > 0),
    },
    {
      label: "Compra",
      category: "common",
      getValue: (r) => fmtOr(r.op.purchasePrice, fmtEUR),
    },
    {
      label: "Obra",
      category: "common",
      getValue: (r) => fmtOr(r.res.obraTotal, fmtEUR),
      expandKey: "obra",
      subFields: obraSubFields,
    },
    {
      label: "Otro",
      category: "common",
      getValue: (r) => {
        const v = r.res.arquitectoAmt + r.res.purchaseTaxAmt + r.res.tasasAmt + r.res.desviacionesAmt;
        return fmtOr(v, fmtEUR);
      },
      expandKey: "otro",
      subFields: otroSubFields,
    },
    {
      label: "ROI",
      category: "sale",
      getValue: (r) => {
        const v = r.res.totalInvestment > 0 ? r.res.saleBenefit / r.res.totalInvestment : 0;
        return fmtOr(v, fmtPct);
      },
      isBest: (_r, i) => {
        const v = rows[i].res.totalInvestment > 0 ? rows[i].res.saleBenefit / rows[i].res.totalInvestment : 0;
        return maxTotalROI !== null && v === maxTotalROI;
      },
    },
  ];

  const bothOff = !showRent && !showSale;
  const visibleFields = fields.filter((f) => {
    if (f.shouldShow && !f.shouldShow(rows)) return false;
    return f.category === "common" || bothOff ||
      (f.category === "rent" && showRent) ||
      (f.category === "sale" && showSale);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center" role="dialog" aria-modal="true" aria-labelledby="compare-modal-title">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-5xl max-h-full bg-white shadow-2xl flex flex-col overflow-hidden sm:mt-8 sm:rounded-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0 gap-4">
          <h2 id="compare-modal-title" className="text-base font-extrabold text-ink tracking-tight shrink-0">Comparación de inversiones</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRent((v) => !v)}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                showRent
                  ? "bg-emerald-600 border-emerald-600 text-white"
                  : "bg-white border-slate-300 text-slate-400 hover:border-slate-400"
              }`}
            >
              Alquiler
            </button>
            <button
              type="button"
              onClick={() => setShowSale((v) => !v)}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                showSale
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white border-slate-300 text-slate-400 hover:border-slate-400"
              }`}
            >
              Venta
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabla scrollable */}
        <div className="flex-1 overflow-auto">
          {/* Panel comparativo visual (arriba del todo, antes de la tabla) */}
          <div className="px-4 pt-4 sm:px-6">
            <CompareDashboard
              rows={rows}
              onOpenOp={
                onOpenOp
                  ? (id) => {
                      const r = rows.find((x) => x.op.id === id);
                      if (r) onOpenOp(r.op);
                    }
                  : undefined
              }
            />
          </div>
          <table className="w-full text-sm border-collapse" style={{ minWidth: `${180 + ops.length * 180}px` }}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-36 sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                  Campo
                </th>
                {rows.map((r) => (
                  <th key={r.op.id} className="px-4 py-3 text-left min-w-[160px]">
                    <div
                      className={`text-sm font-semibold leading-tight truncate max-w-[200px] ${onOpenOp ? "text-blue-700 underline cursor-pointer hover:text-blue-900 transition-colors" : "text-slate-900"}`}
                      onClick={onOpenOp ? () => onOpenOp(r.op) : undefined}
                    >
                      {r.op.name}
                    </div>
                    {r.op.isDraft && (
                      <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded mt-1 inline-block">
                        Incompleta
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleFields.map((field, fi) => {
                const isExpanded = field.expandKey ? expandedRows[field.expandKey] ?? false : false;
                const visibleSubs = field.subFields?.filter((sf) =>
                  rows.some((r) => sf.getRaw(r) > 0)
                ) ?? [];
                const catCls =
                  field.category === "rent" ? "text-emerald-600" :
                  field.category === "sale" ? "text-blue-600" :
                  "text-slate-500";
                return (
                  <>
                    <tr key={field.label} className={fi % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td
                        className={`px-4 py-2.5 text-xs font-medium sticky left-0 bg-inherit z-10 border-r border-slate-100 whitespace-nowrap ${catCls} ${field.expandKey ? "cursor-pointer hover:bg-slate-100/60 select-none" : ""}`}
                        onClick={field.expandKey ? () => toggleExpand(field.expandKey!) : undefined}
                      >
                        <span className="flex items-center gap-1">
                          {field.expandKey && (
                            <svg
                              className={`w-3 h-3 transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                          {field.label}
                        </span>
                      </td>
                      {rows.map((r, ri) => {
                        const best = field.isBest?.(r, ri) ?? false;
                        return (
                          <td
                            key={r.op.id}
                            className={`px-4 py-2.5 text-sm tabular-nums font-medium whitespace-nowrap ${
                              best
                                ? field.isMin
                                  ? "text-blue-700 bg-blue-50"
                                  : "text-emerald-700 bg-emerald-50"
                                : "text-slate-800"
                            }`}
                          >
                            {field.getValue(r)}
                            {best && (
                              <span className={`ml-1 text-[10px] font-bold px-1 rounded ${field.isMin ? "text-blue-600 bg-blue-100" : "text-emerald-600 bg-emerald-100"}`}>
                                {field.isMin ? "↓" : "★"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {isExpanded && visibleSubs.map((sf) => (
                      <tr key={`${field.label}__${sf.label}`} className="bg-slate-50/80">
                        <td className="pl-8 pr-4 py-1.5 text-[11px] text-slate-400 font-medium sticky left-0 bg-inherit z-10 border-r border-slate-100 whitespace-nowrap">
                          {sf.label}
                        </td>
                        {rows.map((r) => (
                          <td key={r.op.id} className="px-4 py-1.5 text-xs tabular-nums text-slate-500 whitespace-nowrap">
                            {sf.getValue(r)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Leyenda */}
        <div className="px-6 py-3 border-t border-slate-100 flex flex-wrap items-center gap-4 text-[11px] text-slate-400 flex-shrink-0">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Alquiler
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" /> Venta
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" /> Común
          </span>
          <span className="flex items-center gap-1 ml-auto">
            <span className="text-emerald-600 font-bold bg-emerald-100 px-1 rounded">★</span>
            Mejor valor
          </span>
          <span className="flex items-center gap-1">
            <span className="text-blue-600 font-bold bg-blue-100 px-1 rounded">↓</span>
            Menor inversión
          </span>
        </div>
      </div>
    </div>
  );
}

// ── RECard ────────────────────────────────────────────────────────────────────

interface RECardProps {
  op: REOperation;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  compareMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  // Group card extras
  isGroupCard?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  // Variant card: action to convert back to independent operation
  onExtract?: () => void;
  // Cambio rápido de etapa del pipeline
  onChangeStage?: (stage: PipelineStage) => void;
  // Momento actual (ISO) para calcular vencimientos sin impureza en render
  now: string;
}

function RECard({
  op, onOpen, onDuplicate, onDelete,
  compareMode, selected, onToggleSelect,
  isGroupCard, isExpanded, onToggleExpand,
  onExtract, onChangeStage, now,
}: RECardProps) {
  const res = useMemo(() => calcResults(op), [op]);
  const exp = useMemo(() => expenseTotals(op), [op]);
  const sales = useMemo(() => salesStats(op), [op]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stage = stageOf(op);
  const tipo = CATEGORY_INFO[(op._cat ?? "vivienda") as RealEstateCategory]?.label ?? null;
  // KPI héroe: rentabilidad de venta si hay venta prevista; si no, inversión total.
  const heroIsYield = res.totalSales > 0;
  // Indicador útil (solo con datos reales de seguimiento; si no, sin barra).
  const bar =
    exp.paidPct != null
      ? { label: "Gastos pagados", value: exp.paidPct, color: "var(--positive)" }
      : sales.soldPct != null
      ? { label: "Ventas cerradas", value: sales.soldPct, color: "var(--brand)" }
      : null;

  const handleClick = () => {
    if (compareMode) {
      onToggleSelect?.();
    } else {
      onOpen();
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`re-card re-card-interactive p-4 cursor-pointer ${
        compareMode && selected ? "!border-brand ring-2 ring-[var(--brand-soft)]" : ""
      }`}
      style={{ borderLeft: `3px solid ${stageDef(stage).color}` }}
    >
      {/* Fila superior: etapa + tipo + acciones */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          {compareMode && (
            <span
              className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                selected ? "bg-blue-600 border-blue-600" : "border-slate-300"
              }`}
            >
              {selected && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
          )}
          {!compareMode && onChangeStage ? (
            <StageSelect stage={stage} onChange={(s) => onChangeStage(s)} />
          ) : (
            <StageBadge stage={stage} />
          )}
          {tipo && <span className="text-[11px] text-ink-subtle truncate">{tipo}</span>}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {isGroupCard && onToggleExpand && (
            <button
              data-no-drag
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
              title={isExpanded ? "Contraer variantes" : "Expandir variantes"}
              className="p-1 text-slate-400 hover:text-blue-500 transition-colors rounded"
            >
              <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          {!compareMode && (
            <div data-no-drag onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
              {confirmDelete ? (
                <>
                  <button onClick={() => onDelete()} className="text-[10px] font-medium text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded transition-colors">Eliminar</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-[10px] font-medium text-slate-500 hover:text-slate-700 px-2 py-0.5 rounded transition-colors">Cancelar</button>
                </>
              ) : (
                <>
                  {onExtract && (
                    <button onClick={() => onExtract()} title="Convertir en operación independiente" className="p-1 text-slate-400 hover:text-orange-500 transition-colors rounded">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </button>
                  )}
                  <button onClick={() => onDuplicate()} title="Duplicar operación" className="p-1 text-slate-400 hover:text-blue-500 transition-colors rounded">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button onClick={() => setConfirmDelete(true)} title="Eliminar operación" className="p-1 text-slate-400 hover:text-red-500 transition-colors rounded">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Título + ubicación + fecha */}
      <div className="min-w-0 mb-3">
        <h3 className="text-base font-extrabold text-ink leading-tight tracking-tight truncate">{op.name || "Operación"}</h3>
        <div className="flex items-center gap-1.5 text-xs text-ink-subtle mt-0.5 min-w-0">
          {op.address ? <span className="truncate">{op.address}</span> : null}
          {op.address && formatShortDate(op.updatedAt) ? <span aria-hidden>·</span> : null}
          {formatShortDate(op.updatedAt) ? <span className="whitespace-nowrap">{formatShortDate(op.updatedAt)}</span> : null}
          {op.isDraft ? <span className="pill pill-warning ml-0.5">Incompleta</span> : null}
        </div>
      </div>

      {/* Gestión: prioridad · temperatura · próxima acción (solo si hay dato real) */}
      {(() => {
        const prio = priorityDef(op.priority);
        const temp = temperatureDef(op.temperature);
        const hasAny = prio || temp || (op.nextActionText && op.nextActionText.trim());
        if (!hasAny) return null;
        const dd = op.nextActionDueDate ? Math.round((Date.parse(op.nextActionDueDate) - Date.parse(now.slice(0, 10))) / 86_400_000) : null;
        return (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {prio ? <span className="pill" style={{ background: prio.soft, color: prio.color }}>{prio.label}</span> : null}
            {temp ? <span className="pill" style={{ background: temp.soft, color: temp.color }}>{temp.icon} {temp.label}</span> : null}
            {op.nextActionText && op.nextActionText.trim() ? (
              <span className="text-[11px] text-ink-muted truncate max-w-full">→ {op.nextActionText}</span>
            ) : null}
            {dd != null && dd < 0 ? <span className="pill pill-negative">Vencida</span> : null}
          </div>
        );
      })()}

      {/* KPI héroe dominante */}
      <div className="mb-3 flex items-end gap-2">
        <div className="min-w-0">
          <p className="kpi-label">{heroIsYield ? "Rentab. venta est." : "Inversión estimada"}</p>
          <p
            className="kpi-hero"
            style={{ color: heroIsYield ? (res.saleYield >= 0 ? "var(--positive)" : "var(--negative)") : "var(--ink)" }}
          >
            {heroIsYield ? fmtPct(res.saleYield) : fmtEUR(res.totalInvestment)}
          </p>
        </div>
        {heroIsYield ? (
          <span className={`stat-delta mb-1 ${res.saleBenefit >= 0 ? "stat-delta-up" : "stat-delta-down"}`}>
            {res.saleBenefit >= 0 ? "▲" : "▼"} {fmtEUR(res.saleBenefit)}
          </span>
        ) : null}
      </div>

      {/* Trío secundario */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <RECardMini label="Inversión" value={fmtEUR(res.totalInvestment)} />
        <RECardMini label="Venta est." value={fmtEUR(res.totalSales)} />
        <RECardMini label="Beneficio" value={fmtEUR(res.saleBenefit)} color={res.saleBenefit >= 0 ? "var(--positive)" : "var(--negative)"} />
      </div>

      {/* Indicador (solo con datos reales de seguimiento) */}
      {bar ? (
        <div>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-ink-subtle">{bar.label}</span>
            <span className="tabular-nums font-semibold text-ink">{Math.round(bar.value * 100)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--surface-alt)] overflow-hidden border border-line">
            <div className="bar-anim h-full rounded-full" style={{ width: `${Math.round(bar.value * 100)}%`, background: bar.color }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RECardMini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide font-bold text-ink-subtle truncate">{label}</p>
      <p className="text-sm font-bold tabular-nums truncate" style={color ? { color } : { color: "var(--ink)" }}>{value}</p>
    </div>
  );
}

// ── REVariantRow ─────────────────────────────────────────────────────────────

interface REVariantRowProps {
  op: REOperation;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExtract: () => void;
  compareMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

function REVariantRow({
  op, onOpen, onDuplicate, onDelete, onExtract,
  compareMode, selected, onToggleSelect,
}: REVariantRowProps) {
  const res = useMemo(() => calcResults(op), [op]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const unitSummary = formatUnitSummaryWeb(op, res);

  const handleClick = () => {
    if (compareMode) {
      onToggleSelect?.();
    } else {
      onOpen();
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`bg-surface rounded-xl border px-3 py-2 cursor-pointer transition-all ${
        compareMode
          ? selected
            ? "border-brand ring-2 ring-[var(--brand-soft)]"
            : "border-line hover:border-brand"
          : "border-line hover:border-[var(--line-strong)] hover:shadow-sm"
      }`}
    >
      <div className="flex items-center gap-2">
        {compareMode && (
          <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${selected ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
            {selected && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0 flex items-center gap-2 justify-between">
          <span className="min-w-0 truncate text-sm font-bold text-ink">
            {op.name}
            {formatShortDate(op.updatedAt) && (
              <span className="ml-1.5 font-normal text-ink-subtle">· {formatShortDate(op.updatedAt)}</span>
            )}
          </span>
          {unitSummary !== "—" && (
            <span className="text-xs text-ink-subtle tabular-nums whitespace-nowrap flex-shrink-0">{unitSummary}</span>
          )}
        </div>
        {!compareMode && (
          <div data-no-drag onClick={(e) => e.stopPropagation()} className="flex items-center gap-0.5 flex-shrink-0">
            {confirmDelete ? (
              <>
                <button onClick={() => onDelete()} className="text-[10px] font-medium text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded transition-colors">
                  Eliminar
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-[10px] font-medium text-slate-500 hover:text-slate-700 px-2 py-0.5 rounded transition-colors">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button onClick={() => onExtract()} title="Convertir en operación independiente" className="p-1 text-slate-400 hover:text-orange-500 transition-colors rounded">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
                <button onClick={() => onDuplicate()} title="Duplicar" className="p-1 text-slate-400 hover:text-blue-500 transition-colors rounded">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button onClick={() => setConfirmDelete(true)} title="Eliminar" className="p-1 text-slate-400 hover:text-red-500 transition-colors rounded">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1">
        <span className="text-xs tabular-nums" style={{ color: "var(--positive)" }}>
          Alquiler: <span className="font-bold">{fmtPct(res.rentYield)}</span>
          {res.monthlyRentBenefit > 0 && <> · {fmtEUR(res.monthlyRentBenefit)}/mes</>}
        </span>
        <span className="text-xs tabular-nums" style={{ color: "var(--brand)" }}>
          Venta: <span className="font-bold">{fmtPct(res.saleYield)}</span>
          {res.saleBenefit > 0 && <> · {fmtEUR(res.saleBenefit)}</>}
        </span>
      </div>
    </div>
  );
}

// ── List item types ───────────────────────────────────────────────────────────

type WebListItem =
  | { kind: "op"; op: REOperation }
  | { kind: "group-card"; groupId: string; groupName: string; mainOp: REOperation; count: number }
  | { kind: "group-expanded"; groupId: string; variants: REOperation[] };

function buildWebListItems(ops: REOperation[], expandedGroups: Set<string>): WebListItem[] {
  const items: WebListItem[] = [];
  const seen = new Set<string>();
  for (const op of ops) {
    if (!op.variantGroupId) {
      items.push({ kind: "op", op });
      continue;
    }
    if (seen.has(op.variantGroupId)) continue;
    seen.add(op.variantGroupId);
    const groupOps = ops.filter((o) => o.variantGroupId === op.variantGroupId);
    // Principal = variante marcada como main; si ninguna, la primera del orden.
    const mainOp = groupOps.find((o) => o.isMainVariant) ?? groupOps[0];
    const variants = groupOps.filter((o) => o.id !== mainOp.id);
    items.push({ kind: "group-card", groupId: op.variantGroupId, groupName: op.variantGroupName ?? op.variantGroupId, mainOp, count: groupOps.length });
    if (expandedGroups.has(op.variantGroupId)) {
      // Excluye el main (mostrado en la group-card) para no duplicar cardRef.
      items.push({ kind: "group-expanded", groupId: op.variantGroupId, variants });
    }
  }
  return items;
}

// ── RealEstateSection ────────────────────────────────────────────────────────

const RE_DRAG_THRESHOLD = 8;

export function RealEstateSection() {
  const { realEstateOperations, setRealEstateOperation, deleteRealEstateOperation } = useSync();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wizardOp, setWizardOp] = useState<REOperation | null>(null);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Drag & drop state
  const [reDrag, setReDrag] = useState<{ id: string; startX: number; startY: number; pointerId: number; isDragActive: boolean; kind: "group-card" | "variant-row" | "op" } | null>(null);
  const [reDragPos, setReDragPos] = useState<{ x: number; y: number } | null>(null);
  const [reDragGhost, setReDragGhost] = useState<{ label: string; w: number; h: number; offsetX: number; offsetY: number } | null>(null);
  const [reDragOverId, setReDragOverId] = useState<string | null>(null);
  // "on" = drop on center (group/merge), "before"/"after" = reorder
  const [dropAction, setDropAction] = useState<"before" | "after" | "on">("after");
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const suppressClickRef = useRef(false);

  // Pipeline / vista: filtro de etapa, búsqueda y modo (tarjetas/tabla, persistido).
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "cards";
    const v = localStorage.getItem("re_viewMode");
    return v === "table" || v === "kanban" ? v : "cards";
  });
  const changeViewMode = useCallback((m: ViewMode) => {
    setViewMode(m);
    if (typeof window !== "undefined") localStorage.setItem("re_viewMode", m);
  }, []);
  const now = useMemo(() => new Date().toISOString(), []);

  const activeOps = useMemo(
    () => realEstateOperations.filter((op) => !op.deleted),
    [realEstateOperations]
  );

  // Orden: prioridad de etapa (Comprado→Captación) y, dentro de cada etapa, las más
  // nuevas primero. "Más nueva" = updatedAt (client_updated_at del sync) desc; fallback
  // createdAt desc; fallback `order` desc (documentado). Sin fechas inventadas.
  const orderedOps = useMemo(() => {
    const recency = (op: REOperation) => op.updatedAt || op.createdAt || "";
    return [...activeOps].sort((a, b) => {
      const pa = stagePriority(a);
      const pb = stagePriority(b);
      if (pa !== pb) return pa - pb;
      const ra = recency(a);
      const rb = recency(b);
      if (ra !== rb) return ra < rb ? 1 : -1;
      const ca = a.createdAt ?? "";
      const cb = b.createdAt ?? "";
      if (ca !== cb) return ca < cb ? 1 : -1;
      return (b.order ?? 0) - (a.order ?? 0);
    });
  }, [activeOps]);

  const webListItems = useMemo(
    () => buildWebListItems(orderedOps, expandedGroups),
    [orderedOps, expandedGroups]
  );

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // Representante de cada item de lista (op suelta o principal del grupo).
  const repOf = (item: WebListItem): REOperation | null =>
    item.kind === "op" ? item.op : item.kind === "group-card" ? item.mainOp : null;

  // Contadores por etapa (sobre representantes, no variantes) — vista global estable.
  const stageCounts = useMemo<StageCounts>(() => {
    const c: StageCounts = { all: 0 };
    for (const s of PIPELINE_STAGES) c[s.key] = 0;
    for (const item of webListItems) {
      const rep = repOf(item);
      if (!rep) continue;
      c.all += 1;
      const key = stageOf(rep); // sin etapa → "captacion"
      c[key] = (c[key] ?? 0) + 1;
    }
    return c;
  }, [webListItems]);

  // Predicado de filtro (etapa + búsqueda por nombre/dirección, local).
  const matchOp = useCallback(
    (op: REOperation): boolean => {
      const stageOk = stageFilter === "all" || stageOf(op) === stageFilter;
      if (!stageOk) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return `${op.name ?? ""} ${op.address ?? ""}`.toLowerCase().includes(q);
    },
    [stageFilter, search]
  );

  // Items de tarjetas filtrados (conserva las variantes expandidas de un grupo visible).
  const displayedItems = useMemo(() => {
    const out: WebListItem[] = [];
    const includedGroups = new Set<string>();
    for (const item of webListItems) {
      if (item.kind === "group-expanded") {
        if (includedGroups.has(item.groupId)) out.push(item);
        continue;
      }
      const rep = repOf(item);
      if (rep && matchOp(rep)) {
        out.push(item);
        if (item.kind === "group-card") includedGroups.add(item.groupId);
      }
    }
    return out;
  }, [webListItems, matchOp]);

  // Representantes (una entrada por operación/grupo) para la cabecera de cartera.
  const deals = useMemo(
    () => webListItems.map(repOf).filter((o): o is REOperation => o != null),
    [webListItems]
  );

  // ¿Algún representante coincide con el filtro/búsqueda activos?
  const hasMatches = useMemo(
    () => webListItems.some((i) => { const r = repOf(i); return r != null && matchOp(r); }),
    [webListItems, matchOp]
  );

  // Filas para la vista tabla (principal + variantes de cada grupo visible).
  const tableRows = useMemo<OperationRow[]>(() => {
    const rows: OperationRow[] = [];
    for (const item of webListItems) {
      if (item.kind === "op") {
        if (matchOp(item.op)) rows.push({ key: item.op.id, op: item.op, variants: [] });
      } else if (item.kind === "group-card") {
        if (!matchOp(item.mainOp)) continue;
        const members = orderedOps.filter((o) => o.variantGroupId === item.groupId);
        rows.push({ key: item.groupId, op: item.mainOp, groupId: item.groupId, variants: members.filter((o) => o.id !== item.mainOp.id) });
      }
    }
    return rows;
  }, [webListItems, orderedOps, matchOp]);

  // Cambio de etapa. Si la operación pertenece a un grupo de variantes, se aplica
  // a TODOS los miembros del grupo (el mismo negocio no debe partirse entre etapas).
  const handleChangeStage = useCallback(
    (op: REOperation, stage: PipelineStage) => {
      const members = op.variantGroupId
        ? activeOps.filter((o) => o.variantGroupId === op.variantGroupId)
        : [op];
      const nowIso = new Date().toISOString();
      let changed = false;
      for (const m of members) {
        if (stageOf(m) !== stage) {
          setRealEstateOperation({ ...m, pipelineStage: stage, updatedAt: nowIso });
          changed = true;
        }
      }
      if (changed) toast.success("Etapa actualizada", { description: stageDef(stage).label });
    },
    [activeOps, setRealEstateOperation]
  );

  // Búsqueda (sin etapa) para Kanban: muestra todas las columnas, filtra por texto.
  const kanbanDeals = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter((op) => `${op.name ?? ""} ${op.address ?? ""}`.toLowerCase().includes(q));
  }, [deals, search]);

  // ── Variant group actions ────────────────────────────────────────────────

  // After any reorder, sync isMainVariant so the first of each group has true
  const syncGroupMainVariants = useCallback((reorderedOps: REOperation[]) => {
    const now = new Date().toISOString();
    const groupFirsts = new Map<string, string>();
    reorderedOps.forEach((op) => {
      if (op.variantGroupId && !groupFirsts.has(op.variantGroupId)) {
        groupFirsts.set(op.variantGroupId, op.id);
      }
    });
    reorderedOps.forEach((op, idx) => {
      const newOrder = (idx + 1) * 1000;
      const shouldBeMain = op.variantGroupId ? groupFirsts.get(op.variantGroupId) === op.id : undefined;
      const orderChanged = op.order !== newOrder;
      const mainChanged = shouldBeMain !== undefined && op.isMainVariant !== shouldBeMain;
      if (orderChanged || mainChanged) {
        setRealEstateOperation({
          ...op,
          order: newOrder,
          ...(shouldBeMain !== undefined ? { isMainVariant: shouldBeMain } : {}),
          updatedAt: now,
        });
      }
    });
  }, [setRealEstateOperation]);

  // Remove op from its group, handle dissolution if last member or reassign main
  const handleGroupDissolution = useCallback((op: REOperation) => {
    if (!op.variantGroupId) return;
    const now = new Date().toISOString();
    const groupId = op.variantGroupId;
    const remaining = activeOps.filter((o) => o.variantGroupId === groupId && o.id !== op.id);

    // Extract op from group
    setRealEstateOperation({ ...stripVariantFields(op), updatedAt: now } as REOperation);

    if (remaining.length === 1) {
      // Dissolve: last member also becomes independent
      setRealEstateOperation({ ...stripVariantFields(remaining[0]), updatedAt: now } as REOperation);
    } else if (remaining.length > 1 && op.isMainVariant) {
      // Promote first remaining as main
      setRealEstateOperation({ ...remaining[0], isMainVariant: true, updatedAt: now });
    }
  }, [activeOps, setRealEstateOperation]);

  // Drop one op ON another (center zone).
  // Variant dragged → dragged becomes FIRST/PRINCIPAL in target group or new group.
  // General op dragged → target becomes FIRST/PRINCIPAL (unchanged legacy behavior).
  const handleDropOn = useCallback((dragged: REOperation, target: REOperation) => {
    const now = new Date().toISOString();

    if (dragged.id === target.id) return;
    if (dragged.variantGroupId && dragged.variantGroupId === target.variantGroupId) return;

    const draggedIsVariant = !!dragged.variantGroupId;
    const targetGroupId = target.variantGroupId;

    // Extract dragged from its source group first (handles source-group dissolution + main promotion)
    if (draggedIsVariant) {
      handleGroupDissolution(dragged);
    }

    if (draggedIsVariant) {
      // VARIANT dropped on something → dragged becomes PRINCIPAL
      if (targetGroupId) {
        // Join existing group as new first/principal
        const groupName = target.variantGroupName ?? target.name;
        const groupMembers = orderedOps
          .filter((o) => o.variantGroupId === targetGroupId)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const firstOrder = groupMembers[0]?.order ?? 1000;
        // Demote the current principal
        groupMembers.forEach((m) => {
          if (m.isMainVariant) {
            setRealEstateOperation({ ...m, isMainVariant: false, updatedAt: now });
          }
        });
        // Add dragged as new principal before existing first
        setRealEstateOperation({
          ...dragged,
          variantGroupId: targetGroupId,
          variantGroupName: groupName,
          isMainVariant: true,
          order: firstOrder - 500,
          updatedAt: now,
        });
        setExpandedGroups((prev) => { const next = new Set(prev); next.add(targetGroupId); return next; });
      } else {
        // Target is independent → new group; dragged = principal, target = second
        const groupId = crypto.randomUUID();
        const groupName = dragged.name;
        const targetOrder = target.order ?? 1000;
        setRealEstateOperation({
          ...dragged,
          variantGroupId: groupId,
          variantGroupName: groupName,
          isMainVariant: true,
          order: targetOrder - 500,
          updatedAt: now,
        });
        setRealEstateOperation({
          ...target,
          variantGroupId: groupId,
          variantGroupName: groupName,
          isMainVariant: false,
          updatedAt: now,
        });
        setExpandedGroups((prev) => { const next = new Set(prev); next.add(groupId); return next; });
      }
    } else {
      // GENERAL op dropped on something → target becomes PRINCIPAL (unchanged behavior)
      if (targetGroupId) {
        // General op joins existing group at the end
        const groupName = target.variantGroupName ?? target.name;
        const groupMembers = orderedOps
          .filter((o) => o.variantGroupId === targetGroupId)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const maxOrder = groupMembers[groupMembers.length - 1]?.order ?? 1000;
        setRealEstateOperation({
          ...dragged,
          variantGroupId: targetGroupId,
          variantGroupName: groupName,
          isMainVariant: false,
          order: maxOrder + 500,
          updatedAt: now,
        });
        setExpandedGroups((prev) => { const next = new Set(prev); next.add(targetGroupId); return next; });
      } else {
        // Both independent → new group; target = principal, dragged = second
        const groupId = crypto.randomUUID();
        const groupName = target.name;
        const targetOrder = target.order ?? 1000;
        setRealEstateOperation({
          ...target,
          variantGroupId: groupId,
          variantGroupName: groupName,
          isMainVariant: true,
          updatedAt: now,
        });
        setRealEstateOperation({
          ...dragged,
          variantGroupId: groupId,
          variantGroupName: groupName,
          isMainVariant: false,
          order: targetOrder + 500,
          updatedAt: now,
        });
        setExpandedGroups((prev) => { const next = new Set(prev); next.add(groupId); return next; });
      }
    }
  }, [orderedOps, handleGroupDissolution, setRealEstateOperation]);

  const handleReorder = useCallback((reorderedOps: REOperation[]) => {
    syncGroupMainVariants(reorderedOps);
  }, [syncGroupMainVariants]);

  // Move an entire group as a unit within the general list (no extraction)
  const handleGroupReorder = useCallback((mainOp: REOperation, targetOp: REOperation, action: "before" | "after" | "on") => {
    const groupId = mainOp.variantGroupId!;
    const groupMembers = orderedOps
      .filter((o) => o.variantGroupId === groupId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const without = orderedOps.filter((o) => o.variantGroupId !== groupId);
    let toIdx = without.findIndex((o) => o.id === targetOp.id);
    if (toIdx === -1) toIdx = without.length;
    if (action === "after" || action === "on") toIdx += 1;
    const result = [...without];
    result.splice(toIdx, 0, ...groupMembers);
    syncGroupMainVariants(result);
  }, [orderedOps, syncGroupMainVariants]);

  // ── Duplicate — OBJETIVO 4 ────────────────────────────────────────────────

  // OBJETIVO 4/7: duplicate — no "Variante X" names, original stays first
  const handleDuplicate = useCallback((op: REOperation) => {
    const now = new Date().toISOString();
    toast.success("Operación duplicada", { description: op.name });

    if (op.variantGroupId) {
      // Already in a group → copy enters same group right after op
      const copy: REOperation = {
        ...JSON.parse(JSON.stringify(op)),
        id: generateId(),
        name: `${op.name} (copia)`,
        isMainVariant: false,
        order: (op.order ?? 0) + 500,
        createdAt: now,
        updatedAt: now,
      };
      setRealEstateOperation(copy);
      setExpandedGroups((prev) => { const next = new Set(prev); next.add(op.variantGroupId!); return next; });
    } else {
      // Independent op → create group: original first/principal, copy second
      const groupId = generateId();
      const groupName = op.name;
      // Original keeps its order (stays first)
      setRealEstateOperation({
        ...op,
        variantGroupId: groupId,
        variantGroupName: groupName,
        isMainVariant: true,
        updatedAt: now,
      });
      const copy: REOperation = {
        ...JSON.parse(JSON.stringify(op)),
        id: generateId(),
        name: `${op.name} (copia)`,
        variantGroupId: groupId,
        variantGroupName: groupName,
        isMainVariant: false,
        order: (op.order ?? 0) + 500, // placed after original
        createdAt: now,
        updatedAt: now,
      };
      setRealEstateOperation(copy);
      setExpandedGroups((prev) => { const next = new Set(prev); next.add(groupId); return next; });
    }
  }, [setRealEstateOperation]);

  // ── Other ops ────────────────────────────────────────────────────────────

  const selectedOp = useMemo(
    () => (selectedId ? realEstateOperations.find((op) => op.id === selectedId) ?? null : null),
    [selectedId, realEstateOperations]
  );

  const compareOps = useMemo(
    () => orderedOps.filter((op) => selectedIds.has(op.id)),
    [orderedOps, selectedIds]
  );

  // "+ Nueva" ahora abre un selector de tipo rápido. Elegir tipo = crear + abrir el
  // editor al instante (sin wizard multipaso). El wizard se conserva solo para
  // reanudar borradores antiguos (op.isDraft).
  const handleNew = useCallback(() => setTypePickerOpen(true), []);

  const handleQuickCreate = useCallback(
    (cat: RealEstateCategory) => {
      // Reutiliza el motor de conversión de tipo (misma semántica financiera).
      const op: REOperation = {
        ...convertRealEstateOperationType(createDefaultOperation(), cat),
        _cat: cat,
        updatedAt: new Date().toISOString(),
      };
      setRealEstateOperation(op);
      setTypePickerOpen(false);
      setSelectedId(op.id); // abre el editor inmediatamente
    },
    [setRealEstateOperation]
  );

  const handleWizardDone = useCallback((op: REOperation) => {
    setRealEstateOperation(op);
    setWizardOp(null);
    if (!op.isDraft) setSelectedId(op.id);
  }, [setRealEstateOperation]);

  const handleSave = useCallback((op: REOperation) => {
    setRealEstateOperation(op);
  }, [setRealEstateOperation]);

  const handleDelete = useCallback((id: string) => {
    const name = realEstateOperations.find((o) => o.id === id)?.name;
    deleteRealEstateOperation(id);
    setSelectedId(null);
    toast.success("Operación eliminada", name ? { description: name } : undefined);
  }, [deleteRealEstateOperation, realEstateOperations]);

  const toggleCompareMode = useCallback(() => {
    setCompareMode((v) => !v);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Pointer handlers (shared for cards + variant rows) ───────────────────

  const buildPointerHandlers = useCallback((opId: string, kind: "group-card" | "variant-row" | "op") => ({
    onPointerDown: compareMode ? undefined : (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setReDrag({ id: opId, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId, isDragActive: false, kind });
      setReDragOverId(null);
      setDropAction("after");
      suppressClickRef.current = false;
    },
    onPointerMove: compareMode ? undefined : (e: React.PointerEvent) => {
      if (!reDrag || reDrag.id !== opId) return;
      const dx = e.clientX - reDrag.startX;
      const dy = e.clientY - reDrag.startY;
      if (Math.sqrt(dx * dx + dy * dy) > RE_DRAG_THRESHOLD && !reDrag.isDragActive) {
        setReDrag({ ...reDrag, isDragActive: true });
        suppressClickRef.current = true;
        const el = cardRefs.current.get(opId);
        if (el) {
          const r = el.getBoundingClientRect();
          setReDragGhost({ label: activeOps.find(o => o.id === opId)?.name ?? "", w: r.width, h: r.height, offsetX: e.clientX - r.left, offsetY: e.clientY - r.top });
        }
      }
      if (reDrag.isDragActive) {
        setReDragPos({ x: e.clientX, y: e.clientY });
        let foundId: string | null = null;
        let action: "before" | "after" | "on" = "after";
        cardRefs.current.forEach((el, id) => {
          if (id === reDrag.id) return;
          const rect = el.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            foundId = id;
            const relY = (e.clientY - rect.top) / rect.height;
            if (relY < 0.25) action = "before";
            else if (relY > 0.75) action = "after";
            else action = "on";
          }
        });
        setReDragOverId(foundId);
        setDropAction(action);
      }
    },
    onPointerUp: compareMode ? undefined : (e: React.PointerEvent) => {
      if (!reDrag || reDrag.id !== opId) return;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      if (reDrag.isDragActive) {
        const draggedOp = orderedOps.find((o) => o.id === reDrag.id);
        if (draggedOp && reDragOverId && reDragOverId !== reDrag.id) {
          const targetOp = orderedOps.find((o) => o.id === reDragOverId);
          if (targetOp) {
            if (reDrag.kind === "group-card") {
              // Group-card represents the whole group → reorder group as a unit, never extract
              handleGroupReorder(draggedOp, targetOp, dropAction);
            } else {
              const sameGroup = draggedOp.variantGroupId && draggedOp.variantGroupId === targetOp.variantGroupId;
              if (dropAction === "on" && !sameGroup) {
                // Drop on center of a different op/group → merge into group
                handleDropOn(draggedOp, targetOp);
              } else {
                // before/after → reorder; "on" same-group = "before" (dragged becomes first/main)
                const effectiveAction = (dropAction === "on" && sameGroup) ? "before" : dropAction;
                const crossGroup = draggedOp.variantGroupId && !sameGroup;

                const fromIdx = orderedOps.findIndex((o) => o.id === reDrag.id);
                let toIdx = orderedOps.findIndex((o) => o.id === reDragOverId);
                if (fromIdx !== -1 && toIdx !== -1) {
                  if (effectiveAction === "after") toIdx += 1;
                  if (fromIdx < toIdx) toIdx -= 1;
                  const next = [...orderedOps];
                  const [removed] = next.splice(fromIdx, 1);

                  if (crossGroup) {
                    // Variant dragged near a different group/op → extract from group, then reorder
                    const extracted = { ...stripVariantFields(draggedOp), updatedAt: new Date().toISOString() } as REOperation;
                    next.splice(toIdx, 0, extracted);
                    const now = new Date().toISOString();
                    next.forEach((op, idx) => {
                      const newOrder = (idx + 1) * 1000;
                      const isExtracted = op.id === extracted.id;
                      const finalOp = isExtracted ? extracted : op;
                      if (isExtracted || finalOp.order !== newOrder) {
                        setRealEstateOperation({ ...finalOp, order: newOrder, updatedAt: now });
                      }
                    });
                    // Handle remaining group members after extraction
                    const remaining = activeOps.filter((o) => o.variantGroupId === draggedOp.variantGroupId && o.id !== draggedOp.id);
                    if (remaining.length === 1) {
                      setRealEstateOperation({ ...stripVariantFields(remaining[0]), updatedAt: now } as REOperation);
                    } else if (remaining.length > 1 && draggedOp.isMainVariant) {
                      setRealEstateOperation({ ...remaining[0], isMainVariant: true, updatedAt: now });
                    }
                  } else {
                    next.splice(toIdx, 0, removed);
                    handleReorder(next);
                  }
                }
              }
            }
          }
        } else if (!reDragOverId && draggedOp?.variantGroupId && reDrag.kind === "variant-row") {
          // Only variant-rows can be extracted by dropping in empty space; group-cards cannot
          handleGroupDissolution(draggedOp);
        }
      }
      setReDrag(null);
      setReDragOverId(null);
      setReDragPos(null);
      setReDragGhost(null);
      setDropAction("after");
      setTimeout(() => { suppressClickRef.current = false; }, 0);
    },
    onPointerCancel: compareMode ? undefined : () => {
      setReDrag(null);
      setReDragOverId(null);
      setReDragPos(null);
      setReDragGhost(null);
      setDropAction("after");
      suppressClickRef.current = false;
    },
  }), [compareMode, reDrag, reDragOverId, dropAction, orderedOps, activeOps, handleDropOn, handleGroupDissolution, handleGroupReorder, handleReorder, setRealEstateOperation]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <section>
        {activeOps.length > 0 && <PortfolioHeader ops={deals} />}

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-2 group"
            >
              <span className="text-xs text-slate-400 group-hover:text-slate-600 transition-colors">
                {expanded ? "▼" : "▶"}
              </span>
              <h2 className="text-base font-extrabold text-ink tracking-tight">Operaciones</h2>
            </button>

            {activeOps.length >= 2 && (
              <button
                type="button"
                onClick={toggleCompareMode}
                title="Comparar inversiones"
                className={`p-1.5 rounded-lg transition-colors ${
                  compareMode
                    ? "text-blue-600 bg-blue-100 hover:bg-blue-200"
                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 21V7"/><path d="M3 7h2c2 0 4-1 6-2 2 1 4 2 6 2h2"/>
                </svg>
              </button>
            )}
          </div>

          {!compareMode && (
            <button type="button" onClick={handleNew} className="btn-primary !py-1.5">
              + Nueva
            </button>
          )}
        </div>

        {compareMode && (
          <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl">
            <span className="text-sm text-blue-700 font-medium flex-1">
              {selectedIds.size === 0
                ? "Selecciona al menos 2 inversiones"
                : `${selectedIds.size} seleccionada${selectedIds.size !== 1 ? "s" : ""}`}
            </span>
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
              >
                Limpiar
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCompareModal(true)}
              disabled={selectedIds.size < 2}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                selectedIds.size >= 2
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              Comparar
            </button>
            <button
              type="button"
              onClick={() => { setCompareMode(false); setSelectedIds(new Set()); }}
              className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}

        {expanded && (
          <>
            {activeOps.length > 0 && !compareMode && (
              <div className="flex flex-col gap-2 mb-3">
                {viewMode !== "kanban" ? (
                  <PipelineFilters counts={stageCounts} active={stageFilter} onChange={setStageFilter} />
                ) : null}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 max-w-xs">
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por nombre o dirección…"
                      className="w-full rounded-lg border border-line pl-3 pr-8 py-1.5 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm"
                        title="Limpiar búsqueda"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="ml-auto">
                    <ViewModeToggle mode={viewMode} onChange={changeViewMode} />
                  </div>
                </div>
              </div>
            )}

            {activeOps.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l5-5 4 4 8-8M21 8v5h-5" />
                  </svg>
                </span>
                <p className="text-xl font-extrabold text-ink tracking-tight mb-1">Analiza tu primera operación</p>
                <p className="text-sm text-ink-muted max-w-md mx-auto leading-relaxed mb-6">
                  Introduce compra, costes y financiación y obtén la rentabilidad de venta y alquiler al instante. Compara escenarios antes de invertir.
                </p>
                <button type="button" onClick={handleNew} className="btn-primary">
                  + Nueva operación
                </button>
              </div>
            ) : viewMode === "kanban" ? (
              kanbanDeals.length === 0 ? (
                <div className="empty-state">
                  <p className="text-lg font-extrabold text-ink tracking-tight mb-1">Sin resultados</p>
                  <p className="text-sm text-ink-muted max-w-md mx-auto mb-5">
                    {search.trim() ? `Ninguna operación coincide con “${search.trim()}”.` : "No hay operaciones."}
                  </p>
                  {search.trim() ? (
                    <button type="button" onClick={() => setSearch("")} className="btn-secondary">Limpiar búsqueda</button>
                  ) : null}
                </div>
              ) : (
                <div key="view-kanban" className="reveal-fast">
                  <KanbanBoard
                    deals={kanbanDeals}
                    now={now}
                    onChangeStage={handleChangeStage}
                    onOpen={(op) => { if (op.isDraft) setWizardOp(op); else setSelectedId(op.id); }}
                  />
                </div>
              )
            ) : !hasMatches ? (
              <div className="empty-state">
                <span className="empty-state-icon">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
                  </svg>
                </span>
                <p className="text-lg font-extrabold text-ink tracking-tight mb-1">Sin resultados</p>
                <p className="text-sm text-ink-muted max-w-md mx-auto leading-relaxed mb-5">
                  {search.trim()
                    ? `Ninguna operación coincide con “${search.trim()}”.`
                    : "Ninguna operación en esta etapa del pipeline."}
                </p>
                <button type="button" onClick={() => { setStageFilter("all"); setSearch(""); }} className="btn-secondary">
                  Limpiar filtros
                </button>
              </div>
            ) : viewMode === "table" ? (
              <div key="view-table" className="reveal-fast">
                <OperationsTable
                  rows={tableRows}
                  onOpen={(op) => { if (op.isDraft) setWizardOp(op); else setSelectedId(op.id); }}
                  onChangeStage={handleChangeStage}
                  expandedGroups={expandedGroups}
                  onToggleGroup={toggleGroup}
                />
              </div>
            ) : (
              <div key="view-cards" className="reveal-fast grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
                {displayedItems.map((item) => {

                  // ── Group expanded variants — compact rows ──────────────────
                  if (item.kind === "group-expanded") {
                    return (
                      <div key={`expanded-${item.groupId}`} className="sm:col-span-2 lg:col-span-3">
                        <div className="ml-4 flex flex-col gap-1.5">
                          {item.variants.map((variant) => {
                            const isDragging = reDrag?.id === variant.id && reDrag.isDragActive;
                            const isDropTarget = reDragOverId === variant.id;
                            const ph = buildPointerHandlers(variant.id, "variant-row");
                            return (
                              <div
                                key={variant.id}
                                ref={(el) => { if (el) cardRefs.current.set(variant.id, el); else cardRefs.current.delete(variant.id); }}
                                className={`relative select-none touch-none ${!compareMode ? "cursor-grab active:cursor-grabbing" : ""} ${isDragging ? "opacity-30" : ""} ${
                                  isDropTarget
                                    ? dropAction === "on"
                                      ? "ring-2 ring-blue-400 rounded-lg"
                                      : dropAction === "before"
                                      ? "border-t-2 border-t-blue-400 rounded-lg"
                                      : "border-b-2 border-b-blue-400 rounded-lg"
                                    : ""
                                }`}
                                onPointerDown={ph.onPointerDown}
                                onPointerMove={ph.onPointerMove}
                                onPointerUp={ph.onPointerUp}
                                onPointerCancel={ph.onPointerCancel}
                              >
                                <REVariantRow
                                  op={variant}
                                  compareMode={compareMode}
                                  selected={selectedIds.has(variant.id)}
                                  onToggleSelect={() => toggleSelect(variant.id)}
                                  onOpen={() => {
                                    if (suppressClickRef.current) return;
                                    if (variant.isDraft) setWizardOp(variant);
                                    else setSelectedId(variant.id);
                                  }}
                                  onDuplicate={() => handleDuplicate(variant)}
                                  onDelete={() => handleDelete(variant.id)}
                                  onExtract={() => handleGroupDissolution(variant)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  // ── Regular op or group card (both are full RECards) ──────
                  const op = item.kind === "op" ? item.op : item.mainOp;
                  const isGroupCard = item.kind === "group-card";
                  const groupId = isGroupCard ? item.groupId : undefined;
                  const isGroupExpanded = groupId ? expandedGroups.has(groupId) : false;
                  const isDragging = reDrag?.id === op.id && reDrag.isDragActive;
                  const isDropTarget = reDragOverId === op.id;

                  const ph = buildPointerHandlers(op.id, isGroupCard ? "group-card" : "op");

                  return (
                    <div
                      key={item.kind === "group-card" ? `group-${item.groupId}` : op.id}
                      ref={(el) => { if (el) cardRefs.current.set(op.id, el); else cardRefs.current.delete(op.id); }}
                      className={`relative select-none touch-none ${!compareMode ? "cursor-grab active:cursor-grabbing" : ""} ${isDragging ? "opacity-30" : ""} ${
                        isDropTarget
                          ? dropAction === "on"
                            ? "ring-2 ring-blue-400 rounded-xl"
                            : dropAction === "before"
                            ? "border-t-2 border-t-blue-400 rounded-xl"
                            : "border-b-2 border-b-blue-400 rounded-xl"
                          : ""
                      }`}
                      onPointerDown={ph.onPointerDown}
                      onPointerMove={ph.onPointerMove}
                      onPointerUp={ph.onPointerUp}
                      onPointerCancel={ph.onPointerCancel}
                    >
                      <RECard
                        op={op}
                        compareMode={compareMode}
                        selected={selectedIds.has(op.id)}
                        onToggleSelect={() => toggleSelect(op.id)}
                        onOpen={() => {
                          if (suppressClickRef.current) return;
                          if (op.isDraft) setWizardOp(op);
                          else setSelectedId(op.id);
                        }}
                        onDuplicate={() => handleDuplicate(op)}
                        onDelete={() => handleDelete(op.id)}
                        isGroupCard={isGroupCard}
                        isExpanded={isGroupExpanded}
                        onToggleExpand={groupId ? () => toggleGroup(groupId) : undefined}
                        onChangeStage={(s) => handleChangeStage(op, s)}
                        now={now}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {/* Drag ghost */}
      {reDrag?.isDragActive && reDragPos && reDragGhost && (
        <div
          className="fixed pointer-events-none z-[9999] px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-xl text-sm font-semibold text-slate-800"
          style={{
            left: reDragPos.x - reDragGhost.offsetX,
            top: reDragPos.y - reDragGhost.offsetY,
            width: reDragGhost.w,
            transform: "scale(1.02)",
            opacity: 0.95,
          }}
        >
          {reDragGhost.label}
        </div>
      )}

      {typePickerOpen && (
        <TypePickerModal
          onPick={handleQuickCreate}
          onClose={() => setTypePickerOpen(false)}
        />
      )}

      {wizardOp && (
        <RealEstateWizard
          baseOp={wizardOp}
          onDone={handleWizardDone}
          onCancel={() => {
            if (!wizardOp.isDraft) deleteRealEstateOperation(wizardOp.id);
            setWizardOp(null);
          }}
        />
      )}

      {selectedOp && !wizardOp && (
        <RealEstateModal
          op={selectedOp}
          onSave={handleSave}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onClose={() => setSelectedId(null)}
        />
      )}

      {showCompareModal && compareOps.length >= 2 && (
        <CompareModal
          ops={compareOps}
          onClose={() => setShowCompareModal(false)}
          onOpenOp={(op) => { setShowCompareModal(false); setSelectedId(op.id); }}
        />
      )}
    </>
  );
}

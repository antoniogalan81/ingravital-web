// src/lib/realEstateTrackingCalc.ts (WEB)
// Cálculos puros de la capa de SEGUIMIENTO (gastos reales, ventas, progreso,
// tiempos y rentabilidad promotor/inversor). Sin dependencias de React ni store.
// Portado desde APP/src/utils/realEstateTracking.ts (misma lógica, mismos shapes).
//
// PRINCIPIO: si un dato no puede calcularse por falta de información, se devuelve
// `null` (no calculable) — NUNCA un 0 inventado. La UI muestra "—" / "Pendiente".

import type { REOperation, REResults } from "./realEstate";
import {
  RE_SALE_CLOSED_STATUSES,
  RE_SALE_COMMITTED_STATUSES,
  type REExpenseCategory,
  type RESaleStatus,
} from "./realEstateTracking";
import { calcResults } from "./realEstateCalc";
import { projectExpenseSummary, saleCollected } from "./projectEconomics";
import { activeItems } from "./realFinances";

const n0 = (v: number | undefined | null): number =>
  Number.isFinite(v as number) ? (v as number) : 0;

const isNum = (v: number | undefined | null): v is number =>
  typeof v === "number" && Number.isFinite(v);

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

// ── Gastos ────────────────────────────────────────────────────────────────────

export type ExpenseAggregate = {
  category: REExpenseCategory;
  label: string;
  estimated: number;
  real: number;
  paid: number;
  pending: number; // base (real||estimado) - paid, mínimo 0
  diff: number; // real - estimated
  count: number;
};

export type ExpenseTotals = {
  hasData: boolean;
  count: number;
  estimated: number;
  real: number;
  paid: number;
  pending: number;
  diff: number; // real - estimated
  paidPct: number | null; // paid / base (real||estimated); null si no hay base
};

// Una sola fuente: `projectExpenseSummary` (previsión = costes del simulador + conceptos del
// promotor; real = Finanzas reales). "Pagado" es el gasto real registrado y "pendiente" lo
// que queda por gastar según la previsión.
export function expensesByCategory(op: REOperation): ExpenseAggregate[] {
  return projectExpenseSummary(op, calcResults(op)).categories.map((c) => ({
    category: c.key,
    label: c.label,
    estimated: n0(c.planned),
    real: n0(c.real),
    paid: n0(c.real),
    pending: n0(c.remaining),
    diff: n0(c.deviation),
    count: c.concepts.length,
  }));
}

export function expenseTotals(op: REOperation): ExpenseTotals {
  const s = projectExpenseSummary(op, calcResults(op));
  const planned = n0(s.planned);
  const real = n0(s.real);
  return {
    hasData: planned > 0 || s.realCount > 0,
    count: s.categories.reduce((sum, c) => sum + c.concepts.length, 0),
    estimated: planned,
    real,
    paid: real,
    pending: n0(s.remaining),
    diff: n0(s.deviation),
    paidPct: planned > 0 ? clamp01(real / planned) : null,
  };
}

// ── Ventas ────────────────────────────────────────────────────────────────────

export type SalesStats = {
  hasData: boolean;
  count: number;
  byStatus: Record<RESaleStatus, number>;
  soldCount: number; // VENDIDO
  committedCount: number; // reservado..vendido
  totalEstimated: number;
  totalReal: number; // precio real de las cerradas (o estimado si falta)
  collected: number; // ingreso cobrado
  pendingIncome: number; // (real cerradas) - cobrado, mínimo 0
  soldPct: number | null; // soldCount / count
};

/** Ingreso de referencia de una venta cerrada: el precio efectivo de la unidad (uno solo). */
const saleClosedValue = (effectivePrice: number | null | undefined): number => n0(effectivePrice);

export function salesStats(op: REOperation): SalesStats {
  const sales = activeItems(op?.sales);
  // Precio efectivo (propio o base de su unidad del Proyecto): la misma regla que calcResults.
  const effective = sales.length ? calcResults(op).effectiveSales : {};
  const byStatus: Record<RESaleStatus, number> = {
    DISPONIBLE: 0,
    RESERVADO: 0,
    SENALADO: 0,
    APALABRADO: 0,
    VENDIDO: 0,
  };
  for (const s of sales) {
    if (s.status in byStatus) byStatus[s.status] += 1;
  }
  const soldCount = sales.filter((s) => RE_SALE_CLOSED_STATUSES.includes(s.status)).length;
  const committedCount = sales.filter((s) =>
    RE_SALE_COMMITTED_STATUSES.includes(s.status),
  ).length;
  const totalEstimated = sales.reduce((s, r) => s + n0(effective[r.id]?.price), 0);
  const closed = sales.filter((s) => RE_SALE_CLOSED_STATUSES.includes(s.status));
  const totalReal = closed.reduce((s, r) => s + saleClosedValue(effective[r.id]?.price), 0);
  const collected = sales.reduce((s, r) => s + saleCollected(r), 0);
  const pendingIncome = Math.max(0, totalReal - collected);
  return {
    hasData: sales.length > 0,
    count: sales.length,
    byStatus,
    soldCount,
    committedCount,
    totalEstimated,
    totalReal,
    collected,
    pendingIncome,
    soldPct: sales.length > 0 ? clamp01(soldCount / sales.length) : null,
  };
}

// ── Progreso / tiempos ──────────────────────────────────────────────────────────

export type ProgressMetrics = {
  obraPct: number | null; // 0-1
  licenciasPct: number | null; // 0-1
  gastosPagadosPct: number | null; // pagado / base
  ventasCerradasPct: number | null; // vendidas / total unidades de venta
  ingresosCobradosPct: number | null; // cobrado / venta prevista total
  tiempoTranscurridoPct: number | null; // por fechas
  daysElapsed: number | null;
  daysTotal: number | null;
  daysRemaining: number | null;
};

/** Días entre dos ISO dates; null si alguna falta o es inválida. */
function daysBetween(fromISO?: string, toISO?: string): number | null {
  if (!fromISO || !toISO) return null;
  const a = Date.parse(fromISO);
  const b = Date.parse(toISO);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export function progressMetrics(
  op: REOperation,
  results: REResults,
  nowISO: string,
): ProgressMetrics {
  const progress = op?.progress ?? {};
  const exp = expenseTotals(op);
  const sales = salesStats(op);

  const obraPct = isNum(progress.obraPct) ? clamp01(n0(progress.obraPct) / 100) : null;
  const licenciasPct = isNum(progress.licenciasPct)
    ? clamp01(n0(progress.licenciasPct) / 100)
    : null;

  // Ingresos cobrados frente a venta prevista total del cálculo base.
  const ingresosCobradosPct =
    results.totalSales > 0 ? clamp01(sales.collected / results.totalSales) : null;

  const daysTotal = daysBetween(progress.startDate, progress.endDateEstimated);
  const daysElapsed =
    progress.startDate != null ? daysBetween(progress.startDate, nowISO) : null;
  const tiempoTranscurridoPct =
    daysTotal != null && daysTotal > 0 && daysElapsed != null
      ? clamp01(daysElapsed / daysTotal)
      : null;
  const daysRemaining =
    daysTotal != null && daysElapsed != null ? Math.max(0, daysTotal - daysElapsed) : null;

  return {
    obraPct,
    licenciasPct,
    gastosPagadosPct: exp.paidPct,
    ventasCerradasPct: sales.soldPct,
    ingresosCobradosPct,
    tiempoTranscurridoPct,
    daysElapsed,
    daysTotal,
    daysRemaining,
  };
}

// ── Rentabilidad promotor / inversor / total ────────────────────────────────────

export type ProfitabilityBreakdown = {
  // Estimada (del motor base calcResults) — siempre disponible.
  estimatedBenefit: number;
  estimatedYield: number; // ratio sobre capital propio/inversión
  // Real (según gastos reales y ventas) — null si no hay datos reales todavía.
  realIncome: number | null;
  realCost: number | null;
  realBenefit: number | null;
  realYield: number | null;
  deviation: number | null; // realBenefit - estimatedBenefit
  // Reparto promotor / inversor — null si no se ha configurado el split.
  investorSharePct: number | null; // 0-1
  promoterSharePct: number | null; // 0-1
  estimatedInvestorBenefit: number | null;
  estimatedPromoterBenefit: number | null;
  realInvestorBenefit: number | null;
  realPromoterBenefit: number | null;
  investorYield: number | null; // beneficio inversor / capital inversor
};

export function profitability(op: REOperation, results: REResults): ProfitabilityBreakdown {
  const estimatedBenefit = results.saleBenefit;
  const estimatedYield = results.saleYield;

  const exp = expenseTotals(op);
  const sales = salesStats(op);

  // Real: solo tiene sentido si hay algún gasto real registrado o alguna venta.
  const hasRealData = exp.real > 0 || sales.collected > 0 || sales.totalReal > 0;
  const realIncome = hasRealData ? (sales.collected > 0 ? sales.collected : sales.totalReal) : null;
  const realCost = exp.real > 0 ? exp.real : hasRealData ? exp.paid : null;
  const realBenefit =
    realIncome != null && realCost != null ? realIncome - realCost : null;

  const investBase = results.myInvestment > 0 ? results.myInvestment : results.totalInvestment;
  const realYield =
    realBenefit != null && investBase > 0 ? realBenefit / investBase : null;
  const deviation = realBenefit != null ? realBenefit - estimatedBenefit : null;

  const split = op?.investorSplit;
  const investorSharePct = isNum(split?.investorSharePct)
    ? clamp01(n0(split?.investorSharePct) / 100)
    : null;
  const promoterSharePct = investorSharePct != null ? 1 - investorSharePct : null;

  const estimatedInvestorBenefit =
    investorSharePct != null ? estimatedBenefit * investorSharePct : null;
  const estimatedPromoterBenefit =
    promoterSharePct != null ? estimatedBenefit * promoterSharePct : null;
  const realInvestorBenefit =
    realBenefit != null && investorSharePct != null ? realBenefit * investorSharePct : null;
  const realPromoterBenefit =
    realBenefit != null && promoterSharePct != null ? realBenefit * promoterSharePct : null;

  const investorCapital = split?.investorCapital;
  const investorBenefitForYield =
    realInvestorBenefit != null ? realInvestorBenefit : estimatedInvestorBenefit;
  const investorYield =
    isNum(investorCapital) && n0(investorCapital) > 0 && investorBenefitForYield != null
      ? investorBenefitForYield / n0(investorCapital)
      : null;

  return {
    estimatedBenefit,
    estimatedYield,
    realIncome,
    realCost,
    realBenefit,
    realYield,
    deviation,
    investorSharePct,
    promoterSharePct,
    estimatedInvestorBenefit,
    estimatedPromoterBenefit,
    realInvestorBenefit,
    realPromoterBenefit,
    investorYield,
  };
}

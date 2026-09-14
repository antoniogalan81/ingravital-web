// src/lib/projectEconomics.ts — ÚNICA capa de cálculo de GASTOS y VENTAS de una operación.
// IDÉNTICO a APP/src/utils/projectEconomics.ts (salvo imports). Sin React, sin red.
//
// Gestión del proyecto, el área Inversores, el informe y las métricas publicadas a
// inversores consumen ESTOS resúmenes; ningún componente vuelve a sumar por su cuenta.
//
// PREVISIÓN de gastos = conceptos del simulador (compra, impuestos, obra, arquitecto,
//   desviaciones, tasas, mobiliario; derivados de `costs`) + conceptos del promotor
//   (`expenses`: €/mes × meses + fijo). Su suma es `calcResults().totalInvestment`.
// REAL de gastos = `realExpenses` activos (a mano o desde documentos de Drive), por su
//   categoría; si están vinculados a un concepto (`budgetLineId`), también en ese concepto.
// PREVISIÓN de ventas = unidades del simulador (`units`: cantidad y precio por tipo),
//   afinada por las fichas de venta (`sales`) con precio y fechas previstas propias.
// REAL de ventas = fichas vendidas (precio real, fecha real) y sus cobros (`payments`).

import type { REOperation, REResults, UnitType } from "./realEstate";
import type { REExpense, REExpenseCategory, RERealExpense, RESale, RESalePayment, RESaleStatus } from "./realEstateTracking";
import { RE_EXPENSE_CATEGORIES, RE_EXPENSE_CATEGORY_LABEL, RE_SALE_STATUS_LABEL } from "./realEstateTracking";
import { activeItems, effectiveRealExpenses } from "./realFinances";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const n0 = (v: unknown): number => (isNum(v) ? v : 0);
const round2 = (v: number): number => Math.round(v * 100) / 100;

// ── Conceptos de gasto previstos ───────────────────────────────────────────────

/** Meses por defecto de un concepto recurrente NUEVO. Los conceptos antiguos no se tocan. */
export const DEFAULT_COST_MONTHS = 18;

type ConceptAmounts = Pick<REExpense, "estimated" | "monthlyAmount" | "months" | "fixedAmount">;

/** ¿El concepto usa el modelo €/mes × meses + fijo (y no un importe estimado suelto)? */
export const isStructuredConcept = (e: ConceptAmounts | null | undefined): boolean =>
  !!e && (isNum(e.monthlyAmount) || isNum(e.fixedAmount));

/** Total previsto de un concepto: (€/mes × meses) + fijo; si no los tiene, su estimado legado. */
export function conceptPlannedAmount(e: ConceptAmounts | null | undefined): number {
  if (!e) return 0;
  if (isStructuredConcept(e)) return round2(n0(e.monthlyAmount) * n0(e.months) + n0(e.fixedAmount));
  return n0(e.estimated);
}

/** Suma de los conceptos previstos del promotor. */
export function plannedConceptsTotal(expenses: REExpense[] | null | undefined): number {
  return round2(activeItems(expenses).reduce((s, e) => s + conceptPlannedAmount(e), 0));
}

/** Concepto listo para guardar: `estimated` refleja su total (lo leen clientes antiguos). */
export function withPlannedTotal<T extends REExpense>(e: T): T {
  return isStructuredConcept(e) ? { ...e, estimated: conceptPlannedAmount(e) } : e;
}

// ── Resumen de gastos por categoría ────────────────────────────────────────────

export type PlannedConceptView = {
  id: string;
  /** `simulador`: derivado de los costes de la ficha · `concepto`: añadido por el promotor. */
  source: "simulador" | "concepto";
  concept: string;
  planned: number | null;
  monthlyAmount?: number | null;
  months?: number | null;
  fixedAmount?: number | null;
  /** Gasto real vinculado a este concepto (`budgetLineId`); null si no hay. */
  real: number | null;
};

export type RealExpenseView = {
  id: string;
  concept: string;
  amount: number | null;
  date: string;
  documentName?: string;
  documentUrl?: string;
  conceptId?: string;
};

export type ExpenseCategoryView = {
  key: REExpenseCategory;
  label: string;
  planned: number | null;
  real: number | null;
  /** real − previsto (positivo = por encima de lo previsto). */
  deviation: number | null;
  /** Lo que queda por gastar según la previsión: max(0, previsto − real). */
  remaining: number | null;
  concepts: PlannedConceptView[];
  realItems: RealExpenseView[];
};

export type ExpenseSummaryView = {
  categories: ExpenseCategoryView[];
  planned: number | null;
  real: number | null;
  deviation: number | null;
  remaining: number | null;
  realCount: number;
};

/** Conceptos derivados de los costes del simulador (solo los que tienen importe). */
export function simulatorConcepts(op: REOperation, res: REResults): { id: string; category: REExpenseCategory; concept: string; planned: number }[] {
  const costs = (op?.costs ?? {}) as REOperation["costs"];
  const rows: { id: string; category: REExpenseCategory; concept: string; planned: number }[] = [
    { id: "sim_compra", category: "COMPRA", concept: "Compra del inmueble", planned: n0(op?.purchasePrice) },
    { id: "sim_impuesto_compra", category: "IMPUESTOS", concept: "Impuesto de compra", planned: res.purchaseTaxAmt },
    { id: "sim_cimentacion", category: "OBRA", concept: "Cimentación", planned: res.cimentacionAmt },
    { id: "sim_escaleras", category: "OBRA", concept: "Escaleras", planned: res.escalerasAmt },
    { id: "sim_accesos", category: "OBRA", concept: "Accesos", planned: res.accesosAmt },
    { id: "sim_obra_vivienda", category: "OBRA", concept: "Obra viviendas", planned: res.obraViviendaAmt },
    { id: "sim_obra_garaje", category: "OBRA", concept: "Obra garajes", planned: res.obraGarajeAmt },
    { id: "sim_obra_trasteros", category: "OBRA", concept: "Obra trasteros", planned: res.obraTrasterosAmt },
    { id: "sim_desviaciones", category: "OBRA", concept: "Desviaciones de obra", planned: res.desviacionesAmt },
    { id: "sim_arquitecto", category: "ARQUITECTO", concept: "Honorarios de arquitecto", planned: res.arquitectoAmt },
    { id: "sim_mobiliario", category: "MOBILIARIO", concept: "Mobiliario", planned: res.furnitureCostTotal },
  ];
  const tasas = Array.isArray(costs.tasas) ? costs.tasas : [];
  if (costs.tasasTotal != null || !tasas.length) {
    rows.push({ id: "sim_tasas", category: "LICENCIAS", concept: "Tasas y licencias", planned: res.tasasAmt });
  } else {
    tasas.forEach((t, i) => rows.push({ id: `sim_tasa_${i}`, category: "LICENCIAS", concept: t.label || "Tasa", planned: t.amount ?? (n0(t.pct) / 100) * res.obraBase }));
  }
  return rows.filter((r) => r.planned > 0).map((r) => ({ ...r, planned: round2(r.planned) }));
}

function realCategory(r: RERealExpense, lines: REExpense[]): REExpenseCategory {
  if (r.category) return r.category;
  const line = r.budgetLineId ? lines.find((l) => l.id === r.budgetLineId) : undefined;
  return line?.category ?? "OTROS";
}

/** Previsto vs real por categoría. `planned` total === `res.totalInvestment`. */
export function projectExpenseSummary(op: REOperation, res: REResults): ExpenseSummaryView {
  const lines: REExpense[] = activeItems(op?.expenses);
  const reals = effectiveRealExpenses(op);
  const realByLine = new Map<string, number>();
  for (const r of reals) if (r.budgetLineId) realByLine.set(r.budgetLineId, round2((realByLine.get(r.budgetLineId) ?? 0) + n0(r.amount)));

  const byKey = new Map<REExpenseCategory, ExpenseCategoryView>();
  const category = (key: REExpenseCategory): ExpenseCategoryView => {
    let c = byKey.get(key);
    if (!c) {
      c = { key, label: RE_EXPENSE_CATEGORY_LABEL[key] ?? "Otros", planned: 0, real: 0, deviation: 0, remaining: 0, concepts: [], realItems: [] };
      byKey.set(key, c);
    }
    return c;
  };

  for (const s of simulatorConcepts(op, res)) {
    const c = category(s.category);
    c.concepts.push({ id: s.id, source: "simulador", concept: s.concept, planned: s.planned, real: null });
    c.planned = round2(n0(c.planned) + s.planned);
  }
  for (const line of lines) {
    const planned = conceptPlannedAmount(line);
    // Filas vacías heredadas de la antigua tabla (sin nombre ni importe): siguen en los datos,
    // pero no son un concepto que mostrar.
    if (!line.concept?.trim() && planned === 0 && !realByLine.has(line.id)) continue;
    const key = RE_EXPENSE_CATEGORY_LABEL[line.category] ? line.category : "OTROS";
    const c = category(key);
    c.concepts.push({
      id: line.id,
      source: "concepto",
      concept: line.concept?.trim() || "Concepto sin nombre",
      planned,
      ...(isNum(line.monthlyAmount) ? { monthlyAmount: line.monthlyAmount, months: n0(line.months) } : {}),
      ...(isNum(line.fixedAmount) ? { fixedAmount: line.fixedAmount } : {}),
      real: realByLine.get(line.id) ?? null,
    });
    c.planned = round2(n0(c.planned) + planned);
  }
  for (const r of reals) {
    const c = category(realCategory(r, lines));
    c.realItems.push({
      id: r.id,
      concept: r.concept || "Gasto",
      amount: n0(r.amount),
      date: r.date,
      ...(r.documentName ? { documentName: r.documentName } : {}),
      ...(r.documentUrl ? { documentUrl: r.documentUrl } : {}),
      ...(r.budgetLineId ? { conceptId: r.budgetLineId } : {}),
    });
    c.real = round2(n0(c.real) + n0(r.amount));
  }

  const order = new Map(RE_EXPENSE_CATEGORIES.map((c, i) => [c.key, i]));
  const categories = [...byKey.values()]
    .filter((c) => c.concepts.length > 0 || c.realItems.length > 0)
    .map((c) => {
      c.realItems.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
      return { ...c, deviation: round2(n0(c.real) - n0(c.planned)), remaining: round2(Math.max(0, n0(c.planned) - n0(c.real))) };
    })
    .sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99));

  const planned = round2(categories.reduce((s, c) => s + n0(c.planned), 0));
  const real = round2(categories.reduce((s, c) => s + n0(c.real), 0));
  return { categories, planned, real, deviation: round2(real - planned), remaining: round2(Math.max(0, planned - real)), realCount: reals.length };
}

/** Variante sin importes (visibilidad del inversor): se conservan categorías y conceptos. */
export function withoutExpenseAmounts(v: ExpenseSummaryView): ExpenseSummaryView {
  return {
    categories: v.categories.map((c) => ({
      ...c,
      planned: null,
      real: null,
      deviation: null,
      remaining: null,
      concepts: c.concepts.map((x) => ({ id: x.id, source: x.source, concept: x.concept, planned: null, real: null })),
      realItems: [],
    })),
    planned: null,
    real: null,
    deviation: null,
    remaining: null,
    realCount: 0,
  };
}

// ── Ventas ─────────────────────────────────────────────────────────────────────

export type SaleGroupKey = UnitType | "OTROS";

export const SALE_GROUP_LABEL: Record<SaleGroupKey, string> = {
  VIVIENDA: "Viviendas",
  GARAJE: "Garajes",
  TRASTERO: "Trasteros",
  OTROS: "Otros",
};

const SALE_GROUP_ORDER: SaleGroupKey[] = ["VIVIENDA", "GARAJE", "TRASTERO", "OTROS"];
const RESERVED: RESaleStatus[] = ["RESERVADO", "SENALADO", "APALABRADO"];

/** Cobros activos de una venta (los que tienen fecha e importe). */
export function salePayments(s: Pick<RESale, "payments"> | null | undefined): RESalePayment[] {
  return (Array.isArray(s?.payments) ? s.payments : []).filter((p) => p && isNum(p.amount));
}

/** Cobrado de una venta: suma de sus cobros; si no tiene ninguno, el importe `collected` legado. */
export function saleCollected(s: Pick<RESale, "payments" | "collected"> | null | undefined): number {
  const payments = salePayments(s);
  return payments.length ? round2(payments.reduce((sum, p) => sum + p.amount, 0)) : n0(s?.collected);
}

/** Venta lista para guardar: `collected` refleja sus cobros (lo leen clientes antiguos). */
export function withCollectedTotal<T extends RESale>(s: T): T {
  return salePayments(s).length ? { ...s, collected: saleCollected(s) } : s;
}

/** Grupo de una ficha: su tipo explícito, el de la unidad vinculada o el que diga el título. */
export function saleGroupOf(s: Pick<RESale, "unitType" | "unitId" | "title">, units: REOperation["units"] | undefined): SaleGroupKey {
  if (s.unitType && SALE_GROUP_LABEL[s.unitType]) return s.unitType;
  const unit = s.unitId ? (units ?? []).find((u) => u.id === s.unitId) : undefined;
  if (unit?.type) return unit.type;
  const t = (s.title ?? "").toLowerCase();
  if (/vivienda|piso|ático|atico|apartamento|dúplex|duplex|casa|chalet/.test(t)) return "VIVIENDA";
  if (/garaje|plaza|parking|aparcamiento/.test(t)) return "GARAJE";
  if (/trastero/.test(t)) return "TRASTERO";
  return "OTROS";
}

export type SaleStep = { estimated?: string; real?: string };

export type SaleUnitView = {
  id: string;
  title: string;
  group: SaleGroupKey;
  status: RESaleStatus;
  statusLabel: string;
  /** Situación de obra: terminada (fecha real), en obra (fecha prevista) o sin dato. */
  build: "terminada" | "en_obra" | null;
  plannedPrice: number | null;
  realPrice: number | null;
  soldAmount: number | null;
  collected: number | null;
  pending: number | null;
  buyer?: string;
  completion: SaleStep;
  sale: SaleStep;
  collection: { estimated?: string; amountEstimated: number | null; payments: { date: string; amount: number | null }[] };
};

export type UpcomingEvent = { kind: "terminacion" | "venta" | "cobro"; date: string; title: string; amount: number | null };

export type SaleGroupView = {
  key: SaleGroupKey;
  label: string;
  units: number;
  /** Unidades previstas sin ficha de venta todavía (se crean desde Gestión del proyecto). */
  unitsWithoutRecord: number;
  finished: number;
  sold: number;
  reserved: number;
  available: number;
  planned: number | null;
  soldAmount: number | null;
  collected: number | null;
  pending: number | null;
  rows: SaleUnitView[];
};

export type SalesSummaryView = {
  groups: SaleGroupView[];
  units: number;
  finished: number;
  sold: number;
  reserved: number;
  available: number;
  planned: number | null;
  soldAmount: number | null;
  collected: number | null;
  pending: number | null;
  upcoming: UpcomingEvent[];
};

const statusIsSold = (s: RESaleStatus) => s === "VENDIDO";

/**
 * Resumen de ventas por tipo de unidad.
 *  · previsto  = Σ precios previstos (ficha o, si falta, precio unitario del simulador)
 *  · vendido   = Σ precio real de las fichas VENDIDAS (previsto si aún no hay real)
 *  · cobrado   = Σ cobros reales
 *  · pendiente = vendido − cobrado (mínimo 0)
 */
export function projectSalesSummary(op: REOperation, res: REResults, todayISO: string): SalesSummaryView {
  const sales: RESale[] = activeItems(op?.sales);
  const forecast = res.salesByUnitType ?? { VIVIENDA: { count: 0, amount: 0 }, GARAJE: { count: 0, amount: 0 }, TRASTERO: { count: 0, amount: 0 } };
  const upcoming: UpcomingEvent[] = [];
  const today = todayISO.slice(0, 10);

  const groups = SALE_GROUP_ORDER.map<SaleGroupView>((key) => {
    const rowsRaw = sales.filter((s) => saleGroupOf(s, op?.units) === key);
    const f = key === "OTROS" ? { count: 0, amount: 0 } : forecast[key];
    const unitPrice = f.count > 0 ? f.amount / f.count : null;

    const rows = rowsRaw.map<SaleUnitView>((s) => {
      const plannedPrice = isNum(s.estimatedPrice) ? s.estimatedPrice : unitPrice != null ? round2(unitPrice) : null;
      const sold = statusIsSold(s.status);
      const soldAmount = sold ? (isNum(s.realPrice) ? s.realPrice : plannedPrice ?? 0) : null;
      const collected = saleCollected(s);
      const payments = salePayments(s).map((p) => ({ date: p.date, amount: p.amount })).sort((a, b) => a.date.localeCompare(b.date));
      // Cobro previsto: el indicado; si no, lo vendido (precio real) o, antes de vender, el previsto.
      const amountEstimated = isNum(s.collectionAmountEstimated) ? s.collectionAmountEstimated : soldAmount ?? plannedPrice;
      const view: SaleUnitView = {
        id: s.id,
        title: s.title?.trim() || "Unidad sin nombre",
        group: key,
        status: s.status,
        statusLabel: RE_SALE_STATUS_LABEL[s.status] ?? s.status,
        build: s.completionDateReal ? "terminada" : s.completionDateEstimated ? "en_obra" : null,
        plannedPrice,
        realPrice: isNum(s.realPrice) ? s.realPrice : null,
        soldAmount,
        collected,
        pending: soldAmount != null ? round2(Math.max(0, soldAmount - collected)) : null,
        ...(s.buyer ? { buyer: s.buyer } : {}),
        completion: { ...(s.completionDateEstimated ? { estimated: s.completionDateEstimated } : {}), ...(s.completionDateReal ? { real: s.completionDateReal } : {}) },
        sale: { ...(s.saleDateEstimated ? { estimated: s.saleDateEstimated } : {}), ...(sold && s.date ? { real: s.date } : {}) },
        collection: { ...(s.collectionDateEstimated ? { estimated: s.collectionDateEstimated } : {}), amountEstimated, payments },
      };
      if (!view.completion.real && view.completion.estimated && view.completion.estimated >= today) upcoming.push({ kind: "terminacion", date: view.completion.estimated, title: view.title, amount: null });
      if (!sold && view.sale.estimated && view.sale.estimated >= today) upcoming.push({ kind: "venta", date: view.sale.estimated, title: view.title, amount: plannedPrice });
      const fullyCollected = amountEstimated != null && collected >= amountEstimated;
      if (!fullyCollected && view.collection.estimated && view.collection.estimated >= today)
        upcoming.push({ kind: "cobro", date: view.collection.estimated, title: view.title, amount: amountEstimated != null ? round2(Math.max(0, amountEstimated - collected)) : null });
      return view;
    });

    const units = Math.max(f.count, rows.length);
    const sold = rows.filter((r) => statusIsSold(r.status)).length;
    const reserved = rows.filter((r) => RESERVED.includes(r.status)).length;
    const planned = round2(rows.reduce((s, r) => s + n0(r.plannedPrice), 0) + Math.max(0, units - rows.length) * n0(unitPrice));
    const soldAmount = round2(rows.reduce((s, r) => s + n0(r.soldAmount), 0));
    const collected = round2(rows.reduce((s, r) => s + n0(r.collected), 0));
    return {
      key,
      label: SALE_GROUP_LABEL[key],
      units,
      unitsWithoutRecord: Math.max(0, units - rows.length),
      finished: rows.filter((r) => r.build === "terminada").length,
      sold,
      reserved,
      available: Math.max(0, units - sold - reserved),
      planned,
      soldAmount,
      collected,
      pending: round2(Math.max(0, soldAmount - collected)),
      rows,
    };
  }).filter((g) => g.units > 0);

  const sum = (k: "units" | "finished" | "sold" | "reserved" | "available") => groups.reduce((s, g) => s + g[k], 0);
  const sumMoney = (k: "planned" | "soldAmount" | "collected") => round2(groups.reduce((s, g) => s + n0(g[k]), 0));
  const soldAmount = sumMoney("soldAmount");
  const collected = sumMoney("collected");
  return {
    groups,
    units: sum("units"),
    finished: sum("finished"),
    sold: sum("sold"),
    reserved: sum("reserved"),
    available: sum("available"),
    planned: sumMoney("planned"),
    soldAmount,
    collected,
    pending: round2(Math.max(0, soldAmount - collected)),
    upcoming: upcoming.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5),
  };
}

/** Variante para inversores: sin compradores (datos personales) y, si se pide, sin importes. */
export function salesSummaryForInvestors(v: SalesSummaryView, withPrices: boolean): SalesSummaryView {
  const money = (x: number | null) => (withPrices ? x : null);
  return {
    ...v,
    planned: money(v.planned),
    soldAmount: money(v.soldAmount),
    collected: money(v.collected),
    pending: money(v.pending),
    upcoming: v.upcoming.map((e) => ({ ...e, amount: money(e.amount) })),
    groups: v.groups.map((g) => ({
      ...g,
      planned: money(g.planned),
      soldAmount: money(g.soldAmount),
      collected: money(g.collected),
      pending: money(g.pending),
      rows: g.rows.map(({ buyer: _buyer, ...r }) => ({
        ...r,
        plannedPrice: money(r.plannedPrice),
        realPrice: money(r.realPrice),
        soldAmount: money(r.soldAmount),
        collected: money(r.collected),
        pending: money(r.pending),
        collection: { ...r.collection, amountEstimated: money(r.collection.amountEstimated), payments: r.collection.payments.map((p) => ({ date: p.date, amount: money(p.amount) })) },
      })),
    })),
  };
}

/**
 * Fichas que faltan para las unidades previstas de un grupo (sin inventar estados ni fechas):
 * mismas unidades que el simulador, título numerado y precio unitario previsto.
 */
export function missingSaleRecords(op: REOperation, res: REResults, group: UnitType, makeId: () => string, nowISO: string): RESale[] {
  const summary = projectSalesSummary(op, res, nowISO).groups.find((g) => g.key === group);
  if (!summary || summary.unitsWithoutRecord <= 0) return [];
  const f = res.salesByUnitType[group];
  const unitPrice = f.count > 0 ? round2(f.amount / f.count) : undefined;
  const base = SALE_GROUP_LABEL[group].replace(/s$/, "");
  const start = summary.rows.length;
  return Array.from({ length: summary.unitsWithoutRecord }, (_, i) => ({
    id: makeId(),
    title: `${base} ${start + i + 1}`,
    unitType: group,
    status: "DISPONIBLE" as const,
    ...(unitPrice != null ? { estimatedPrice: unitPrice } : {}),
    createdAt: nowISO,
    updatedAt: nowISO,
  }));
}

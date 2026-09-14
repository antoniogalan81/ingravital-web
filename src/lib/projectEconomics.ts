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
// VENTAS y ALQUILER = BASE del Proyecto + valores propios por unidad (Seguimiento operativo).
//   El Proyecto define por tipología (`units`) cuántas unidades hay y su precio y renta base.
//   Cada ficha (`sales`) ES una de esas unidades, no una copia: sin precio o renta propios
//   usa la base; con ellos la sustituye. `calcResults` calcula así el total y la media
//   actuales, y de ahí la rentabilidad, el cashflow y todo lo que depende de los ingresos.
// REAL de ventas = fichas vendidas (precio real, fecha real) y sus cobros (`payments`).

import type { REOperation, REResults, UnitType } from "./realEstate";
import type { REExpense, REExpenseCategory, RERealExpense, RESale, RESalePayment, RESaleStatus } from "./realEstateTracking";
import { RE_EXPENSE_CATEGORIES, RE_EXPENSE_CATEGORY_LABEL, RE_SALE_STATUS_LABEL } from "./realEstateTracking";
import { activeItems, effectiveRealExpenses } from "./realFinances";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const n0 = (v: unknown): number => (isNum(v) ? v : 0);
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Número en formato español con punto de miles SIEMPRE (5.475; 1.666,67) y hasta `decimals` decimales. */
export function formatEs(v: number, decimals = 0): string {
  const fixed = Math.abs(Number.isFinite(v) ? v : 0).toFixed(decimals);
  const [int, dec] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v < 0 && Number(fixed) !== 0 ? "-" : ""}${grouped}${dec && /[^0]/.test(dec) ? `,${dec}` : ""}`;
}

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
  LOCAL: "Locales",
  PARCELA: "Parcelas",
  OTROS: "Otros",
};

/** Nombre en singular de cada tipología ("Vivienda 1", "Local 2"…). */
export const UNIT_SINGULAR: Record<UnitType, string> = { VIVIENDA: "Vivienda", GARAJE: "Garaje", TRASTERO: "Trastero", LOCAL: "Local", PARCELA: "Parcela" };

/** Tipologías de unidad del Proyecto, en orden de presentación. */
export const UNIT_TYPES: UnitType[] = ["VIVIENDA", "GARAJE", "TRASTERO", "LOCAL", "PARCELA"];
const SALE_GROUP_ORDER: SaleGroupKey[] = [...UNIT_TYPES, "OTROS"];

/** Objeto con una entrada por tipología. */
export function byUnitType<T>(fn: (t: UnitType) => T): Record<UnitType, T> {
  return Object.fromEntries(UNIT_TYPES.map((t) => [t, fn(t)])) as Record<UnitType, T>;
}
const RESERVED: RESaleStatus[] = ["RESERVADO", "SENALADO", "APALABRADO"];

/** Cobros activos de una venta (los que tienen fecha e importe). */
export function salePayments(s: Pick<RESale, "payments"> | null | undefined): RESalePayment[] {
  return (Array.isArray(s?.payments) ? s.payments : []).filter((p) => p && isNum(p.amount));
}

/**
 * Cobrado de una venta: la señal (`deposit`) más sus cobros. Sin cobros detallados, un
 * `collected` antiguo se respeta tal cual (ya era el total); si no, cuenta la señal.
 */
export function saleCollected(s: Pick<RESale, "payments" | "collected" | "deposit"> | null | undefined): number {
  const payments = salePayments(s);
  if (payments.length) return round2(n0(s?.deposit) + payments.reduce((sum, p) => sum + p.amount, 0));
  return isNum(s?.collected) ? s.collected : n0(s?.deposit);
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
  if (/local|oficina/.test(t)) return "LOCAL";
  if (/parcela|solar|terreno/.test(t)) return "PARCELA";
  return "OTROS";
}

/** Fichas activas de cada grupo (una tipología del Proyecto u Otros). */
export function activeSalesByGroup(op: Pick<REOperation, "sales" | "units">): Record<SaleGroupKey, RESale[]> {
  const out = { ...byUnitType<RESale[]>(() => []), OTROS: [] as RESale[] };
  for (const s of activeItems(op?.sales)) out[saleGroupOf(s, op?.units)].push(s);
  return out;
}

/** Una línea de Unidades del Proyecto: nº de unidades y precio y renta BASE por unidad. */
export type ProjectUnitLine = { id: string; type: UnitType; count: number; salePrice: number; rent: number };

/**
 * Precio efectivo de una unidad: su precio propio si existe; si no, el precio base de su línea.
 * Hay UN solo precio por unidad (`estimatedPrice`); un `realPrice` antiguo manda si existe y
 * desaparece en cuanto se edita el precio de la unidad.
 */
export function effectivePrice(s: Pick<RESale, "estimatedPrice" | "realPrice">, basePrice: number | null): number | null {
  return isNum(s.realPrice) ? s.realPrice : isNum(s.estimatedPrice) ? s.estimatedPrice : basePrice;
}

/** Renta efectiva de una unidad: su renta propia si existe; si no, la renta base de su línea. */
export function effectiveRent(s: Pick<RESale, "rentMonthly">, baseRent: number | null): number | null {
  return isNum(s.rentMonthly) ? s.rentMonthly : baseRent;
}

export type UnitTotals = { count: number; amount: number };

export type EffectiveUnits = {
  /** Venta y renta mensual ACTUALES por tipología: suma de los valores efectivos de cada unidad. */
  sales: Record<UnitType, UnitTotals>;
  rent: Record<UnitType, UnitTotals>;
  /** Fichas sin tipología del Proyecto (Otros): solo cuentan sus valores propios. */
  otherSales: number;
  otherRent: number;
  /** Precio y renta efectivos de cada ficha activa, con la base de su unidad del Proyecto, por id. */
  bySale: Record<string, EffectiveSale>;
  /** Base de cada unidad del Proyecto que aún no tiene ficha, en orden, por tipología. */
  unrecorded: Record<UnitType, { price: number; rent: number }[]>;
};

export type EffectiveSale = { price: number | null; rent: number | null; basePrice: number | null; baseRent: number | null };

/**
 * BASE del Proyecto + valores propios por unidad = valor ACTUAL.
 * Cada ficha ocupa una unidad concreta de una línea del Proyecto: primero las vinculadas
 * (`unitId`), después el resto en orden. Una unidad sin ficha vale la base de su línea; una
 * ficha que ya no cabe en el Proyecto toma la base de la última línea de su tipología.
 * El total es SIEMPRE la suma de los valores de cada unidad (nunca media × unidades).
 */
export function effectiveUnits(op: Pick<REOperation, "sales" | "units">, lines: ProjectUnitLine[]): EffectiveUnits {
  const rows = activeSalesByGroup(op);
  const bySale: EffectiveUnits["bySale"] = {};
  const sales = byUnitType<UnitTotals>(() => ({ count: 0, amount: 0 }));
  const rent = byUnitType<UnitTotals>(() => ({ count: 0, amount: 0 }));
  const unrecordedUnits = byUnitType<{ price: number; rent: number }[]>(() => []);
  for (const type of UNIT_TYPES) {
    const typeLines = lines.filter((l) => l.type === type && l.count > 0);
    const free = new Map(typeLines.map((l) => [l, l.count]));
    const lineOf = new Map<RESale, ProjectUnitLine | null>();
    const take = (s: RESale, l: ProjectUnitLine) => {
      free.set(l, (free.get(l) ?? 0) - 1);
      lineOf.set(s, l);
    };
    for (const s of rows[type]) {
      const l = s.unitId ? typeLines.find((x) => x.id === s.unitId && (free.get(x) ?? 0) > 0) : undefined;
      if (l) take(s, l);
    }
    let overflow = 0;
    for (const s of rows[type]) {
      if (lineOf.has(s)) continue;
      const l = typeLines.find((x) => (free.get(x) ?? 0) > 0);
      if (l) take(s, l);
      else {
        overflow += 1;
        lineOf.set(s, typeLines[typeLines.length - 1] ?? null);
      }
    }
    let saleAmount = 0;
    let rentAmount = 0;
    for (const s of rows[type]) {
      const l = lineOf.get(s) ?? null;
      const basePrice = l ? l.salePrice : null;
      const baseRent = l ? l.rent : null;
      const v = { price: effectivePrice(s, basePrice), rent: effectiveRent(s, baseRent), basePrice, baseRent };
      bySale[s.id] = v;
      saleAmount += n0(v.price);
      rentAmount += n0(v.rent);
    }
    for (const l of typeLines) {
      const unrecorded = Math.max(0, free.get(l) ?? 0);
      saleAmount += unrecorded * l.salePrice;
      rentAmount += unrecorded * l.rent;
      for (let i = 0; i < unrecorded; i += 1) unrecordedUnits[type].push({ price: l.salePrice, rent: l.rent });
    }
    const count = typeLines.reduce((n, l) => n + l.count, 0) + overflow;
    sales[type] = { count, amount: round2(saleAmount) };
    rent[type] = { count, amount: round2(rentAmount) };
  }
  let otherSales = 0;
  let otherRent = 0;
  for (const s of rows.OTROS) {
    const v = { price: effectivePrice(s, null), rent: effectiveRent(s, null), basePrice: null, baseRent: null };
    bySale[s.id] = v;
    otherSales += n0(v.price);
    otherRent += n0(v.rent);
  }
  return { sales, rent, otherSales: round2(otherSales), otherRent: round2(otherRent), bySale, unrecorded: unrecordedUnits };
}

export type UnitTypeValues = {
  /** Base media por unidad según el Proyecto. */
  base: number | null;
  /** Suma de los valores efectivos de las unidades. */
  total: number;
  /** total / unidades (solo para mostrar). */
  average: number | null;
  /** Media actual − base, por unidad, y en % sobre la base. */
  deviation: number | null;
  deviationPct: number | null;
};

export type UnitTypeView = {
  key: UnitType;
  label: string;
  units: number;
  /** Unidades con precio / renta propios definidos en Seguimiento operativo. */
  overridden: { sale: number; rent: number };
  sale: UnitTypeValues;
  rent: UnitTypeValues;
};

/** Por tipología del Proyecto: base prevista frente a situación actual (total, media y desviación). */
export function projectUnitTypes(op: Pick<REOperation, "sales" | "units">, res: REResults): UnitTypeView[] {
  const rows = activeSalesByGroup(op);
  const values = (t: UnitTotals, base: number | null): UnitTypeValues => {
    const average = t.count > 0 ? t.amount / t.count : null;
    const deviation = average != null && base != null ? average - base : null;
    return {
      base,
      total: t.amount,
      average,
      deviation,
      deviationPct: deviation != null && base ? deviation / base : null,
    };
  };
  return UNIT_TYPES.map((key) => ({
    key,
    label: SALE_GROUP_LABEL[key],
    units: res.salesByUnitType[key].count,
    overridden: { sale: rows[key].filter((x) => isNum(x.estimatedPrice) || isNum(x.realPrice)).length, rent: rows[key].filter((x) => isNum(x.rentMonthly)).length },
    sale: values(res.salesByUnitType[key], res.saleUnitPriceByType[key]),
    rent: values(res.rentByUnitType[key], res.rentUnitBaseByType[key]),
  })).filter((t) => t.units > 0);
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
  /** Renta mensual actual (propia o base); null si la tipología no tiene renta. */
  rentMonthly: number | null;
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
  const byGroup = activeSalesByGroup(op);
  const upcoming: UpcomingEvent[] = [];
  const today = todayISO.slice(0, 10);

  const groups = SALE_GROUP_ORDER.map<SaleGroupView>((key) => {
    const rowsRaw = byGroup[key];

    const rows = rowsRaw.map<SaleUnitView>((s) => {
      const effective = res.effectiveSales?.[s.id];
      const plannedPrice = effective?.price ?? null;
      const sold = statusIsSold(s.status);
      const soldAmount = sold ? plannedPrice ?? 0 : null;
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
        rentMonthly: effective?.rent || null,
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

    const units = key === "OTROS" ? rows.length : n0(res.salesByUnitType?.[key]?.count);
    const planned = key === "OTROS" ? round2(rows.reduce((sum, r) => sum + n0(r.plannedPrice), 0)) : n0(res.salesByUnitType?.[key]?.amount);
    const sold = rows.filter((r) => statusIsSold(r.status)).length;
    const reserved = rows.filter((r) => RESERVED.includes(r.status)).length;
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
        rentMonthly: money(r.rentMonthly),
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
 * mismas unidades que el Proyecto y título numerado. SIN precio: lo heredan del Proyecto.
 */
export function missingSaleRecords(op: REOperation, res: REResults, group: UnitType, makeId: () => string, nowISO: string): RESale[] {
  const summary = projectSalesSummary(op, res, nowISO).groups.find((g) => g.key === group);
  if (!summary || summary.unitsWithoutRecord <= 0) return [];
  const base = UNIT_SINGULAR[group];
  const start = summary.rows.length;
  return Array.from({ length: summary.unitsWithoutRecord }, (_, i) => ({
    id: makeId(),
    title: `${base} ${start + i + 1}`,
    unitType: group,
    status: "DISPONIBLE" as const,
    createdAt: nowISO,
    updatedAt: nowISO,
  }));
}

export type ScenarioFactors = { sale?: number; obra?: number; rent?: number };

/**
 * Copia en memoria de la operación con multiplicadores de escenario. Escala las BASES del
 * Proyecto y también los valores propios de cada unidad: una vivienda a 184.000 € con +5 %
 * pasa a 193.200 €, no a base × 1,05. Nada se guarda.
 */
export function scaleOperation(op: REOperation, f: ScenarioFactors): REOperation {
  const sale = f.sale ?? 1;
  const obra = f.obra ?? 1;
  const rent = f.rent ?? 1;
  const clone: REOperation = JSON.parse(JSON.stringify(op));
  const by = (v: number | undefined, k: number) => (v != null ? v * k : v);
  clone.units = (clone.units ?? []).map((u) => ({
    ...u,
    salePriceTotal: by(u.salePriceTotal, sale),
    salePriceM2: by(u.salePriceM2, sale),
    rentMonthly: by(u.rentMonthly, rent),
    pricePerRoom: by(u.pricePerRoom, rent),
  }));
  clone.sales = clone.sales?.map((x) => ({
    ...x,
    ...(isNum(x.estimatedPrice) ? { estimatedPrice: x.estimatedPrice * sale } : {}),
    ...(isNum(x.realPrice) ? { realPrice: x.realPrice * sale } : {}),
    ...(isNum(x.rentMonthly) ? { rentMonthly: x.rentMonthly * rent } : {}),
  }));
  const c = clone.costs;
  if (c) {
    c.obraViviendaPriceM2 = by(c.obraViviendaPriceM2, obra);
    c.obraViviendaTotal = by(c.obraViviendaTotal, obra);
    c.obraGarajePriceM2 = by(c.obraGarajePriceM2, obra);
    c.obraGarajeTotal = by(c.obraGarajeTotal, obra);
    c.obraTrasterosPriceM2 = by(c.obraTrasterosPriceM2, obra);
    c.obraTrasterosTotal = by(c.obraTrasterosTotal, obra);
  }
  return clone;
}

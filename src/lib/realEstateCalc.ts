// src/lib/realEstateCalc.ts — Fórmulas idénticas a APP/src/utils/realEstateCalc.ts

import type { REOperation, REResults, REUnit } from "./realEstate";

const n0 = (v: number | undefined | null): number =>
  Number.isFinite(v as number) ? (v as number) : 0;

/**
 * Nº de trasteros calculados para una unidad TRASTERO.
 * floor((m2Total - m2Access) / m2PerUnit), mínimo 0.
 */
export function calcNumTrasteros(m2Total: number, m2Access: number, m2PerUnit: number): number {
  if (m2PerUnit <= 0) return 0;
  return Math.max(0, Math.floor((m2Total - m2Access) / m2PerUnit));
}

/**
 * Nº de plazas de aparcamiento para una unidad GARAJE.
 * floor((m2Unit - m2Access) / m2PerPlaza), mínimo 0.
 */
export function calcNumPlazas(m2Unit: number, m2Access: number, m2PerPlaza: number): number {
  if (m2PerPlaza <= 0) return 0;
  return Math.max(0, Math.floor((m2Unit - m2Access) / m2PerPlaza));
}

/**
 * Cuota mensual — sistema francés (anualidad constante).
 * C = P · r / (1 − (1+r)^−n)
 */
export function calcFrench(principal: number, tinAnualPct: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0;
  const r = tinAnualPct / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/**
 * TIN anual (%) necesario para una cuota mensual dada.
 * Bisección sobre la tasa mensual r → convierte a TIN anual %.
 */
export function calcTINFromCuota(principal: number, years: number, cuota: number): number {
  if (principal <= 0 || years <= 0 || cuota <= 0) return 0;
  const n = years * 12;
  if (cuota <= principal / n) return 0; // sin interés o cuota insuficiente
  let lo = 0;
  let hi = 1; // tasa mensual máxima: 1 = 1200% anual
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2;
    const m = (principal * mid) / (1 - Math.pow(1 + mid, -n));
    if (m < cuota) lo = mid; else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  return ((lo + hi) / 2) * 12 * 100;
}

export function calcResults(op: REOperation): REResults {
  // Defensivo: una operación antigua o incompleta puede llegar sin algunos
  // bloques (costs, units, financing, tasas). Aplicamos defaults seguros para
  // que calcResults NUNCA rompa; los campos ausentes se tratan como 0.
  const safeOp = (op ?? {}) as REOperation;
  const units: REUnit[] = Array.isArray(safeOp.units) ? safeOp.units : [];
  const costs = (safeOp.costs ?? {}) as REOperation["costs"];
  const financing = (safeOp.financing ?? {}) as REOperation["financing"];
  const tasas = Array.isArray(costs.tasas) ? costs.tasas : [];
  const purchasePrice = n0(safeOp.purchasePrice);
  const m2Plot        = n0(safeOp.m2Plot);

  // ── Impuesto compra ──────────────────────────────────────────────────────────
  const purchaseTaxAmt =
    costs.purchaseTaxTotal != null
      ? n0(costs.purchaseTaxTotal)
      : (n0(costs.purchaseTaxPct) / 100) * purchasePrice;

  // ── Cimentación ──────────────────────────────────────────────────────────────
  const cimentacionAmt =
    costs.cimentacionTotal != null
      ? n0(costs.cimentacionTotal)
      : n0(costs.cimentacionPriceM2) * m2Plot;

  // ── Escaleras ─────────────────────────────────────────────────────────────────
  const escalerasAmt =
    costs.escalerasTotal != null
      ? n0(costs.escalerasTotal)
      : n0(costs.escalerasM2) * n0(costs.escalerasPriceM2);

  // ── Accesos ───────────────────────────────────────────────────────────────────
  const accesosAmt =
    costs.accesosTotal != null
      ? n0(costs.accesosTotal)
      : n0(costs.accesosM2) * n0(costs.accesosPriceM2);

  // ── Obra ──────────────────────────────────────────────────────────────────────
  const viviendaM2 = units
    .filter((u) => u.type === "VIVIENDA")
    .reduce((s, u) => s + n0(u.m2Unit) * Math.max(1, Math.round(n0(u.numUnits ?? 1))), 0);
  const garajeM2 = units
    .filter((u) => u.type === "GARAJE")
    .reduce((s, u) => s + n0(u.m2Unit), 0);
  // TRASTERO: usar m2Total (nuevo campo); fallback a m2Unit para datos antiguos
  const trasteroM2 = units
    .filter((u) => u.type === "TRASTERO")
    .reduce((s, u) => s + n0(u.m2Total ?? u.m2Unit), 0);

  const obraViviendaAmt =
    costs.obraViviendaTotal != null
      ? n0(costs.obraViviendaTotal)
      : n0(costs.obraViviendaPriceM2) * viviendaM2;
  const obraGarajeAmt =
    costs.obraGarajeTotal != null
      ? n0(costs.obraGarajeTotal)
      : n0(costs.obraGarajePriceM2) * garajeM2;
  const obraTrasterosAmt =
    costs.obraTrasterosTotal != null
      ? n0(costs.obraTrasterosTotal)
      : n0(costs.obraTrasterosPriceM2) * trasteroM2;
  const obraTotal = obraViviendaAmt + obraGarajeAmt + obraTrasterosAmt;

  // ── Base obra completa (para tasas, financiación de obra y desviaciones) ──────
  const obraBase = cimentacionAmt + escalerasAmt + accesosAmt + obraTotal;

  // ── Arquitecto ────────────────────────────────────────────────────────────────
  const arquitectoAmt =
    costs.arquitectoTotal != null
      ? n0(costs.arquitectoTotal)
      : (n0(costs.arquitectoPct) / 100) * obraBase;

  // ── Desviaciones ──────────────────────────────────────────────────────────────
  const desviacionesAmt =
    costs.desviacionesTotal != null
      ? n0(costs.desviacionesTotal)
      : (n0(costs.desviacionesPct) / 100) * obraBase;

  // ── Tasas ─────────────────────────────────────────────────────────────────────
  const tasasAmt = costs.tasasTotal != null
    ? n0(costs.tasasTotal)
    : tasas.reduce((s, t) => {
        const amt = t.amount ?? (n0(t.pct) / 100) * obraBase;
        return s + amt;
      }, 0);

  // ── Mobiliario (no financiable) ───────────────────────────────────────────────
  const totalViviendas = units
    .filter((u) => u.type === "VIVIENDA")
    .reduce((s, u) => s + Math.max(1, Math.round(n0(u.numUnits ?? 1))), 0);
  const furnitureCostTotal = n0(costs.furnitureCostPerUnit) * totalViviendas;

  // ── Inversión total ───────────────────────────────────────────────────────────
  const totalInvestment =
    purchasePrice +
    purchaseTaxAmt +
    cimentacionAmt +
    escalerasAmt +
    accesosAmt +
    obraTotal +
    arquitectoAmt +
    desviacionesAmt +
    tasasAmt +
    furnitureCostTotal;

  // ── Unidades con cálculos derivados ──────────────────────────────────────────
  const unitResults = units.map((u) => {
    if (u.type === "TRASTERO") {
      const numTrasteros = calcNumTrasteros(n0(u.m2Total), n0(u.m2Access), n0(u.m2PerUnit));
      return { ...u, rooms: 0, monthlyIncomeRooms: 0, numTrasteros, numPlazas: 0 };
    }
    if (u.type === "GARAJE") {
      const numPlazas = calcNumPlazas(n0(u.m2Unit), n0(u.m2Access), n0(u.m2PerPlaza) || 12.5);
      return { ...u, rooms: 0, monthlyIncomeRooms: 0, numTrasteros: 0, numPlazas };
    }
    if (u.type !== "VIVIENDA") {
      return { ...u, rooms: 0, monthlyIncomeRooms: 0, numTrasteros: 0, numPlazas: 0 };
    }
    // VIVIENDA
    const rentType = u.rentType ?? "TRADICIONAL";
    const numUnits = Math.max(1, Math.round(n0(u.numUnits ?? 1)));
    if (rentType === "HABITACIONES" && u.m2PerRoom && u.m2PerRoom > 0) {
      const usable = n0(u.m2Unit) - n0(u.m2CommonAreas) - n0(u.m2Access);
      const roomsPerUnit = Math.max(0, Math.floor(usable / n0(u.m2PerRoom)));
      const rooms = roomsPerUnit * numUnits;
      const monthlyIncomeRooms = rooms * n0(u.pricePerRoom);
      return { ...u, rooms, monthlyIncomeRooms, numTrasteros: 0, numPlazas: 0 };
    }
    // Manual rooms mode: m2PerRoom not set, numHabitaciones entered directly
    if (rentType === "HABITACIONES" && n0(u.numHabitaciones) > 0) {
      const rooms = n0(u.numHabitaciones) * numUnits;
      const monthlyIncomeRooms = rooms * n0(u.pricePerRoom);
      return { ...u, rooms, monthlyIncomeRooms, numTrasteros: 0, numPlazas: 0 };
    }
    return { ...u, rooms: 0, monthlyIncomeRooms: 0, numTrasteros: 0, numPlazas: 0 };
  });

  // ── Financiación ──────────────────────────────────────────────────────────────
  const finEnabled = financing.enabled === true;

  const compraAmount = finEnabled
    ? financing.compra?.amount != null
      ? n0(financing.compra?.amount)
      : (n0(financing.compra?.pct) / 100) * purchasePrice
    : 0;

  const obraFinAmount = finEnabled
    ? financing.obra?.amount != null
      ? n0(financing.obra?.amount)
      : (n0(financing.obra?.pct) / 100) * obraBase
    : 0;

  const totalFinanced = compraAmount + obraFinAmount;
  const myInvestment = totalInvestment - totalFinanced;

  const compraMonthly =
    finEnabled && n0(financing.compra?.years) > 0
      ? calcFrench(compraAmount, n0(financing.compra?.interest), n0(financing.compra?.years))
      : 0;
  const obraMonthly =
    finEnabled && n0(financing.obra?.years) > 0
      ? calcFrench(obraFinAmount, n0(financing.obra?.interest), n0(financing.obra?.years))
      : 0;
  const totalMonthlyPayment = compraMonthly + obraMonthly;

  // ── Alquiler ──────────────────────────────────────────────────────────────────
  const monthlyRentIncome = unitResults.reduce((s, u) => {
    if (u.type === "VIVIENDA") {
      const rentType = u.rentType ?? "TRADICIONAL";
      const numUnits = Math.max(1, Math.round(n0(u.numUnits ?? 1)));
      return s + (rentType === "HABITACIONES" ? u.monthlyIncomeRooms : n0(u.rentMonthly) * numUnits);
    }
    return s + n0(u.rentMonthly);
  }, 0);

  const monthlyRentBenefit = finEnabled
    ? monthlyRentIncome - totalMonthlyPayment
    : monthlyRentIncome;
  const investBase = finEnabled && myInvestment > 0 ? myInvestment : totalInvestment;
  const rentYield = investBase > 0 ? (monthlyRentBenefit * 12) / investBase : 0;

  // ── Venta ─────────────────────────────────────────────────────────────────────
  // TRASTERO: salePriceTotal × numTrasteros
  const totalSales = unitResults.reduce((s, u) => {
    if (u.type === "TRASTERO") return s + n0(u.salePriceTotal) * u.numTrasteros;
    if (u.type === "GARAJE")   return s + n0(u.salePriceTotal) * u.numPlazas;
    if (u.type === "VIVIENDA") return s + n0(u.salePriceTotal) * Math.max(1, Math.round(n0(u.numUnits ?? 1)));
    return s + n0(u.salePriceTotal);
  }, 0);
  const saleBenefit = totalSales - totalInvestment;
  const saleYield = investBase > 0 ? saleBenefit / investBase : 0;

  return {
    purchaseTaxAmt,
    cimentacionAmt,
    escalerasAmt,
    accesosAmt,
    obraViviendaAmt,
    obraGarajeAmt,
    obraTrasterosAmt,
    obraTotal,
    obraBase,
    arquitectoAmt,
    desviacionesAmt,
    tasasAmt,
    furnitureCostTotal,
    totalInvestment,
    compraAmount,
    obraFinAmount,
    totalFinanced,
    myInvestment,
    compraMonthly,
    obraMonthly,
    totalMonthlyPayment,
    unitResults,
    monthlyRentIncome,
    monthlyRentBenefit,
    rentYield,
    totalSales,
    saleBenefit,
    saleYield,
  };
}

/** Formatea euros con separador de miles — ej: 3.000 € */
export function fmtEUR(v: number): string {
  const safe = Number.isFinite(v) ? v : 0;
  return `${Math.round(safe).toLocaleString("es-ES")} €`;
}

/** Formatea número con separador de miles — ej: 3.000 */
export function fmtNum(v: number): string {
  const safe = Number.isFinite(v) ? v : 0;
  return Math.round(safe).toLocaleString("es-ES");
}

/** Formatea ratio como porcentaje con 1 decimal */
export function fmtPct(ratio: number): string {
  const safe = Number.isFinite(ratio) ? ratio : 0;
  return `${(safe * 100).toFixed(1)} %`;
}

export type RealEstateCategory = "vivienda" | "local" | "suelo" | "adaptacion";

export const CATEGORY_INFO: Record<RealEstateCategory, { label: string; icon: string; desc: string }> = {
  vivienda:   { label: "Vivienda convencional",  icon: "🏠", desc: "Compra y reforma de viviendas" },
  local:      { label: "Conversión de local",    icon: "🔄", desc: "Local a uso residencial" },
  suelo:      { label: "Suelo / Edificio",       icon: "🏗️", desc: "Edificación sobre suelo" },
  adaptacion: { label: "Adaptación en unidades", icon: "🔧", desc: "División o adaptación de espacios" },
};

export function convertRealEstateOperationType(op: REOperation, newCat: RealEstateCategory): REOperation {
  const hasGT = newCat === "local" || newCat === "suelo";
  const hasCim = newCat === "suelo";
  const hasEscAcc = newCat === "suelo" || newCat === "local";
  const hasAcc = hasEscAcc || newCat === "adaptacion";

  const vivUnits = op.units.filter((u) => u.type === "VIVIENDA");
  const garUnit = op.units.find((u) => u.type === "GARAJE");
  const trasUnit = op.units.find((u) => u.type === "TRASTERO");

  const newUnits: REUnit[] = [...vivUnits];
  if (hasGT) {
    newUnits.push(
      garUnit ?? { id: `g_${Date.now()}`, type: "GARAJE" as const, title: "Garaje 1", m2PerPlaza: 12.5 }
    );
    newUnits.push(
      trasUnit ?? { id: `t_${Date.now()}`, type: "TRASTERO" as const, title: "Trastero 1" }
    );
  }

  return {
    ...op,
    _cat: newCat,
    m2Plot: newCat === "suelo" ? (op.m2Plot ?? op.m2Buildable) : undefined,
    units: newUnits,
    costs: {
      ...op.costs,
      cimentacionPriceM2: hasCim ? op.costs.cimentacionPriceM2 : undefined,
      cimentacionTotal: hasCim ? op.costs.cimentacionTotal : undefined,
      escalerasM2: hasEscAcc ? op.costs.escalerasM2 : undefined,
      escalerasPriceM2: hasEscAcc ? op.costs.escalerasPriceM2 : undefined,
      escalerasTotal: hasEscAcc ? op.costs.escalerasTotal : undefined,
      accesosM2: hasAcc ? op.costs.accesosM2 : undefined,
      accesosPriceM2: hasAcc ? op.costs.accesosPriceM2 : undefined,
      accesosTotal: hasAcc ? op.costs.accesosTotal : undefined,
      obraGarajePriceM2: hasGT ? op.costs.obraGarajePriceM2 : undefined,
      obraGarajeTotal: hasGT ? op.costs.obraGarajeTotal : undefined,
      obraTrasterosPriceM2: hasGT ? op.costs.obraTrasterosPriceM2 : undefined,
      obraTrasterosTotal: hasGT ? op.costs.obraTrasterosTotal : undefined,
    },
    updatedAt: new Date().toISOString(),
  };
}

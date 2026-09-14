import test from "node:test";
import assert from "node:assert/strict";
import type { REOperation } from "./realEstate.ts";
import { calcResults } from "./realEstateCalc.ts";
import {
  conceptPlannedAmount,
  formatEs,
  missingSaleRecords,
  projectUnitTypes,
  scaleOperation,
  projectExpenseSummary,
  projectSalesSummary,
  saleCollected,
  salesSummaryForInvestors,
  withCollectedTotal,
  withPlannedTotal,
  withoutExpenseAmounts,
} from "./projectEconomics.ts";
import { expenseTotals, salesStats } from "./realEstateTrackingCalc.ts";

const baseOp = (extra: Partial<REOperation> = {}): REOperation =>
  ({
    id: "op1",
    name: "Edificio",
    purchasePrice: 170200,
    units: [],
    costs: { purchaseTaxPct: 7, arquitectoPct: 0, tasas: [], arquitectoTotal: 8500 },
    financing: { enabled: false, compra: { pct: 0, interest: 0 }, obra: { pct: 0 } },
    createdAt: "",
    updatedAt: "",
    ...extra,
  }) as REOperation;

const concept = (id: string, over: Record<string, unknown>) =>
  ({ id, category: "SUMINISTROS", concept: id, status: "PENDIENTE", createdAt: "", updatedAt: "", ...over }) as never;

test("gasto recurrente: 105 €/mes × 18 = 1.890 €; mensual + fijo; solo fijo; estimado antiguo intacto", () => {
  assert.equal(conceptPlannedAmount({ monthlyAmount: 105, months: 18 }), 1890);
  assert.equal(conceptPlannedAmount({ monthlyAmount: 70, months: 18, fixedAmount: 300 }), 1560);
  assert.equal(conceptPlannedAmount({ fixedAmount: 450 }), 450);
  // Un gasto histórico con solo `estimated` NO se convierte en 18 meses.
  assert.equal(conceptPlannedAmount({ estimated: 2500 }), 2500);
  assert.equal(conceptPlannedAmount({ estimated: 2500, months: 18 }), 2500);
  assert.equal((withPlannedTotal(concept("Luz", { monthlyAmount: 70, months: 18 })) as { estimated: number }).estimated, 1260);
});

test("agrupación por categoría, previsto = inversión total del simulador, editar y eliminar", () => {
  const luz = concept("Luz", { monthlyAmount: 70, months: 18 });
  const agua = concept("Agua", { monthlyAmount: 35, months: 18 });
  const alta = concept("Alta suministros", { fixedAmount: 300 });
  const vigilancia = concept("Vigilancia", { category: "OTROS", monthlyAmount: 200, months: 16 });
  let op = baseOp({ expenses: [luz, agua, alta, vigilancia] });
  let res = calcResults(op);
  let s = projectExpenseSummary(op, res);
  const sum = s.categories.find((c) => c.key === "SUMINISTROS")!;
  assert.equal(sum.planned, 2190);
  assert.deepEqual(sum.concepts.map((c) => [c.concept, c.planned]), [["Luz", 1260], ["Agua", 630], ["Alta suministros", 300]]);
  assert.equal(s.categories.find((c) => c.key === "COMPRA")!.planned, 170200);
  assert.equal(s.categories.find((c) => c.key === "ARQUITECTO")!.planned, 8500);
  assert.equal(s.planned, res.totalInvestment, "el previsto es la inversión total");
  assert.equal(res.customCostsAmt, 2190 + 3200);

  // Editar (Luz a 80 €/mes) y eliminar (Agua)
  op = { ...op, expenses: [concept("Luz", { monthlyAmount: 80, months: 18 }), alta, vigilancia] };
  res = calcResults(op);
  s = projectExpenseSummary(op, res);
  assert.equal(s.categories.find((c) => c.key === "SUMINISTROS")!.planned, 1740);
  assert.equal(s.planned, res.totalInvestment);
});

test("previsto vs real: factura IA entra en su categoría y un gasto vinculado no se duplica", () => {
  const luz = concept("Luz", { monthlyAmount: 70, months: 18 });
  const op = baseOp({
    expenses: [luz, concept("", { category: "OTROS", concept: "" })],
    realExpenses: [
      { id: "rexp_doc_1FileX", concept: "Endesa", amount: 78.05, date: "2026-01-03", category: "SUMINISTROS", documentUrl: "https://drive.google.com/file/d/1FileX/view", createdAt: "", updatedAt: "" },
      { id: "rexp_2", concept: "Luz febrero", amount: 100, date: "2026-02-03", budgetLineId: "Luz", createdAt: "", updatedAt: "" },
      { id: "rexp_3", concept: "Borrado", amount: 999, date: "2026-02-03", category: "SUMINISTROS", deletedAt: "2026-02-04", createdAt: "", updatedAt: "" },
    ],
  });
  const s = projectExpenseSummary(op, calcResults(op));
  const cat = s.categories.find((c) => c.key === "SUMINISTROS")!;
  assert.equal(cat.real, 178.05, "factura IA + gasto vinculado, sin el borrado");
  assert.equal(cat.realItems.length, 2);
  assert.equal(cat.concepts.find((c) => c.id === "Luz")!.real, 100);
  assert.equal(cat.deviation, Math.round((178.05 - 1260) * 100) / 100);
  assert.equal(cat.remaining, 1081.95);
  assert.equal(s.real, 178.05, "el gasto vinculado cuenta una sola vez en el total");
  assert.ok(!s.categories.some((c) => c.concepts.some((x) => x.concept === "Concepto sin nombre")), "filas vacías heredadas ocultas");
  const t = expenseTotals(op);
  assert.equal(t.estimated, s.planned);
  assert.equal(t.real, s.real);
  const investor = withoutExpenseAmounts(s);
  assert.equal(investor.planned, null);
  assert.ok(investor.categories.every((c) => c.realItems.length === 0 && c.concepts.every((x) => x.planned === null)));
});

const unitsOp = (sales: REOperation["sales"]) =>
  baseOp({
    units: [
      { id: "v", type: "VIVIENDA", title: "Viviendas", m2Unit: 90, numUnits: 4, salePriceTotal: 245000 },
      { id: "g", type: "GARAJE", title: "Garajes", m2Unit: 50, m2PerPlaza: 12.5, salePriceTotal: 15000 },
      { id: "t", type: "TRASTERO", title: "Trasteros", m2Total: 20, m2PerUnit: 5, salePriceTotal: 6000 },
    ],
    sales,
  });

test("ventas por tipo: viviendas, garajes y trasteros con el previsto del simulador", () => {
  const op = unitsOp([]);
  const res = calcResults(op);
  const s = projectSalesSummary(op, res, "2026-09-14");
  assert.deepEqual(s.groups.map((g) => [g.key, g.units, g.planned]), [["VIVIENDA", 4, 980000], ["GARAJE", 4, 60000], ["TRASTERO", 4, 24000]]);
  assert.equal(s.planned, res.totalSales);
  assert.equal(s.available, 12);
  assert.equal(s.groups[0].unitsWithoutRecord, 4);
});

test("venta real, cobro parcial, pendiente, fechas previstas y próximos hitos", () => {
  const sales = [
    {
      id: "1A", title: "Vivienda 1A", unitType: "VIVIENDA", status: "VENDIDO", estimatedPrice: 245000, realPrice: 242000, date: "2027-02-03", buyer: "Laura",
      completionDateEstimated: "2027-01-15", completionDateReal: "2027-01-20", saleDateEstimated: "2027-02-01", collectionDateEstimated: "2027-02-15",
      payments: [{ id: "p1", date: "2026-10-01", amount: 20000 }, { id: "p2", date: "2027-02-03", amount: 80000 }], collected: 5, createdAt: "", updatedAt: "",
    },
    { id: "1B", title: "Vivienda 1B", status: "RESERVADO", completionDateEstimated: "2027-01-15", saleDateEstimated: "2027-03-01", collectionDateEstimated: "2027-04-01", createdAt: "", updatedAt: "" },
    { id: "G1", title: "Plaza de garaje 1", status: "VENDIDO", realPrice: 16000, collected: 16000, createdAt: "", updatedAt: "" },
  ] as REOperation["sales"];
  const op = unitsOp(sales);
  const s = projectSalesSummary(op, calcResults(op), "2026-12-01");
  const viv = s.groups.find((g) => g.key === "VIVIENDA")!;
  const a = viv.rows.find((r) => r.id === "1A")!;
  assert.equal(a.collected, 100000, "cobros reales, no el `collected` legado");
  assert.equal(a.pending, 142000);
  assert.equal(a.build, "terminada");
  assert.deepEqual(a.sale, { estimated: "2027-02-01", real: "2027-02-03" });
  assert.equal(viv.sold, 1);
  assert.equal(viv.reserved, 1);
  assert.equal(viv.available, 2);
  assert.equal(viv.soldAmount, 242000);
  assert.equal(viv.planned, 4 * 245000);
  const gar = s.groups.find((g) => g.key === "GARAJE")!;
  assert.equal(gar.sold, 1);
  assert.equal(gar.pending, 0);
  assert.equal(s.collected, 116000);
  assert.equal(s.pending, 142000);
  assert.deepEqual(s.upcoming.map((e) => [e.kind, e.date]), [["terminacion", "2027-01-15"], ["cobro", "2027-02-15"], ["venta", "2027-03-01"], ["cobro", "2027-04-01"]]);
  assert.equal(s.upcoming[1].amount, 142000, "lo que queda por cobrar de lo realmente vendido");
  assert.equal(salesStats(op).collected, 116000, "las métricas existentes usan la misma regla de cobrado");
  const inv = salesSummaryForInvestors(s, false);
  assert.equal(inv.groups[0].rows[0].buyer, undefined, "sin datos del comprador");
  assert.equal(inv.collected, null);
  assert.equal(inv.groups[0].rows[0].collection.payments[0].amount, null);
  assert.equal(salesSummaryForInvestors(s, true).collected, 116000);
});

test("cobros: el total legado se reescribe al guardar; las fichas que faltan se crean sin inventar estados", () => {
  assert.equal(saleCollected({ collected: 500 }), 500);
  assert.equal(
    withCollectedTotal({ id: "x", title: "x", status: "VENDIDO", payments: [{ id: "a", date: "2027-01-01", amount: 10 }, { id: "b", date: "2027-01-02", amount: 15.5 }], createdAt: "", updatedAt: "" }).collected,
    25.5,
  );
  const op = unitsOp([{ id: "1A", title: "Vivienda 1A", unitType: "VIVIENDA", status: "VENDIDO", createdAt: "", updatedAt: "" }] as REOperation["sales"]);
  let n = 0;
  const created = missingSaleRecords(op, calcResults(op), "VIVIENDA", () => `new${++n}`, "2026-09-14T00:00:00.000Z");
  assert.deepEqual(created.map((r) => [r.title, r.status, r.estimatedPrice, r.unitType]), [
    ["Vivienda 2", "DISPONIBLE", undefined, "VIVIENDA"],
    ["Vivienda 3", "DISPONIBLE", undefined, "VIVIENDA"],
    ["Vivienda 4", "DISPONIBLE", undefined, "VIVIENDA"],
  ]);
});

test("borrados con marca: un concepto o una ficha eliminados no cuentan en ningún total", () => {
  const op = unitsOp([
    { id: "1A", title: "Vivienda 1A", status: "VENDIDO", realPrice: 200000, createdAt: "", updatedAt: "" },
    { id: "1B", title: "Vivienda 1B", status: "VENDIDO", realPrice: 999999, deletedAt: "2026-09-14T00:00:00Z", createdAt: "", updatedAt: "" },
  ] as REOperation["sales"]);
  const withCosts = { ...op, expenses: [concept("Luz", { monthlyAmount: 70, months: 18 }), concept("Agua", { monthlyAmount: 35, months: 18, deletedAt: "2026-09-14T00:00:00Z" })] };
  const res = calcResults(withCosts);
  assert.equal(res.customCostsAmt, 1260);
  assert.equal(projectExpenseSummary(withCosts, res).categories.find((c) => c.key === "SUMINISTROS")!.concepts.length, 1);
  const s = projectSalesSummary(withCosts, res, "2026-09-14");
  assert.equal(s.soldAmount, 200000);
  assert.equal(salesStats(withCosts).soldCount, 1);
});

const unitsBase = (over: Record<string, unknown>) => [{ id: "v", type: "VIVIENDA", title: "Viviendas", numUnits: 6, salePriceTotal: 180000, rentMonthly: 900, ...over }] as REOperation["units"];
const withOverrides = (units: REOperation["units"], group: "VIVIENDA" | "GARAJE" | "TRASTERO" | "LOCAL" | "PARCELA", own: Record<string, Partial<NonNullable<REOperation["sales"]>[number]>>) => {
  const op0 = baseOp({ units });
  let n = 0;
  const fichas = missingSaleRecords(op0, calcResults(op0), group, () => `${group}${++n}`, "2026-09-14T00:00:00.000Z");
  return baseOp({ units, sales: fichas.map((f) => ({ ...f, ...(own[f.title] ?? {}) })) });
};
const effectivePrices = (op: REOperation) => {
  const res = calcResults(op);
  return (op.sales ?? []).map((x) => res.effectiveSales[x.id].price);
};

test("VENTA obligatoria: 6 viviendas a 180.000 €; V1 184.000 y V4 186.000 → 1.090.000 € y media 181.666,67 €; base a 185.000 → 1.110.000 €", () => {
  const inicial = baseOp({ units: unitsBase({}) });
  const r0 = calcResults(inicial);
  assert.equal(r0.totalSales, 1080000);
  assert.equal(projectUnitTypes(inicial, r0)[0].sale.average, 180000);

  const op = withOverrides(unitsBase({}), "VIVIENDA", { "Vivienda 1": { estimatedPrice: 184000 }, "Vivienda 4": { estimatedPrice: 186000 } });
  assert.ok((op.sales ?? []).filter((x) => !["Vivienda 1", "Vivienda 4"].includes(x.title)).every((x) => x.estimatedPrice === undefined), "la base no se copia en las unidades");
  assert.deepEqual(effectivePrices(op), [184000, 180000, 180000, 186000, 180000, 180000]);
  const res = calcResults(op);
  assert.equal(res.totalSales, 1090000);
  assert.equal(res.saleBenefit, 1090000 - res.totalInvestment, "beneficio con los ingresos actuales");
  const viv = projectUnitTypes(op, res)[0];
  assert.equal(viv.sale.total, 1090000);
  assert.equal(Math.round(viv.sale.average! * 100) / 100, 181666.67);
  assert.equal(viv.sale.base, 180000, "la base se conserva junto a la situación actual");
  assert.equal(Math.round(viv.sale.deviation! * 100) / 100, 1666.67);
  assert.equal(Math.round(viv.sale.deviationPct! * 10000) / 100, 0.93);
  assert.equal(projectSalesSummary(op, res, "2026-09-14").planned, res.totalSales, "Seguimiento = Proyecto");

  const op185 = { ...op, units: unitsBase({ salePriceTotal: 185000 }) };
  assert.deepEqual(effectivePrices(op185), [184000, 185000, 185000, 186000, 185000, 185000]);
  const r185 = calcResults(op185);
  assert.equal(r185.totalSales, 1110000);
  assert.equal(projectUnitTypes(op185, r185)[0].sale.average, 185000);
});

test("ALQUILER obligatorio: renta base 900 €; 950, 900, 925, 900, 900, 900 → 5.475 €/mes, media 912,50 €, 65.700 €/año", () => {
  const op = withOverrides(unitsBase({}), "VIVIENDA", { "Vivienda 1": { rentMonthly: 950 }, "Vivienda 3": { rentMonthly: 925 } });
  const res = calcResults(op);
  assert.equal(res.monthlyRentIncome, 5475);
  assert.equal(res.monthlyRentIncome * 12, 65700);
  const viv = projectUnitTypes(op, res)[0];
  assert.equal(viv.rent.average, 912.5);
  assert.equal(viv.rent.base, 900);
  assert.equal(res.monthlyRentBenefit, 5475, "sin financiación, beneficio mensual = ingreso");
  assert.equal(res.rentYield, (5475 * 12) / res.totalInvestment);
  // Con financiación, el cashflow descuenta la cuota del mismo ingreso actual.
  const fin = { ...op, financing: { enabled: true, compra: { pct: 50, interest: 3, years: 20 }, obra: { pct: 0 } } };
  const rf = calcResults(fin);
  assert.equal(rf.monthlyRentIncome, 5475);
  assert.equal(rf.monthlyRentBenefit, 5475 - rf.totalMonthlyPayment);
  assert.equal(rf.rentYield, (rf.monthlyRentBenefit * 12) / rf.myInvestment);
  const row = projectSalesSummary(op, res, "2026-09-14").groups[0].rows;
  assert.deepEqual(row.map((x) => x.rentMonthly), [950, 900, 925, 900, 900, 900]);
});

test("ESCENARIOS: +5 % escala las bases y los valores propios (184.000 → 193.200), igual con la renta", () => {
  const op = withOverrides(unitsBase({}), "VIVIENDA", { "Vivienda 1": { estimatedPrice: 184000, rentMonthly: 950 } });
  const up = scaleOperation(op, { sale: 1.05, rent: 1.1 });
  const res = calcResults(up);
  const v1 = (up.sales ?? []).find((x) => x.title === "Vivienda 1")!;
  assert.equal(res.effectiveSales[v1.id].price, 193200);
  assert.equal(res.totalSales, 193200 + 5 * 189000);
  assert.equal(res.monthlyRentIncome, 1045 + 5 * 990);
  assert.equal(calcResults(op).totalSales, 184000 + 5 * 180000, "la operación original no cambia");
});

test("garajes y trasteros: la renta y el precio base son por plaza / trastero y admiten valores propios", () => {
  const units = [
    { id: "g", type: "GARAJE", title: "Garajes", m2Unit: 50, m2PerPlaza: 12.5, salePriceTotal: 15000, rentMonthly: 70 },
    { id: "t", type: "TRASTERO", title: "Trasteros", m2Total: 20, m2PerUnit: 5, salePriceTotal: 6000, rentMonthly: 40 },
  ] as REOperation["units"];
  const base = calcResults(baseOp({ units }));
  assert.equal(base.totalSales, 4 * 15000 + 4 * 6000);
  assert.equal(base.monthlyRentIncome, 4 * 70 + 4 * 40, "nº de plazas × renta por plaza");
  const op = withOverrides(units, "GARAJE", { "Garaje 2": { estimatedPrice: 18000, rentMonthly: 90 } });
  const res = calcResults(op);
  assert.equal(res.totalSales, 3 * 15000 + 18000 + 4 * 6000);
  assert.equal(res.monthlyRentIncome, 3 * 70 + 90 + 4 * 40);
});

test("locales, parcelas y otras unidades: misma regla; una unidad sin tipología solo suma su valor propio", () => {
  const units = [
    { id: "l", type: "LOCAL", title: "Locales", numUnits: 2, salePriceTotal: 150000, rentMonthly: 1200 },
    { id: "p", type: "PARCELA", title: "Parcelas", numUnits: 3, salePriceTotal: 40000 },
  ] as REOperation["units"];
  const op = withOverrides(units, "LOCAL", { "Local 1": { estimatedPrice: 160000 } });
  const withOther = { ...op, sales: [...(op.sales ?? []), { id: "nave", title: "Nave", status: "DISPONIBLE", estimatedPrice: 90000, rentMonthly: 500, createdAt: "", updatedAt: "" }] as REOperation["sales"] };
  const res = calcResults(withOther);
  assert.equal(res.totalSales, 160000 + 150000 + 3 * 40000 + 90000);
  assert.equal(res.monthlyRentIncome, 2 * 1200 + 500);
  const s = projectSalesSummary(withOther, res, "2026-09-14");
  assert.deepEqual(s.groups.map((g) => [g.key, g.units]), [["LOCAL", 2], ["PARCELA", 3], ["OTROS", 1]]);
  assert.equal(s.planned, res.totalSales);
  // Una ficha de parcela creada a mano (sin precio) usa la base de su línea.
  const parcela = { ...withOther, sales: [...(withOther.sales ?? []), { id: "p1", title: "Parcela A", unitType: "PARCELA", status: "DISPONIBLE", createdAt: "", updatedAt: "" }] as REOperation["sales"] };
  assert.equal(calcResults(parcela).effectiveSales.p1.price, 40000);
  assert.equal(calcResults(parcela).totalSales, res.totalSales, "la ficha ocupa una parcela ya prevista");
});

test("sin medias: cada unidad toma la base de SU línea; el total es la suma exacta", () => {
  const units = [
    { id: "a", type: "VIVIENDA", title: "Tipo A", numUnits: 2, salePriceTotal: 100000 },
    { id: "b", type: "VIVIENDA", title: "Tipo B", numUnits: 1, salePriceTotal: 100001 },
  ] as REOperation["units"];
  const op = withOverrides(units, "VIVIENDA", {});
  const res = calcResults(op);
  assert.deepEqual(effectivePrices(op), [100000, 100000, 100001]);
  assert.equal(res.totalSales, 300001, "sin redondeos de media (100.000,33 × 3)");
  // Una ficha vinculada a la línea B ocupa esa unidad aunque esté la primera.
  const linked = baseOp({ units, sales: [{ id: "x", title: "Ático", unitId: "b", status: "DISPONIBLE", createdAt: "", updatedAt: "" }] as REOperation["sales"] });
  assert.equal(calcResults(linked).effectiveSales.x.price, 100001);
  assert.equal(calcResults(linked).totalSales, 300001);
  // Fichas que exceden las unidades previstas toman la base de la última línea de su tipología.
  const extra = baseOp({ units: [units[0]], sales: ["1", "2", "3"].map((k) => ({ id: k, title: `Vivienda ${k}`, unitType: "VIVIENDA", status: "DISPONIBLE", createdAt: "", updatedAt: "" })) as REOperation["sales"] });
  assert.equal(calcResults(extra).totalSales, 300000);
  assert.equal(calcResults(extra).salesByUnitType.VIVIENDA.count, 3);
});

test("KPIs de ventas: una unidad vendida sin precio real vale su precio efectivo (base), no 0", () => {
  const op = withOverrides(unitsBase({}), "VIVIENDA", { "Vivienda 2": { status: "VENDIDO", date: "2026-09-01", payments: [{ id: "p", date: "2026-09-01", amount: 30000 }] } });
  const stats = salesStats(op);
  assert.equal(stats.totalReal, 180000);
  assert.equal(stats.pendingIncome, 150000);
  assert.equal(projectSalesSummary(op, calcResults(op), "2026-09-14").pending, 150000, "misma cifra que el resumen");
});

test("WEB y APP: mismo calcResults, mismas métricas de ventas y misma lógica de cálculo", async () => {
  const { readFileSync } = await import("node:fs");
  const fn = (p: string, name: string) => {
    const text = readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const i = text.indexOf(`export function ${name}`);
    assert.ok(i >= 0, `${name} en ${p}`);
    return text.slice(i, text.indexOf("\n}\n", i));
  };
  const afterImports = (p: string) => {
    const text = readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const marker = text.indexOf('from "./realFinances"') >= 0 ? 'from "./realFinances"' : 'from "@/src/utils/realFinances"';
    return text.slice(text.indexOf("\n", text.indexOf(marker)));
  };
  assert.equal(afterImports("./projectEconomics.ts"), afterImports("../../../APP/src/utils/projectEconomics.ts"));
  assert.equal(fn("./realEstateCalc.ts", "calcResults"), fn("../../../APP/src/utils/realEstateCalc.ts", "calcResults"));
  assert.equal(fn("./realEstateTrackingCalc.ts", "salesStats"), fn("../../../APP/src/utils/realEstateTracking.ts", "salesStats"));
});

test("formato: punto de miles siempre y céntimos solo si los hay", () => {
  assert.equal(formatEs(5475), "5.475");
  assert.equal(formatEs(1666.666, 2), "1.666,67");
  assert.equal(formatEs(912.5, 2), "912,50");
  assert.equal(formatEs(185000, 2), "185.000");
  assert.equal(formatEs(-1234567), "-1.234.567");
  assert.equal(formatEs(-0.001, 2), "0");
});

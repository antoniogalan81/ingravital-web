import test from "node:test";
import assert from "node:assert/strict";
import type { REOperation } from "./realEstate.ts";
import { calcResults } from "./realEstateCalc.ts";
import {
  conceptPlannedAmount,
  missingSaleRecords,
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
    ["Vivienda 2", "DISPONIBLE", 245000, "VIVIENDA"],
    ["Vivienda 3", "DISPONIBLE", 245000, "VIVIENDA"],
    ["Vivienda 4", "DISPONIBLE", 245000, "VIVIENDA"],
  ]);
});

test("WEB y APP comparten exactamente la misma capa de cálculo", async () => {
  const { readFileSync } = await import("node:fs");
  const body = (p: string) => {
    const text = readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    return text.slice(text.indexOf("\n", text.indexOf('from "./realFinances"') >= 0 ? text.indexOf('from "./realFinances"') : text.indexOf('from "@/src/utils/realFinances"')));
  };
  assert.equal(body("./projectEconomics.ts"), body("../../../APP/src/utils/projectEconomics.ts"));
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

import test from "node:test";
import assert from "node:assert/strict";
import type { REOperation } from "./realEstate.ts";
import { calcResults } from "./realEstateCalc.ts";
import { projectUnitTypes, projectSalesSummary, saleCollected, scaleOperation } from "./projectEconomics.ts";
import { calendarMonth, commonUnitValue, editUnit, editUnitFields, editUnitsBulk, formatEsDate, monthOf, parseEsAmount, parseEsDate, projectUnitRows, yearPage, yearPageStart, type UnitRow } from "./unitEditing.ts";

const NOW = "2026-09-14T10:00:00.000Z";
const op0 = (extra: Partial<REOperation> = {}): REOperation =>
  ({
    id: "op",
    name: "Edificio",
    purchasePrice: 300000,
    units: [{ id: "v", type: "VIVIENDA", title: "Viviendas", numUnits: 6, salePriceTotal: 180000, rentMonthly: 900 }],
    costs: { purchaseTaxPct: 7, arquitectoPct: 0, tasas: [] },
    financing: { enabled: false, compra: { pct: 0, interest: 0 }, obra: { pct: 0 } },
    createdAt: "",
    updatedAt: "",
    ...extra,
  }) as REOperation;

let n = 0;
const makeId = () => `u${++n}`;
const rowsOf = (op: REOperation) => projectUnitRows(op, calcResults(op));
const row = (op: REOperation, title: string): UnitRow => rowsOf(op).find((r) => r.title === title)!;
const edit = (op: REOperation, title: string, field: Parameters<typeof editUnit>[3], value: string | number | boolean | null): REOperation => ({
  ...op,
  sales: editUnit(op, calcResults(op), row(op, title), field, value, makeId, NOW),
});

test("fechas: DD/MM/AAAA ↔ ISO sin zonas horarias; vacío borra; fecha imposible no vale", () => {
  assert.equal(formatEsDate("2027-02-15"), "15/02/2027");
  assert.equal(formatEsDate(undefined), "");
  assert.deepEqual(parseEsDate("15/02/2027"), { ok: true, iso: "2027-02-15" });
  assert.deepEqual(parseEsDate("5/2/27"), { ok: true, iso: "2027-02-05" });
  assert.deepEqual(parseEsDate("15-02-2027"), { ok: true, iso: "2027-02-15" });
  assert.deepEqual(parseEsDate("2027-02-15"), { ok: true, iso: "2027-02-15" });
  assert.deepEqual(parseEsDate("  "), { ok: true, iso: null });
  assert.equal(parseEsDate("31/02/2027").ok, false);
  assert.equal(parseEsDate("hoy").ok, false);
});

test("calendario: semanas de lunes a domingo; abre en el mes de la fecha o en el actual", () => {
  const feb = calendarMonth(2027, 1);
  assert.equal(feb.label, "febrero 2027");
  assert.equal(feb.weeks[0][0], "2027-02-01", "febrero de 2027 empieza en lunes");
  assert.equal(feb.weeks.flat().filter(Boolean).length, 28);
  const mar = calendarMonth(2026, 2);
  assert.equal(mar.weeks[0].indexOf("2026-03-01"), 6, "1 de marzo de 2026 es domingo");
  assert.deepEqual(monthOf("2027-02-15", new Date(2026, 8, 14)), { year: 2027, month: 1 });
  assert.deepEqual(monthOf(undefined, new Date(2026, 8, 14)), { year: 2026, month: 8 });
  // Selector de año: páginas de 12 años; tres años atrás sin pulsar 36 veces «mes anterior».
  assert.deepEqual(yearPage(yearPageStart(2026)), [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032]);
  assert.equal(yearPage(yearPageStart(2026) - 12)[0], 2009);
});

test("importes en formato español: miles con punto, decimales con coma; vacío borra", () => {
  assert.deepEqual(parseEsAmount("186.000"), { ok: true, value: 186000 });
  assert.deepEqual(parseEsAmount("186000"), { ok: true, value: 186000 });
  assert.deepEqual(parseEsAmount("1.234,56 €"), { ok: true, value: 1234.56 });
  assert.deepEqual(parseEsAmount("12,5"), { ok: true, value: 12.5 });
  assert.deepEqual(parseEsAmount(""), { ok: true, value: null });
  assert.equal(parseEsAmount("abc").ok, false);
});

test("filas de unidades: todas las unidades del Proyecto, sin crear nada al leer", () => {
  const op = op0();
  const before = JSON.stringify(op);
  const rows = rowsOf(op);
  assert.deepEqual(rows.map((r) => [r.title, r.virtual, r.price, r.priceOwn, r.rent, r.forRent]), [1, 2, 3, 4, 5, 6].map((i) => [`Vivienda ${i}`, true, 180000, false, 900, false]));
  assert.equal(JSON.stringify(op), before, "leer no modifica la operación");
});

test("edición directa: precio y renta propios con el ejemplo 184.000/186.000 y 950/925", () => {
  let op = op0();
  op = edit(op, "Vivienda 4", "price", 186000);
  assert.equal(op.sales!.length, 1, "editar una unidad sin ficha crea SOLO esa ficha");
  assert.deepEqual(rowsOf(op).map((r) => r.title), ["Vivienda 1", "Vivienda 2", "Vivienda 3", "Vivienda 4", "Vivienda 5", "Vivienda 6"], "sin títulos repetidos");
  op = edit(op, "Vivienda 1", "price", 184000);
  op = edit(op, "Vivienda 1", "rent", 950);
  op = edit(op, "Vivienda 3", "rent", 925);
  const res = calcResults(op);
  assert.equal(res.totalSales, 1090000);
  assert.equal(Math.round(projectUnitTypes(op, res)[0].sale.average! * 100) / 100, 181666.67);
  assert.equal(res.monthlyRentIncome, 5475);
  assert.equal(projectUnitTypes(op, res)[0].rent.average, 912.5);
  assert.equal(projectSalesSummary(op, res, NOW).planned, 1090000, "Seguimiento ve la misma cifra");
  assert.ok(op.sales!.every((s) => !("realPrice" in s)), "un solo campo de precio");
  // Borrar el precio propio vuelve a la base.
  const cleared = edit(op, "Vivienda 4", "price", null);
  assert.equal(row(cleared, "Vivienda 4").price, 180000);
  assert.equal(row(cleared, "Vivienda 4").priceOwn, false);
  assert.equal(calcResults(cleared).totalSales, 1084000);
});

test("precio de venta real antiguo (realPrice): se lee como precio de la unidad y al editar queda un solo campo", () => {
  let op = op0({ sales: [{ id: "a", title: "Vivienda 1", unitType: "VIVIENDA", status: "VENDIDO", realPrice: 190000, estimatedPrice: 185000, createdAt: "", updatedAt: "" }] as REOperation["sales"] });
  assert.equal(row(op, "Vivienda 1").price, 190000);
  assert.equal(calcResults(op).totalSales, 190000 + 5 * 180000);
  op = edit(op, "Vivienda 1", "price", 191000);
  assert.equal(op.sales![0].estimatedPrice, 191000);
  assert.equal("realPrice" in op.sales![0], false);
});

test("previsión y realidad: fechas, señal, venta, comprador y alquiler; vacíos sin \"\" ni 0", () => {
  let op = op0();
  op = edit(op, "Vivienda 2", "completionDateEstimated", "2027-02-15");
  op = edit(op, "Vivienda 2", "saleDateEstimated", "2027-04-30");
  op = edit(op, "Vivienda 2", "deposit", 6000);
  let s = op.sales![0];
  assert.equal(s.status, "SENALADO", "registrar la señal marca la unidad como señalada");
  assert.equal(saleCollected(s), 6000, "la señal cuenta como cobrado una sola vez");
  op = edit(op, "Vivienda 2", "depositDate", "2026-10-01");
  op = edit(op, "Vivienda 2", "saleDate", "2027-05-02");
  op = edit(op, "Vivienda 2", "buyer", "Laura Pérez");
  op = edit(op, "Vivienda 2", "forRent", true);
  s = op.sales![0];
  assert.deepEqual(
    { c: s.completionDateEstimated, ve: s.saleDateEstimated, d: s.deposit, dd: s.depositDate, v: s.date, st: s.status, b: s.buyer, r: s.forRent },
    { c: "2027-02-15", ve: "2027-04-30", d: 6000, dd: "2026-10-01", v: "2027-05-02", st: "VENDIDO", b: "Laura Pérez", r: true },
  );
  assert.equal(s.estimatedPrice, undefined, "activar alquiler o vender no borra ni copia el precio");
  assert.equal(projectSalesSummary(op, calcResults(op), NOW).groups[0].rows[0].soldAmount, 180000);
  for (const [field, value] of [["buyer", ""], ["deposit", null], ["depositDate", ""], ["forRent", false], ["completionDateEstimated", null]] as const) op = edit(op, "Vivienda 2", field, value);
  s = op.sales![0];
  for (const k of ["buyer", "deposit", "depositDate", "forRent", "completionDateEstimated"]) assert.equal(k in s, false, `${k} se borra, no se guarda vacío`);
  assert.equal(s.updatedAt, NOW);
});

test("editor completo: varios campos a la vez crean UNA ficha y el estado elegido manda", () => {
  const op = op0();
  const sales = editUnitFields(op, calcResults(op), row(op, "Vivienda 5"), { status: "RESERVADO", price: 183000, deposit: 3000, buyer: "Ana", saleDateEstimated: "2027-06-01", forRent: false }, makeId, NOW);
  assert.equal(sales.length, 1);
  assert.deepEqual({ t: sales[0].title, st: sales[0].status, p: sales[0].estimatedPrice, d: sales[0].deposit, b: sales[0].buyer, v: sales[0].saleDateEstimated, r: "forRent" in sales[0] }, { t: "Vivienda 5", st: "RESERVADO", p: 183000, d: 3000, b: "Ana", v: "2027-06-01", r: false });
  const op2 = { ...op, sales };
  const again = editUnitFields(op2, calcResults(op2), row(op2, "Vivienda 5"), { price: null, buyer: "" }, makeId, NOW);
  assert.equal(again.length, 1);
  assert.equal("estimatedPrice" in again[0] || "buyer" in again[0], false);
});

test("destino venta/alquiler: todo OFF es la comparativa; con alguna ON cada unidad cuenta en un solo flujo", () => {
  let op = op0();
  let res = calcResults(op);
  assert.deepEqual([res.rentSplit, res.totalSales, res.monthlyRentIncome], [false, 1080000, 5400], "todo OFF: vender todo / alquilar todo, como hasta ahora");

  op = edit(op, "Vivienda 1", "forRent", true);
  op = edit(op, "Vivienda 2", "forRent", true);
  res = calcResults(op);
  assert.equal(res.rentSplit, true);
  assert.equal(res.totalSales, 720000, "4 × 180.000");
  assert.equal(res.monthlyRentIncome, 1800, "2 × 900");
  assert.equal(res.monthlyRentIncome * 12, 21600);
  assert.equal(res.saleBenefit, 720000 - res.totalInvestment);
  let t = projectUnitTypes(op, res)[0];
  assert.deepEqual([t.units, t.saleUnits, t.rentUnits, t.sale.average, t.rent.average], [6, 4, 2, 180000, 900]);

  // Valores propios: una vivienda de venta a 184.000 y una de alquiler a 950.
  op = edit(op, "Vivienda 3", "price", 184000);
  op = edit(op, "Vivienda 1", "rent", 950);
  res = calcResults(op);
  assert.equal(res.totalSales, 724000, "184.000 + 3 × 180.000");
  assert.equal(res.monthlyRentIncome, 1850, "950 + 900");
  assert.equal(res.monthlyRentIncome * 12, 22200);
  t = projectUnitTypes(op, res)[0];
  assert.equal(t.sale.average, 181000, "media solo sobre las 4 de venta");
  assert.equal(t.rent.average, 925, "media solo sobre las 2 de alquiler");
  const summary = projectSalesSummary(op, res, NOW);
  assert.deepEqual([summary.units, summary.planned], [6, 724000], "Seguimiento e Inversores: 6 unidades, venta actual sin las de alquiler");

  // Los precios de las de alquiler no se borran: al volver a OFF vuelven a la venta.
  const v1 = op.sales!.find((s) => s.title === "Vivienda 1")!;
  op = { ...op, sales: op.sales!.map((s) => (s.id === v1.id ? { ...s, estimatedPrice: 190000 } : s)) };
  assert.equal(calcResults(op).totalSales, 724000, "precio guardado de una unidad de alquiler no cuenta");
  op = edit(op, "Vivienda 1", "forRent", false);
  op = edit(op, "Vivienda 2", "forRent", false);
  res = calcResults(op);
  assert.equal(res.rentSplit, false);
  assert.equal(res.totalSales, 190000 + 184000 + 4 * 180000, "todo OFF: vuelve la comparativa con todos los precios");
  assert.equal(res.monthlyRentIncome, 950 + 5 * 900);
  assert.equal(op.sales!.find((s) => s.id === v1.id)!.rentMonthly, 950, "la renta propia sigue guardada");
});

test("destino: una unidad VENDIDA cuenta como venta aunque tenga la marca de alquiler; la señal no cambia el destino", () => {
  let op = op0({ sales: [{ id: "s", title: "Vivienda 1", unitType: "VIVIENDA", status: "VENDIDO", forRent: true, createdAt: "", updatedAt: "" }] as REOperation["sales"] });
  let res = calcResults(op);
  assert.deepEqual([res.rentSplit, res.totalSales, res.monthlyRentIncome], [false, 1080000, 5400], "vendida + marca antigua: no activa el reparto");
  op = edit(op, "Vivienda 2", "forRent", true);
  op = edit(op, "Vivienda 2", "deposit", 3000);
  assert.equal(row(op, "Vivienda 2").forRent, true, "registrar la señal no quita el destino");
  res = calcResults(op);
  assert.deepEqual([res.totalSales, res.monthlyRentIncome], [5 * 180000, 900]);
});

test("destino en garajes, locales y parcelas; los escenarios escalan cada flujo solo en sus unidades", () => {
  const op = op0({
    units: [
      { id: "g", type: "GARAJE", title: "Garajes", m2Unit: 50, m2PerPlaza: 12.5, salePriceTotal: 15000, rentMonthly: 80 },
      { id: "l", type: "LOCAL", title: "Locales", numUnits: 2, salePriceTotal: 100000, rentMonthly: 600 },
      { id: "p", type: "PARCELA", title: "Parcelas", numUnits: 1, salePriceTotal: 50000, rentMonthly: 0 },
    ] as REOperation["units"],
  });
  let cur = op;
  cur = edit(cur, "Garaje 1", "forRent", true);
  cur = edit(cur, "Local 2", "forRent", true);
  const res = calcResults(cur);
  assert.equal(res.totalSales, 3 * 15000 + 100000 + 50000);
  assert.equal(res.monthlyRentIncome, 80 + 600);
  assert.deepEqual(projectUnitTypes(cur, res).map((t) => [t.key, t.saleUnits, t.rentUnits]), [["GARAJE", 3, 1], ["LOCAL", 1, 1], ["PARCELA", 1, 0]]);
  const scaled = calcResults(scaleOperation(cur, { sale: 1.1, rent: 0.5 }));
  assert.equal(Math.round(scaled.totalSales), Math.round(1.1 * res.totalSales));
  assert.equal(scaled.monthlyRentIncome, 0.5 * res.monthlyRentIncome);
});

test("selección múltiple: solo cambian los campos tocados y la edición individual posterior manda", () => {
  let op = op0();
  const bulk = (o: REOperation, titles: string[] | "all", patch: Parameters<typeof editUnitsBulk>[3]): REOperation => {
    const rows = rowsOf(o).filter((r) => titles === "all" || titles.includes(r.title));
    return { ...o, sales: editUnitsBulk(o, calcResults(o), rows, patch, makeId, NOW) };
  };
  op = edit(op, "Vivienda 2", "buyer", "Previo");
  op = bulk(op, "all", { completionDateEstimated: "2027-06-30" });
  assert.equal(op.sales!.length, 6, "las 5 unidades sin ficha la crean; la que ya tenía se reutiliza");
  assert.deepEqual(rowsOf(op).map((r) => r.completionDateEstimated), Array(6).fill("2027-06-30"));
  assert.equal(row(op, "Vivienda 2").buyer, "Previo", "el resto de campos no se toca");
  assert.ok(rowsOf(op).every((r) => r.status === "DISPONIBLE" && !r.priceOwn && !r.rentOwn));

  op = edit(op, "Vivienda 4", "completionDateEstimated", "2027-05-15");
  assert.deepEqual(rowsOf(op).map((r) => r.completionDateEstimated), ["2027-06-30", "2027-06-30", "2027-06-30", "2027-05-15", "2027-06-30", "2027-06-30"]);

  op = bulk(op, ["Vivienda 1", "Vivienda 2", "Vivienda 3"], { price: 185000 });
  assert.deepEqual(rowsOf(op).map((r) => [r.price, r.priceOwn]), [[185000, true], [185000, true], [185000, true], [180000, false], [180000, false], [180000, false]]);
  assert.equal(op.units[0].salePriceTotal, 180000, "editar seleccionadas no cambia la base de la tipología");
  assert.equal(calcResults(op).totalSales, 3 * 185000 + 3 * 180000);

  op = bulk(op, ["Vivienda 1", "Vivienda 2", "Vivienda 3"], { forRent: true });
  const res = calcResults(op);
  assert.deepEqual([res.rentSplit, res.totalSales, res.monthlyRentIncome], [true, 3 * 180000, 3 * 900], "destino en lote: esas tres pasan a alquiler, recalculado");
  assert.deepEqual(editUnitsBulk(op, res, rowsOf(op), {}, makeId, NOW), op.sales, "sin campos tocados no cambia nada");
});

test("selección múltiple: valores diferentes no eligen ninguno; solo lo escrito se aplica a todas", () => {
  let op = op0();
  op = edit(op, "Vivienda 1", "buyer", "A");
  op = edit(op, "Vivienda 2", "buyer", "B");
  const sel = () => rowsOf(op).filter((r) => r.title === "Vivienda 1" || r.title === "Vivienda 2");
  assert.deepEqual(commonUnitValue(sel(), "buyer"), { mixed: true, value: null });
  assert.deepEqual(commonUnitValue(sel(), "price"), { mixed: false, value: 180000 });
  assert.deepEqual(commonUnitValue(sel(), "completionDateEstimated"), { mixed: false, value: null });
  const before = JSON.stringify(op.sales);
  assert.equal(JSON.stringify(editUnitsBulk(op, calcResults(op), sel(), {}, makeId, NOW)), before, "sin tocar el campo, nada cambia");
  op = { ...op, sales: editUnitsBulk(op, calcResults(op), sel(), { buyer: "C" }, makeId, NOW) };
  assert.deepEqual(sel().map((r) => r.buyer), ["C", "C"]);
});

test("cobrado: señal + cobros; un cobrado antiguo sin detalle se respeta", () => {
  assert.equal(saleCollected({ deposit: 100, payments: [{ id: "p", date: "2026-01-01", amount: 50 }] }), 150);
  assert.equal(saleCollected({ deposit: 100, collected: 500 }), 500);
  assert.equal(saleCollected({ deposit: 100 }), 100);
});

test("WEB y APP comparten exactamente el mismo módulo de edición de unidades", async () => {
  const { readFileSync } = await import("node:fs");
  const body = (p: string) => {
    const text = readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    return text.slice(text.indexOf("// ── Cuerpo compartido"));
  };
  assert.equal(body("./unitEditing.ts"), body("../../../APP/src/utils/unitEditing.ts"));
});

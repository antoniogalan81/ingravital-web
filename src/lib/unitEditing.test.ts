import test from "node:test";
import assert from "node:assert/strict";
import type { REOperation } from "./realEstate.ts";
import { calcResults } from "./realEstateCalc.ts";
import { displaySaleStatus, projectUnitTypes, projectSalesSummary, saleCollected, scaleOperation } from "./projectEconomics.ts";
import { salesStats } from "./realEstateTrackingCalc.ts";
import { buildUnitPatch, calendarMonth, commonUnitValue, editUnit, editUnitFields, editUnitsBulk, formatEsDate, monthOf, parseEsAmount, parseEsDate, projectUnitRows, yearPage, yearPageStart, type UnitRow } from "./unitEditing.ts";

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
  assert.deepEqual(rows.map((r) => [r.title, r.virtual, r.status, r.price, r.priceOwn, r.rent]), [1, 2, 3, 4, 5, 6].map((i) => [`Vivienda ${i}`, true, "DISPONIBLE", 180000, false, 900]));
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

test("ficha mínima: previsión, señal y cierre; vacíos sin \"\" ni 0; datos antiguos ocultos se conservan", () => {
  let op = op0({ sales: [{ id: "old", title: "Vivienda 2", unitType: "VIVIENDA", status: "DISPONIBLE", buyer: "Laura", depositDateEstimated: "2026-01-01", notes: "nota", createdAt: "", updatedAt: "" }] as REOperation["sales"] });
  op = edit(op, "Vivienda 2", "completionDateEstimated", "2027-02-15");
  op = edit(op, "Vivienda 2", "saleDateEstimated", "2027-04-30");
  let s = op.sales![0];
  assert.deepEqual({ c: s.completionDateEstimated, v: s.saleDateEstimated }, { c: "2027-02-15", v: "2027-04-30" });
  assert.deepEqual({ b: s.buyer, d: s.depositDateEstimated, n: s.notes }, { b: "Laura", d: "2026-01-01", n: "nota" }, "lo que ya no se muestra no se borra");
  op = edit(op, "Vivienda 2", "title", "Ático A");
  assert.equal(op.sales![0].title, "Ático A");
  op = edit(op, "Ático A", "title", "   ");
  assert.equal(op.sales![0].title, "Ático A", "el nombre nunca se queda vacío");
  op = edit(op, "Ático A", "completionDateEstimated", null);
  s = op.sales![0];
  assert.equal("completionDateEstimated" in s, false);
  assert.equal(s.updatedAt, NOW);
});

test("señal: el importe sin fecha no cuenta como cobrado ni cambia el estado; con fecha, sí (38)", () => {
  let op = op0();
  op = edit(op, "Vivienda 1", "deposit", 10000);
  const collected = () => projectSalesSummary(op, calcResults(op), NOW).collected;
  assert.deepEqual([row(op, "Vivienda 1").deposit, row(op, "Vivienda 1").status, collected(), salesStats(op).collected], [10000, "DISPONIBLE", 0, 0]);
  op = edit(op, "Vivienda 1", "depositDate", "2026-10-15");
  assert.deepEqual([row(op, "Vivienda 1").status, collected(), salesStats(op).collected], ["SENALADO", 10000, 10000]);
  op = edit(op, "Vivienda 1", "depositDate", null);
  assert.deepEqual([row(op, "Vivienda 1").deposit, row(op, "Vivienda 1").status, collected(), salesStats(op).collected], [10000, "DISPONIBLE", 0, 0], "sin fecha el importe se queda pero deja de contar y deja de estar señalada");
  assert.equal(saleCollected({ deposit: 100, depositDate: "2026-01-01", payments: [{ id: "p", date: "2026-01-02", amount: 50 }] }), 150);
  assert.equal(saleCollected({ deposit: 100, payments: [{ id: "p", date: "2026-01-02", amount: 50 }] }), 50);
  assert.equal(saleCollected({ deposit: 100, collected: 500 }), 500, "un cobrado antiguo sin detalle se respeta");
  // Una unidad vendida o alquilada no vuelve a Señalado por registrar la fecha de la señal.
  op = { ...op, sales: editUnitFields(op, calcResults(op), row(op, "Vivienda 2"), { status: "VENDIDO", saleDate: "2026-11-20" }, makeId, NOW) };
  op = edit(op, "Vivienda 2", "depositDate", "2026-10-01");
  assert.equal(row(op, "Vivienda 2").status, "VENDIDO");
});

test("vendido: precio y fecha; el precio es el único precio de la unidad y todo recalcula (39)", () => {
  let op = op0();
  const form = buildUnitPatch([row(op, "Vivienda 3")], { status: "VENDIDO", price: "185.000", saleDate: "2026-11-20" });
  assert.ok(form.ok);
  op = { ...op, sales: editUnitFields(op, calcResults(op), row(op, "Vivienda 3"), form.patch, makeId, NOW) };
  const r = row(op, "Vivienda 3");
  assert.deepEqual([r.status, r.price, r.priceOwn, r.saleDate], ["VENDIDO", 185000, true, "2026-11-20"]);
  assert.ok(op.sales!.every((s) => !("realPrice" in s)));
  const res = calcResults(op);
  assert.equal(res.totalSales, 185000 + 5 * 180000, "Proyecto");
  assert.equal(projectSalesSummary(op, res, NOW).soldAmount, 185000, "Seguimiento e Inversores");
  assert.deepEqual([salesStats(op).soldCount, salesStats(op).totalReal], [1, 185000]);
  // Faltan datos: se dice qué falta y no se aplica.
  const missing = buildUnitPatch([row(op0(), "Vivienda 1")], { status: "VENDIDO" });
  assert.deepEqual(missing, { ok: false, errors: { saleDate: "Indica la fecha de venta." } }, "el precio base cuenta; la fecha falta");
  // Al cerrar heredando la base, el precio queda fijado (no cambia si luego cambia la base).
  let base = op0();
  base = { ...base, sales: editUnitFields(base, calcResults(base), row(base, "Vivienda 1"), { status: "VENDIDO", saleDate: "2026-12-01" }, makeId, NOW) };
  assert.equal(base.sales![0].estimatedPrice, 180000);
});

test("alquilado: renta y fecha de alquiler; activa el reparto sin contar la unidad dos veces (40)", () => {
  let op = op0();
  assert.deepEqual([calcResults(op).rentSplit, calcResults(op).totalSales, calcResults(op).monthlyRentIncome], [false, 1080000, 5400], "sin alquiladas: comparativa");
  const form = buildUnitPatch([row(op, "Vivienda 1")], { status: "ALQUILADO", rent: "950", rentDate: "2026-12-01" });
  assert.ok(form.ok);
  op = { ...op, sales: editUnitFields(op, calcResults(op), row(op, "Vivienda 1"), form.patch, makeId, NOW) };
  const r = row(op, "Vivienda 1");
  assert.deepEqual([r.status, r.rent, r.rentOwn, r.rentDate, r.saleDate], ["ALQUILADO", 950, true, "2026-12-01", undefined]);
  const res = calcResults(op);
  assert.deepEqual([res.rentSplit, res.totalSales, res.monthlyRentIncome], [true, 5 * 180000, 950]);
  assert.deepEqual([salesStats(op).rentedCount, projectSalesSummary(op, res, NOW).rented], [1, 1]);
  assert.deepEqual(buildUnitPatch([row(op0(), "Vivienda 2")], { status: "ALQUILADO", rent: "" }), { ok: false, errors: { rent: "Indica la renta mensual.", rentDate: "Indica la fecha de alquiler." } });
  // Marca antigua forRent: se sigue leyendo; al elegir un estado, el estado manda.
  let legacy = op0({ sales: [{ id: "f", title: "Vivienda 4", unitType: "VIVIENDA", status: "DISPONIBLE", forRent: true, createdAt: "", updatedAt: "" }] as REOperation["sales"] });
  assert.deepEqual([calcResults(legacy).rentSplit, calcResults(legacy).monthlyRentIncome], [true, 900]);
  legacy = edit(legacy, "Vivienda 4", "status", "EN_NEGOCIACION");
  assert.equal("forRent" in legacy.sales![0], false);
  assert.deepEqual([calcResults(legacy).rentSplit, calcResults(legacy).totalSales], [false, 1080000]);
});

test("estados: Reservado y Apalabrado antiguos se ven como En negociación sin reescribirse", () => {
  const op = op0({ sales: [{ id: "r", title: "Vivienda 1", unitType: "VIVIENDA", status: "RESERVADO", createdAt: "", updatedAt: "" }, { id: "a", title: "Vivienda 2", unitType: "VIVIENDA", status: "APALABRADO", createdAt: "", updatedAt: "" }] as REOperation["sales"] });
  const before = JSON.stringify(op);
  assert.deepEqual([row(op, "Vivienda 1").status, row(op, "Vivienda 2").status], ["EN_NEGOCIACION", "EN_NEGOCIACION"]);
  assert.deepEqual(commonUnitValue([row(op, "Vivienda 1"), row(op, "Vivienda 2")], "status"), { mixed: false, value: "EN_NEGOCIACION" });
  assert.equal(JSON.stringify(op), before, "leer no escribe");
  assert.deepEqual([displaySaleStatus("RESERVADO"), displaySaleStatus("VENDIDO"), displaySaleStatus(undefined)], ["EN_NEGOCIACION", "VENDIDO", "DISPONIBLE"]);
});

test("resumen de unidades: cuenta TODAS las unidades del Proyecto aunque no tengan ficha (37)", () => {
  let op = op0({ units: [{ id: "v", type: "VIVIENDA", title: "Viviendas", numUnits: 6, salePriceTotal: 180000, rentMonthly: 900 }, { id: "g", type: "GARAJE", title: "Garajes", m2Unit: 50, m2PerPlaza: 12.5, salePriceTotal: 15000 }] as REOperation["units"] });
  assert.deepEqual([salesStats(op).count, salesStats(op).soldCount, salesStats(op).byStatus.DISPONIBLE, salesStats(op).hasData], [10, 0, 10, true], "sin crear fichas");
  op = { ...op, sales: editUnitFields(op, calcResults(op), row(op, "Vivienda 1"), { status: "VENDIDO", saleDate: "2026-11-20" }, makeId, NOW) };
  const st = salesStats(op);
  assert.deepEqual([st.count, st.soldCount, st.soldPct, st.byStatus.VENDIDO, st.byStatus.DISPONIBLE], [10, 1, 0.1, 1, 9]);
  assert.equal(op.sales!.length, 1, "contar no crea registros");
});

test("edición de varias unidades: mismos campos; solo lo tocado; valores diferentes; el nombre no se copia (41)", () => {
  let op = op0();
  const bulk = (o: REOperation, titles: string[] | "all", draft: Parameters<typeof buildUnitPatch>[1]): REOperation => {
    const rows = rowsOf(o).filter((r) => titles === "all" || titles.includes(r.title));
    const form = buildUnitPatch(rows, draft);
    assert.ok(form.ok, JSON.stringify(form));
    return { ...o, sales: editUnitsBulk(o, calcResults(o), rows, form.patch, makeId, NOW) };
  };
  op = bulk(op, "all", { completionDateEstimated: "2027-06-30" });
  assert.deepEqual(rowsOf(op).map((r) => r.completionDateEstimated), Array(6).fill("2027-06-30"));
  assert.ok(rowsOf(op).every((r) => r.status === "DISPONIBLE" && !r.priceOwn && !r.rentOwn));
  op = edit(op, "Vivienda 4", "completionDateEstimated", "2027-05-15");
  assert.deepEqual(rowsOf(op).map((r) => r.completionDateEstimated), ["2027-06-30", "2027-06-30", "2027-06-30", "2027-05-15", "2027-06-30", "2027-06-30"]);
  op = bulk(op, ["Vivienda 1", "Vivienda 2", "Vivienda 3"], { price: "185.000" });
  assert.deepEqual(rowsOf(op).map((r) => [r.price, r.priceOwn]), [[185000, true], [185000, true], [185000, true], [180000, false], [180000, false], [180000, false]]);
  assert.equal(op.units[0].salePriceTotal, 180000, "no cambia la base de la tipología");

  // Precios distintos: «Valores diferentes»; vender con fecha común sin tocar el precio conserva cada uno.
  op = edit(op, "Vivienda 2", "price", 190000);
  const three = () => rowsOf(op).filter((r) => ["Vivienda 1", "Vivienda 2", "Vivienda 3"].includes(r.title));
  assert.deepEqual(commonUnitValue(three(), "price"), { mixed: true, value: null });
  op = bulk(op, ["Vivienda 1", "Vivienda 2", "Vivienda 3"], { status: "VENDIDO", saleDate: "2027-12-15" });
  assert.deepEqual(three().map((r) => [r.status, r.price, r.saleDate]), [["VENDIDO", 185000, "2027-12-15"], ["VENDIDO", 190000, "2027-12-15"], ["VENDIDO", 185000, "2027-12-15"]]);
  assert.deepEqual(rowsOf(op).slice(3).map((r) => r.status), ["DISPONIBLE", "DISPONIBLE", "DISPONIBLE"]);

  // Vender varias sin fecha: dice en cuáles falta.
  const noDate = buildUnitPatch(rowsOf(op).filter((r) => ["Vivienda 4", "Vivienda 5"].includes(r.title)), { status: "VENDIDO" });
  assert.deepEqual(noDate, { ok: false, errors: { saleDate: "Indica la fecha de venta. Falta en: Vivienda 4, Vivienda 5." } });

  // El nombre no se aplica a varias; sin campos tocados no cambia nada.
  const two = rowsOf(op).filter((r) => ["Vivienda 5", "Vivienda 6"].includes(r.title));
  const named = buildUnitPatch(two, { title: "Igual" });
  assert.deepEqual(named, { ok: true, patch: {} });
  assert.deepEqual(editUnitsBulk(op, calcResults(op), two, { title: "Igual" }, makeId, NOW), op.sales);
  assert.deepEqual(buildUnitPatch([row(op, "Vivienda 5")], { price: "abc", title: "" }), { ok: false, errors: { price: "Importe no válido.", title: "Escribe un nombre." } });
});

test("reparto con alquiladas en garajes, locales y parcelas; los escenarios escalan cada flujo en sus unidades", () => {
  let cur = op0({
    units: [
      { id: "g", type: "GARAJE", title: "Garajes", m2Unit: 50, m2PerPlaza: 12.5, salePriceTotal: 15000, rentMonthly: 80 },
      { id: "l", type: "LOCAL", title: "Locales", numUnits: 2, salePriceTotal: 100000, rentMonthly: 600 },
      { id: "p", type: "PARCELA", title: "Parcelas", numUnits: 1, salePriceTotal: 50000, rentMonthly: 0 },
    ] as REOperation["units"],
  });
  for (const t of ["Garaje 1", "Local 2"]) cur = { ...cur, sales: editUnitFields(cur, calcResults(cur), row(cur, t), { status: "ALQUILADO", rentDate: "2026-12-01" }, makeId, NOW) };
  const res = calcResults(cur);
  assert.equal(res.totalSales, 3 * 15000 + 100000 + 50000);
  assert.equal(res.monthlyRentIncome, 80 + 600);
  assert.deepEqual(projectUnitTypes(cur, res).map((t) => [t.key, t.saleUnits, t.rentUnits]), [["GARAJE", 3, 1], ["LOCAL", 1, 1], ["PARCELA", 1, 0]]);
  const scaled = calcResults(scaleOperation(cur, { sale: 1.1, rent: 0.5 }));
  assert.equal(Math.round(scaled.totalSales), Math.round(1.1 * res.totalSales));
  assert.equal(scaled.monthlyRentIncome, 0.5 * res.monthlyRentIncome);
});

test("WEB y APP comparten exactamente el mismo módulo de edición de unidades", async () => {
  const { readFileSync } = await import("node:fs");
  const body = (p: string) => {
    const text = readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    return text.slice(text.indexOf("// ── Cuerpo compartido"));
  };
  assert.equal(body("./unitEditing.ts"), body("../../../APP/src/utils/unitEditing.ts"));
});

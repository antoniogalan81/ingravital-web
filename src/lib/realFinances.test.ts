// Tests puros de FINANZAS REALES (enlaces de Drive + agregados).
// Ejecutar con:  node --test src/lib/realFinances.test.ts   (Node 22.7+/24, TS nativo)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adoptLegacyRealAmounts,
  budgetLineReal,
  driveFileUrl,
  driveFolderUrl,
  effectiveRealExpenses,
  isRealFinancesEnabled,
  parseAmountEs,
  parseDriveLink,
  realExpenseTotals,
  realLoanTotals,
  realVsPlanned,
} from "./realFinances.ts";
import type { REOperation } from "./realEstate.ts";
import type { REExpense, RERealExpense, RERealLoan } from "./realEstateTracking.ts";

const FOLDER_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz";
const FILE_ID = "1ZyXwVuTsRqPoNmLkJiHgFeDcBa";

test("reconoce enlaces de carpeta de Drive (con y sin /u/0, con ?usp)", () => {
  for (const url of [
    `https://drive.google.com/drive/folders/${FOLDER_ID}`,
    `https://drive.google.com/drive/folders/${FOLDER_ID}?usp=sharing`,
    `https://drive.google.com/drive/u/0/folders/${FOLDER_ID}`,
    `drive.google.com/drive/folders/${FOLDER_ID}`,
    `  https://drive.google.com/drive/folders/${FOLDER_ID}  `,
  ]) {
    const p = parseDriveLink(url);
    assert.equal(p?.kind, "folder", url);
    assert.equal(p?.id, FOLDER_ID);
    assert.ok(driveFolderUrl(url)?.startsWith("https://drive.google.com/"));
    assert.equal(driveFileUrl(url), null, "una carpeta no vale como documento");
  }
});

test("reconoce enlaces de archivo de Drive y Docs", () => {
  for (const url of [
    `https://drive.google.com/file/d/${FILE_ID}/view?usp=sharing`,
    `https://docs.google.com/document/d/${FILE_ID}/edit`,
    `https://docs.google.com/spreadsheets/d/${FILE_ID}/edit#gid=0`,
  ]) {
    assert.equal(parseDriveLink(url)?.kind, "file", url);
    assert.equal(parseDriveLink(url)?.id, FILE_ID);
    assert.ok(driveFileUrl(url));
    assert.equal(driveFolderUrl(url), null, "un archivo no vale como carpeta");
  }
});

test("open?id= se acepta como carpeta o archivo", () => {
  const url = `https://drive.google.com/open?id=${FILE_ID}`;
  assert.equal(parseDriveLink(url)?.kind, "unknown");
  assert.ok(driveFolderUrl(url));
  assert.ok(driveFileUrl(url));
});

test("rechaza lo que no es Drive, sin id o con esquema peligroso", () => {
  for (const bad of [
    "",
    "Factura junio.pdf",
    "https://dropbox.com/folders/abc",
    `https://drive.google.com.evil.com/drive/folders/${FOLDER_ID}`,
    "https://drive.google.com/drive/my-drive",
    "https://drive.google.com/drive/folders/abc",
    "javascript:alert(1)",
    `ftp://drive.google.com/drive/folders/${FOLDER_ID}`,
  ]) {
    assert.equal(parseDriveLink(bad), null, bad);
  }
});

const exp = (p: Partial<RERealExpense>): RERealExpense => ({
  id: Math.random().toString(36),
  concept: "x",
  amount: 0,
  date: "2026-01-01",
  createdAt: "",
  updatedAt: "",
  ...p,
});
const loan = (p: Partial<RERealLoan>): RERealLoan => ({
  id: Math.random().toString(36),
  name: "x",
  principal: 0,
  status: "ACTIVO",
  createdAt: "",
  updatedAt: "",
  ...p,
});

test("operación antigua sin finanzas reales → vacío, sin inventar", () => {
  const op = {} as REOperation;
  assert.deepEqual(realExpenseTotals(op), { count: 0, total: 0, withoutDocument: 0, lastDate: null });
  const l = realLoanTotals(op);
  assert.equal(l.count, 0);
  assert.equal(l.monthlyInstallments, null);
  const r = realVsPlanned(op, { totalInvestment: 100_000 });
  assert.equal(r.hasData, false);
  assert.equal(r.spentOfPlannedPct, null);
});

test("gastos: suma, cuenta los que no tienen documento y la última fecha", () => {
  const op = {
    realExpenses: [
      exp({ amount: 4850, date: "2026-06-10", documentName: "Factura fontanería junio.pdf" }), // nombre sin enlace
      exp({ amount: 150.5, date: "2026-07-01", documentUrl: `https://drive.google.com/file/d/${FILE_ID}/view` }),
    ],
  } as REOperation;
  const t = realExpenseTotals(op);
  assert.equal(t.total, 5000.5);
  assert.equal(t.withoutDocument, 1);
  assert.equal(t.lastDate, "2026-07-01");
  assert.equal(realVsPlanned(op, { totalInvestment: 10_001 }).spentOfPlannedPct, 0.5);
  assert.equal(realVsPlanned(op, { totalInvestment: 0 }).spentOfPlannedPct, null);
});

test("préstamos: financiado total, pendiente solo si todos los activos lo informan, cuota mensualizada", () => {
  const op = {
    realLoans: [
      loan({ principal: 200_000, outstanding: 150_000, installment: 900 }),
      loan({ principal: 60_000, outstanding: 50_000, installment: 1500, periodicity: "TRIMESTRAL" }),
      loan({ principal: 10_000, status: "AMORTIZADO", installment: 400 }),
    ],
  } as REOperation;
  const t = realLoanTotals(op);
  assert.equal(t.count, 3);
  assert.equal(t.activeCount, 2);
  assert.equal(t.financed, 270_000);
  assert.equal(t.outstanding, 200_000, "el amortizado no suma pendiente ni exige dato");
  assert.equal(t.monthlyInstallments, 900 + 500, "la trimestral se reparte en 3 meses; la amortizada no cuenta");

  const incompleto = { realLoans: [loan({ principal: 1, outstanding: 1 }), loan({ principal: 1 })] } as REOperation;
  assert.equal(realLoanTotals(incompleto).outstanding, null, "sin dato en un activo → no calculable");
});

test("importes en formato español, sin inventar ceros", () => {
  assert.equal(parseAmountEs("4.850"), 4850);
  assert.equal(parseAmountEs("4.850 €"), 4850);
  assert.equal(parseAmountEs("4850,50"), 4850.5);
  assert.equal(parseAmountEs("1.234.567,89"), 1234567.89);
  assert.equal(parseAmountEs("4850.50"), 4850.5);
  assert.equal(parseAmountEs("3,5"), 3.5);
  assert.equal(parseAmountEs(""), undefined);
  assert.equal(parseAmountEs("abc"), undefined);
  assert.equal(parseAmountEs("12,3,4"), undefined);
});

const line = (p: Partial<REExpense> & { id: string }): REExpense => ({
  category: "OBRA",
  concept: "Fontanería",
  status: "PENDIENTE",
  createdAt: "2026-02-01T10:00:00.000Z",
  updatedAt: "2026-02-01T10:00:00.000Z",
  ...p,
});

test("Real de una partida = suma de sus gastos reales vinculados", () => {
  const rows = [exp({ amount: 1000, budgetLineId: "l1" }), exp({ amount: 250.5, budgetLineId: "l1" }), exp({ amount: 99 })];
  assert.equal(budgetLineReal(rows, "l1"), 1250.5);
  assert.equal(budgetLineReal(rows, "l2"), undefined, "sin gastos vinculados no hay Real (no un 0)");
});

test("importe real legado: cuenta como gasto real y se convierte una sola vez con id determinista", () => {
  const op = {
    expenses: [line({ id: "l1", estimated: 5000, real: 4850, date: "2026-06-10" }), line({ id: "l2", estimated: 100 })],
    realExpenses: [exp({ id: "r1", amount: 300 })],
  } as REOperation;

  const eff = effectiveRealExpenses(op);
  assert.equal(eff.length, 2);
  const legacy = eff.find((e) => e.id === "rexp_legacy_l1");
  assert.deepEqual([legacy?.amount, legacy?.budgetLineId, legacy?.date, legacy?.concept, legacy?.category], [4850, "l1", "2026-06-10", "Fontanería", "OBRA"]);
  assert.equal(realExpenseTotals(op).total, 5150, "los totales ya ven el dato legado antes de convertirlo");

  const patch = adoptLegacyRealAmounts(op);
  assert.ok(patch);
  assert.equal(patch.expenses?.some((l) => "real" in l), false, "la partida deja de guardar real");
  assert.equal(patch.expenses?.[0].estimated, 5000, "el resto de la partida no se toca");
  const migrated = { ...op, ...patch } as REOperation;
  assert.equal(adoptLegacyRealAmounts(migrated), null, "idempotente");
  assert.equal(realExpenseTotals(migrated).total, 5150, "sin perder ni duplicar importes");

  // Otro dispositivo convierte lo mismo → mismo id → la fusión por id no duplica.
  assert.equal(adoptLegacyRealAmounts(op)?.realExpenses?.find((e) => e.id === "rexp_legacy_l1")?.id, "rexp_legacy_l1");
});

test("una versión antigua que vuelve a escribir real actualiza el gasto convertido, sin duplicarlo", () => {
  const op = {
    expenses: [line({ id: "l1", real: 5100 })],
    realExpenses: [exp({ id: "rexp_legacy_l1", amount: 4850, budgetLineId: "l1", concept: "Fontanería (editado)" })],
  } as REOperation;
  const eff = effectiveRealExpenses(op);
  assert.equal(eff.length, 1);
  assert.equal(eff[0].amount, 5100);
  assert.equal(eff[0].concept, "Fontanería (editado)", "conserva lo editado en Finanzas reales");
});

test("real vacío o 0 en una partida antigua no crea gastos, pero se limpia", () => {
  const op = { expenses: [line({ id: "l1", real: 0 }), line({ id: "l2", real: undefined })] } as REOperation;
  assert.equal(effectiveRealExpenses(op).length, 0);
  const patch = adoptLegacyRealAmounts(op);
  assert.deepEqual(patch?.realExpenses, []);
  assert.equal(patch?.expenses?.some((l) => "real" in l), false);
});

test("interruptor Registrar finanzas reales: manda lo guardado; si no, activo solo con datos", () => {
  assert.equal(isRealFinancesEnabled({} as REOperation), false, "operación sin datos → desactivado");
  assert.equal(isRealFinancesEnabled({ realLoans: [loan({})] } as REOperation), true);
  assert.equal(isRealFinancesEnabled({ invoicesDriveFolder: { url: "x", linkedAt: "" } } as REOperation), true);
  assert.equal(isRealFinancesEnabled({ expenses: [line({ id: "l1", real: 10 })] } as REOperation), true, "real antiguo cuenta como dato");
  assert.equal(isRealFinancesEnabled({ realFinancesEnabled: false, realExpenses: [exp({ amount: 5 })] } as REOperation), false);
  assert.equal(isRealFinancesEnabled({ realFinancesEnabled: true } as REOperation), true);
});

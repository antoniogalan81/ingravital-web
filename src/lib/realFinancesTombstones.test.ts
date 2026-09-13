// Conflictos de sincronización de FINANZAS REALES con borrado con marca (tombstones).
// Se ejecutan contra las DOS copias del módulo compartido (WEB y APP) para demostrar que
// ambas plataformas aplican exactamente la misma regla.
// Ejecutar con:  npm test   (usa scripts/test-ts-resolve.mjs)

import { test } from "node:test";
import assert from "node:assert/strict";
import * as web from "./realFinances.ts";
import * as app from "../../../APP/src/utils/realFinances.ts";
import type { REOperation } from "./realEstate.ts";
import type { RERealExpense, RERealLoan } from "./realEstateTracking.ts";

const T0 = "2026-09-13T20:10:00.000Z"; // copia antigua
const T1 = "2026-09-13T21:40:00.000Z"; // borrado
const T2 = "2026-09-13T22:00:00.000Z"; // edición posterior

const exp = (p: Partial<RERealExpense> & { id: string }): RERealExpense => ({
  concept: "Gasto",
  amount: 100,
  date: "2026-09-01",
  createdAt: T0,
  updatedAt: T0,
  ...p,
});
const loan = (p: Partial<RERealLoan> & { id: string }): RERealLoan => ({
  name: "Préstamo",
  principal: 1000,
  status: "ACTIVO",
  createdAt: T0,
  updatedAt: T0,
  ...p,
});

for (const [platform, rf] of [["WEB", web], ["APP", app]] as const) {
  test(`[${platform}] CASO A: A borra el gasto X, B sincroniza su copia antigua → X sigue borrado`, () => {
    const copiaB = [exp({ id: "X" }), exp({ id: "Y" })];
    const deA = copiaB.map((e) => (e.id === "X" ? rf.markRealFinanceDeleted(e, T1) : e));

    // En cualquier orden de fusión (pull en A, pull en B, push de B contra el servidor).
    for (const merged of [rf.mergeRealFinanceItems(deA, copiaB), rf.mergeRealFinanceItems(copiaB, deA)]) {
      const x = merged.find((e) => e.id === "X");
      assert.ok(x?.deletedAt, "la marca de borrado se conserva");
      assert.equal(merged.filter(rf.isActiveRealFinanceItem).map((e) => e.id).join(), "Y");
    }
  });

  test(`[${platform}] CASO B: A borra el préstamo X, B sincroniza copia antigua → sigue borrado`, () => {
    const opB = { realLoans: [loan({ id: "X" })] } as REOperation;
    const opA = { realLoans: [rf.markRealFinanceDeleted(loan({ id: "X" }), T1)] } as REOperation;
    const merged = { ...opB, ...rf.mergeRealFinancesOf(opB, opA) } as REOperation;
    assert.equal(rf.activeRealLoans(merged).length, 0);
    assert.equal(rf.realLoanTotals(merged).financed, 0);
    assert.ok(merged.realLoans?.[0].deletedAt);
  });

  test(`[${platform}] CASO C: dos dispositivos crean gastos distintos → sobreviven ambos`, () => {
    const merged = rf.mergeRealFinanceItems([exp({ id: "A1" })], [exp({ id: "B1" })]);
    assert.deepEqual(merged.map((e) => e.id), ["A1", "B1"]);
  });

  test(`[${platform}] CASO D: gana la versión más reciente; borrado vs edición posterior legítima`, () => {
    // Edición en un dispositivo frente a copia antigua en otro.
    const editado = exp({ id: "X", amount: 250, updatedAt: T2 });
    const antiguo = exp({ id: "X", amount: 100, updatedAt: T0 });
    assert.equal(rf.mergeRealFinanceItems([antiguo], [editado])[0].amount, 250);
    assert.equal(rf.mergeRealFinanceItems([editado], [antiguo])[0].amount, 250);

    // Borrado (T1) frente a una edición POSTERIOR (T2): la edición gana (restauración).
    const borrado = rf.markRealFinanceDeleted(antiguo, T1);
    const r = rf.mergeRealFinanceItems([borrado], [editado])[0];
    assert.equal(r.deletedAt, undefined);
    assert.equal(r.amount, 250);

    // Empate exacto de versión: gana el borrado.
    const empateActivo = exp({ id: "X", updatedAt: T1 });
    assert.ok(rf.mergeRealFinanceItems([empateActivo], [borrado])[0].deletedAt);
    assert.ok(rf.mergeRealFinanceItems([borrado], [empateActivo])[0].deletedAt);

    // La marca siempre es posterior a la última versión, aunque el reloj local vaya atrasado.
    const futuro = exp({ id: "Z", updatedAt: T2 });
    const marcado = rf.markRealFinanceDeleted(futuro, T0);
    assert.ok(Date.parse(marcado.updatedAt) > Date.parse(T2));
  });

  test(`[${platform}] CASO E: un borrado no cuenta en totales, Económico, Resumen, mapa ni interruptor`, () => {
    const op = {
      realExpenses: [
        exp({ id: "vivo", amount: 900, budgetLineId: "L1" }),
        rf.markRealFinanceDeleted(exp({ id: "borrado", amount: 12, budgetLineId: "L1" }), T1),
      ],
      realLoans: [rf.markRealFinanceDeleted(loan({ id: "p", outstanding: 500, installment: 50 }), T1)],
    } as REOperation;

    assert.equal(rf.realExpenseTotals(op).total, 900, "Finanzas reales");
    assert.equal(rf.realExpenseTotals(op).count, 1);
    assert.deepEqual(rf.effectiveRealExpenses(op).map((e) => e.id), ["vivo"]);
    assert.equal(rf.budgetLineReal(rf.effectiveRealExpenses(op), "L1"), 900, "columna Real de Económico");
    const rv = rf.realVsPlanned(op, { totalInvestment: 1800 });
    assert.equal(rv.spent.total, 900, "Resumen y mapa usan realVsPlanned");
    assert.equal(rv.spentOfPlannedPct, 0.5);
    assert.equal(rv.loans.count, 0);
    assert.equal(rf.realLoanTotals(op).monthlyInstallments, null);

    const soloBorrados = { realExpenses: [rf.markRealFinanceDeleted(exp({ id: "b" }), T1)] } as REOperation;
    assert.equal(rf.isRealFinancesEnabled(soloBorrados), false, "sin datos activos no se activa solo");
  });

  test(`[${platform}] un importe "real" antiguo de Económico no revive un gasto legado ya borrado`, () => {
    const op = {
      expenses: [{ id: "L1", category: "OBRA", concept: "Obra", status: "PENDIENTE", real: 500, createdAt: T0, updatedAt: T0 }],
      realExpenses: [rf.markRealFinanceDeleted(exp({ id: `${rf.LEGACY_REAL_EXPENSE_PREFIX}L1`, amount: 500 }), T1)],
    } as unknown as REOperation;
    assert.equal(rf.realExpenseTotals(op).total, 0);
    const patch = rf.adoptLegacyRealAmounts(op);
    assert.ok(patch?.realExpenses?.[0].deletedAt, "la conversión conserva la marca");
  });
}

test("WEB y APP comparten exactamente la misma implementación", async () => {
  const { readFileSync } = await import("node:fs");
  const body = (p: string) => {
    const text = readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    return text.slice(text.indexOf("\n", text.indexOf("import type { REExpense")));
  };
  assert.equal(body("./realFinances.ts"), body("../../../APP/src/utils/realFinances.ts"));
});

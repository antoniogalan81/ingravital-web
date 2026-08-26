// Tests puros del módulo BALANCE (modelo compartido WEB ⇄ APP).
// Ejecutar con:  node --test src/lib/balance.test.ts   (Node 22.7+/24, TS nativo)
// No dependen de red, Supabase ni navegador.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterByHolder,
  nextChargeDate,
  daysBetween,
  splitBalance,
  summarize,
  upcomingCharges,
  todayISO,
  newAccount,
  newLoan,
  newHolder,
  type BalanceAccount,
  type BalanceItem,
  type BalanceLoan,
} from "./balance.ts";

const NOW = "2026-03-10T08:00:00.000Z";

function acc(p: Partial<BalanceAccount> & { id: string }): BalanceAccount {
  return { ...newAccount(p.id, NOW), ...p };
}
function loan(p: Partial<BalanceLoan> & { id: string }): BalanceLoan {
  return { ...newLoan(p.id, NOW), ...p };
}

test("splitBalance separa por kind, ordena y descarta tombstones", () => {
  const items: BalanceItem[] = [
    { ...newHolder("h1", NOW, 2), name: "Ventana al Futuro" },
    { ...newHolder("h2", NOW, 1), name: "Particular", type: "PARTICULAR" },
    acc({ id: "a1", bank: "CaixaBank" }),
    loan({ id: "l1" }),
    { ...acc({ id: "a2" }), deleted: true },
  ];
  const { holders, accounts, loans } = splitBalance(items);
  assert.deepEqual(holders.map((h) => h.id), ["h2", "h1"]);
  assert.deepEqual(accounts.map((a) => a.id), ["a1"]);
  assert.equal(loans.length, 1);
});

test("summarize: disponible, deuda, cuotas y posición neta", () => {
  const s = summarize(
    [acc({ id: "a1", balance: 80000 }), acc({ id: "a2", balance: 20000 })],
    [loan({ id: "l1", outstanding: 120000, installment: 600 }), loan({ id: "l2", outstanding: 5000, installment: 150 })]
  );
  assert.equal(s.available, 100000);
  assert.equal(s.debt, 125000);
  assert.equal(s.monthlyInstalments, 750);
  assert.equal(s.net, -25000);
});

test("summarize: valores no numéricos cuentan como 0 (nunca NaN)", () => {
  const s = summarize(
    [acc({ id: "a1", balance: undefined as unknown as number })],
    [loan({ id: "l1", outstanding: NaN, installment: undefined as unknown as number })]
  );
  assert.deepEqual(s, { available: 0, debt: 0, monthlyInstalments: 0, net: 0 });
});

test("filterByHolder: null = todos", () => {
  const rows = [acc({ id: "a1", holderId: "h1" }), acc({ id: "a2", holderId: null })];
  assert.equal(filterByHolder(rows, null).length, 2);
  assert.deepEqual(filterByHolder(rows, "h1").map((r) => r.id), ["a1"]);
  assert.deepEqual(filterByHolder(rows, "h9").length, 0);
});

test("nextChargeDate: hoy mismo si el día aún no ha pasado", () => {
  assert.equal(nextChargeDate(10, "2026-03-10"), "2026-03-10");
  assert.equal(nextChargeDate(25, "2026-03-10"), "2026-03-25");
});

test("nextChargeDate: salta al mes siguiente si el día ya pasó", () => {
  assert.equal(nextChargeDate(5, "2026-03-10"), "2026-04-05");
});

test("nextChargeDate: cruza el año en diciembre", () => {
  assert.equal(nextChargeDate(1, "2026-12-15"), "2027-01-01");
});

test("nextChargeDate: recorta el día al último del mes (31 → febrero)", () => {
  assert.equal(nextChargeDate(31, "2026-02-01"), "2026-02-28");
  assert.equal(nextChargeDate(31, "2024-02-01"), "2024-02-29"); // bisiesto
  assert.equal(nextChargeDate(31, "2026-04-01"), "2026-04-30");
});

test("nextChargeDate: días fuera de rango devuelven null", () => {
  assert.equal(nextChargeDate(0, "2026-03-10"), null);
  assert.equal(nextChargeDate(32, "2026-03-10"), null);
  assert.equal(nextChargeDate(NaN, "2026-03-10"), null);
});

test("daysBetween cuenta días naturales", () => {
  assert.equal(daysBetween("2026-03-10", "2026-03-10"), 0);
  assert.equal(daysBetween("2026-03-10", "2026-04-05"), 26);
});

test("upcomingCharges: ordena por fecha, resuelve cuenta y omite préstamos sin día", () => {
  const accounts = [acc({ id: "a1", bank: "CaixaBank", alias: "Operativa" })];
  const loans = [
    loan({ id: "l1", alias: "Hipoteca", lender: "Santander", installment: 600, chargeDay: 5, accountId: "a1" }),
    loan({ id: "l2", alias: "Coche", lender: "BBVA", installment: 200, chargeDay: 12, accountId: null }),
    loan({ id: "l3", alias: "Sin día", installment: 50, chargeDay: undefined }),
  ];
  const out = upcomingCharges(loans, accounts, "2026-03-10");

  assert.deepEqual(out.map((c) => c.loanId), ["l2", "l1"]); // 12-mar antes que 5-abr
  assert.equal(out[0].dateISO, "2026-03-12");
  assert.equal(out[0].daysAway, 2);
  assert.equal(out[0].accountLabel, null);
  assert.equal(out[1].dateISO, "2026-04-05");
  assert.equal(out[1].accountLabel, "CaixaBank · Operativa");
});

test("upcomingCharges: cuenta asociada inexistente no rompe la fila", () => {
  const out = upcomingCharges([loan({ id: "l1", chargeDay: 1, accountId: "borrada" })], [], "2026-03-10");
  assert.equal(out.length, 1);
  assert.equal(out[0].accountLabel, null);
});

test("todayISO usa la fecha LOCAL (no desplaza de día por UTC)", () => {
  // 1 de enero a las 00:30 hora local: en UTC podría ser aún 31 de diciembre.
  assert.equal(todayISO(new Date(2026, 0, 1, 0, 30)), "2026-01-01");
});

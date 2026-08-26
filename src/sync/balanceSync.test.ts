// Contrato de sincronización WEB ⇄ APP para el módulo BALANCE.
//
// Comprueba que la WEB ingiere correctamente filas de `balance_items` ESCRITAS
// TAL Y COMO LAS ESCRIBE LA APP (`src/sync/syncEngine.ts` → pushItem guarda el
// item completo en `data`, sin normalizador), y que los tombstones de la APP
// borran de verdad en la WEB. Usa las funciones REALES del motor de sync.
//
// Ejecutar con:  node --test src/sync/balanceSync.test.ts   (Node 22.7+/24)

import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeRemoteRows, rowToEntity } from "./merge.ts";
import type { SupabaseRow, SyncableEntity } from "./types.ts";
import { newAccount, newLoan, splitBalance, summarize, type BalanceItem } from "../lib/balance.ts";

const USER = "11111111-1111-4111-8111-111111111111";

/** Fila exactamente como la sube la APP: `data` = el item completo. */
function rowFromApp(item: BalanceItem, serverUpdatedAt: string): SupabaseRow {
  return {
    id: item.id,
    user_id: USER,
    data: item as unknown as Record<string, unknown>,
    client_updated_at: item.updatedAt,
    server_updated_at: serverUpdatedAt,
    deleted_at: null,
  };
}

/** Tombstone exactamente como lo sube la APP: `data` = { id }, deleted_at != null. */
function tombstoneFromApp(id: string, whenISO: string): SupabaseRow {
  return {
    id,
    user_id: USER,
    data: { id },
    client_updated_at: whenISO,
    server_updated_at: whenISO,
    deleted_at: whenISO,
  };
}

test("una cuenta creada en la APP aparece íntegra en la WEB", () => {
  const remote: BalanceItem = {
    ...newAccount("a1", "2026-03-10T10:00:00.000Z"),
    bank: "CaixaBank",
    alias: "Operativa",
    holderId: "h1",
    balance: 80000,
  };

  const merged = mergeRemoteRows<SyncableEntity>([], [rowFromApp(remote, "2026-03-10T10:00:01.000Z")]);
  const { accounts } = splitBalance(merged as unknown as BalanceItem[]);

  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].bank, "CaixaBank");
  assert.equal(accounts[0].holderId, "h1");
  assert.equal(accounts[0].balance, 80000);
  assert.equal(summarize(accounts, []).available, 80000);
});

test("un saldo cambiado en la APP (más reciente) pisa el de la WEB", () => {
  const local: BalanceItem = {
    ...newAccount("a1", "2026-03-10T10:00:00.000Z"),
    bank: "CaixaBank",
    balance: 80000,
  };
  const fromApp: BalanceItem = { ...local, balance: 75000, updatedAt: "2026-03-11T09:00:00.000Z" };

  const merged = mergeRemoteRows<SyncableEntity>(
    [local as unknown as SyncableEntity],
    [rowFromApp(fromApp, "2026-03-11T09:00:01.000Z")]
  );
  const { accounts } = splitBalance(merged as unknown as BalanceItem[]);

  assert.equal(accounts[0].balance, 75000);
});

test("una edición local MÁS RECIENTE no se pierde ante una fila remota antigua", () => {
  // Sigue dirty y se volverá a subir: la política es last-write-wins, no
  // "el remoto siempre gana".
  const local: BalanceItem = {
    ...newLoan("l1", "2026-03-12T12:00:00.000Z"),
    installment: 700,
    updatedAt: "2026-03-12T12:00:00.000Z",
  };
  const stale: BalanceItem = { ...local, installment: 600, updatedAt: "2026-03-01T08:00:00.000Z" };

  const merged = mergeRemoteRows<SyncableEntity>(
    [local as unknown as SyncableEntity],
    [rowFromApp(stale, "2026-03-01T08:00:01.000Z")]
  );
  const { loans } = splitBalance(merged as unknown as BalanceItem[]);

  assert.equal(loans[0].installment, 700);
});

test("un borrado hecho en la APP elimina la fila en la WEB", () => {
  const local: BalanceItem = { ...newAccount("a1", "2026-03-10T10:00:00.000Z"), bank: "CaixaBank" };

  const merged = mergeRemoteRows<SyncableEntity>(
    [local as unknown as SyncableEntity],
    [tombstoneFromApp("a1", "2026-03-13T10:00:00.000Z")]
  );

  assert.equal(merged.length, 0);
  assert.deepEqual(splitBalance(merged as unknown as BalanceItem[]).accounts, []);
});

test("rowToEntity conserva el discriminante `kind` (sin él no habría módulo)", () => {
  const loan: BalanceItem = { ...newLoan("l1", "2026-03-10T10:00:00.000Z"), alias: "Hipoteca" };
  const entity = rowToEntity(rowFromApp(loan, "2026-03-10T10:00:01.000Z")) as unknown as BalanceItem;

  assert.equal(entity.kind, "LOAN");
  assert.equal(entity.id, "l1");
  assert.equal((entity as { alias: string }).alias, "Hipoteca");
});

test("un préstamo antiguo con `lender` sobrevive al viaje de ida y vuelta", () => {
  // `lender` se retiró de la interfaz pero NO de los datos: un préstamo guardado por
  // una versión anterior debe seguir sincronizándose sin perder el campo.
  const legacy = {
    ...newLoan("l1", "2026-03-10T10:00:00.000Z"),
    alias: "Hipoteca antigua",
    lender: "Banco Santander",
    installment: 600,
  } as BalanceItem;

  const merged = mergeRemoteRows<SyncableEntity>([], [rowFromApp(legacy, "2026-03-10T10:00:01.000Z")]);
  const { loans } = splitBalance(merged as unknown as BalanceItem[]);

  assert.equal(loans.length, 1);
  assert.equal(loans[0].alias, "Hipoteca antigua");
  assert.equal(loans[0].lender, "Banco Santander");
  assert.equal(loans[0].installment, 600);
});

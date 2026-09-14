// CASO F — ciclo de sincronización completo con borrados de finanzas reales.
// Usa las funciones REALES del motor (mergeRemoteRows + mergeOperationEntity para el pull,
// mergeOperationForPush + escritura condicionada para el push) contra un "servidor" en
// memoria con la misma semántica que `operaciones_inmobiliarias` en Supabase.
// Ejecutar con:  npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeOperationEntity, mergeOperationForPush, mergeRemoteRows } from "./merge.ts";
import { effectiveRealExpenses, markRealFinanceDeleted } from "../lib/realFinances.ts";
import type { SupabaseRow, SyncableEntity } from "./types.ts";
import type { REOperation } from "../lib/realEstate.ts";

type Op = SyncableEntity & Partial<REOperation>;

/** Servidor mínimo: una fila por id, con escritura condicionada como pushOperationMerged. */
class Server {
  rows = new Map<string, SupabaseRow>();
  private tick = 0;
  /** Push de la versión NUEVA del código: lee, fusiona y escribe si no cambió entretanto. */
  pushMerged(item: Op, clientUpdatedAt: string) {
    const existing = this.rows.get(item.id);
    const merged = mergeOperationForPush(item, existing?.data as Record<string, unknown> | undefined);
    this.write(item.id, { ...merged, updatedAt: clientUpdatedAt }, clientUpdatedAt);
  }
  /** Push de un cliente con código ANTERIOR: sube la operación entera sin fusionar. */
  pushBlind(item: Op, clientUpdatedAt: string) {
    this.write(item.id, { ...item, updatedAt: clientUpdatedAt }, clientUpdatedAt);
  }
  private write(id: string, data: Record<string, unknown>, clientUpdatedAt: string) {
    this.tick += 1;
    this.rows.set(id, {
      id,
      user_id: "u",
      data: JSON.parse(JSON.stringify(data)),
      client_updated_at: clientUpdatedAt,
      server_updated_at: `2026-09-13T23:00:${String(this.tick).padStart(2, "0")}.000Z`,
      deleted_at: null,
    });
  }
  all(): SupabaseRow[] {
    return [...this.rows.values()].map((r) => JSON.parse(JSON.stringify(r)));
  }
}

/** Dispositivo WEB con la versión nueva: store en memoria + caché persistida (recarga). */
class Device {
  store: Op[] = [];
  cache = "[]";
  server: Server;
  constructor(server: Server) {
    this.server = server;
  }
  pull() {
    const needsRepush = new Set<string>();
    this.store = mergeRemoteRows(this.store, this.server.all(), { combine: mergeOperationEntity, needsRepush }) as Op[];
    this.cache = JSON.stringify(this.store);
    return needsRepush;
  }
  edit(id: string, patch: Partial<Op>, at: string) {
    this.store = this.store.map((o) => (o.id === id ? { ...o, ...patch, updatedAt: at } : o));
    this.cache = JSON.stringify(this.store);
  }
  push(id: string) {
    const item = this.store.find((o) => o.id === id)!;
    this.server.pushMerged(item, item.updatedAt as string);
  }
  reload() {
    this.store = JSON.parse(this.cache);
  }
  active(id: string) {
    return effectiveRealExpenses(this.store.find((o) => o.id === id) as REOperation).map((e) => e.id);
  }
}

const exp = (id: string, amount: number, at: string) => ({ id, concept: id, amount, date: "2026-09-01", createdAt: at, updatedAt: at });

function seed() {
  const server = new Server();
  const base: Op = {
    id: "op",
    name: "León",
    updatedAt: "2026-09-13T20:00:00.000Z",
    realExpenses: [exp("X", 12, "2026-09-13T20:00:00.000Z"), exp("Y", 900, "2026-09-13T20:00:00.000Z")],
  };
  server.pushMerged(base, base.updatedAt as string);
  const A = new Device(server);
  const B = new Device(server);
  A.pull();
  B.pull();
  return { server, A, B };
}

const remoteActive = (server: Server) =>
  effectiveRealExpenses(server.rows.get("op")!.data as unknown as REOperation).map((e) => e.id);

test("CASO F: A borra X; B (copia antigua) edita y sube ANTES de hacer pull → X sigue borrado en servidor, en B tras recargar y en un dispositivo nuevo", () => {
  const { server, A, B } = seed();

  const t1 = "2026-09-13T21:40:00.000Z";
  const deA = A.store[0].realExpenses!.map((e) => (e.id === "X" ? markRealFinanceDeleted(e, t1) : e));
  A.edit("op", { realExpenses: deA }, t1);
  A.push("op");
  assert.deepEqual(remoteActive(server), ["Y"]);

  // B no sabe nada del borrado: cambia el nombre y sube su operación entera.
  B.edit("op", { name: "León XIII" }, "2026-09-13T21:50:00.000Z");
  B.push("op");
  assert.deepEqual(remoteActive(server), ["Y"], "la copia antigua de B no resucita X");
  assert.equal(server.rows.get("op")!.data.name, "León XIII", "la edición legítima de B se conserva");

  // B recarga (caché antigua con X activo) y sincroniza.
  B.reload();
  assert.deepEqual(B.active("op"), ["X", "Y"], "antes de sincronizar, la caché aún lo tiene");
  B.pull();
  assert.deepEqual(B.active("op"), ["Y"], "tras el pull, X no reaparece");
  B.push("op");
  assert.deepEqual(remoteActive(server), ["Y"]);

  // Dispositivo nuevo sin caché.
  const C = new Device(server);
  C.pull();
  assert.deepEqual(C.active("op"), ["Y"]);

  // A recarga y vuelve a sincronizar: sigue borrado y la marca permanece en el servidor.
  A.reload();
  A.pull();
  assert.deepEqual(A.active("op"), ["Y"]);
  assert.ok((server.rows.get("op")!.data.realExpenses as { id: string; deletedAt?: string }[]).find((e) => e.id === "X")?.deletedAt);
});

test("CASO F (altas concurrentes): lo creado en B mientras A borraba sobrevive", () => {
  const { server, A, B } = seed();
  const t1 = "2026-09-13T21:40:00.000Z";
  A.edit("op", { realExpenses: A.store[0].realExpenses!.map((e) => (e.id === "X" ? markRealFinanceDeleted(e, t1) : e)) }, t1);
  A.push("op");
  B.edit("op", { realExpenses: [...B.store[0].realExpenses!, exp("Z", 50, "2026-09-13T21:45:00.000Z")] }, "2026-09-13T21:45:00.000Z");
  B.push("op");
  A.pull();
  B.pull();
  assert.deepEqual(remoteActive(server), ["Y", "Z"]);
  assert.deepEqual(A.active("op"), ["Y", "Z"]);
  assert.deepEqual(B.active("op"), ["Y", "Z"]);
});

test("LÍMITE documentado: un cliente con código ANTERIOR que sube sin fusionar puede quitar la marca, y un dispositivo actualizado la restaura al sincronizar", () => {
  const { server, A, B } = seed();
  const t1 = "2026-09-13T21:40:00.000Z";
  A.edit("op", { realExpenses: A.store[0].realExpenses!.map((e) => (e.id === "X" ? markRealFinanceDeleted(e, t1) : e)) }, t1);
  A.push("op");

  // Pestaña antigua: sube su copia entera (X activo) sin leer ni fusionar.
  const antigua = { ...B.store[0], name: "renombrada", updatedAt: "2026-09-13T21:50:00.000Z" };
  server.pushBlind(antigua, antigua.updatedAt as string);
  assert.deepEqual(remoteActive(server), ["X", "Y"], "el código antiguo SÍ puede reintroducirlo");

  // A (versión nueva) sincroniza: su marca es más reciente que la copia antigua → gana y se re-sube.
  const repush = A.pull();
  assert.deepEqual(A.active("op"), ["Y"]);
  assert.ok(repush.has("op"), "A detecta que debe re-subir");
  A.push("op");
  assert.deepEqual(remoteActive(server), ["Y"], "el servidor vuelve a tener X borrado");
  assert.equal(server.rows.get("op")!.data.name, "renombrada", "sin perder la edición de la pestaña antigua");
});

test("VENTAS: un parche del servidor no lo pisa un push con copia antigua; un borrado con marca no resucita; los cobros se conservan", () => {
  const server = new Server();
  const base: Op = {
    id: "op1",
    updatedAt: "2026-09-10T10:00:00.000Z",
    sales: [
      { id: "s1", title: "Vivienda 1", status: "DISPONIBLE", createdAt: "x", updatedAt: "2026-09-01T00:00:00.000Z" },
      { id: "s2", title: "Vivienda 2", status: "DISPONIBLE", createdAt: "x", updatedAt: "2026-09-01T00:00:00.000Z" },
    ],
  } as Op;
  server.pushMerged(base, base.updatedAt as string);
  const stale = JSON.parse(JSON.stringify(base)) as Op;

  // El servidor (apply_document_proposal) marca s1 como vendida con un cobro.
  const row = server.rows.get("op1")!;
  const serverSales = (row.data.sales as Record<string, unknown>[]).map((s) =>
    s.id === "s1" ? { ...s, status: "VENDIDO", realPrice: 185000, payments: [{ id: "p1", date: "2026-09-13", amount: 40000 }], collected: 40000, updatedAt: "2026-09-14T08:00:00.000Z" } : s,
  );
  row.data = { ...row.data, sales: serverSales };

  // Dispositivo con copia antigua (código actual): borra s2 con marca y edita otra cosa, sin pull.
  const edited = {
    ...stale,
    name: "Editado",
    sales: (stale.sales ?? []).map((s) => (s.id === "s2" ? markRealFinanceDeleted(s, "2026-09-14T09:00:00.000Z") : s)),
    updatedAt: "2026-09-14T09:00:00.000Z",
  } as Op;
  server.pushMerged(edited, edited.updatedAt as string);

  const sales = server.rows.get("op1")!.data.sales as { id: string; status: string; realPrice?: number; payments?: unknown[]; deletedAt?: string }[];
  const s1 = sales.find((s) => s.id === "s1")!;
  assert.equal(s1.status, "VENDIDO");
  assert.equal(s1.payments?.length, 1, "el cobro del servidor sobrevive");
  assert.ok(sales.find((s) => s.id === "s2")?.deletedAt, "el borrado viaja como marca");

  // Un tercer dispositivo aún con s2 activa (copia vieja) no la resucita al fusionar.
  const third = { ...stale, updatedAt: "2026-09-14T10:00:00.000Z" } as Op;
  server.pushMerged(third, third.updatedAt as string);
  assert.ok((server.rows.get("op1")!.data.sales as { id: string; deletedAt?: string }[]).find((s) => s.id === "s2")?.deletedAt);
});

test("GASTOS PREVISTOS: un concepto nuevo (€/mes × meses + fijo) no lo quita un push con copia antigua y los campos nuevos viajan intactos", () => {
  const server = new Server();
  const base: Op = { id: "op2", updatedAt: "2026-09-10T10:00:00.000Z", expenses: [] } as Op;
  server.pushMerged(base, base.updatedAt as string);
  const stale = JSON.parse(JSON.stringify(base)) as Op;

  const concept = { id: "exp_luz", category: "SUMINISTROS", concept: "Luz", monthlyAmount: 70, months: 18, fixedAmount: 300, estimated: 1560, status: "PENDIENTE", createdAt: "x", updatedAt: "2026-09-14T08:00:00.000Z" };
  const withConcept = { ...base, expenses: [concept], updatedAt: "2026-09-14T08:00:00.000Z" } as Op;
  server.pushMerged(withConcept, withConcept.updatedAt as string);

  const staleEdit = { ...stale, name: "Otro cambio", updatedAt: "2026-09-14T09:00:00.000Z" } as Op;
  server.pushMerged(staleEdit, staleEdit.updatedAt as string);
  assert.deepEqual(server.rows.get("op2")!.data.expenses, [concept], "el concepto y sus campos nuevos siguen en el servidor");

  // Borrado con marca en el dispositivo nuevo y pull en el antiguo: no reaparece.
  const deleted = { ...withConcept, expenses: [markRealFinanceDeleted(concept as never, "2026-09-14T10:00:00.000Z")], updatedAt: "2026-09-14T10:00:00.000Z" } as Op;
  server.pushMerged(deleted, deleted.updatedAt as string);
  const pulled = mergeRemoteRows([{ ...withConcept, updatedAt: "2026-09-14T08:00:00.000Z" }], [server.rows.get("op2")!], { combine: mergeOperationEntity });
  assert.ok((pulled[0].expenses as { deletedAt?: string }[])[0].deletedAt, "el borrado llega al dispositivo con copia antigua");
});

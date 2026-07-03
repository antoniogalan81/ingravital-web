// Tests puros de la lógica de fusión del motor de sync.
// Ejecutar con:  node --test src/sync/merge.test.ts   (Node 22.7+/24, TS nativo)
// No dependen de red, Supabase ni navegador.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isRemoteNewer,
  mergeRemoteRows,
  rowToEntity,
  mergeById,
  mergeOperationEntity,
  operationSignature,
} from "./merge.ts";
import type { SupabaseRow, SyncableEntity } from "./types.ts";

function row(partial: Partial<SupabaseRow> & { id: string }): SupabaseRow {
  return {
    user_id: "u1",
    data: {},
    client_updated_at: "2024-01-01T00:00:00.000Z",
    deleted_at: null,
    ...partial,
  };
}
function ent(partial: Partial<SyncableEntity> & { id: string }): SyncableEntity {
  return { updatedAt: "2024-01-01T00:00:00.000Z", ...partial };
}

test("isRemoteNewer: sin local, el remoto gana", () => {
  assert.equal(isRemoteNewer(row({ id: "a" }), undefined), true);
});

test("isRemoteNewer: compara por fecha", () => {
  const local = ent({ id: "a", updatedAt: "2024-06-01T00:00:00.000Z" });
  assert.equal(isRemoteNewer(row({ id: "a", client_updated_at: "2024-06-02T00:00:00.000Z" }), local), true);
  assert.equal(isRemoteNewer(row({ id: "a", client_updated_at: "2024-05-31T00:00:00.000Z" }), local), false);
});

test("merge: remoto más nuevo sobrescribe local", () => {
  const local = [ent({ id: "a", updatedAt: "2024-01-01T00:00:00.000Z" }) as SyncableEntity];
  const remote = [row({ id: "a", client_updated_at: "2024-02-01T00:00:00.000Z", data: { updatedAt: "2024-02-01T00:00:00.000Z", name: "nuevo" } })];
  const merged = mergeRemoteRows(local, remote);
  assert.equal(merged.length, 1);
  assert.equal((merged[0] as Record<string, unknown>).name, "nuevo");
});

test("merge: local más nuevo se conserva (queda dirty para re-subir)", () => {
  const local = [ent({ id: "a", updatedAt: "2024-06-01T00:00:00.000Z", ...( { name: "editado local" } as object) }) as SyncableEntity];
  const remote = [row({ id: "a", client_updated_at: "2024-01-01T00:00:00.000Z", data: { name: "viejo" } })];
  const merged = mergeRemoteRows(local, remote);
  assert.equal((merged[0] as Record<string, unknown>).name, "editado local");
});

test("merge: tombstone MÁS NUEVO que local → borra", () => {
  const local = [ent({ id: "a", updatedAt: "2024-01-01T00:00:00.000Z" }) as SyncableEntity];
  const remote = [row({ id: "a", deleted_at: "2024-02-01T00:00:00.000Z", client_updated_at: "2024-02-01T00:00:00.000Z" })];
  assert.equal(mergeRemoteRows(local, remote).length, 0);
});

test("merge: tombstone MÁS VIEJO que edición local → NO borra (regresión #3)", () => {
  // Otro dispositivo borró en enero; aquí se editó en junio → la edición debe sobrevivir.
  const local = [ent({ id: "a", updatedAt: "2024-06-01T00:00:00.000Z" }) as SyncableEntity];
  const remote = [row({ id: "a", deleted_at: "2024-01-01T00:00:00.000Z", client_updated_at: "2024-01-01T00:00:00.000Z" })];
  const merged = mergeRemoteRows(local, remote);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "a");
});

test("merge: tombstone de item inexistente en local es inocuo", () => {
  const merged = mergeRemoteRows<SyncableEntity>([], [row({ id: "z", deleted_at: "2024-02-01T00:00:00.000Z" })]);
  assert.equal(merged.length, 0);
});

test("merge: no muta el array local de entrada", () => {
  const local = [ent({ id: "a" }) as SyncableEntity];
  const snapshot = JSON.stringify(local);
  mergeRemoteRows(local, [row({ id: "b", client_updated_at: "2024-09-01T00:00:00.000Z" })]);
  assert.equal(JSON.stringify(local), snapshot);
});

test("rowToEntity: marca deleted según deleted_at y toma updatedAt de client_updated_at", () => {
  const e = rowToEntity(row({ id: "a", client_updated_at: "2024-03-03T00:00:00.000Z", deleted_at: "2024-03-03T00:00:00.000Z", data: { name: "x" } }));
  assert.equal(e.id, "a");
  assert.equal(e.deleted, true);
  assert.equal(e.updatedAt, "2024-03-03T00:00:00.000Z");
});

// ==================== MERGE POR COLECCIÓN ====================

type Item = { id?: string; updatedAt?: string; deleted?: boolean; concept?: string };
const item = (id: string, updatedAt?: string, extra: Partial<Item> = {}): Item => ({ id, updatedAt, ...extra });

/** Operación mínima con sub-colecciones (shape parcial de REOperation). */
function op(partial: Record<string, unknown>): SyncableEntity {
  return { id: "op1", name: "", updatedAt: "2024-01-01T00:00:00.000Z", ...partial } as unknown as SyncableEntity;
}
const ids = (arr: unknown[] | undefined) =>
  (arr as Item[] | undefined ?? []).map((x) => x.id).sort();

test("mergeById: null/undefined se tratan como [] (legacy)", () => {
  assert.deepEqual(ids(mergeById(undefined, [item("s1")], "remote")), ["s1"]);
  assert.deepEqual(ids(mergeById([item("e1")], undefined, "local")), ["e1"]);
  assert.deepEqual(mergeById(undefined, undefined, "remote"), []);
});

test("mergeById: union por id sin duplicar (mismo id una sola vez)", () => {
  const merged = mergeById([item("a"), item("b")], [item("b"), item("c")], "remote");
  assert.deepEqual(ids(merged), ["a", "b", "c"]);
});

test("mergeById: mismo id en ambos lados → gana el updatedAt más nuevo (LWW por item)", () => {
  const local = [item("a", "2024-06-01T00:00:00.000Z", { concept: "local" })];
  const remote = [item("a", "2024-01-01T00:00:00.000Z", { concept: "remote" })];
  // Aunque prefiramos remote a nivel de operación, el item más nuevo (local) gana.
  const merged = mergeById(local, remote, "remote") as Item[];
  assert.equal(merged.length, 1);
  assert.equal(merged[0].concept, "local");
});

test("mergeById: empate/sin timestamps → gana el lado preferente", () => {
  const local = [item("a", undefined, { concept: "local" })];
  const remote = [item("a", undefined, { concept: "remote" })];
  assert.equal((mergeById(local, remote, "remote") as Item[])[0].concept, "remote");
  assert.equal((mergeById(local, remote, "local") as Item[])[0].concept, "local");
});

test("mergeById: respeta tombstone por-item deleted:true (forward-compatible, no resucita)", () => {
  // El item borrado (deleted:true) y más nuevo NO debe aparecer.
  const local = [item("a", "2024-06-01T00:00:00.000Z", { deleted: true })];
  const remote = [item("a", "2024-01-01T00:00:00.000Z")];
  assert.deepEqual(ids(mergeById(local, remote, "remote")), []);
});

test("mergeOperationEntity criterio 1: A añade gasto (local), B añade venta (remote) → ambos sobreviven", () => {
  const local = op({ expenses: [item("e1")], sales: [], updatedAt: "2024-01-01T00:00:00.000Z" });
  const remote = op({ expenses: [], sales: [item("s1")], updatedAt: "2024-02-01T00:00:00.000Z" });
  const merged = mergeOperationEntity(local, remote, /* remoteIsNewer */ true) as unknown as Record<string, unknown>;
  assert.deepEqual(ids(merged.expenses as unknown[]), ["e1"]);
  assert.deepEqual(ids(merged.sales as unknown[]), ["s1"]);
});

test("mergeOperationEntity criterio 2: A añade hito, B añade gasto → ambos sobreviven", () => {
  const local = op({ milestones: [item("m1")], expenses: [item("e1")] });
  const remote = op({ milestones: [], expenses: [item("e2")], updatedAt: "2024-03-01T00:00:00.000Z" });
  const merged = mergeOperationEntity(local, remote, true) as unknown as Record<string, unknown>;
  assert.deepEqual(ids(merged.milestones as unknown[]), ["m1"]);
  assert.deepEqual(ids(merged.expenses as unknown[]), ["e1", "e2"]);
});

test("mergeOperationEntity: conserva campos escalares del lado más reciente", () => {
  const local = op({ name: "viejo", purchasePrice: 100, expenses: [item("e1")] });
  const remote = op({ name: "nuevo", purchasePrice: 200, expenses: [item("e2")], updatedAt: "2024-05-01T00:00:00.000Z" });
  const merged = mergeOperationEntity(local, remote, true) as unknown as Record<string, unknown>;
  assert.equal(merged.name, "nuevo");
  assert.equal(merged.purchasePrice, 200);
  // ...y aun así fusiona las colecciones de ambos lados.
  assert.deepEqual(ids(merged.expenses as unknown[]), ["e1", "e2"]);
});

test("mergeOperationEntity: no pierde inversores (share.recipients se fusiona por id)", () => {
  const local = op({ share: { enabled: true, visibility: { resumen: true }, recipients: [item("r1")] } });
  const remote = op({ share: { enabled: true, visibility: { resumen: false }, recipients: [item("r2")] }, updatedAt: "2024-04-01T00:00:00.000Z" });
  const merged = mergeOperationEntity(local, remote, true) as unknown as Record<string, unknown>;
  const share = merged.share as Record<string, unknown>;
  assert.deepEqual(ids(share.recipients as unknown[]), ["r1", "r2"]);
  // visibility del lado más reciente (remote).
  assert.equal((share.visibility as Record<string, unknown>).resumen, false);
});

test("mergeOperationEntity: colecciones ausentes en un lado no rompen (legacy)", () => {
  const local = op({}); // sin expenses/sales
  const remote = op({ expenses: [item("e1")], updatedAt: "2024-02-01T00:00:00.000Z" });
  const merged = mergeOperationEntity(local, remote, true) as unknown as Record<string, unknown>;
  assert.deepEqual(ids(merged.expenses as unknown[]), ["e1"]);
});

test("operationSignature: igual contenido → misma firma; contenido extra → firma distinta", () => {
  const a = op({ expenses: [item("e1", "t1")], updatedAt: "u" });
  const b = op({ expenses: [item("e1", "t1")], updatedAt: "u" });
  const c = op({ expenses: [item("e1", "t1"), item("e2", "t2")], updatedAt: "u" });
  assert.equal(operationSignature(a), operationSignature(b));
  assert.notEqual(operationSignature(a), operationSignature(c));
});

// ==================== mergeRemoteRows CON combine (integración) ====================

test("mergeRemoteRows+combine: fusiona colecciones y marca needsRepush cuando lo local aporta", () => {
  // Local tiene un gasto que el remoto no tiene; el remoto es más nuevo a nivel de op.
  const local: SyncableEntity[] = [op({ expenses: [item("e1")], updatedAt: "2024-01-01T00:00:00.000Z" })];
  const remoteRow = row({
    id: "op1",
    client_updated_at: "2024-02-01T00:00:00.000Z",
    data: { updatedAt: "2024-02-01T00:00:00.000Z", expenses: [item("e2")], sales: [] },
  });
  const needsRepush = new Set<string>();
  const merged = mergeRemoteRows(local, [remoteRow], { combine: mergeOperationEntity, needsRepush }) as unknown as Record<string, unknown>[];
  assert.deepEqual(ids(merged[0].expenses as unknown[]), ["e1", "e2"]);
  assert.ok(needsRepush.has("op1"), "op1 debe re-subirse para converger (aporta e1)");
});

test("mergeRemoteRows+combine: sin cambios locales → NO marca needsRepush", () => {
  const shared = [item("e1", "2024-01-01T00:00:00.000Z")];
  const local: SyncableEntity[] = [op({ expenses: shared, updatedAt: "2024-02-01T00:00:00.000Z" })];
  const remoteRow = row({
    id: "op1",
    client_updated_at: "2024-02-01T00:00:00.000Z",
    data: { updatedAt: "2024-02-01T00:00:00.000Z", expenses: shared },
  });
  const needsRepush = new Set<string>();
  mergeRemoteRows(local, [remoteRow], { combine: mergeOperationEntity, needsRepush });
  assert.equal(needsRepush.size, 0);
});

test("mergeRemoteRows+combine: borrado de OPERACIÓN completa sigue respetando LWW de fila", () => {
  const local: SyncableEntity[] = [op({ expenses: [item("e1")], updatedAt: "2024-01-01T00:00:00.000Z" })];
  const tombstone = row({ id: "op1", deleted_at: "2024-05-01T00:00:00.000Z", client_updated_at: "2024-05-01T00:00:00.000Z" });
  const merged = mergeRemoteRows(local, [tombstone], { combine: mergeOperationEntity });
  assert.equal(merged.length, 0);
});

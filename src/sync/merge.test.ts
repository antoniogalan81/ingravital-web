// Tests puros de la lógica de fusión del motor de sync.
// Ejecutar con:  node --test src/sync/merge.test.ts   (Node 22.7+/24, TS nativo)
// No dependen de red, Supabase ni navegador.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isRemoteNewer, mergeRemoteRows, rowToEntity } from "./merge.ts";
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

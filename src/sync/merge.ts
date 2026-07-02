// ==================== LÓGICA DE FUSIÓN (PURA) ====================
// Funciones puras de merge/normalización, sin dependencias de red ni de Supabase.
// Se separan de `syncEngine.ts` para poder testearlas de forma aislada
// (`merge.test.ts`) y para dejar clara la política de resolución de conflictos.

import type { SupabaseRow, SyncableEntity } from "./types";

/**
 * ¿El registro remoto es más nuevo que el local? (last-write-wins por timestamp).
 * - Sin local → el remoto "gana" (true).
 * - Sin marca de tiempo remota → false (no pisamos con algo sin fecha).
 * - Sin marca local → el remoto gana (true).
 */
export function isRemoteNewer(
  remoteRow: SupabaseRow,
  localItem: SyncableEntity | undefined
): boolean {
  if (!localItem) return true;

  const remoteUpdated = remoteRow.client_updated_at || remoteRow.server_updated_at;
  const localUpdated = localItem.updatedAt;

  if (!remoteUpdated) return false;
  if (!localUpdated) return true;

  return new Date(remoteUpdated) > new Date(localUpdated);
}

/** Convierte una fila de Supabase en una entidad local. */
export function rowToEntity(row: SupabaseRow): SyncableEntity {
  const data = row.data || {};

  return {
    id: row.id,
    ...data,
    updatedAt: row.client_updated_at || (data.updatedAt as string),
    deleted: row.deleted_at !== null,
  } as SyncableEntity;
}

/**
 * Aplica filas remotas sobre el array local y devuelve el nuevo array.
 *
 * Política de conflictos = last-write-wins por `client_updated_at`, APLICADA TAMBIÉN
 * A LOS BORRADOS (tombstones): un borrado remoto solo elimina el registro local si es
 * MÁS NUEVO que la copia local. Así, si otro dispositivo borró pero aquí se editó
 * después, la edición local (más reciente) se conserva y se volverá a subir; solo se
 * pierde si el borrado es realmente posterior. (Antes el borrado ganaba siempre y
 * podía descartar en silencio una edición local más reciente.)
 */
export function mergeRemoteRows<T extends SyncableEntity>(
  localItems: T[],
  remoteRows: SupabaseRow[]
): T[] {
  const localMap = new Map(localItems.map((item) => [item.id, item]));
  const resultMap = new Map(localMap);

  for (const row of remoteRows) {
    const localItem = localMap.get(row.id);

    if (row.deleted_at !== null) {
      // Tombstone → LWW: borra solo si el borrado remoto es más nuevo que lo local.
      if (isRemoteNewer(row, localItem)) {
        resultMap.delete(row.id);
      }
      continue;
    }

    // Remoto más nuevo (o no existe local) → usar remoto. Si el local es más nuevo,
    // se mantiene local (seguirá dirty para volver a subirse).
    if (isRemoteNewer(row, localItem)) {
      resultMap.set(row.id, rowToEntity(row) as T);
    }
  }

  return Array.from(resultMap.values());
}

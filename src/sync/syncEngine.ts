// ==================== SYNC ENGINE ====================

import { supabase } from "@/src/lib/supabaseClient";
import { ENTITY_CONFIGS, EntityKey, SupabaseRow, SyncableEntity } from "./types";

// ==================== HELPERS ====================

function getLastPulledAt(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("sync_lastPulledAt");
}

function setLastPulledAt(iso: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("sync_lastPulledAt", iso);
}

// ==================== PULL ====================

export async function pullEntity(
  entityKey: EntityKey,
  userId: string,
  since?: string | null
): Promise<{ rows: SupabaseRow[]; error: string | null }> {
  const config = ENTITY_CONFIGS[entityKey];
  if (!config) return { rows: [], error: `Unknown entity: ${entityKey}` };

  let query = supabase
    .from(config.tableName)
    .select("id, user_id, data, client_updated_at, server_updated_at, deleted_at")
    .eq("user_id", userId)
    .order("server_updated_at", { ascending: true });

  // Filtro incremental: solo rows con server_updated_at > since
  if (since) {
    query = query.gt("server_updated_at", since);
  }

  const { data, error } = await query;

  if (error) {
    console.warn(`[sync] pullEntity ${entityKey} error:`, error.message);
    return { rows: [], error: error.message };
  }

  return { rows: (data || []) as SupabaseRow[], error: null };
}

export async function pullAll(userId: string, forceFullPull?: boolean): Promise<{
  data: Record<EntityKey, SupabaseRow[]>;
  errors: string[];
}> {
  const results: Record<string, SupabaseRow[]> = {};
  const errors: string[] = [];
  // forceFullPull=true when the store is empty (new session): ignore lastPulledAt so
  // we do a complete fetch instead of an incremental one that would return 0 rows.
  const lastPulled = forceFullPull ? null : getLastPulledAt();

  const entityKeys = Object.keys(ENTITY_CONFIGS) as EntityKey[];

  await Promise.all(
    entityKeys.map(async (key) => {
      const { rows, error } = await pullEntity(key, userId, lastPulled);
      results[key] = rows;
      if (error) errors.push(`${key}: ${error}`);
    })
  );

  // Calcular max server_updated_at entre TODAS las rows recibidas
  let maxServerUpdatedAt: string | null = null;
  for (const key of entityKeys) {
    for (const row of results[key] || []) {
      if (row.server_updated_at) {
        if (!maxServerUpdatedAt || row.server_updated_at > maxServerUpdatedAt) {
          maxServerUpdatedAt = row.server_updated_at;
        }
      }
    }
  }

  // Solo actualizar lastPulledAt si hubo rows nuevas
  if (maxServerUpdatedAt) {
    setLastPulledAt(maxServerUpdatedAt);
  }

  return { data: results as Record<EntityKey, SupabaseRow[]>, errors };
}

// ==================== PUSH ====================

export async function pushItem(
  entityKey: EntityKey,
  userId: string,
  item: SyncableEntity
): Promise<{ error: string | null }> {
  const config = ENTITY_CONFIGS[entityKey];
  if (!config) return { error: `Unknown entity: ${entityKey}` };

  const now = new Date().toISOString();
  const updatedAt = config.getUpdatedAt(item) || now;

  // Preparar data payload
  const dataPayload: Record<string, unknown> = { ...item, updatedAt };

  const record = {
    id: item.id,
    user_id: userId,
    data: dataPayload,
    client_updated_at: updatedAt,
    deleted_at: item.deleted ? now : null,
  };

  console.log(`[syncEngine] pushItem table=${config.tableName} id=${item.id}`, record);

  const { error } = await supabase.from(config.tableName).upsert(record, { onConflict: "id" });

  if (error) {
    console.error(`[syncEngine] pushItem FAILED table=${config.tableName} id=${item.id}:`, error.message, error);
    return { error: error.message };
  }

  console.log(`[syncEngine] pushItem OK table=${config.tableName} id=${item.id}`);
  return { error: null };
}

export async function pushDelete(
  entityKey: EntityKey,
  userId: string,
  itemId: string
): Promise<{ error: string | null }> {
  const config = ENTITY_CONFIGS[entityKey];
  if (!config) return { error: `Unknown entity: ${entityKey}` };

  const now = new Date().toISOString();

  // UPSERT tombstone: si el row no existe, lo crea con deleted_at != null
  // Esto garantiza que la APP pueda hacer pull del borrado
  const { error } = await supabase.from(config.tableName).upsert(
    {
      id: itemId,
      user_id: userId,
      data: {},
      client_updated_at: now,
      deleted_at: now,
    },
    { onConflict: "id" }
  );

  if (error) {
    console.warn(`[sync] pushDelete ${entityKey} error:`, error.message);
    return { error: error.message };
  }

  return { error: null };
}

// ==================== MERGE LOGIC ====================

/**
 * Determina si el registro remoto es más nuevo que el local
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

/**
 * Convierte SupabaseRow a entidad local
 */
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
 * Aplica rows remotos a un array local y retorna el nuevo array
 * Respeta last-write-wins por client_updated_at
 */
export function mergeRemoteRows<T extends SyncableEntity>(
  localItems: T[],
  remoteRows: SupabaseRow[]
): T[] {
  const localMap = new Map(localItems.map((item) => [item.id, item]));
  const resultMap = new Map(localMap);

  for (const row of remoteRows) {
    const localItem = localMap.get(row.id);

    // Si está borrado remotamente, eliminar local
    if (row.deleted_at !== null) {
      resultMap.delete(row.id);
      continue;
    }

    // Si remoto es más nuevo o no existe local, usar remoto
    if (isRemoteNewer(row, localItem)) {
      resultMap.set(row.id, rowToEntity(row) as T);
    }
    // Si local es más nuevo, mantener local (quedará dirty para push)
  }

  return Array.from(resultMap.values());
}

// ==================== DIRTY TRACKING ====================

const DIRTY_STORAGE_KEY = "sync_dirtyIds";

export function getDirtyIds(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(DIRTY_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function setDirtyIds(dirty: Record<string, string[]>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DIRTY_STORAGE_KEY, JSON.stringify(dirty));
}

export function markDirty(entityKey: EntityKey, itemId: string) {
  const dirty = getDirtyIds();
  if (!dirty[entityKey]) dirty[entityKey] = [];
  if (!dirty[entityKey].includes(itemId)) {
    dirty[entityKey].push(itemId);
  }
  setDirtyIds(dirty);
}

export function clearDirty(entityKey: EntityKey, itemId: string) {
  const dirty = getDirtyIds();
  if (dirty[entityKey]) {
    dirty[entityKey] = dirty[entityKey].filter((id) => id !== itemId);
    if (dirty[entityKey].length === 0) delete dirty[entityKey];
  }
  setDirtyIds(dirty);
}

export function clearAllDirty() {
  setDirtyIds({});
}

export { getLastPulledAt };


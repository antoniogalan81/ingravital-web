// ==================== SYNC ENGINE ====================
// Transporte (pull/push contra Supabase) + estado local (watermark, dirty, borrados
// pendientes y caché offline del store). La lógica pura de fusión vive en `merge.ts`.

import { supabase } from "@/src/lib/supabaseClient";
import { ENTITY_CONFIGS, EntityKey, SupabaseRow, SyncableEntity } from "./types";

// Re-export de la lógica de fusión pura (mantiene la API previa de este módulo).
export {
  isRemoteNewer,
  rowToEntity,
  mergeRemoteRows,
  mergeById,
  mergeOperationEntity,
  operationSignature,
} from "./merge";

// ==================== ALMACENAMIENTO LOCAL (aislado por usuario, a prueba de fallos) ====================
// TODAS las claves se aíslan por userId para NO mezclar datos entre cuentas en el
// mismo navegador (antes eran globales → fuga entre cuentas). Las escrituras se
// protegen: una QuotaExceededError o el modo privado de Safari no deben romper la app.

let syncUserId: string | null = null;

/** Fija el usuario activo para el aislamiento de claves. Llamar en login/logout. */
export function setSyncUser(userId: string | null) {
  syncUserId = userId;
}

function scopedKey(base: string): string {
  return syncUserId ? `${base}::${syncUserId}` : base;
}

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn(`[sync] no se pudo escribir ${key} (quota / modo privado):`, e);
  }
}

function safeRemove(key: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

const LAST_PULLED_KEY = "sync_lastPulledAt";
const DIRTY_STORAGE_KEY = "sync_dirtyIds";
const DELETED_STORAGE_KEY = "sync_deletedIds";
const CACHE_PREFIX = "sync_cache";

/**
 * Migración única: claves antiguas SIN aislar → aisladas por el usuario actual.
 * Preserva ediciones pendientes en el caso común (mismo usuario reabre) y elimina
 * las claves globales que provocaban fuga de datos entre cuentas. Es idempotente.
 */
export function migrateLegacyKeys() {
  if (typeof window === "undefined" || !syncUserId) return;
  for (const base of [LAST_PULLED_KEY, DIRTY_STORAGE_KEY]) {
    const legacy = safeGet(base);
    if (legacy !== null) {
      const scoped = scopedKey(base);
      if (safeGet(scoped) === null) safeSet(scoped, legacy);
      safeRemove(base);
    }
  }
}

// ==================== WATERMARK ====================

function getLastPulledAt(): string | null {
  return safeGet(scopedKey(LAST_PULLED_KEY));
}

function setLastPulledAt(iso: string) {
  safeSet(scopedKey(LAST_PULLED_KEY), iso);
}

// ==================== CACHÉ LOCAL DEL STORE (offline real) ====================
// Persistimos la copia local de cada entidad para que las ediciones sobrevivan a un
// refresco SIN conexión. Antes el dato solo vivía en memoria: al refrescar se perdía
// mientras el "dirty" persistía apuntando a datos ya inexistentes (pérdida/borrado).

function cacheKey(entityKey: EntityKey): string {
  return `${CACHE_PREFIX}::${entityKey}::${syncUserId ?? "anon"}`;
}

export function loadEntityCache(entityKey: EntityKey): unknown[] | null {
  const raw = safeGet(cacheKey(entityKey));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveEntityCache(entityKey: EntityKey, items: unknown[]) {
  safeSet(cacheKey(entityKey), JSON.stringify(items));
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

  const { error } = await supabase.from(config.tableName).upsert(record, { onConflict: "id" });

  if (error) {
    console.error(`[syncEngine] pushItem FAILED table=${config.tableName} id=${item.id}:`, error.message);
    return { error: error.message };
  }

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

// ==================== DIRTY TRACKING ====================

function getIdMap(base: string): Record<string, string[]> {
  const stored = safeGet(scopedKey(base));
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function setIdMap(base: string, map: Record<string, string[]>) {
  safeSet(scopedKey(base), JSON.stringify(map));
}

function addId(base: string, entityKey: EntityKey, itemId: string) {
  const map = getIdMap(base);
  if (!map[entityKey]) map[entityKey] = [];
  if (!map[entityKey].includes(itemId)) map[entityKey].push(itemId);
  setIdMap(base, map);
}

function removeId(base: string, entityKey: EntityKey, itemId: string) {
  const map = getIdMap(base);
  if (map[entityKey]) {
    map[entityKey] = map[entityKey].filter((id) => id !== itemId);
    if (map[entityKey].length === 0) delete map[entityKey];
    setIdMap(base, map);
  }
}

export function getDirtyIds(): Record<string, string[]> {
  return getIdMap(DIRTY_STORAGE_KEY);
}
export function markDirty(entityKey: EntityKey, itemId: string) {
  addId(DIRTY_STORAGE_KEY, entityKey, itemId);
}
export function clearDirty(entityKey: EntityKey, itemId: string) {
  removeId(DIRTY_STORAGE_KEY, entityKey, itemId);
}
export function clearAllDirty() {
  setIdMap(DIRTY_STORAGE_KEY, {});
}

// ==================== DELETED TRACKING (borrados explícitos) ====================
// Registro EXPLÍCITO de qué ids ha borrado el usuario. Antes, "id dirty sin item en
// memoria" se interpretaba como borrado y se enviaba un tombstone — lo que, tras un
// refresco que vacía la memoria, BORRABA operaciones vivas en la nube. Ahora solo se
// envía tombstone si el id está marcado explícitamente como borrado.

export function getDeletedIds(): Record<string, string[]> {
  return getIdMap(DELETED_STORAGE_KEY);
}
export function markDeleted(entityKey: EntityKey, itemId: string) {
  addId(DELETED_STORAGE_KEY, entityKey, itemId);
}
export function clearDeleted(entityKey: EntityKey, itemId: string) {
  removeId(DELETED_STORAGE_KEY, entityKey, itemId);
}
export function isDeletedId(entityKey: EntityKey, itemId: string): boolean {
  return (getDeletedIds()[entityKey] || []).includes(itemId);
}

export { getLastPulledAt };

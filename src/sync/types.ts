// ==================== SYNC TYPES ====================

export interface SyncableEntity {
  id: string;
  updatedAt?: string;
  createdAt?: string;
  deleted?: boolean;
}

export interface SupabaseRow {
  id: string;
  user_id: string;
  data: Record<string, unknown>;
  client_updated_at: string;
  server_updated_at?: string;
  deleted_at: string | null;
}

export interface EntityConfig {
  tableName: string;
  localKey: string;
  getId: (item: SyncableEntity) => string;
  getUpdatedAt: (item: SyncableEntity) => string;
}

export interface SyncState {
  isSyncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  dirtyIds: Record<string, Set<string>>; // entityKey -> Set<id>
}

export const ENTITY_CONFIGS: Record<string, EntityConfig> = {
  realEstateOperations: {
    tableName: "operaciones_inmobiliarias",
    localKey: "realEstateOperations",
    getId: (item) => item.id,
    getUpdatedAt: (item) => item.updatedAt || new Date().toISOString(),
  },
  // BALANCE — titulares, cuentas y préstamos en una sola tabla discriminada por
  // `data.kind` (ver src/lib/balance.ts). Misma tabla y mismo contrato que la APP.
  balanceItems: {
    tableName: "balance_items",
    localKey: "balanceItems",
    getId: (item) => item.id,
    getUpdatedAt: (item) => item.updatedAt || new Date().toISOString(),
  },
};

export type EntityKey = keyof typeof ENTITY_CONFIGS;


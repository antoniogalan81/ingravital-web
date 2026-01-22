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
  metas: {
    tableName: "metas",
    localKey: "metas",
    getId: (item) => item.id,
    getUpdatedAt: (item) => item.updatedAt || new Date().toISOString(),
  },
  tasks: {
    tableName: "tasks",
    localKey: "tasks",
    getId: (item) => item.id,
    getUpdatedAt: (item) => item.updatedAt || new Date().toISOString(),
  },
  bankAccounts: {
    tableName: "bank_accounts",
    localKey: "bankAccounts",
    getId: (item) => item.id,
    getUpdatedAt: (item) => item.updatedAt || new Date().toISOString(),
  },
  financeMovements: {
    tableName: "finance_movements",
    localKey: "financeMovements",
    getId: (item) => item.id,
    getUpdatedAt: (item) => item.updatedAt || new Date().toISOString(),
  },
  incomeForecastLines: {
    tableName: "income_forecast_lines",
    localKey: "incomeForecastLines",
    getId: (item) => item.id,
    getUpdatedAt: (item) => item.updatedAt || new Date().toISOString(),
  },
  nutritionQuickItems: {
    tableName: "nutrition_quick_items",
    localKey: "nutritionQuickItems",
    getId: (item) => item.id,
    getUpdatedAt: (item) => item.updatedAt || new Date().toISOString(),
  },
};

export type EntityKey = keyof typeof ENTITY_CONFIGS;


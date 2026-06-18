"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import {
  pullAll,
  pushItem,
  pushDelete,
  mergeRemoteRows,
  getDirtyIds,
  markDirty,
  clearDirty,
  clearAllDirty,
  getLastPulledAt,
} from "./syncEngine";
import { EntityKey, SyncableEntity, SupabaseRow } from "./types";
import { type ForecastMonths } from "@/src/lib/finance/financeData";
import type { REOperation } from "@/src/lib/realEstate";

const APP_SETTINGS_ID = "__APP_SETTINGS__";

interface ModulesConfig {
  operaciones: { enabled: boolean };
}

const DEFAULT_MODULES: ModulesConfig = {
  operaciones: { enabled: true },
};

// ==================== STORE TYPES ====================

interface BankAccount extends SyncableEntity {
  name: string;
  type?: "PERSONAL" | "SOCIEDAD";
  balance?: number;
  order?: number;
}

interface ForecastLine extends SyncableEntity {
  name: string;
  type?: "INGRESO" | "GASTO";
  parentId?: string | null;
  months?: ForecastMonths;
  enabledTypes?: { INGRESO?: boolean; GASTO?: boolean };
  order?: number;
}

interface FinanceMovement extends SyncableEntity {
  date: string;
  concept?: string;
  amount: number;
  type: "INGRESO" | "GASTO";
  accountId?: string | null;
  forecastId?: string | null;
  tags?: string[];
  label?: string | null;
  note?: string | null;
  frequency?: "PUNTUAL" | "SEMANAL" | "MENSUAL";
  linkedPredictionId?: string | null;
}

interface SyncStore {
  bankAccounts: BankAccount[];
  incomeForecastLines: ForecastLine[];
  financeMovements: FinanceMovement[];
  realEstateOperations: REOperation[];
}

interface SyncContextValue {
  // Data
  bankAccounts: BankAccount[];
  incomeForecastLines: ForecastLine[];
  financeMovements: FinanceMovement[];
  realEstateOperations: REOperation[];

  // Actions
  setBankAccount: (item: BankAccount) => void;
  deleteBankAccount: (id: string) => void;
  setForecastLine: (item: ForecastLine) => void;
  deleteForecastLine: (id: string) => void;
  setFinanceMovement: (item: FinanceMovement) => void;
  deleteFinanceMovement: (id: string) => void;
  setRealEstateOperation: (item: REOperation) => void;
  deleteRealEstateOperation: (id: string) => void;

  // Silent notifications (no dirty, no push)
  notifyBankAccountUpdated: (item: BankAccount) => void;
  notifyBankAccountDeleted: (id: string) => void;
  notifyForecastLineUpdated: (item: ForecastLine) => void;
  notifyForecastLineDeleted: (id: string) => void;
  notifyFinanceMovementUpdated: (item: FinanceMovement) => void;
  notifyFinanceMovementDeleted: (id: string) => void;

  // Modules (from app_settings, shared with APP)
  modules: ModulesConfig;
  setModuleEnabled: (module: keyof ModulesConfig, enabled: boolean) => Promise<void>;

  // Sync
  isSyncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  triggerSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

// ==================== PROVIDER ====================

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [store, setStore] = useState<SyncStore>({
    bankAccounts: [],
    incomeForecastLines: [],
    financeMovements: [],
    realEstateOperations: [],
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [modules, setModules] = useState<ModulesConfig>(DEFAULT_MODULES);

  // Flag para evitar marcar dirty durante merge
  const isApplyingRemote = useRef(false);

  // Timestamp del último pull (ms) — para cooldown en visibilitychange
  const lastPullTimestampRef = useRef<number>(0);

  // Ref al store actual — permite que doPush lea datos frescos sin depender de `store`
  // (evita que doPush cambie de referencia tras cada setStore, cortando el bucle infinito)
  const storeRef = useRef(store);
  storeRef.current = store;

  // Push debounce
  const pushTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ==================== AUTH ====================

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUserId(session?.user?.id || null);
    };
    checkAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  // ==================== APP SETTINGS (modules) ====================

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("data")
        .eq("user_id", userId)
        .eq("id", APP_SETTINGS_ID)
        .maybeSingle();
      const remote = (data as any)?.data;
      if (remote?.modules) {
        setModules({
          operaciones: { enabled: remote.modules.operaciones?.enabled === true },
        });
      }
    })();
  }, [userId]);

  const setModuleEnabled = useCallback(async (module: keyof ModulesConfig, enabled: boolean) => {
    if (!userId) return;
    setModules((prev) => ({ ...prev, [module]: { enabled } }));

    const { data: existing } = await supabase
      .from("app_settings")
      .select("data")
      .eq("user_id", userId)
      .eq("id", APP_SETTINGS_ID)
      .maybeSingle();

    const now = new Date().toISOString();
    const base = (existing as any)?.data ?? {};
    const currentModules = base.modules ?? {};
    const updatedData = {
      ...base,
      modules: { ...currentModules, [module]: { enabled } },
      updatedAt: now,
    };

    await supabase.from("app_settings").upsert(
      { id: APP_SETTINGS_ID, user_id: userId, data: updatedData, client_updated_at: now },
      { onConflict: "id" }
    );
  }, [userId]);

  // ==================== PULL ====================

  const doPull = useCallback(async () => {
    if (!userId) return;

    setIsSyncing(true);
    setLastError(null);

    try {
      // If the store is empty (new session / hard refresh), force a full pull so the
      // in-memory store gets populated even when nothing changed since last pull.
      const storeIsEmpty =
        !storeRef.current.bankAccounts.length &&
        !storeRef.current.incomeForecastLines.length &&
        !storeRef.current.financeMovements.length &&
        !storeRef.current.realEstateOperations.length;
      const { data, errors } = await pullAll(userId, storeIsEmpty);

      if (errors.length > 0) {
        setLastError(errors.join("; "));
      }

      isApplyingRemote.current = true;

      setStore((prev) => ({
        bankAccounts: mergeRemoteRows(prev.bankAccounts, data.bankAccounts || [], "bankAccounts"),
        incomeForecastLines: mergeRemoteRows(prev.incomeForecastLines, data.incomeForecastLines || [], "incomeForecastLines"),
        financeMovements: mergeRemoteRows(prev.financeMovements, data.financeMovements || [], "financeMovements"),
        realEstateOperations: mergeRemoteRows(prev.realEstateOperations, data.realEstateOperations || [], "realEstateOperations"),
      }));

      isApplyingRemote.current = false;
      setLastSyncAt(new Date().toISOString());
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Pull failed");
    } finally {
      lastPullTimestampRef.current = Date.now();
      setIsSyncing(false);
    }
  }, [userId]);

  // ==================== PUSH ====================

  const doPush = useCallback(async () => {
    if (!userId) return;

    const dirty = getDirtyIds();
    const entityKeys = Object.keys(dirty) as EntityKey[];

    if (entityKeys.length > 0) {
      console.log("[Push] Starting push for entities:", entityKeys, dirty);
    }

    await Promise.allSettled(
      entityKeys.map(async (entityKey) => {
        const ids = dirty[entityKey] || [];
        const currentStore = storeRef.current;

        for (const id of ids) {
          let item: SyncableEntity | undefined;
          if (entityKey === "bankAccounts") {
            item = currentStore.bankAccounts.find((x) => x.id === id);
          } else if (entityKey === "incomeForecastLines") {
            item = currentStore.incomeForecastLines.find((x) => x.id === id);
          } else if (entityKey === "financeMovements") {
            item = currentStore.financeMovements.find((x) => x.id === id);
          } else if (entityKey === "realEstateOperations") {
            item = currentStore.realEstateOperations.find((x) => x.id === id);
          }

          console.log(`[Push] → ${entityKey}/${id}, item found: ${!!item}`);

          try {
            let result: { error: string | null };
            if (item) {
              result = item.deleted
                ? await pushDelete(entityKey, userId, id)
                : await pushItem(entityKey, userId, item);
            } else {
              result = await pushDelete(entityKey, userId, id);
            }

            if (result.error) {
              console.error(`[Push] FAILED ${entityKey}/${id}:`, result.error);
              // No llamar clearDirty — reintento en el siguiente push
            } else {
              console.log(`[Push] OK ${entityKey}/${id}`);
              clearDirty(entityKey, id);
            }
          } catch (err) {
            console.error(`[Push] EXCEPTION ${entityKey}/${id}:`, err);
            // item remains dirty for next push attempt
          }
        }
      })
    );
  }, [userId]); // store eliminado de deps: se lee via storeRef para no recrear doPush tras cada setStore

  const schedulePush = useCallback(() => {
    if (pushTimeoutRef.current) {
      clearTimeout(pushTimeoutRef.current);
    }
    pushTimeoutRef.current = setTimeout(() => {
      doPush();
    }, 500);
  }, [doPush]);

  // ==================== SYNC TRIGGER ====================

  const triggerSync = useCallback(async () => {
    await doPull();
    await doPush();
  }, [doPull, doPush]);

  // ==================== INITIAL SYNC ====================

  useEffect(() => {
    if (userId) {
      doPull().then(() => doPush());
    }
  }, [userId, doPull, doPush]);

  // ==================== PERIODIC SYNC ====================

  useEffect(() => {
    if (!userId) return;

    const interval = setInterval(() => {
      doPull();
    }, 180_000); // 180 segundos

    return () => clearInterval(interval);
  }, [userId, doPull]);

  // ==================== VISIBILITY CHANGE ====================

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && userId) {
        if (Date.now() - lastPullTimestampRef.current < 60_000) return;
        doPull();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [userId, doPull]);

  // ==================== STORE ACTIONS ====================

  const setBankAccount = useCallback(
    (item: BankAccount) => {
      const now = new Date().toISOString();
      const updated = { ...item, updatedAt: item.updatedAt || now };

      setStore((prev) => {
        const exists = prev.bankAccounts.find((x) => x.id === item.id);
        if (exists) {
          return {
            ...prev,
            bankAccounts: prev.bankAccounts.map((x) => (x.id === item.id ? updated : x)),
          };
        }
        return { ...prev, bankAccounts: [...prev.bankAccounts, updated] };
      });

      if (!isApplyingRemote.current) {
        markDirty("bankAccounts", item.id);
        schedulePush();
      }
    },
    [schedulePush]
  );

  const deleteBankAccount = useCallback(
    (id: string) => {
      setStore((prev) => ({
        ...prev,
        bankAccounts: prev.bankAccounts.filter((x) => x.id !== id),
      }));

      if (!isApplyingRemote.current) {
        markDirty("bankAccounts", id);
        schedulePush();
      }
    },
    [schedulePush]
  );

  const setForecastLine = useCallback(
    (item: ForecastLine) => {
      const now = new Date().toISOString();
      const updated = { ...item, updatedAt: item.updatedAt || now };

      setStore((prev) => {
        const exists = prev.incomeForecastLines.find((x) => x.id === item.id);
        if (exists) {
          return {
            ...prev,
            incomeForecastLines: prev.incomeForecastLines.map((x) => (x.id === item.id ? updated : x)),
          };
        }
        return { ...prev, incomeForecastLines: [...prev.incomeForecastLines, updated] };
      });

      if (!isApplyingRemote.current) {
        markDirty("incomeForecastLines", item.id);
        schedulePush();
      }
    },
    [schedulePush]
  );

  const deleteForecastLine = useCallback(
    (id: string) => {
      setStore((prev) => ({
        ...prev,
        incomeForecastLines: prev.incomeForecastLines.filter((x) => x.id !== id),
      }));

      if (!isApplyingRemote.current) {
        markDirty("incomeForecastLines", id);
        schedulePush();
      }
    },
    [schedulePush]
  );

  const setFinanceMovement = useCallback(
    (item: FinanceMovement) => {
      const now = new Date().toISOString();
      const updated = { ...item, updatedAt: item.updatedAt || now };

      setStore((prev) => {
        const exists = prev.financeMovements.find((x) => x.id === item.id);
        if (exists) {
          return {
            ...prev,
            financeMovements: prev.financeMovements.map((x) => (x.id === item.id ? updated : x)),
          };
        }
        return { ...prev, financeMovements: [...prev.financeMovements, updated] };
      });

      if (!isApplyingRemote.current) {
        markDirty("financeMovements", item.id);
        schedulePush();
      }
    },
    [schedulePush]
  );

  const deleteFinanceMovement = useCallback(
    (id: string) => {
      setStore((prev) => ({
        ...prev,
        financeMovements: prev.financeMovements.filter((x) => x.id !== id),
      }));

      if (!isApplyingRemote.current) {
        markDirty("financeMovements", id);
        schedulePush();
      }
    },
    [schedulePush]
  );

  const setRealEstateOperation = useCallback(
    (item: REOperation) => {
      const now = new Date().toISOString();
      const updated = { ...item, updatedAt: item.updatedAt || now };

      setStore((prev) => {
        const exists = prev.realEstateOperations.find((x) => x.id === item.id);
        if (exists) {
          return {
            ...prev,
            realEstateOperations: prev.realEstateOperations.map((x) => (x.id === item.id ? updated : x)),
          };
        }
        return { ...prev, realEstateOperations: [...prev.realEstateOperations, updated] };
      });

      if (!isApplyingRemote.current) {
        markDirty("realEstateOperations", item.id);
        schedulePush();
      }
    },
    [schedulePush]
  );

  const deleteRealEstateOperation = useCallback(
    (id: string) => {
      setStore((prev) => ({
        ...prev,
        realEstateOperations: prev.realEstateOperations.filter((x) => x.id !== id),
      }));

      if (!isApplyingRemote.current) {
        markDirty("realEstateOperations", id);
        schedulePush();
      }
    },
    [schedulePush]
  );

  // ==================== SILENT NOTIFY (no dirty, no push) ====================

  const notifyBankAccountUpdated = useCallback((item: BankAccount) => {
    setStore((prev) => {
      const exists = prev.bankAccounts.find((x) => x.id === item.id);
      if (exists) {
        return { ...prev, bankAccounts: prev.bankAccounts.map((x) => (x.id === item.id ? item : x)) };
      }
      return { ...prev, bankAccounts: [...prev.bankAccounts, item] };
    });
  }, []);

  const notifyBankAccountDeleted = useCallback((id: string) => {
    setStore((prev) => ({
      ...prev,
      bankAccounts: prev.bankAccounts.filter((x) => x.id !== id),
    }));
  }, []);

  const notifyForecastLineUpdated = useCallback((item: ForecastLine) => {
    setStore((prev) => {
      const exists = prev.incomeForecastLines.find((x) => x.id === item.id);
      if (exists) {
        return { ...prev, incomeForecastLines: prev.incomeForecastLines.map((x) => (x.id === item.id ? item : x)) };
      }
      return { ...prev, incomeForecastLines: [...prev.incomeForecastLines, item] };
    });
  }, []);

  const notifyForecastLineDeleted = useCallback((id: string) => {
    setStore((prev) => ({
      ...prev,
      incomeForecastLines: prev.incomeForecastLines.filter((x) => x.id !== id),
    }));
  }, []);

  const notifyFinanceMovementUpdated = useCallback((item: FinanceMovement) => {
    setStore((prev) => {
      const exists = prev.financeMovements.find((x) => x.id === item.id);
      if (exists) {
        return { ...prev, financeMovements: prev.financeMovements.map((x) => (x.id === item.id ? item : x)) };
      }
      return { ...prev, financeMovements: [...prev.financeMovements, item] };
    });
  }, []);

  const notifyFinanceMovementDeleted = useCallback((id: string) => {
    setStore((prev) => ({
      ...prev,
      financeMovements: prev.financeMovements.filter((x) => x.id !== id),
    }));
  }, []);

  // ==================== CONTEXT VALUE ====================

  const value = useMemo<SyncContextValue>(() => ({
    bankAccounts: store.bankAccounts,
    incomeForecastLines: store.incomeForecastLines,
    financeMovements: store.financeMovements,
    realEstateOperations: store.realEstateOperations,
    setBankAccount,
    deleteBankAccount,
    setForecastLine,
    deleteForecastLine,
    setFinanceMovement,
    deleteFinanceMovement,
    setRealEstateOperation,
    deleteRealEstateOperation,
    notifyBankAccountUpdated,
    notifyBankAccountDeleted,
    notifyForecastLineUpdated,
    notifyForecastLineDeleted,
    notifyFinanceMovementUpdated,
    notifyFinanceMovementDeleted,
    modules,
    setModuleEnabled,
    isSyncing,
    lastSyncAt,
    lastError,
    triggerSync,
  }), [
    store.bankAccounts, store.incomeForecastLines, store.financeMovements, store.realEstateOperations,
    setBankAccount, deleteBankAccount, setForecastLine, deleteForecastLine,
    setFinanceMovement, deleteFinanceMovement,
    setRealEstateOperation, deleteRealEstateOperation,
    notifyBankAccountUpdated, notifyBankAccountDeleted,
    notifyForecastLineUpdated, notifyForecastLineDeleted,
    notifyFinanceMovementUpdated, notifyFinanceMovementDeleted,
    modules, setModuleEnabled,
    isSyncing, lastSyncAt, lastError, triggerSync,
  ]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

// ==================== HOOK ====================

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync must be used within SyncProvider");
  }
  return context;
}

// Hook opcional para componentes que solo necesitan datos
export function useSyncData() {
  const { bankAccounts, incomeForecastLines, financeMovements, realEstateOperations, isSyncing, lastSyncAt, lastError } =
    useSync();
  return { bankAccounts, incomeForecastLines, financeMovements, realEstateOperations, isSyncing, lastSyncAt, lastError };
}


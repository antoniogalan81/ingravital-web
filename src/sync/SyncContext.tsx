"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
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

// ==================== STORE TYPES ====================

interface BankAccount extends SyncableEntity {
  name: string;
  type?: "PERSONAL" | "SOCIEDAD";
  balance?: number;
}

interface ForecastLine extends SyncableEntity {
  name: string;
  type: "INGRESO" | "GASTO";
  parentId?: string | null;
  months?: Record<string, { expected?: number; base?: number }>;
}

interface FinanceMovement extends SyncableEntity {
  date: string;
  concept?: string;
  amount: number;
  type: "INGRESO" | "GASTO";
  accountId?: string;
  forecastId?: string;
}

interface SyncStore {
  bankAccounts: BankAccount[];
  incomeForecastLines: ForecastLine[];
  financeMovements: FinanceMovement[];
}

interface SyncContextValue {
  // Data
  bankAccounts: BankAccount[];
  incomeForecastLines: ForecastLine[];
  financeMovements: FinanceMovement[];

  // Actions
  setBankAccount: (item: BankAccount) => void;
  deleteBankAccount: (id: string) => void;
  setForecastLine: (item: ForecastLine) => void;
  deleteForecastLine: (id: string) => void;
  setFinanceMovement: (item: FinanceMovement) => void;
  deleteFinanceMovement: (id: string) => void;

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
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Flag para evitar marcar dirty durante merge
  const isApplyingRemote = useRef(false);

  // Push debounce
  const pushTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ==================== AUTH ====================

  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data?.user?.id || null);
    };
    checkAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  // ==================== PULL ====================

  const doPull = useCallback(async () => {
    if (!userId) return;

    setIsSyncing(true);
    setLastError(null);

    try {
      const { data, errors } = await pullAll(userId);

      if (errors.length > 0) {
        setLastError(errors.join("; "));
      }

      isApplyingRemote.current = true;

      setStore((prev) => ({
        bankAccounts: mergeRemoteRows(prev.bankAccounts, data.bankAccounts || [], "bankAccounts"),
        incomeForecastLines: mergeRemoteRows(prev.incomeForecastLines, data.incomeForecastLines || [], "incomeForecastLines"),
        financeMovements: mergeRemoteRows(prev.financeMovements, data.financeMovements || [], "financeMovements"),
      }));

      isApplyingRemote.current = false;
      setLastSyncAt(new Date().toISOString());
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Pull failed");
    } finally {
      setIsSyncing(false);
    }
  }, [userId]);

  // ==================== PUSH ====================

  const doPush = useCallback(async () => {
    if (!userId) return;

    const dirty = getDirtyIds();
    const entityKeys = Object.keys(dirty) as EntityKey[];

    for (const entityKey of entityKeys) {
      const ids = dirty[entityKey] || [];

      for (const id of ids) {
        let item: SyncableEntity | undefined;

        if (entityKey === "bankAccounts") {
          item = store.bankAccounts.find((x) => x.id === id);
        } else if (entityKey === "incomeForecastLines") {
          item = store.incomeForecastLines.find((x) => x.id === id);
        } else if (entityKey === "financeMovements") {
          item = store.financeMovements.find((x) => x.id === id);
        }

        if (item) {
          if (item.deleted) {
            await pushDelete(entityKey, userId, id);
          } else {
            await pushItem(entityKey, userId, item);
          }
          clearDirty(entityKey, id);
        } else {
          // Item was deleted locally, push delete
          await pushDelete(entityKey, userId, id);
          clearDirty(entityKey, id);
        }
      }
    }
  }, [userId, store]);

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
    }, 90000); // 90 segundos

    return () => clearInterval(interval);
  }, [userId, doPull]);

  // ==================== VISIBILITY CHANGE ====================

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && userId) {
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

  // ==================== CONTEXT VALUE ====================

  const value: SyncContextValue = {
    bankAccounts: store.bankAccounts,
    incomeForecastLines: store.incomeForecastLines,
    financeMovements: store.financeMovements,
    setBankAccount,
    deleteBankAccount,
    setForecastLine,
    deleteForecastLine,
    setFinanceMovement,
    deleteFinanceMovement,
    isSyncing,
    lastSyncAt,
    lastError,
    triggerSync,
  };

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
  const { bankAccounts, incomeForecastLines, financeMovements, isSyncing, lastSyncAt, lastError } =
    useSync();
  return { bankAccounts, incomeForecastLines, financeMovements, isSyncing, lastSyncAt, lastError };
}


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
} from "./syncEngine";
import { EntityKey, SyncableEntity } from "./types";
import type { REOperation } from "@/src/lib/realEstate";

// ==================== STORE TYPES ====================
// La WEB solo sincroniza operaciones inmobiliarias (núcleo del producto).

interface SyncStore {
  realEstateOperations: REOperation[];
}

interface SyncContextValue {
  // Data
  realEstateOperations: REOperation[];

  // Actions
  setRealEstateOperation: (item: REOperation) => void;
  deleteRealEstateOperation: (id: string) => void;

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
    realEstateOperations: [],
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

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

  // ==================== PULL ====================

  const doPull = useCallback(async () => {
    if (!userId) return;

    setIsSyncing(true);
    setLastError(null);

    try {
      // If the store is empty (new session / hard refresh), force a full pull so the
      // in-memory store gets populated even when nothing changed since last pull.
      const storeIsEmpty = !storeRef.current.realEstateOperations.length;
      const { data, errors } = await pullAll(userId, storeIsEmpty);

      if (errors.length > 0) {
        setLastError(errors.join("; "));
      }

      isApplyingRemote.current = true;

      setStore((prev) => ({
        realEstateOperations: mergeRemoteRows(prev.realEstateOperations, data.realEstateOperations || []),
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
          if (entityKey === "realEstateOperations") {
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

  // ==================== CONTEXT VALUE ====================

  const value = useMemo<SyncContextValue>(() => ({
    realEstateOperations: store.realEstateOperations,
    setRealEstateOperation,
    deleteRealEstateOperation,
    isSyncing,
    lastSyncAt,
    lastError,
    triggerSync,
  }), [
    store.realEstateOperations,
    setRealEstateOperation, deleteRealEstateOperation,
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
  const { realEstateOperations, isSyncing, lastSyncAt, lastError } = useSync();
  return { realEstateOperations, isSyncing, lastSyncAt, lastError };
}

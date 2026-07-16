"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import {
  pullAll,
  pushItem,
  pushDelete,
  mergeRemoteRows,
  mergeOperationEntity,
  getDirtyIds,
  markDirty,
  clearDirty,
  setSyncUser,
  migrateLegacyKeys,
  loadEntityCache,
  saveEntityCache,
  getDeletedIds,
  markDeleted,
  clearDeleted,
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
  // El usuario viene de AuthContext (única fuente de verdad de la sesión).
  // Antes SyncProvider llamaba a su propio getSession()/onAuthStateChange, lo que
  // duplicaba la inicialización de auth (dos listeners, dos getSession) y podía
  // divergir de AuthContext (que descarta sesiones expiradas). Al consumir
  // useAuth() no hay duplicación y `userId` es siempre coherente con la sesión
  // realmente utilizable.
  const { user } = useAuth();
  const userId = user?.id ?? null;
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

  // Ref al programador de push. Permite que doPull dispare una re-subida de convergencia
  // (tras fusionar por colección) sin depender de `schedulePush`, que se declara más
  // abajo (evita problemas de orden de declaración en las deps de useCallback).
  const schedulePushRef = useRef<() => void>(() => {});

  // ==================== AISLAMIENTO POR USUARIO + HIDRATACIÓN OFFLINE ====================
  // Al cambiar de usuario: fijamos el aislamiento de claves, migramos claves antiguas
  // (una vez) y REEMPLAZAMOS el store por la caché local de ESE usuario (o vacío). Así:
  //  · las ediciones sobreviven a un refresco sin conexión (arranque instantáneo),
  //  · nunca se muestran datos de otra cuenta tras cambiar de usuario.
  // Debe declararse ANTES del efecto de sync inicial para que `setSyncUser` se aplique
  // antes de cualquier pull/push (los efectos corren en orden de declaración).
  useEffect(() => {
    setSyncUser(userId);
    if (!userId) {
      setStore({ realEstateOperations: [] });
      return;
    }
    migrateLegacyKeys();
    const cached = loadEntityCache("realEstateOperations") as REOperation[] | null;
    setStore({ realEstateOperations: cached ?? [] });
  }, [userId]);

  // Persistimos la copia local ante cualquier cambio, para que sobreviva a refrescos
  // offline. Escritura protegida (quota/modo privado no rompen la app).
  useEffect(() => {
    if (!userId) return;
    saveEntityCache("realEstateOperations", store.realEstateOperations);
  }, [store.realEstateOperations, userId]);

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

      // Fusión por COLECCIÓN: cuando existe copia local y remota de una operación se
      // fusionan sus sub-colecciones por id (no se pisan arrays enteros). `needsRepush`
      // recoge los ids cuya unión aporta datos que el remoto aún no tiene, para volver a
      // subirlos y que el otro dispositivo los reciba (convergencia).
      const needsRepush = new Set<string>();
      const mergedOps = mergeRemoteRows(
        storeRef.current.realEstateOperations,
        data.realEstateOperations || [],
        { combine: mergeOperationEntity, needsRepush }
      );

      isApplyingRemote.current = true;
      setStore({ realEstateOperations: mergedOps });
      isApplyingRemote.current = false;

      // Marcar dirty las operaciones fusionadas con datos propios y re-subir la unión.
      if (needsRepush.size > 0) {
        for (const id of needsRepush) markDirty("realEstateOperations", id);
        schedulePushRef.current();
      }

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
    const deleted = getDeletedIds();
    const entityKeys = Object.keys(dirty) as EntityKey[];
    const errors: string[] = [];

    await Promise.allSettled(
      entityKeys.map(async (entityKey) => {
        const ids = dirty[entityKey] || [];
        const delIds = deleted[entityKey] || [];
        const currentStore = storeRef.current;

        for (const id of ids) {
          let item: SyncableEntity | undefined;
          if (entityKey === "realEstateOperations") {
            item = currentStore.realEstateOperations.find((x) => x.id === id);
          }

          // Solo se envía tombstone si el borrado es EXPLÍCITO (id en la lista de
          // borrados o item.deleted). Un "dirty sin item" que NO es borrado explícito
          // se deja pendiente: jamás tombstoneamos una operación viva por un hueco de
          // memoria (esa era la causa del borrado accidental tras un refresco).
          const isDeleted = delIds.includes(id) || !!item?.deleted;

          try {
            let result: { error: string | null };
            if (isDeleted) {
              result = await pushDelete(entityKey, userId, id);
            } else if (item) {
              result = await pushItem(entityKey, userId, item);
            } else {
              continue; // sin item y sin borrado explícito → no tocar la nube
            }

            if (result.error) {
              errors.push(`${entityKey}/${id}: ${result.error}`);
              // se mantiene dirty para reintentar en el próximo push
            } else {
              clearDirty(entityKey, id);
              if (isDeleted) clearDeleted(entityKey, id);
            }
          } catch (err) {
            errors.push(`${entityKey}/${id}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      })
    );

    // Estado HONESTO: si algún push falló, se expone el error (los items quedan dirty
    // y se reintentan). No se marca como sincronizado algo que no lo está.
    if (errors.length > 0) {
      setLastError(errors.join("; "));
    }
  }, [userId]); // store eliminado de deps: se lee via storeRef para no recrear doPush tras cada setStore

  const schedulePush = useCallback(() => {
    if (pushTimeoutRef.current) {
      clearTimeout(pushTimeoutRef.current);
    }
    pushTimeoutRef.current = setTimeout(() => {
      doPush();
    }, 500);
  }, [doPush]);

  // Mantener el ref del programador de push al día para la convergencia desde doPull.
  schedulePushRef.current = schedulePush;

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
        markDeleted("realEstateOperations", id); // borrado EXPLÍCITO → sí tombstone
        markDirty("realEstateOperations", id);
        schedulePush();
      }
    },
    [schedulePush]
  );

  // Flush best-effort al ocultar/cerrar la pestaña: si hay un push debounced pendiente
  // (edición en los últimos 500 ms), se intenta enviar ya. Si no llega a completarse,
  // el dirty persiste y se reintenta en la próxima apertura (sin pérdida).
  useEffect(() => {
    const flush = () => {
      if (pushTimeoutRef.current) {
        clearTimeout(pushTimeoutRef.current);
        pushTimeoutRef.current = null;
        void doPush();
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [doPush]);

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

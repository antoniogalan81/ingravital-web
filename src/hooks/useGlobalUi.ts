"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  type GlobalUIStateV1,
  GLOBAL_UI_DEFAULT,
  getGlobalUiKey,
  readGlobalUi,
  writeGlobalUi,
} from "@/src/lib/uiGlobalState";

/**
 * Hook compartido para estado global de UI (hideCompletedTasks, etc.).
 * Persiste en localStorage con debounce.
 * Escucha evento "storage" para sincronizar entre pestañas.
 *
 * IMPORTANTE: No hidrata ni persiste hasta que userId sea un string no vacío.
 * Esto evita el bug de escribir en key "anon" y luego sobreescribir la key real.
 *
 * @param userId - userId del usuario autenticado, o null/undefined mientras carga
 */
export function useGlobalUi(userId: string | null | undefined) {
  const [state, setState] = useState<GlobalUIStateV1>(GLOBAL_UI_DEFAULT);
  const hydrated = useRef(false);
  const prevKeyRef = useRef<string | null>(null);
  const storageKey = userId ? getGlobalUiKey(userId) : null;

  // Hydrate from localStorage — runs when userId becomes available
  useEffect(() => {
    if (!userId) return;
    const key = getGlobalUiKey(userId);
    // Re-hydrate if key changed (first time, or userId went from null to real)
    if (prevKeyRef.current === key && hydrated.current) return;
    prevKeyRef.current = key;
    hydrated.current = true;
    setState(readGlobalUi(userId));
  }, [userId]);

  // Debounced persist — only when userId is stable
  useEffect(() => {
    if (!userId || !hydrated.current) return;
    const timer = setTimeout(() => {
      writeGlobalUi(userId, state);
    }, 250);
    return () => clearTimeout(timer);
  }, [state, userId]);

  // Cross-tab sync via storage event
  useEffect(() => {
    if (typeof window === "undefined" || !storageKey) return;
    const handler = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : null;
        if (parsed && parsed.v === 1) {
          setState({ ...GLOBAL_UI_DEFAULT, ...parsed });
        }
      } catch {
        // ignore malformed
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [storageKey]);

  // Setter for hideCompletedTasks
  const setHideCompletedTasks = useCallback((next: boolean) => {
    setState(prev => ({ ...prev, hideCompletedTasks: next }));
  }, []);

  return {
    hideCompletedTasks: state.hideCompletedTasks,
    setHideCompletedTasks,
  } as const;
}

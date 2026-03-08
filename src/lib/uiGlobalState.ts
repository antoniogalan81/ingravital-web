/**
 * Estado global de UI compartido entre vistas (Metas y Agenda).
 * Persistido en localStorage, SSR-safe.
 */

import { readUiState, writeUiState } from "./uiLocalState";

// ==================== TIPOS ====================

export interface GlobalUIStateV1 {
  v: 1;
  hideCompletedTasks: boolean;
}

export const GLOBAL_UI_DEFAULT: GlobalUIStateV1 = {
  v: 1,
  hideCompletedTasks: false,
};

// ==================== KEY ====================

const BASE = "ingravital.ui.global.v1";

export function getGlobalUiKey(userKey?: string): string {
  return `${BASE}.${userKey || "anon"}`;
}

// ==================== READ / WRITE ====================

export function readGlobalUi(userKey?: string): GlobalUIStateV1 {
  return readUiState<GlobalUIStateV1>(getGlobalUiKey(userKey), GLOBAL_UI_DEFAULT);
}

export function writeGlobalUi(userKey?: string, next?: GlobalUIStateV1): void {
  if (next) writeUiState(getGlobalUiKey(userKey), next);
}

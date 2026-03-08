/**
 * Persistencia local de estado UI (localStorage).
 * SSR-safe, con fallback y versionado.
 */

const BASE_KEY = "ingravital.ui";

// ==================== TIPOS ====================

export interface MetasUILocalStateV1 {
  v: 1;
  collapsedById: Record<string, boolean>;
  hideDoneMultiByTaskId: Record<string, boolean>;
}

export interface AgendaUILocalStateV1 {
  v: 1;
  collapsedById: Record<string, boolean>;
  hideDoneMultiByTaskId: Record<string, boolean>;
}

// ==================== DEFAULTS ====================

export const DEFAULT_METAS_LOCAL: MetasUILocalStateV1 = {
  v: 1,
  collapsedById: {},
  hideDoneMultiByTaskId: {},
};

export const DEFAULT_AGENDA_LOCAL: AgendaUILocalStateV1 = {
  v: 1,
  collapsedById: {},
  hideDoneMultiByTaskId: {},
};

// ==================== HELPERS ====================

function buildKey(view: string, userKey: string): string {
  return `${BASE_KEY}.${view}.v1.${userKey}`;
}

export function readUiState<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.v === 1) {
      return { ...fallback, ...parsed } as T;
    }
    // Schema mismatch — wipe and use fallback
    localStorage.removeItem(key);
    return fallback;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

export function writeUiState<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage full or disabled — ignore
  }
}

/**
 * Filtra un Record<string, boolean> para retener solo ids presentes en validIds.
 * Devuelve el mismo objeto si no hay cambios, para evitar re-renders.
 */
export function pruneRecord(
  rec: Record<string, boolean>,
  validIds: Set<string>
): Record<string, boolean> {
  const keys = Object.keys(rec);
  const toRemove = keys.filter(k => !validIds.has(k));
  if (toRemove.length === 0) return rec;
  const copy: Record<string, boolean> = {};
  for (const k of keys) {
    if (validIds.has(k)) copy[k] = rec[k];
  }
  return copy;
}

// ==================== VIEW-SPECIFIC HELPERS ====================

export function getMetasKey(userId?: string): string {
  return buildKey("metas", userId || "anon");
}

export function getAgendaKey(userId?: string): string {
  return buildKey("agenda", userId || "anon");
}

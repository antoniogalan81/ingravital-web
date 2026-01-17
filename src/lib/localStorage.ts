import type { AgendaUIState, FilterPreset, TaskFilters } from "./types";
import { DEFAULT_UI_STATE, DEFAULT_FILTERS } from "./types";

const STORAGE_KEY = "ingravital_agenda_ui";

/**
 * Carga el estado de UI desde localStorage
 */
export function loadUIState(): AgendaUIState {
  if (typeof window === "undefined") return DEFAULT_UI_STATE;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_UI_STATE;
    
    const parsed = JSON.parse(stored);
    return {
      ...DEFAULT_UI_STATE,
      ...parsed,
      activeFilters: {
        ...DEFAULT_FILTERS,
        ...parsed.activeFilters,
      },
    };
  } catch {
    return DEFAULT_UI_STATE;
  }
}

/**
 * Guarda el estado de UI en localStorage
 */
export function saveUIState(state: AgendaUIState): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage puede fallar si está lleno o deshabilitado
  }
}

/**
 * Actualiza parcialmente el estado de UI
 */
export function updateUIState(partial: Partial<AgendaUIState>): AgendaUIState {
  const current = loadUIState();
  const updated = { ...current, ...partial };
  saveUIState(updated);
  return updated;
}

/**
 * Guarda un preset nuevo
 */
export function savePreset(preset: FilterPreset): AgendaUIState {
  const current = loadUIState();
  const existingIndex = current.presets.findIndex((p) => p.id === preset.id);
  
  if (existingIndex >= 0) {
    current.presets[existingIndex] = preset;
  } else {
    current.presets.push(preset);
  }
  
  saveUIState(current);
  return current;
}

/**
 * Elimina un preset
 */
export function deletePreset(presetId: string): AgendaUIState {
  const current = loadUIState();
  current.presets = current.presets.filter((p) => p.id !== presetId);
  saveUIState(current);
  return current;
}

/**
 * Actualiza los filtros activos
 */
export function updateFilters(filters: TaskFilters): AgendaUIState {
  return updateUIState({ activeFilters: filters });
}

/**
 * Resetea los filtros a valores por defecto
 */
export function resetFilters(): AgendaUIState {
  return updateUIState({ activeFilters: DEFAULT_FILTERS });
}

/**
 * Genera un ID único para presets
 */
export function generatePresetId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}


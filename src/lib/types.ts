// Tipos para Task según el modelo de Supabase (alineado con móvil)

export type TaskType = "ACTIVIDAD" | "INGRESO" | "GASTO";
export type TaskScope = "LABORAL" | "FISICO" | "CRECIMIENTO";
export type TaskStatus = "done" | "pending" | "hidden";
export type Frequency = "PUNTUAL" | "SEMANAL" | "MENSUAL";

export interface TaskExtra {
  completedDates?: string[];
  movementIdsByDate?: Record<string, string>;
  // Frecuencia y repetición
  frequency?: Frequency;
  weeklyDays?: number[];        // 0=Dom, 1=Lun, ..., 6=Sab
  weeklyTime?: string;          // HH:MM
  monthlyDay?: number;          // 1-31
  monthlyTime?: string;         // HH:MM
  unscheduled?: boolean;        // Sin fecha (frecuencia PUNTUAL sin date)
  // Campos financieros
  amountEUR?: number;           // Importe para INGRESO/GASTO
  // Campos adicionales
  notes?: string;
  // Permitir campos adicionales sin romper tipado
  [key: string]: unknown;
}

export interface TaskData {
  id: string;
  metaId?: string;
  parentId?: string;
  level: number;
  order: number;
  type: TaskType;
  scope?: TaskScope;
  title: string;
  label?: string;               // Etiqueta para Fisico/Conocimiento
  description?: string;
  date?: string;
  time?: string;
  points?: number;              // Default 2
  isCompleted?: boolean;
  accountId?: string;           // FK a bank_accounts
  forecastId?: string;          // FK a income_forecast_lines
  extra?: TaskExtra;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskRow {
  id: string;
  user_id: string;
  data: TaskData;
  client_updated_at: string;
  server_updated_at?: string;
  deleted_at: string | null;
}

// Meta desde Supabase (tabla metas)
export interface MetaData {
  id: string;
  title?: string;
  name?: string;
  description?: string;
}

export interface MetaRow {
  id: string;
  user_id: string;
  data: MetaData;
  deleted_at: string | null;
}

export interface Meta {
  id: string;
  title: string;
  description?: string;
}

// Bank Account desde Supabase
export interface BankAccount {
  id: string;
  name: string;
}

// Income Forecast Line desde Supabase
export interface ForecastLine {
  id: string;
  name: string;
  type: "INGRESO" | "GASTO";
}

// Scoring Item desde app_settings.scoringSettings.items[]
// Categorías: PHYSICAL -> FISICO, KNOWLEDGE -> CRECIMIENTO
export interface ScoringItem {
  key: string;          // ID único del item
  label: string;        // Nombre a mostrar
  points: number;       // Puntos asociados
  category: "PHYSICAL" | "KNOWLEDGE" | "FOOD";
}

// Etiquetas para Fisico/Conocimiento (derivadas de ScoringItem)
export interface Label {
  id: string;
  name: string;
  points: number;       // Puntos del scoring
  scope: TaskScope;
}

// Mapeo de categorías scoring -> scope
export const SCORING_CATEGORY_TO_SCOPE: Record<string, TaskScope> = {
  "PHYSICAL": "FISICO",
  "KNOWLEDGE": "CRECIMIENTO",
};

// Filtros de la UI
export interface TaskFilters {
  metaIds: string[];
  types: TaskType[];
  statuses: TaskStatus[];
  dateFrom?: string;
  dateTo?: string;
  showChildren: boolean;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: TaskFilters;
}

// Estado de UI (localStorage)
export interface AgendaUIState {
  sidebarCollapsed: boolean;
  columnWidths: Record<string, number>;
  columnOrder: string[];
  presets: FilterPreset[];
  activeFilters: TaskFilters;
}

// Tipos UI para columna Tipo
export type UITaskType = "Actividad" | "Fisico" | "Conocimiento" | "Ingreso" | "Gasto";

// Mapping UI Tipo -> TaskType + TaskScope
export const UI_TYPE_MAPPING: Record<UITaskType, { type: TaskType; scope?: TaskScope }> = {
  "Actividad": { type: "ACTIVIDAD", scope: "LABORAL" },
  "Fisico": { type: "ACTIVIDAD", scope: "FISICO" },
  "Conocimiento": { type: "ACTIVIDAD", scope: "CRECIMIENTO" },
  "Ingreso": { type: "INGRESO" },
  "Gasto": { type: "GASTO" },
};

// Reverse mapping
export function getUIType(type: TaskType, scope?: TaskScope): UITaskType {
  if (type === "INGRESO") return "Ingreso";
  if (type === "GASTO") return "Gasto";
  if (type === "ACTIVIDAD") {
    if (scope === "FISICO") return "Fisico";
    if (scope === "CRECIMIENTO") return "Conocimiento";
    return "Actividad";
  }
  return "Actividad";
}

// Colores sutiles por tipo (2-4% opacity)
export const TYPE_COLORS: Record<TaskType, string> = {
  ACTIVIDAD: "rgba(59, 130, 246, 0.03)",
  INGRESO: "rgba(34, 197, 94, 0.04)",
  GASTO: "rgba(239, 68, 68, 0.03)",
};

// Filtros por defecto
export const DEFAULT_FILTERS: TaskFilters = {
  metaIds: [],
  types: [],
  statuses: [],
  showChildren: true,
};

export const DEFAULT_UI_STATE: AgendaUIState = {
  sidebarCollapsed: false,
  columnWidths: {},
  columnOrder: [],
  presets: [],
  activeFilters: DEFAULT_FILTERS,
};

// Días de la semana
export const WEEKDAYS = ["D", "L", "M", "X", "J", "V", "S"];

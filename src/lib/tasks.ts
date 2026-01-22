import { supabase } from "./supabaseClient";
import type { TaskRow, TaskData, TaskFilters, TaskType, Meta, MetaRow, MetaData, BankAccount, ForecastLine, Label, TaskScope, TaskExtra } from "./types";
import { SCORING_CATEGORY_TO_SCOPE } from "./types";
import { normalizeTaskForDb, hydrateTaskFromDb, recalculateTaskLevels } from "../sync/normalizeTask";
import { normalizeMetaForDb, hydrateMetaFromDb } from "../sync/normalizeMeta";

// ==================== TASKS ====================

export async function fetchTasks(): Promise<{ data: TaskRow[] | null; error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { data: null, error: "No autenticado" };
  }

  const { data, error } = await supabase
    .from("tasks")
    .select("id, user_id, data, client_updated_at, server_updated_at, deleted_at")
    .eq("user_id", userData.user.id)
    .is("deleted_at", null)
    .order("client_updated_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  // Hidratar tasks desde DB y recalcular levels
  const rawTasks = data as { id: string; user_id: string; data: Record<string, unknown>; client_updated_at: string; server_updated_at?: string; deleted_at: string | null }[];
  const hydratedTasks = rawTasks.map(row => ({
    ...row,
    data: hydrateTaskFromDb(row.data),
  })) as TaskRow[];
  
  // Recalcular levels basándose en parentId
  const allTaskData = hydratedTasks.map(t => t.data);
  const withLevels = recalculateTaskLevels(allTaskData);
  
  // Actualizar los TaskRow con los levels recalculados
  const result = hydratedTasks.map((row, i) => ({
    ...row,
    data: withLevels[i],
  }));

  return { data: result, error: null };
}

export async function createTask(taskData: TaskData): Promise<{ data: TaskRow | null; error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { data: null, error: "No autenticado" };
  }

  const now = new Date().toISOString();
  
  // Normalizar task antes de guardar (elimina nulls, aplica reglas de frecuencia, etc.)
  const normalizedData = normalizeTaskForDb({
    ...taskData,
    createdAt: taskData.createdAt || now,
  });

  const payload = {
    id: taskData.id,
    user_id: userData.user.id,
    data: normalizedData,
    client_updated_at: now,
    deleted_at: null,
  };

  const { data, error } = await supabase
    .from("tasks")
    .insert(payload)
    .select("id, user_id, data, client_updated_at, server_updated_at, deleted_at")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  // Hidratar el resultado para devolverlo con todos los campos esperados por la UI
  const resultRow = data as { id: string; user_id: string; data: Record<string, unknown>; client_updated_at: string; server_updated_at?: string; deleted_at: string | null };
  return { 
    data: {
      ...resultRow,
      data: hydrateTaskFromDb(resultRow.data),
    } as TaskRow, 
    error: null 
  };
}

export async function updateTask(id: string, taskData: Partial<TaskData>): Promise<{ data: TaskRow | null; error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { data: null, error: "No autenticado" };
  }

  const { data: currentTask, error: fetchError } = await supabase
    .from("tasks")
    .select("data")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .single();

  if (fetchError || !currentTask) {
    return { data: null, error: fetchError?.message || "Tarea no encontrada" };
  }

  // Hidratar la tarea existente para tener todos los campos
  const existing = hydrateTaskFromDb(currentTask.data as Record<string, unknown>);
  const now = new Date().toISOString();

  // Detectar si hay cambio de tipo o scope
  const typeChanged = taskData.type !== undefined && taskData.type !== existing.type;
  const scopeChanged = taskData.scope !== undefined && taskData.scope !== existing.scope;
  const needsSanitize = typeChanged || scopeChanged;

  let mergedData: TaskData;

  if (needsSanitize) {
    // Si cambia tipo/scope: primero merge, luego sanitize (elimina campos del tipo anterior)
    const merged: TaskData = {
      ...existing,
      ...taskData,
      extra: {
        ...(existing.extra || {}),
        ...(taskData.extra || {}),
      },
      updatedAt: now,
    };
    mergedData = sanitizeTaskDataByType(merged, existing) as TaskData;
  } else {
    // Sin cambio de tipo: merge normal
    let mergedExtra = existing.extra;
    if (taskData.extra) {
      mergedExtra = {
        ...(existing.extra || {}),
        ...taskData.extra,
      };
    }
    mergedData = {
      ...existing,
      ...taskData,
      extra: mergedExtra,
      updatedAt: now,
    };
  }

  // Normalizar antes de guardar (elimina nulls, aplica reglas de frecuencia)
  const normalizedData = normalizeTaskForDb(mergedData);

  const { data, error } = await supabase
    .from("tasks")
    .update({
      data: normalizedData,
      client_updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .select("id, user_id, data, client_updated_at, server_updated_at, deleted_at")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  // Hidratar el resultado para devolverlo con todos los campos esperados por la UI
  const resultRow = data as { id: string; user_id: string; data: Record<string, unknown>; client_updated_at: string; server_updated_at?: string; deleted_at: string | null };
  return { 
    data: {
      ...resultRow,
      data: hydrateTaskFromDb(resultRow.data),
    } as TaskRow, 
    error: null 
  };
}

export async function deleteTask(id: string): Promise<{ error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { error: "No autenticado" };
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("tasks")
    .update({
      deleted_at: now,
      client_updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userData.user.id);

  return { error: error?.message || null };
}

export async function restoreTask(id: string): Promise<{ error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { error: "No autenticado" };
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("tasks")
    .update({
      deleted_at: null,
      client_updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userData.user.id);

  return { error: error?.message || null };
}

// ==================== METAS ====================

type MetaType = "MOONSHOT" | "LARGO_PLAZO" | "CORTO_PLAZO";
type Horizon = "1M" | "3M" | "6M" | "9M" | "1Y" | "3Y" | "5Y" | "10Y";

type SaveMetaInput = {
  title: string;
  description?: string;
  targetDate: string;
  metaType: MetaType;
  horizon?: Horizon;
};

export async function fetchMetas(): Promise<{ data: Meta[] | null; error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { data: null, error: "No autenticado" };
  }

  const { data, error } = await supabase
    .from("metas")
    .select("id, user_id, data, deleted_at")
    .eq("user_id", userData.user.id)
    .is("deleted_at", null);

  if (error) {
    return { data: null, error: error.message };
  }

  // Hidratar metas desde DB usando el normalizador
  const metas: Meta[] = (data || []).map((row: MetaRow) => {
    const metaData = row.data as Record<string, unknown>;
    // Asegurar que el id del row se use (por si data no lo tiene)
    return hydrateMetaFromDb({ ...metaData, id: row.id });
  });

  // Ordenar por order ascendente (metas sin order al final)
  metas.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

  return { data: metas, error: null };
}

export async function createMeta(input: SaveMetaInput): Promise<{ data: Meta | null; error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { data: null, error: "No autenticado" };
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  // Normalizar meta antes de guardar (mismas reglas que APP)
  const normalizedData = normalizeMetaForDb({
    id,
    title: input.title,
    description: input.description,
    targetDate: input.targetDate,
    metaType: input.metaType,
    horizon: input.horizon,
    isActive: true, // Nueva meta siempre activa (no se persiste porque es true)
    createdAt: now,
  });

  const payload = {
    id,
    user_id: userData.user.id,
    data: normalizedData,
    client_updated_at: now,
    deleted_at: null,
  };

  const { data, error } = await supabase
    .from("metas")
    .insert(payload)
    .select("id, data")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  // Hidratar el resultado para devolverlo con todos los campos esperados por la UI
  return {
    data: hydrateMetaFromDb({ ...(data.data as Record<string, unknown>), id: data.id }),
    error: null,
  };
}

export async function updateMeta(id: string, input: SaveMetaInput): Promise<{ data: Meta | null; error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { data: null, error: "No autenticado" };
  }

  // Fetch current
  const { data: current, error: fetchError } = await supabase
    .from("metas")
    .select("data")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .single();

  if (fetchError || !current) {
    return { data: null, error: fetchError?.message || "Meta no encontrada" };
  }

  const now = new Date().toISOString();
  const existing = current.data as Record<string, unknown>;

  // Normalizar meta antes de guardar (mismas reglas que APP)
  // Preservar campos existentes como order, isActive, createdAt
  const normalizedData = normalizeMetaForDb({
    id,
    title: input.title,
    description: input.description,
    targetDate: input.targetDate,
    metaType: input.metaType,
    horizon: input.horizon,
    // Preservar campos que no vienen en input
    order: existing.order as number | undefined,
    isActive: existing.isActive as boolean | undefined,
    createdAt: existing.createdAt as string | undefined,
  });

  const { data, error } = await supabase
    .from("metas")
    .update({
      data: normalizedData,
      client_updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .select("id, data")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  // Hidratar el resultado para devolverlo con todos los campos esperados por la UI
  return {
    data: hydrateMetaFromDb({ ...(data.data as Record<string, unknown>), id: data.id }),
    error: null,
  };
}

// Actualiza solo el campo order de una meta (para drag & drop reorder)
export async function updateMetaOrder(id: string, order: number): Promise<{ success: boolean; error?: string }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { success: false, error: "No autenticado" };
  }

  // Fetch current data
  const { data: current, error: fetchError } = await supabase
    .from("metas")
    .select("data")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .single();

  if (fetchError || !current) {
    return { success: false, error: fetchError?.message || "Meta no encontrada" };
  }

  const now = new Date().toISOString();
  const existing = current.data as Record<string, unknown>;
  
  // Hidratar la meta existente para tener todos los campos
  const hydrated = hydrateMetaFromDb({ ...existing, id });

  // Normalizar con el nuevo order
  const normalizedData = normalizeMetaForDb({
    ...hydrated,
    order,
    createdAt: existing.createdAt as string | undefined,
  });

  const { error } = await supabase
    .from("metas")
    .update({
      data: normalizedData,
      client_updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userData.user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Actualiza el estado activo/pausado de una meta
export async function updateMetaIsActive(id: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { success: false, error: "No autenticado" };
  }

  // Fetch current data
  const { data: current, error: fetchError } = await supabase
    .from("metas")
    .select("data")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .single();

  if (fetchError || !current) {
    return { success: false, error: fetchError?.message || "Meta no encontrada" };
  }

  const now = new Date().toISOString();
  const existing = current.data as Record<string, unknown>;

  // Hidratar la meta existente para tener todos los campos
  const hydrated = hydrateMetaFromDb({ ...existing, id });

  // Normalizar con el nuevo isActive
  // IMPORTANTE: isActive solo se persiste si es false
  const normalizedData = normalizeMetaForDb({
    ...hydrated,
    isActive,
    createdAt: existing.createdAt as string | undefined,
  });

  const { error } = await supabase
    .from("metas")
    .update({
      data: normalizedData,
      client_updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userData.user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function deleteMetaAndTasks(metaId: string): Promise<{ success: boolean; error?: string }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { success: false, error: "No autenticado" };
  }

  const now = new Date().toISOString();
  const userId = userData.user.id;

  // 1) Soft delete TODAS las tareas con ese metaId
  // Las tareas tienen metaId dentro de data (JSONB), usamos el operador ->>
  const { error: tasksError } = await supabase
    .from("tasks")
    .update({
      deleted_at: now,
      client_updated_at: now,
    })
    .eq("user_id", userId)
    .filter("data->>metaId", "eq", metaId);

  if (tasksError) {
    return { success: false, error: `Error eliminando tareas: ${tasksError.message}` };
  }

  // 2) Soft delete la meta
  const { error: metaError } = await supabase
    .from("metas")
    .update({
      deleted_at: now,
      client_updated_at: now,
    })
    .eq("id", metaId)
    .eq("user_id", userId);

  if (metaError) {
    return { success: false, error: `Error eliminando meta: ${metaError.message}` };
  }

  return { success: true };
}

// ==================== BANK ACCOUNTS ====================

export async function fetchBankAccounts(): Promise<{ data: BankAccount[] | null; error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { data: null, error: "No autenticado" };
  }

  const { data, error } = await supabase
    .from("bank_accounts")
    .select("id, data, deleted_at, client_updated_at, server_updated_at")
    .eq("user_id", userData.user.id)
    .is("deleted_at", null);

  if (error) {
    // Tabla puede no existir
    console.warn("bank_accounts fetch error:", error.message);
    return { data: [], error: null };
  }

  const accounts: BankAccount[] = (data || []).map((row: { id: string; data: { name?: string; title?: string; type?: string; balance?: number } }) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[bank_accounts] load row.type", row.id, row.data?.type);
    }
    return {
      id: row.id,
      name: row.data?.name || row.data?.title || row.id,
      type: row.data?.type as "PERSONAL" | "SOCIEDAD" | undefined,
      balance: typeof row.data?.balance === "number" ? row.data.balance : undefined,
    };
  });

  return { data: accounts, error: null };
}

// ==================== FORECAST LINES ====================

export async function fetchForecastLines(): Promise<{ data: ForecastLine[] | null; error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { data: null, error: "No autenticado" };
  }

  const { data, error } = await supabase
    .from("income_forecast_lines")
    .select("id, data")
    .eq("user_id", userData.user.id)
    .is("deleted_at", null);

  if (error) {
    console.warn("income_forecast_lines fetch error:", error.message);
    return { data: [], error: null };
  }

  const lines: ForecastLine[] = (data || []).map((row: { id: string; data: { name?: string; title?: string; type?: string; parentId?: string | null } }) => ({
    id: row.id,
    name: row.data?.name || row.data?.title || row.id,
    type: (row.data?.type === "GASTO" ? "GASTO" : "INGRESO") as "INGRESO" | "GASTO",
    parentId: row.data?.parentId || null,
  }));

  return { data: lines, error: null };
}

// ==================== SCORING SETTINGS (desde app_settings) ====================

/**
 * Obtiene los scoring settings desde app_settings.
 * Esta es la ÚNICA fuente de verdad, compartida con la app móvil.
 * 
 * Lee: SELECT data FROM app_settings WHERE id='__APP_SETTINGS__' AND user_id=userId
 * Extrae: data.scoringSettings.items[]
 */
export async function fetchScoringSettings(): Promise<{ data: Label[] | null; error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { data: null, error: "No autenticado" };
  }

  const { data, error } = await supabase
    .from("app_settings")
    .select("data")
    .eq("id", "__APP_SETTINGS__")
    .eq("user_id", userData.user.id)
    .single();

  if (error) {
    console.warn("app_settings fetch error:", error.message);
    return { data: [], error: null };
  }

  // Extraer scoringSettings.items
  const scoringItems = data?.data?.scoringSettings?.items || [];
  
  // Mapear a Label[] para uso en la UI
  // Solo incluir PHYSICAL y KNOWLEDGE (no FOOD)
  const labels: Label[] = scoringItems
    .filter((item: { category?: string }) => 
      item.category === "PHYSICAL" || item.category === "KNOWLEDGE"
    )
    .map((item: { key: string; label: string; points: number; category: string }) => ({
      id: item.key,
      name: item.label,
      points: item.points,
      scope: SCORING_CATEGORY_TO_SCOPE[item.category] || "FISICO",
    }));

  return { data: labels, error: null };
}

// Alias para compatibilidad (usa la misma fuente de verdad)
export const fetchLabels = fetchScoringSettings;

// ==================== SANITIZE BY TYPE ====================

/**
 * Whitelist de campos de extra que son válidos para cada "categoría" de tarea.
 * - COMMON: campos compartidos entre todos los tipos (frecuencia, completedDates, etc.)
 * - FINANCIAL: campos exclusivos de INGRESO/GASTO
 * - PHYSICAL_KNOWLEDGE: campos exclusivos de tareas físicas/conocimiento (scope FISICO/CRECIMIENTO)
 */
const EXTRA_FIELDS_COMMON = [
  "completedDates",
  "movementIdsByDate",
  "frequency",
  "weeklyDays",
  "weeklyTime",
  "monthlyDay",
  "monthlyTime",
  "unscheduled",
  "notes",
];

const EXTRA_FIELDS_FINANCIAL = ["amountEUR"];

const EXTRA_FIELDS_PHYSICAL_KNOWLEDGE = [
  "unit",
  "quantity",
  "physicalDetails",
  "knowledgeDetails",
];

function isFinancialType(type: TaskType): boolean {
  return type === "INGRESO" || type === "GASTO";
}

function isPhysicalOrKnowledgeScope(scope?: TaskScope | null): boolean {
  return scope === "FISICO" || scope === "CRECIMIENTO";
}

/**
 * Limpia los datos de una tarea según su tipo, eliminando campos que no corresponden.
 * Solo se aplica si hay cambio de tipo/scope respecto al estado anterior.
 */
export function sanitizeTaskDataByType(
  next: TaskData | Partial<TaskData>,
  prev?: TaskData
): TaskData | Partial<TaskData> {
  const nextType = next.type ?? prev?.type;
  const nextScope = next.scope ?? prev?.scope;
  const prevType = prev?.type;
  const prevScope = prev?.scope;

  // Si no hay cambio de tipo ni scope, no limpiar
  const typeChanged = nextType !== prevType;
  const scopeChanged = nextScope !== prevScope;
  if (!typeChanged && !scopeChanged) {
    return next;
  }

  // Determinar categoría final
  const isFinancial = nextType ? isFinancialType(nextType) : false;
  const isPhysOrKnow = isPhysicalOrKnowledgeScope(nextScope);

  // Construir whitelist de campos extra permitidos
  const allowedExtraFields = new Set<string>([
    ...EXTRA_FIELDS_COMMON,
    ...(isFinancial ? EXTRA_FIELDS_FINANCIAL : []),
    ...(isPhysOrKnow ? EXTRA_FIELDS_PHYSICAL_KNOWLEDGE : []),
  ]);

  // Limpiar extra
  let cleanedExtra: TaskExtra | undefined;
  const sourceExtra = next.extra ?? prev?.extra;
  if (sourceExtra) {
    cleanedExtra = {};
    for (const key of Object.keys(sourceExtra)) {
      if (allowedExtraFields.has(key)) {
        (cleanedExtra as Record<string, unknown>)[key] = sourceExtra[key as keyof TaskExtra];
      }
    }
    // Si quedó vacío, undefined
    if (Object.keys(cleanedExtra).length === 0) {
      cleanedExtra = undefined;
    }
  }

  // Limpiar campos de data según tipo
  const result: TaskData | Partial<TaskData> = { ...next };

  // Si no es financiero, limpiar accountId y forecastId
  if (!isFinancial) {
    if ("accountId" in result || prev?.accountId) {
      result.accountId = undefined;
    }
    if ("forecastId" in result || prev?.forecastId) {
      result.forecastId = undefined;
    }
  }

  // Si no es físico/conocimiento, limpiar label
  if (!isPhysOrKnow) {
    if ("label" in result || prev?.label) {
      result.label = undefined;
    }
  }

  result.extra = cleanedExtra;
  return result;
}

// ==================== REMINDER DISPLAY ====================

/**
 * Calcula el texto de display para el aviso de una tarea.
 * Devuelve "Aviso a las HH:mm" o null si no hay aviso configurado.
 * 
 * Condiciones para mostrar aviso:
 * - task.time != null
 * - task.extra.reminderEnabled === true
 * - task.extra.reminderOffsetUnit in {"min", "hor"}
 * - task.extra.reminderOffsetValue > 0
 * 
 * Calculo: hora base (time) - offset en minutos u horas.
 * Es un cálculo puro de reloj HH:mm modular 24h, sin dependencia de Date/timezone.
 */
export function getReminderDisplay(task: TaskData | { time?: string | null; extra?: TaskExtra }): string | null {
  const time = task.time;
  const extra = task.extra;

  // Verificar condiciones requeridas
  if (!time) return null;
  if (!extra?.reminderEnabled) return null;
  
  const unit = extra.reminderOffsetUnit;
  const value = extra.reminderOffsetValue;
  
  if (!unit || (unit !== "min" && unit !== "hor")) return null;
  if (typeof value !== "number" || value <= 0) return null;

  // Parsear hora base HH:mm
  const timeParts = time.split(":");
  if (timeParts.length < 2) return null;
  
  const baseHour = parseInt(timeParts[0], 10);
  const baseMin = parseInt(timeParts[1], 10);
  
  if (isNaN(baseHour) || isNaN(baseMin)) return null;

  // Convertir todo a minutos desde medianoche
  let totalMinutes = baseHour * 60 + baseMin;

  // Restar offset
  if (unit === "min") {
    totalMinutes -= value;
  } else if (unit === "hor") {
    totalMinutes -= value * 60;
  }

  // Modular 24h (manejar negativos)
  totalMinutes = ((totalMinutes % 1440) + 1440) % 1440;

  // Convertir de vuelta a HH:mm
  const resultHour = Math.floor(totalMinutes / 60);
  const resultMin = totalMinutes % 60;

  const hh = String(resultHour).padStart(2, "0");
  const mm = String(resultMin).padStart(2, "0");

  return `Aviso a las ${hh}:${mm}`;
}

// ==================== HELPERS ====================

export function filterTasks(tasks: TaskRow[], filters: TaskFilters): TaskRow[] {
  return tasks.filter((task) => {
    const data = task.data;
    const isTitle = data.kind === "TITLE";

    if (filters.metaIds.length > 0 && data.metaId && !filters.metaIds.includes(data.metaId)) {
      return false;
    }

    if (filters.types.length > 0 && !filters.types.includes(data.type)) {
      return false;
    }

    if (filters.statuses.length > 0) {
      const isDone = !isTitle && (data.isCompleted || (data.extra?.completedDates && data.extra.completedDates.length > 0));
      const status = isDone ? "done" : "pending";
      if (!filters.statuses.includes(status)) {
        return false;
      }
    }

    if (filters.dateFrom && data.date && data.date < filters.dateFrom) {
      return false;
    }
    if (filters.dateTo && data.date && data.date > filters.dateTo) {
      return false;
    }

    if (!filters.showChildren && data.parentId) {
      return false;
    }

    return true;
  });
}

export function sortTasksByHierarchy(tasks: TaskRow[]): TaskRow[] {
  const rootTasks = tasks.filter((t) => !t.data.parentId);
  const childTasks = tasks.filter((t) => t.data.parentId);

  const childrenMap = new Map<string, TaskRow[]>();
  for (const child of childTasks) {
    const parentId = child.data.parentId!;
    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId)!.push(child);
  }

  rootTasks.sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));
  for (const children of childrenMap.values()) {
    children.sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));
  }

  const result: TaskRow[] = [];
  
  function addWithChildren(task: TaskRow) {
    result.push(task);
    const children = childrenMap.get(task.data.id) || [];
    for (const child of children) {
      addWithChildren(child);
    }
  }

  for (const root of rootTasks) {
    addWithChildren(root);
  }

  const addedIds = new Set(result.map((t) => t.data.id));
  for (const child of childTasks) {
    if (!addedIds.has(child.data.id)) {
      result.push(child);
    }
  }

  return result;
}

export function generateTaskId(): string {
  return crypto.randomUUID();
}

/**
 * Genera fecha de hoy en formato YYYY-MM-DD (ISO local)
 */
function getTodayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * FUNCION CANONICA: Construye un TaskData COMPLETO con todos los campos y defaults
 * que la APP espera. Garantiza que WEB y APP generen exactamente el mismo objeto.
 *
 * Invariantes garantizados:
 * - kind: "NORMAL" (o "TITLE" si isTitle=true)
 * - time: null
 * - label: null (salvo override)
 * - parentId: null (salvo override)
 * - accountId: null
 * - forecastId: null
 * - movementId: null
 * - repeatRule: null
 * - isCompleted: false
 * - createdAt: now si no viene
 * - updatedAt: siempre now
 * - extra.frequency: "PUNTUAL"
 * - extra.reminderEnabled: false
 * - date: hoy YYYY-MM-DD (o null si unscheduled)
 */
export interface BuildNewTaskOptions {
  id?: string;
  metaId: string;
  parentId?: string | null;
  level?: number;
  order?: number;
  type?: TaskType;
  scope?: TaskScope | null;
  title?: string;
  label?: string | null;
  description?: string | null;
  date?: string | null;
  points?: number;
  isTitle?: boolean;
  unscheduled?: boolean;
  // Campos financieros (para herencia en duplicados)
  accountId?: string | null;
  forecastId?: string | null;
  amountEUR?: number;
  // Campos extra adicionales a preservar
  extraOverrides?: Partial<TaskExtra>;
}

export function buildNewTaskData(options: BuildNewTaskOptions): TaskData {
  const now = new Date().toISOString();
  const today = getTodayISO();
  const isTitle = options.isTitle === true;

  // Construir extra canónico - solo campos que aplican
  const extra: TaskExtra = {
    frequency: "PUNTUAL",
  };

  // Si es "sin programar", agregar flag
  if (options.unscheduled) {
    extra.unscheduled = true;
  }

  // Si es tarea financiera con amountEUR, preservarlo
  if (options.amountEUR !== undefined && options.amountEUR > 0) {
    extra.amountEUR = options.amountEUR;
  }

  // Aplicar overrides adicionales de extra (para duplicados)
  if (options.extraOverrides) {
    // Solo copiar campos con valores válidos
    for (const [key, value] of Object.entries(options.extraOverrides)) {
      if (value !== null && value !== undefined && value !== "") {
        if (Array.isArray(value) && value.length === 0) continue;
        (extra as Record<string, unknown>)[key] = value;
      }
    }
    // Garantizar que frequency siempre exista
    if (!extra.frequency) extra.frequency = "PUNTUAL";
  }

  if (isTitle) {
    // Tarea TITULO: campos mínimos necesarios
    // La UI espera ciertos campos con null para renderizar correctamente
    return {
      id: options.id ?? generateTaskId(),
      metaId: options.metaId,
      parentId: options.parentId ?? null,
      level: options.level ?? 0,
      order: options.order ?? 999,
      kind: "TITLE",
      type: "ACTIVIDAD",
      scope: null,
      title: options.title ?? "",
      label: null,
      description: null,
      date: null,
      time: null,
      repeatRule: null,
      points: 0,
      accountId: null,
      forecastId: null,
      movementId: null,
      isCompleted: false,
      createdAt: now,
      updatedAt: now,
      extra: { frequency: "PUNTUAL" },
    };
  }

  // Tarea NORMAL: campos para UI (la normalización limpiará nulls al guardar)
  return {
    id: options.id ?? generateTaskId(),
    metaId: options.metaId,
    parentId: options.parentId ?? null,
    level: options.level ?? 0,
    order: options.order ?? 999,
    kind: "NORMAL",
    type: options.type ?? "ACTIVIDAD",
    scope: options.scope ?? "LABORAL",
    title: options.title ?? "",
    label: options.label ?? null,
    description: options.description ?? null,
    date: options.unscheduled ? null : (options.date ?? today),
    time: null,
    repeatRule: null,
    points: options.points ?? 2,
    accountId: options.accountId ?? null,
    forecastId: options.forecastId ?? null,
    movementId: null,
    isCompleted: false,
    createdAt: now,
    updatedAt: now,
    extra,
  };
}

/**
 * Crea un TaskData a partir de un template existente.
 * Usa buildNewTaskData internamente para garantizar campos canónicos.
 */
export function createTaskFromTemplate(template: TaskData): TaskData {
  const isTitle = template.kind === "TITLE";
  const isUnscheduled = template.extra?.unscheduled === true || !template.date;

  // Extraer campos extra relevantes del template (excluyendo los que buildNewTaskData maneja)
  const extraOverrides: Partial<TaskExtra> = {};
  if (template.extra) {
    // Preservar campos específicos del template
    if (template.extra.completedDates) extraOverrides.completedDates = template.extra.completedDates;
    if (template.extra.notes) extraOverrides.notes = template.extra.notes;
    if (template.extra.unit) extraOverrides.unit = template.extra.unit;
    if (template.extra.quantity !== undefined) extraOverrides.quantity = template.extra.quantity;
    if (template.extra.weeklyDays) extraOverrides.weeklyDays = template.extra.weeklyDays;
    if (template.extra.weeklyTime) extraOverrides.weeklyTime = template.extra.weeklyTime;
    if (template.extra.monthlyDay) extraOverrides.monthlyDay = template.extra.monthlyDay;
    if (template.extra.monthlyTime) extraOverrides.monthlyTime = template.extra.monthlyTime;
    // frequency se hereda si existe, sino buildNewTaskData pone PUNTUAL
    if (template.extra.frequency) extraOverrides.frequency = template.extra.frequency;
  }

  return buildNewTaskData({
    metaId: template.metaId ?? "",
    parentId: template.parentId,
    level: template.level,
    order: (template.order ?? 0) + 1,
    type: template.type,
    scope: template.scope,
    title: "", // Siempre vacío para nuevas tareas
    label: template.label,
    description: template.description,
    date: template.date,
    points: template.points ?? 2,
    isTitle,
    unscheduled: isUnscheduled,
    accountId: template.accountId,
    forecastId: template.forecastId,
    amountEUR: template.extra?.amountEUR,
    extraOverrides,
  });
}

export function getTaskStatus(task: TaskData): "done" | "pending" {
  if (task.kind === "TITLE") return "pending";
  if (task.isCompleted) return "done";
  if (task.extra?.completedDates && task.extra.completedDates.length > 0) return "done";
  return "pending";
}

export function getRootTasksForMeta(tasks: TaskRow[], metaId: string): TaskRow[] {
  return tasks.filter(t => t.data.metaId === metaId && !t.data.parentId);
}

export function getChildTasks(tasks: TaskRow[], parentId: string): TaskRow[] {
  return tasks.filter(t => t.data.parentId === parentId);
}

export function validateParentAssignment(tasks: TaskRow[], taskId: string, newParentId: string, metaId?: string): string | null {
  // Misma meta
  const parent = tasks.find(t => t.data.id === newParentId);
  if (!parent) return "Padre no encontrado";
  if (metaId && parent.data.metaId !== metaId) return "El padre debe ser de la misma meta";
  
  // Sin ciclos
  let current: TaskRow | undefined = parent;
  while (current) {
    if (current.data.id === taskId) return "No se puede crear un ciclo";
    current = tasks.find(t => t.data.id === current?.data.parentId);
  }
  
  // Nivel máximo
  if ((parent.data.level || 0) >= 5) return "Nivel máximo alcanzado (6)";
  
  return null;
}

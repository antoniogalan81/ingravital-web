import { supabase } from "./supabaseClient";
import type { TaskRow, TaskData, TaskFilters, TaskType, Meta, MetaRow, MetaData, BankAccount, ForecastLine, Label, TaskScope } from "./types";
import { SCORING_CATEGORY_TO_SCOPE } from "./types";

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

  return { data: data as TaskRow[], error: null };
}

export async function createTask(taskData: TaskData): Promise<{ data: TaskRow | null; error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { data: null, error: "No autenticado" };
  }

  const now = new Date().toISOString();
  
  // Asegurar points default
  const finalData = {
    ...taskData,
    points: taskData.points ?? 2,
    createdAt: now,
    updatedAt: now,
  };

  const payload = {
    id: taskData.id,
    user_id: userData.user.id,
    data: finalData,
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

  return { data: data as TaskRow, error: null };
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

  const existing = currentTask.data as TaskData;
  const now = new Date().toISOString();
  
  // Deep merge de extra
  let mergedExtra = existing.extra;
  if (taskData.extra) {
    mergedExtra = {
      ...(existing.extra || {}),
      ...taskData.extra,
    };
  }

  const mergedData: TaskData = {
    ...existing,
    ...taskData,
    extra: mergedExtra,
    updatedAt: now,
  };

  const { data, error } = await supabase
    .from("tasks")
    .update({
      data: mergedData,
      client_updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .select("id, user_id, data, client_updated_at, server_updated_at, deleted_at")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as TaskRow, error: null };
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

// ==================== METAS ====================

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

  const metas: Meta[] = (data || []).map((row: MetaRow) => {
    const metaData = row.data as MetaData;
    return {
      id: row.id,
      title: metaData.title || metaData.name || row.id,
      description: metaData.description,
    };
  });

  return { data: metas, error: null };
}

export async function createMeta(title: string, description?: string): Promise<{ data: Meta | null; error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { data: null, error: "No autenticado" };
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const payload = {
    id,
    user_id: userData.user.id,
    data: {
      id,
      title,
      description,
      createdAt: now,
      updatedAt: now,
    },
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

  return {
    data: {
      id: data.id,
      title: (data.data as MetaData).title || title,
      description: (data.data as MetaData).description,
    },
    error: null,
  };
}

export async function updateMeta(id: string, title: string, description?: string): Promise<{ data: Meta | null; error: string | null }> {
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
  const existing = current.data as MetaData;

  const { data, error } = await supabase
    .from("metas")
    .update({
      data: {
        ...existing,
        title,
        description,
        updatedAt: now,
      },
      client_updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .select("id, data")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: {
      id: data.id,
      title: (data.data as MetaData).title || title,
      description: (data.data as MetaData).description,
    },
    error: null,
  };
}

// ==================== BANK ACCOUNTS ====================

export async function fetchBankAccounts(): Promise<{ data: BankAccount[] | null; error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { data: null, error: "No autenticado" };
  }

  const { data, error } = await supabase
    .from("bank_accounts")
    .select("id, data")
    .eq("user_id", userData.user.id)
    .is("deleted_at", null);

  if (error) {
    // Tabla puede no existir
    console.warn("bank_accounts fetch error:", error.message);
    return { data: [], error: null };
  }

  const accounts: BankAccount[] = (data || []).map((row: { id: string; data: { name?: string; title?: string } }) => ({
    id: row.id,
    name: row.data?.name || row.data?.title || row.id,
  }));

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

  const lines: ForecastLine[] = (data || []).map((row: { id: string; data: { name?: string; title?: string; type?: string } }) => ({
    id: row.id,
    name: row.data?.name || row.data?.title || row.id,
    type: (row.data?.type === "GASTO" ? "GASTO" : "INGRESO") as "INGRESO" | "GASTO",
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

// ==================== HELPERS ====================

export function filterTasks(tasks: TaskRow[], filters: TaskFilters): TaskRow[] {
  return tasks.filter((task) => {
    const data = task.data;

    if (filters.metaIds.length > 0 && data.metaId && !filters.metaIds.includes(data.metaId)) {
      return false;
    }

    if (filters.types.length > 0 && !filters.types.includes(data.type)) {
      return false;
    }

    if (filters.statuses.length > 0) {
      const isDone = data.isCompleted || (data.extra?.completedDates && data.extra.completedDates.length > 0);
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

export function createTaskFromTemplate(template: TaskData): TaskData {
  return {
    id: generateTaskId(),
    metaId: template.metaId,
    parentId: template.parentId,
    level: template.level,
    order: (template.order ?? 0) + 1,
    type: template.type,
    scope: template.scope,
    title: "",
    label: template.label,
    description: template.description,
    date: template.date,
    time: template.time,
    points: template.points ?? 2,
    accountId: template.accountId,
    forecastId: template.forecastId,
    extra: template.extra ? { ...template.extra } : undefined,
  };
}

export function getTaskStatus(task: TaskData): "done" | "pending" {
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

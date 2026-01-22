/**
 * Normalización de Tasks para WEB - MISMAS REGLAS QUE APP
 * 
 * REGLAS:
 * - NO guardar campos null/undefined/"" (excepto title que puede ser "")
 * - NO guardar arrays/objetos vacíos
 * - isCompleted solo si es true
 * - kind debe ser "NORMAL" o "TITLE" (nunca null)
 * - extra debe existir siempre con al menos frequency
 * 
 * FRECUENCIAS:
 * - PUNTUAL con date => guarda date; time solo si HH:mm válida; NO repeatRule
 * - PUNTUAL sin date => extra.unscheduled=true
 * - SEMANAL requiere weeklyDays>0, repeatRule = WEEKLY|days=... y optional |time=HH:mm
 * - MENSUAL requiere monthlyDay 1..31, repeatRule = MONTHLY|day=n y optional |time=HH:mm
 * - SEMANAL sin días o MENSUAL sin monthlyDay => degradar a PUNTUAL + unscheduled=true
 * 
 * TITLE tasks:
 * - kind:"TITLE" => no date/time/repeatRule, extra = {frequency:"PUNTUAL"}, points default 0
 */

import type { TaskData, TaskExtra, Frequency } from "../lib/types";

// ==================== HELPERS ====================

/**
 * Valida formato HH:mm (00:00 a 23:59)
 */
export function isValidTimeHHmm(time: unknown): time is string {
  if (typeof time !== "string") return false;
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const [h, m] = time.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/**
 * Valida formato de fecha YYYY-MM-DD
 */
export function isValidDateYYYYMMDD(date: unknown): date is string {
  if (typeof date !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(date);
  return !isNaN(d.getTime());
}

/**
 * Determina la frecuencia efectiva de una tarea según sus datos
 */
export function getEffectiveFrequency(task: Partial<TaskData>): Frequency {
  const freq = task.extra?.frequency;
  
  if (freq === "SEMANAL") {
    const days = task.extra?.weeklyDays;
    if (!days || !Array.isArray(days) || days.length === 0) {
      return "PUNTUAL"; // Degradar si no hay días
    }
    return "SEMANAL";
  }
  
  if (freq === "MENSUAL") {
    const day = task.extra?.monthlyDay;
    if (typeof day !== "number" || day < 1 || day > 31) {
      return "PUNTUAL"; // Degradar si no hay día válido
    }
    return "MENSUAL";
  }
  
  return "PUNTUAL";
}

/**
 * Construye repeatRule según frecuencia efectiva
 * - SEMANAL: "WEEKLY|days=L,M,X" con optional "|time=HH:mm"
 * - MENSUAL: "MONTHLY|day=15" con optional "|time=HH:mm"
 * - PUNTUAL: null (sin repeatRule)
 */
export function buildRepeatRule(task: Partial<TaskData>): string | undefined {
  const freq = getEffectiveFrequency(task);
  
  if (freq === "SEMANAL") {
    const days = task.extra?.weeklyDays;
    if (!days || !Array.isArray(days) || days.length === 0) return undefined;
    
    let rule = `WEEKLY|days=${days.join(",")}`;
    const time = task.extra?.weeklyTime;
    if (isValidTimeHHmm(time)) {
      rule += `|time=${time}`;
    }
    return rule;
  }
  
  if (freq === "MENSUAL") {
    const day = task.extra?.monthlyDay;
    if (typeof day !== "number" || day < 1 || day > 31) return undefined;
    
    let rule = `MONTHLY|day=${day}`;
    const time = task.extra?.monthlyTime;
    if (isValidTimeHHmm(time)) {
      rule += `|time=${time}`;
    }
    return rule;
  }
  
  return undefined;
}

/**
 * Limpia un objeto eliminando:
 * - Propiedades con valor null, undefined, ""
 * - Excepto las keys especificadas en preserveKeys
 */
export function cleanObject<T extends Record<string, unknown>>(
  obj: T,
  preserveKeys: string[] = []
): Partial<T> {
  const result: Partial<T> = {};
  const preserveSet = new Set(preserveKeys);
  
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    
    // Siempre preservar keys explícitas
    if (preserveSet.has(key)) {
      result[key as keyof T] = value as T[keyof T];
      continue;
    }
    
    // Omitir null, undefined, string vacío
    if (value === null || value === undefined || value === "") {
      continue;
    }
    
    // Omitir arrays vacíos
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    
    // Omitir objetos vacíos (pero no arrays)
    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0) {
      continue;
    }
    
    result[key as keyof T] = value as T[keyof T];
  }
  
  return result;
}

// ==================== NORMALIZE FOR DB ====================

/**
 * Normaliza una tarea ANTES de guardar en Supabase.
 * Produce el mismo output que la APP.
 * 
 * @param task - TaskData con todos los campos (puede tener nulls)
 * @returns Record limpio sin nulls ni campos vacíos
 */
export function normalizeTaskForDb(task: TaskData | Partial<TaskData>): Record<string, unknown> {
  const now = new Date().toISOString();
  const isTitle = task.kind === "TITLE";
  
  // Determinar frecuencia efectiva
  const effectiveFreq = getEffectiveFrequency(task);
  
  // Determinar si está sin programar
  const hasValidDate = isValidDateYYYYMMDD(task.date);
  const isUnscheduled = !hasValidDate && effectiveFreq === "PUNTUAL";
  
  // Construir extra normalizado
  const normalizedExtra: Record<string, unknown> = {
    frequency: effectiveFreq,
  };
  
  // Agregar unscheduled solo si es true
  if (isUnscheduled && !isTitle) {
    normalizedExtra.unscheduled = true;
  }
  
  // Campos de frecuencia según tipo
  if (effectiveFreq === "SEMANAL") {
    const days = task.extra?.weeklyDays;
    if (Array.isArray(days) && days.length > 0) {
      normalizedExtra.weeklyDays = days;
    }
    if (isValidTimeHHmm(task.extra?.weeklyTime)) {
      normalizedExtra.weeklyTime = task.extra?.weeklyTime;
    }
  } else if (effectiveFreq === "MENSUAL") {
    const day = task.extra?.monthlyDay;
    if (typeof day === "number" && day >= 1 && day <= 31) {
      normalizedExtra.monthlyDay = day;
    }
    if (isValidTimeHHmm(task.extra?.monthlyTime)) {
      normalizedExtra.monthlyTime = task.extra?.monthlyTime;
    }
  }
  
  // Campos financieros
  if (task.type === "INGRESO" || task.type === "GASTO") {
    const amount = task.extra?.amountEUR;
    if (typeof amount === "number" && amount > 0) {
      normalizedExtra.amountEUR = amount;
    } else if (amount !== undefined) {
      // Si está definido pero no es válido, guardar 0
      normalizedExtra.amountEUR = 0;
    }
  }
  
  // Campos físicos/conocimiento
  if (task.scope === "FISICO" || task.scope === "CRECIMIENTO") {
    if (task.extra?.unit) {
      normalizedExtra.unit = task.extra.unit;
    }
    if (typeof task.extra?.quantity === "number") {
      normalizedExtra.quantity = task.extra.quantity;
    }
  }
  
  // Campos de reminder
  if (task.extra?.reminderEnabled === true) {
    normalizedExtra.reminderEnabled = true;
    if (task.extra?.reminderOffsetUnit) {
      normalizedExtra.reminderOffsetUnit = task.extra.reminderOffsetUnit;
    }
    if (typeof task.extra?.reminderOffsetValue === "number") {
      normalizedExtra.reminderOffsetValue = task.extra.reminderOffsetValue;
    }
  }
  
  // Notas
  if (task.extra?.notes && typeof task.extra.notes === "string" && task.extra.notes.trim()) {
    normalizedExtra.notes = task.extra.notes.trim();
  }
  
  // completedDates (solo si tiene elementos)
  if (Array.isArray(task.extra?.completedDates) && task.extra.completedDates.length > 0) {
    normalizedExtra.completedDates = task.extra.completedDates;
  }
  
  // movementIdsByDate (solo si tiene claves)
  if (task.extra?.movementIdsByDate && typeof task.extra.movementIdsByDate === "object") {
    const mvIds = task.extra.movementIdsByDate;
    if (Object.keys(mvIds).length > 0) {
      normalizedExtra.movementIdsByDate = mvIds;
    }
  }
  
  // ==================== BUILD RESULT ====================
  
  const result: Record<string, unknown> = {
    id: task.id,
  };
  
  // kind: siempre incluir, default "NORMAL"
  result.kind = isTitle ? "TITLE" : "NORMAL";
  
  // type: siempre incluir
  result.type = task.type || "ACTIVIDAD";
  
  // title: siempre incluir (puede ser "")
  result.title = task.title ?? "";
  
  // metaId: solo si existe
  if (task.metaId) {
    result.metaId = task.metaId;
  }
  
  // parentId: solo si existe (no null)
  if (task.parentId) {
    result.parentId = task.parentId;
  }
  
  // order: siempre incluir
  if (typeof task.order === "number") {
    result.order = task.order;
  }
  
  // points: siempre incluir
  // TITLE: default 0, NORMAL: default 2
  if (typeof task.points === "number") {
    result.points = task.points;
  } else {
    result.points = isTitle ? 0 : 2;
  }
  
  // scope: solo si no es TITLE y existe
  if (!isTitle && task.scope) {
    result.scope = task.scope;
  }
  
  // label: solo si existe y es físico/conocimiento
  if (!isTitle && task.label && (task.scope === "FISICO" || task.scope === "CRECIMIENTO")) {
    result.label = task.label;
  }
  
  // description: solo si existe
  if (task.description && typeof task.description === "string" && task.description.trim()) {
    result.description = task.description.trim();
  }
  
  // TITLE: sin date/time/repeatRule
  if (!isTitle) {
    // date: solo si es válida y frecuencia PUNTUAL con fecha
    if (hasValidDate && effectiveFreq === "PUNTUAL") {
      result.date = task.date;
    }
    
    // time: solo si es válida y frecuencia PUNTUAL con fecha
    if (hasValidDate && effectiveFreq === "PUNTUAL" && isValidTimeHHmm(task.time)) {
      result.time = task.time;
    }
    
    // repeatRule: construir según frecuencia
    const repeatRule = buildRepeatRule(task);
    if (repeatRule) {
      result.repeatRule = repeatRule;
    }
  }
  
  // accountId: solo si existe y es financiero
  if ((task.type === "INGRESO" || task.type === "GASTO") && task.accountId) {
    result.accountId = task.accountId;
  }
  
  // forecastId: solo si existe y es financiero
  if ((task.type === "INGRESO" || task.type === "GASTO") && task.forecastId) {
    result.forecastId = task.forecastId;
  }
  
  // movementId: solo si existe y es financiero
  if ((task.type === "INGRESO" || task.type === "GASTO") && task.movementId) {
    result.movementId = task.movementId;
  }
  
  // isCompleted: solo si es true
  if (task.isCompleted === true) {
    result.isCompleted = true;
  }
  
  // timestamps
  result.createdAt = task.createdAt || now;
  result.updatedAt = now;
  
  // extra: siempre incluir (al menos con frequency)
  // Limpiar extra de campos vacíos pero mantener frequency
  const cleanedExtra = cleanObject(normalizedExtra as Record<string, unknown>, ["frequency"]);
  result.extra = cleanedExtra;
  
  return result;
}

// ==================== HYDRATE FROM DB ====================

/**
 * Hidrata una tarea DESDE Supabase para uso en UI.
 * Añade defaults para campos que la UI espera.
 * 
 * @param dbTask - Objeto leído de Supabase (puede ser sparse)
 * @returns TaskData con todos los campos necesarios para la UI
 */
export function hydrateTaskFromDb(dbTask: Record<string, unknown>): TaskData {
  const isTitle = dbTask.kind === "TITLE";
  
  // Parsear extra
  const dbExtra = (dbTask.extra as Record<string, unknown>) || {};
  
  const extra: TaskExtra = {
    frequency: (dbExtra.frequency as Frequency) || "PUNTUAL",
  };
  
  // Restaurar campos de extra si existen
  if (dbExtra.unscheduled === true) extra.unscheduled = true;
  if (Array.isArray(dbExtra.weeklyDays)) extra.weeklyDays = dbExtra.weeklyDays as string[];
  if (typeof dbExtra.weeklyTime === "string") extra.weeklyTime = dbExtra.weeklyTime;
  if (typeof dbExtra.monthlyDay === "number") extra.monthlyDay = dbExtra.monthlyDay;
  if (typeof dbExtra.monthlyTime === "string") extra.monthlyTime = dbExtra.monthlyTime;
  if (typeof dbExtra.amountEUR === "number") extra.amountEUR = dbExtra.amountEUR;
  if (typeof dbExtra.unit === "string") extra.unit = dbExtra.unit as TaskExtra["unit"];
  if (typeof dbExtra.quantity === "number") extra.quantity = dbExtra.quantity;
  if (typeof dbExtra.notes === "string") extra.notes = dbExtra.notes;
  if (dbExtra.reminderEnabled === true) extra.reminderEnabled = true;
  if (typeof dbExtra.reminderOffsetUnit === "string") extra.reminderOffsetUnit = dbExtra.reminderOffsetUnit as "min" | "hor";
  if (typeof dbExtra.reminderOffsetValue === "number") extra.reminderOffsetValue = dbExtra.reminderOffsetValue;
  if (Array.isArray(dbExtra.completedDates)) extra.completedDates = dbExtra.completedDates as string[];
  if (dbExtra.movementIdsByDate && typeof dbExtra.movementIdsByDate === "object") {
    extra.movementIdsByDate = dbExtra.movementIdsByDate as Record<string, string>;
  }
  
  // Calcular level si no existe (para compatibilidad)
  // En realidad, level no se persiste - se calcula en runtime
  // Pero la UI espera un valor, así que ponemos 0 por defecto
  
  return {
    id: dbTask.id as string,
    metaId: dbTask.metaId as string | undefined,
    parentId: (dbTask.parentId as string | null) ?? null,
    level: typeof dbTask.level === "number" ? dbTask.level : 0, // Se recalcula en runtime
    order: typeof dbTask.order === "number" ? dbTask.order : 0,
    kind: isTitle ? "TITLE" : "NORMAL",
    type: (dbTask.type as TaskData["type"]) || "ACTIVIDAD",
    scope: isTitle ? null : ((dbTask.scope as TaskData["scope"]) ?? "LABORAL"),
    title: (dbTask.title as string) ?? "",
    label: (dbTask.label as string | null) ?? null,
    description: (dbTask.description as string | null) ?? null,
    date: (dbTask.date as string | null) ?? null,
    time: (dbTask.time as string | null) ?? null,
    repeatRule: (dbTask.repeatRule as string | null) ?? null,
    points: typeof dbTask.points === "number" ? dbTask.points : (isTitle ? 0 : 2),
    isCompleted: dbTask.isCompleted === true,
    accountId: (dbTask.accountId as string | null) ?? null,
    forecastId: (dbTask.forecastId as string | null) ?? null,
    movementId: (dbTask.movementId as string | null) ?? null,
    extra,
    createdAt: dbTask.createdAt as string | undefined,
    updatedAt: dbTask.updatedAt as string | undefined,
  };
}

// ==================== LEVEL RECALCULATION ====================

/**
 * Recalcula los levels de las tareas basándose en parentId.
 * Se usa después de hidratar para tener levels correctos.
 * 
 * @param tasks - Array de tareas hidratadas
 * @returns Array de tareas con levels recalculados
 */
export function recalculateTaskLevels(tasks: TaskData[]): TaskData[] {
  // Crear mapa id -> task
  const taskMap = new Map<string, TaskData>();
  for (const task of tasks) {
    taskMap.set(task.id, task);
  }
  
  // Función recursiva para calcular level
  const getLevel = (task: TaskData, visited: Set<string>): number => {
    if (!task.parentId) return 0;
    if (visited.has(task.id)) return 0; // Evitar ciclos
    
    visited.add(task.id);
    const parent = taskMap.get(task.parentId);
    if (!parent) return 0;
    
    return getLevel(parent, visited) + 1;
  };
  
  // Recalcular todos los levels
  return tasks.map(task => ({
    ...task,
    level: getLevel(task, new Set()),
  }));
}


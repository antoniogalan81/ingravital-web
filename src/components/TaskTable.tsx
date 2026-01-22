"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import type { TaskRow, TaskData, TaskType, TaskScope, Meta, BankAccount, ForecastLine, Label, UITaskType, Frequency } from "@/src/lib/types";
import { TYPE_COLORS, UI_TYPE_MAPPING, getUIType, WEEKDAYS } from "@/src/lib/types";
import { getTaskStatus, createTaskFromTemplate, generateTaskId, getRootTasksForMeta, getChildTasks, validateParentAssignment } from "@/src/lib/tasks";

interface Props {
  tasks: TaskRow[];
  metas: Meta[];
  bankAccounts: BankAccount[];
  forecastLines: ForecastLine[];
  labels: Label[];
  onCreateTask: (taskData: TaskData) => Promise<{ success: boolean; error?: string }>;
  onUpdateTask: (id: string, taskData: Partial<TaskData>) => Promise<{ success: boolean; error?: string }>;
  onDuplicateTask: (task: TaskRow) => void;
  onOpenMetaModal: (meta: Meta | null) => void;
}

const DRAFT_ID = "__draft__";

// Columnas con anchos aproximados en caracteres -> px (1 char ≈ 8px)
const COLUMNS: Array<{ key: string; label: string; width: number; frozen?: boolean }> = [
  { key: "status", label: "", width: 28 },          // Solo checkbox, sin texto
  { key: "meta", label: "Meta", width: 100, frozen: true },
  { key: "parent", label: "Asignar", width: 96 },
  { key: "uiType", label: "Tipo", width: 96 },
  { key: "title", label: "Nombre", width: 240 },
  { key: "amount", label: "Cantidad", width: 80 },
  { key: "account", label: "Banco", width: 56 },
  { key: "forecast", label: "Previsión", width: 96 },
  { key: "frequency", label: "Frecuen.", width: 64 },
  { key: "date", label: "Fecha", width: 96 },
  { key: "time", label: "Hora", width: 56 },        // Input texto HH:MM
  { key: "points", label: "Pts", width: 32 },       // Más estrecho
  { key: "description", label: "Descripción", width: 200 },
];

const UI_TYPES: UITaskType[] = ["Actividad", "Fisico", "Conocimiento", "Ingreso", "Gasto"];
const FREQUENCIES: Array<{ value: Frequency | "SIN_FECHA"; label: string }> = [
  { value: "PUNTUAL", label: "Puntual" },
  { value: "SIN_FECHA", label: "Sin programar" },
  { value: "SEMANAL", label: "Semanal" },
  { value: "MENSUAL", label: "Mensual" },
];

// JERARQUÍA VISUAL: determina el nivel de importancia de cada columna
// Nivel 1 (dominante): meta, title, date
// Nivel 2 (medio): uiType, frequency
// Nivel 3 (bajo): el resto
type VisualLevel = 1 | 2 | 3;
const COLUMN_VISUAL_LEVEL: Record<string, VisualLevel> = {
  meta: 1,
  title: 1,
  date: 1,
  uiType: 2,
  frequency: 2,
  status: 3,
  parent: 3,
  amount: 3,
  account: 3,
  forecast: 3,
  time: 3,
  points: 3,
  description: 3,
};

// Clases CSS por nivel para HEADERS
const HEADER_LEVEL_CLASSES: Record<VisualLevel, string> = {
  1: "text-[10px] font-bold text-slate-700",
  2: "text-[9px] font-semibold text-slate-500",
  3: "text-[8px] font-medium text-slate-400",
};

// Clases CSS por nivel para CELDAS
const CELL_LEVEL_CLASSES: Record<VisualLevel, string> = {
  1: "text-sm font-medium text-slate-800",
  2: "text-xs text-slate-600",
  3: "text-[11px] text-slate-400",
};

function createDraftData(template?: TaskData): TaskData {
  if (template) {
    return createTaskFromTemplate(template);
  }
  return {
    id: generateTaskId(),
    level: 0,
    order: 0,
    type: "ACTIVIDAD",
    scope: "LABORAL",
    title: "",
    points: 2,
  };
}

// Determina si una columna está habilitada según el tipo y scope
function isColumnEnabled(col: string, type: TaskType, scope?: TaskScope | null): boolean {
  if (["amount", "account", "forecast"].includes(col)) {
    return type === "INGRESO" || type === "GASTO";
  }
  // Puntuación no editable para Físico/Conocimiento (viene del scoring settings)
  if (col === "points" && (scope === "FISICO" || scope === "CRECIMIENTO")) {
    return false;
  }
  return true;
}

// Regla canónica: una tarea es "Sin programar" si:
// 1) extra.unscheduled === true (formato web)
// 2) date == null && repeatRule == null && NO tiene frequency definida (formato app móvil)
// IMPORTANTE: Si frequency existe (SEMANAL/MENSUAL/PUNTUAL), NO es unscheduled aunque falte date/repeatRule
function isTaskUnscheduled(data: TaskData): boolean {
  // Si el flag existe, manda
  if (data.extra?.unscheduled === true) return true;
  if (data.extra?.unscheduled === false) return false;

  // Si tiene frequency definida (SEMANAL, MENSUAL, PUNTUAL), no es unscheduled
  if (data.extra?.frequency) return false;

  // Compat móvil (solo si no existe el flag NI frequency)
  return !data.date && !data.repeatRule;
}

// Códigos de días de la semana (formato móvil)
type WeekdayCode = "L" | "M" | "X" | "J" | "V" | "S" | "D";
const WEEKDAY_CODES: WeekdayCode[] = ["L", "M", "X", "J", "V", "S", "D"];

// Convierte weeklyDays de number[] (formato antiguo) a string[] (formato móvil)
function normalizeWeeklyDays(weeklyDays: unknown): WeekdayCode[] {
  if (!Array.isArray(weeklyDays)) return [];
  if (weeklyDays.length === 0) return [];
  // Si ya son strings, validar y retornar
  if (typeof weeklyDays[0] === "string") {
    return weeklyDays.filter((d): d is WeekdayCode => WEEKDAY_CODES.includes(d as WeekdayCode));
  }
  // Si son números, convertir a códigos
  if (typeof weeklyDays[0] === "number") {
    return weeklyDays
      .filter((i): i is number => typeof i === "number" && i >= 0 && i < 7)
      .map(i => WEEKDAY_CODES[i]);
  }
  return [];
}

// Construye repeatRule para SEMANAL en formato móvil: "WEEKLY|days=L,X|time=HH:MM"
function buildWeeklyRepeatRule(weeklyDays: WeekdayCode[], weeklyTime?: string): string {
  return `WEEKLY|days=${weeklyDays.join(",")}|time=${weeklyTime || ""}`;
}

// Construye repeatRule para MENSUAL en formato móvil: "MONTHLY|day=15|time=HH:MM"
function buildMonthlyRepeatRule(monthlyDay: number, monthlyTime?: string): string {
  return `MONTHLY|day=${monthlyDay}|time=${monthlyTime || ""}`;
}

// Valida y normaliza TaskData antes de guardar, construyendo repeatRule si es necesario
function normalizeTaskForSave(data: TaskData): { data: TaskData; error?: string } {
  const normalized = { ...data };
  const freq = normalized.extra?.frequency;
  
  if (freq === "SEMANAL") {
    // Normalizar weeklyDays a formato string[]
    const weeklyDays = normalizeWeeklyDays(normalized.extra?.weeklyDays);
    if (weeklyDays.length === 0) {
      return { data: normalized, error: "Semanal requiere al menos 1 día" };
    }
    // Actualizar extra con weeklyDays normalizado
    normalized.extra = { 
      ...normalized.extra, 
      weeklyDays,
      unscheduled: false 
    };
    // Construir repeatRule
    normalized.repeatRule = buildWeeklyRepeatRule(weeklyDays, normalized.extra?.weeklyTime);
    // Limpiar date (semanal no usa date fija)
    normalized.date = undefined;
  } else if (freq === "MENSUAL") {
    const monthlyDay = normalized.extra?.monthlyDay || 1;
    // Construir repeatRule
    normalized.repeatRule = buildMonthlyRepeatRule(monthlyDay, normalized.extra?.monthlyTime);
    // Limpiar date
    normalized.date = undefined;
    // Asegurar que no esté marcada como unscheduled
    if (normalized.extra) {
      normalized.extra = { ...normalized.extra, unscheduled: false };
    }
  } else if (freq === "PUNTUAL" && !normalized.extra?.unscheduled) {
    // Puntual normal: limpiar repeatRule
    normalized.repeatRule = undefined;
  }
  // SIN_FECHA: ya se maneja en parseEditToUpdates
  
  return { data: normalized };
}

export default function TaskTable({ 
  tasks, metas, bankAccounts, forecastLines, labels, 
  onCreateTask, onUpdateTask, onDuplicateTask, onOpenMetaModal 
}: Props) {
  const [draftData, setDraftData] = useState<TaskData>(() => createDraftData());
  const [editCell, setEditCell] = useState<{ rowId: string; col: string } | null>(null);
  const [editValue, setEditValue] = useState<string | number | boolean | string[]>("");
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  
  // Para selector cascada de padre
  const [parentSelection, setParentSelection] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);

  const allRows: Array<{ id: string; data: TaskData; isDraft: boolean }> = [
    ...tasks.map(t => ({ id: t.id, data: t.data, isDraft: false })),
    { id: DRAFT_ID, data: draftData, isDraft: true },
  ];

  useEffect(() => {
    if (editCell) {
      const timeout = setTimeout(() => {
        if (selectRef.current) {
          selectRef.current.focus();
        } else if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 10);
      return () => clearTimeout(timeout);
    }
  }, [editCell]);

  // ========== CELL VALUE GETTERS ==========

  // Obtener fecha de hoy en formato ISO (YYYY-MM-DD)
  const getTodayISO = useCallback((): string => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  }, []);

  const getCellValue = useCallback((data: TaskData, col: string): string => {
    switch (col) {
      case "status":
        return ""; // Manejado por checkbox directo
      case "meta":
        if (!data.metaId) return "";
        return metas.find(m => m.id === data.metaId)?.title || data.metaId;
      case "parent":
        if (!data.parentId) return "";
        const parent = tasks.find(t => t.data.id === data.parentId);
        return parent?.data.title || "";
      case "uiType":
        return getUIType(data.type, data.scope, data.kind);
      case "title":
        // Para Fisico/Conocimiento usar label, sino title
        if (data.scope === "FISICO" || data.scope === "CRECIMIENTO") {
          return data.label || "";
        }
        return data.title || "";
      case "amount":
        return data.extra?.amountEUR?.toString() || "";
      case "account":
        if (!data.accountId) return "";
        return bankAccounts.find(a => a.id === data.accountId)?.name || "";
      case "forecast":
        if (!data.forecastId) return "";
        return forecastLines.find(f => f.id === data.forecastId)?.name || "";
      case "frequency": {
        const freq = data.extra?.frequency;
        if (isTaskUnscheduled(data)) return "Sin programar";
        if (freq === "SEMANAL") return "Semanal";
        if (freq === "MENSUAL") return "Mensual";
        return "Puntual";
      }
      case "date": {
        const freq = data.extra?.frequency;
        if (isTaskUnscheduled(data)) return "-";
        if (freq === "SEMANAL" && data.extra?.weeklyDays) {
          // weeklyDays ya es string[] ("L", "M", etc), mostrar directamente
          const days = normalizeWeeklyDays(data.extra.weeklyDays);
          return days.length > 0 ? days.join(", ") : "-";
        }
        if (freq === "MENSUAL" && data.extra?.monthlyDay) {
          return `Día ${data.extra.monthlyDay}`;
        }
        // Default: fecha de hoy si no hay fecha (Puntual)
        return data.date || getTodayISO();
      }
      case "time": {
        const freq = data.extra?.frequency;
        if (isTaskUnscheduled(data)) return "-";
        if (freq === "SEMANAL") return data.extra?.weeklyTime || "";
        if (freq === "MENSUAL") return data.extra?.monthlyTime || "";
        return data.time || "";
      }
      case "points":
        return (data.points ?? 2).toString();
      case "description":
        return data.description || "";
      default:
        return "";
    }
  }, [metas, tasks, bankAccounts, forecastLines, getTodayISO]);

  // ========== START EDIT ==========

  const startEdit = useCallback((rowId: string, col: string) => {
    const row = allRows.find(r => r.id === rowId);
    if (!row) return;

    // Status se maneja con checkbox directo, no con modo edición
    if (col === "status") return;

    // Verificar si columna está habilitada
    if (!isColumnEnabled(col, row.data.type, row.data.scope)) return;

    const data = row.data;
    let value: string | number | boolean | string[] = "";

    switch (col) {
      case "meta":
        value = data.metaId || "";
        break;
      case "parent":
        value = data.parentId || "";
        setParentSelection(data.parentId ? [data.parentId] : []);
        break;
      case "uiType":
        value = getUIType(data.type, data.scope, data.kind);
        break;
      case "title":
        if (data.scope === "FISICO" || data.scope === "CRECIMIENTO") {
          value = data.label || "";
        } else {
          value = data.title || "";
        }
        break;
      case "amount":
        value = data.extra?.amountEUR || "";
        break;
      case "account":
        value = data.accountId || "";
        break;
      case "forecast":
        value = data.forecastId || "";
        break;
      case "frequency":
        if (isTaskUnscheduled(data)) value = "SIN_FECHA";
        else value = data.extra?.frequency || "PUNTUAL";
        break;
      case "date":
        if (data.extra?.frequency === "SEMANAL") {
          // Normalizar weeklyDays a string[] para edición
          value = normalizeWeeklyDays(data.extra?.weeklyDays);
        } else if (data.extra?.frequency === "MENSUAL") {
          value = data.extra?.monthlyDay || 1;
        } else {
          // Default: HOY
          value = data.date || getTodayISO();
        }
        break;
      case "time":
        if (data.extra?.frequency === "SEMANAL") {
          value = data.extra?.weeklyTime || "";
        } else if (data.extra?.frequency === "MENSUAL") {
          value = data.extra?.monthlyTime || "";
        } else {
          value = data.time || "";
        }
        break;
      case "points":
        value = data.points ?? 2;
        break;
      case "description":
        value = data.description || "";
        break;
    }

    setEditCell({ rowId, col });
    setEditValue(value);
  }, [allRows]);

  // ========== APPLY/SAVE EDIT ==========

  const parseEditToUpdates = useCallback((data: TaskData, col: string, value: unknown): Partial<TaskData> => {
    switch (col) {
      case "status":
        return { isCompleted: value === true };
      case "meta":
        return { metaId: value as string || undefined };
      case "parent": {
        const parentId = value as string || undefined;
        if (!parentId) return { parentId: undefined, level: 0 };
        const parentTask = tasks.find(t => t.data.id === parentId);
        return { 
          parentId, 
          level: parentTask ? (parentTask.data.level || 0) + 1 : 0 
        };
      }
      case "uiType": {
        const mapping = UI_TYPE_MAPPING[value as UITaskType];
        if (!mapping) return {};
        // Al cambiar tipo, limpiar campos incompatibles
        const updates: Partial<TaskData> = { type: mapping.type, scope: mapping.scope };
        if (mapping.type !== "INGRESO" && mapping.type !== "GASTO") {
          updates.accountId = undefined;
          updates.forecastId = undefined;
          if (data.extra) {
            updates.extra = { ...data.extra, amountEUR: undefined };
          }
        }
        // Si cambia a/desde Fisico/Conocimiento, limpiar label/title
        if ((mapping.scope === "FISICO" || mapping.scope === "CRECIMIENTO") !== 
            (data.scope === "FISICO" || data.scope === "CRECIMIENTO")) {
          updates.label = undefined;
          updates.title = "";
        }
        return updates;
      }
      case "title":
        if (data.scope === "FISICO" || data.scope === "CRECIMIENTO") {
          return { label: value as string };
        }
        return { title: value as string };
      case "amount":
        return { 
          extra: { 
            ...(data.extra || {}), 
            amountEUR: value ? parseFloat(value as string) : undefined 
          } 
        };
      case "account":
        return { accountId: value as string || undefined };
      case "forecast":
        return { forecastId: value as string || undefined };
      case "frequency": {
        const freq = value as string;
        const extra = { ...(data.extra || {}) };
        
        if (freq === "SIN_FECHA") {
          extra.frequency = "PUNTUAL";
          extra.unscheduled = true;
          delete extra.weeklyDays;
          delete extra.weeklyTime;
          delete extra.monthlyDay;
          delete extra.monthlyTime;
          return { date: undefined, time: undefined, repeatRule: undefined, extra };
        }
        
        extra.frequency = freq as Frequency;
        extra.unscheduled = false;
        
        if (freq === "PUNTUAL") {
          delete extra.weeklyDays;
          delete extra.weeklyTime;
          delete extra.monthlyDay;
          delete extra.monthlyTime;
          return { repeatRule: undefined, extra };
        } else if (freq === "SEMANAL") {
          delete extra.monthlyDay;
          delete extra.monthlyTime;
          // Normalizar weeklyDays existentes a string[]
          const existingDays = normalizeWeeklyDays(extra.weeklyDays);
          extra.weeklyDays = existingDays;
          // Construir repeatRule (vacío si no hay días aún)
          const repeatRule = existingDays.length > 0 
            ? buildWeeklyRepeatRule(existingDays, extra.weeklyTime) 
            : undefined;
          return { date: undefined, repeatRule, extra };
        } else if (freq === "MENSUAL") {
          delete extra.weeklyDays;
          delete extra.weeklyTime;
          if (!extra.monthlyDay) extra.monthlyDay = 1;
          const repeatRule = buildMonthlyRepeatRule(extra.monthlyDay, extra.monthlyTime);
          return { date: undefined, repeatRule, extra };
        }
        
        return { extra };
      }
      case "date": {
        const freq = data.extra?.frequency;
        if (freq === "SEMANAL") {
          // value llega como WeekdayCode[] (string[])
          const weeklyDays = value as WeekdayCode[];
          const newExtra = { ...(data.extra || {}), weeklyDays };
          // Reconstruir repeatRule con los nuevos días
          const repeatRule = weeklyDays.length > 0 
            ? buildWeeklyRepeatRule(weeklyDays, newExtra.weeklyTime) 
            : undefined;
          return { repeatRule, extra: newExtra };
        } else if (freq === "MENSUAL") {
          const monthlyDay = value as number;
          const newExtra = { ...(data.extra || {}), monthlyDay };
          const repeatRule = buildMonthlyRepeatRule(monthlyDay, newExtra.monthlyTime);
          return { repeatRule, extra: newExtra };
        }
        return { date: value as string || undefined, repeatRule: undefined };
      }
      case "time": {
        const freq = data.extra?.frequency;
        if (freq === "SEMANAL") {
          const weeklyTime = value as string || undefined;
          const newExtra = { ...(data.extra || {}), weeklyTime };
          // Reconstruir repeatRule con la nueva hora
          const weeklyDays = normalizeWeeklyDays(newExtra.weeklyDays);
          const repeatRule = weeklyDays.length > 0 
            ? buildWeeklyRepeatRule(weeklyDays, weeklyTime) 
            : undefined;
          return { repeatRule, extra: newExtra };
        } else if (freq === "MENSUAL") {
          const monthlyTime = value as string || undefined;
          const newExtra = { ...(data.extra || {}), monthlyTime };
          const repeatRule = buildMonthlyRepeatRule(newExtra.monthlyDay || 1, monthlyTime);
          return { repeatRule, extra: newExtra };
        }
        return { time: value as string || undefined };
      }
      case "points":
        return { points: parseInt(value as string) || 2 };
      case "description":
        return { description: value as string || undefined };
      default:
        return {};
    }
  }, [tasks]);

  const applyEdit = useCallback((rowId: string, col: string, value: unknown) => {
    const row = allRows.find(r => r.id === rowId);
    if (!row) return;

    const updates = parseEditToUpdates(row.data, col, value);
    
    if (row.isDraft) {
      setDraftData(prev => ({ ...prev, ...updates }));
    }
  }, [allRows, parseEditToUpdates]);

  const saveEdit = useCallback(async (rowId: string, col: string, value: unknown) => {
    const row = allRows.find(r => r.id === rowId);
    if (!row || row.isDraft) return;

    // Validar asignación de padre
    if (col === "parent" && value) {
      const error = validateParentAssignment(tasks, row.data.id, value as string, row.data.metaId);
      if (error) {
        setRowErrors(prev => ({ ...prev, [rowId]: error }));
        return;
      }
    }

    // Validar SEMANAL: requiere al menos 1 día
    if (col === "date" && row.data.extra?.frequency === "SEMANAL") {
      const weeklyDays = value as WeekdayCode[];
      if (!weeklyDays || weeklyDays.length === 0) {
        setRowErrors(prev => ({ ...prev, [rowId]: "Semanal requiere al menos 1 día" }));
        return;
      }
    }

    const updates = parseEditToUpdates(row.data, col, value);
    if (Object.keys(updates).length === 0) return;

    const result = await onUpdateTask(row.data.id, updates);
    if (!result.success && result.error) {
      setRowErrors(prev => ({ ...prev, [rowId]: result.error! }));
    } else {
      setRowErrors(prev => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
    }
  }, [allRows, tasks, parseEditToUpdates, onUpdateTask]);

  const closeEdit = useCallback(() => {
    setEditCell(null);
    setEditValue("");
    setParentSelection([]);
  }, []);

  // ========== SAVE DRAFT ==========

  const saveDraftAndCreateNew = useCallback(async () => {
    if (saving) return;
    
    const hasName = draftData.scope === "FISICO" || draftData.scope === "CRECIMIENTO" 
      ? draftData.label?.trim() 
      : draftData.title?.trim();
    
    if (!hasName) {
      setRowErrors(prev => ({ ...prev, [DRAFT_ID]: "Nombre requerido" }));
      return;
    }

    // Normalizar y validar antes de guardar
    const { data: normalizedData, error: validationError } = normalizeTaskForSave(draftData);
    if (validationError) {
      setRowErrors(prev => ({ ...prev, [DRAFT_ID]: validationError }));
      return;
    }

    setSaving(true);
    setRowErrors(prev => {
      const next = { ...prev };
      delete next[DRAFT_ID];
      return next;
    });

    const result = await onCreateTask(normalizedData);
    
    if (result.success) {
      const newDraft = createDraftData(draftData);
      setDraftData(newDraft);
      
      setTimeout(() => {
        startEdit(DRAFT_ID, "title");
      }, 50);
    } else if (result.error) {
      setRowErrors(prev => ({ ...prev, [DRAFT_ID]: result.error! }));
    }

    setSaving(false);
  }, [draftData, saving, onCreateTask, startEdit]);

  // ========== KEYBOARD ==========

  const handleKeyDown = useCallback((e: React.KeyboardEvent, rowId: string, col: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const row = allRows.find(r => r.id === rowId);
      if (!row) return;

      if (row.isDraft) {
        applyEdit(rowId, col, editValue);
        closeEdit();
        setTimeout(() => saveDraftAndCreateNew(), 0);
      } else {
        saveEdit(rowId, col, editValue);
        closeEdit();
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      const row = allRows.find(r => r.id === rowId);
      
      if (row?.isDraft) {
        applyEdit(rowId, col, editValue);
      } else if (row) {
        saveEdit(rowId, col, editValue);
      }
      closeEdit();
      
      // Navigate to next editable cell
      const currentColIndex = COLUMNS.findIndex(c => c.key === col);
      const currentRowIndex = allRows.findIndex(r => r.id === rowId);
      let nextColIndex = e.shiftKey ? currentColIndex - 1 : currentColIndex + 1;
      let nextRowIndex = currentRowIndex;
      
      if (nextColIndex >= COLUMNS.length) {
        nextColIndex = 0;
        nextRowIndex++;
      } else if (nextColIndex < 0) {
        nextColIndex = COLUMNS.length - 1;
        nextRowIndex--;
      }
      
      if (nextRowIndex >= 0 && nextRowIndex < allRows.length) {
        const nextRow = allRows[nextRowIndex];
        const nextCol = COLUMNS[nextColIndex].key;
        if (isColumnEnabled(nextCol, nextRow.data.type, nextRow.data.scope)) {
          setTimeout(() => startEdit(nextRow.id, nextCol), 10);
        }
      }
    } else if (e.key === "Escape") {
      closeEdit();
    } else if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const row = allRows.find(r => r.id === rowId);
      if (row && !row.isDraft) {
        const taskRow = tasks.find(t => t.id === rowId);
        if (taskRow) onDuplicateTask(taskRow);
      }
    }
  }, [allRows, editValue, applyEdit, saveEdit, closeEdit, saveDraftAndCreateNew, tasks, onDuplicateTask, startEdit]);

  const handleBlur = useCallback((rowId: string, col: string) => {
    const row = allRows.find(r => r.id === rowId);
    if (!row) {
      closeEdit();
      return;
    }

    if (row.isDraft) {
      applyEdit(rowId, col, editValue);
    } else {
      saveEdit(rowId, col, editValue);
    }
    closeEdit();
  }, [allRows, editValue, applyEdit, saveEdit, closeEdit]);

  // ========== RENDER CELL ==========

  const renderEditCell = (row: { id: string; data: TaskData; isDraft: boolean }, col: string) => {
    const data = row.data;
    const level = COLUMN_VISUAL_LEVEL[col] || 3;
    // Tamaños según nivel visual
    const sizeClass = level === 1 ? "text-sm" : level === 2 ? "text-xs" : "text-[11px]";
    const commonClass = `w-full h-full px-1.5 ${sizeClass} border-0 bg-blue-50/80 focus:outline-none focus:ring-1 focus:ring-blue-400`;

    switch (col) {
      case "status":
        // El checkbox se maneja directamente en renderCell, no aquí
        return null;

      case "meta":
        return (
          <select
            ref={selectRef}
            value={editValue as string}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "__CREATE__") {
                onOpenMetaModal(null);
                closeEdit();
              } else if (val === "__EDIT__") {
                const meta = metas.find(m => m.id === data.metaId);
                if (meta) onOpenMetaModal(meta);
                closeEdit();
              } else {
                setEditValue(val);
              }
            }}
            onKeyDown={(e) => handleKeyDown(e, row.id, col)}
            onBlur={() => handleBlur(row.id, col)}
            className={commonClass}
          >
            <option value="">-</option>
            {metas.map(m => (
              <option key={m.id} value={m.id}>{m.title}</option>
            ))}
            <option disabled>───────────</option>
            <option value="__CREATE__">+ Crear meta</option>
            {data.metaId && <option value="__EDIT__">✎ Editar meta</option>}
          </select>
        );

      case "parent": {
        // Selector cascada: primero tareas raíz de la misma meta, luego hijos
        const metaId = data.metaId;
        const rootTasks = metaId ? getRootTasksForMeta(tasks, metaId).filter(t => t.data.id !== data.id) : [];
        
        let currentParentId: string | undefined = parentSelection[0];
        const childOptions = currentParentId ? getChildTasks(tasks, currentParentId).filter(t => t.data.id !== data.id) : [];
        
        return (
          <div className="flex flex-col gap-1 w-full">
            <select
              ref={selectRef}
              value={parentSelection[0] || ""}
              onChange={(e) => {
                const val = e.target.value;
                setParentSelection(val ? [val] : []);
                setEditValue(val);
              }}
              onKeyDown={(e) => handleKeyDown(e, row.id, col)}
              onBlur={() => handleBlur(row.id, col)}
              className={commonClass}
            >
              <option value="">Sin padre</option>
              {rootTasks.map(t => (
                <option key={t.data.id} value={t.data.id}>{t.data.title}</option>
              ))}
            </select>
            {childOptions.length > 0 && (
              <select
                value={parentSelection[1] || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    setParentSelection([parentSelection[0], val]);
                    setEditValue(val);
                  }
                }}
                className={commonClass}
              >
                <option value="">- Subtarea -</option>
                {childOptions.map(t => (
                  <option key={t.data.id} value={t.data.id}>{t.data.title}</option>
                ))}
              </select>
            )}
          </div>
        );
      }

      case "uiType":
        return (
          <select
            ref={selectRef}
            value={editValue as string}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, row.id, col)}
            onBlur={() => handleBlur(row.id, col)}
            className={commonClass}
          >
            {UI_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        );

      case "title": {
        // Para Fisico/Conocimiento: desplegable con etiquetas desde scoring settings
        if (data.scope === "FISICO" || data.scope === "CRECIMIENTO") {
          const scopeLabels = labels.filter(l => l.scope === data.scope);
          return (
            <select
              ref={selectRef}
              value={editValue as string}
              onChange={(e) => {
                const selectedName = e.target.value;
                if (selectedName === "__ADD__") {
                  // Permitir escribir nueva (sin puntos predefinidos)
                  const name = prompt("Nueva etiqueta:");
                  if (name?.trim()) {
                    setEditValue(name.trim());
                  }
                } else {
                  setEditValue(selectedName);
                  // Al seleccionar una etiqueta del scoring, asignar también los puntos
                  const selectedLabel = scopeLabels.find(l => l.name === selectedName);
                  if (selectedLabel && selectedLabel.points !== undefined) {
                    // Actualizar puntos automáticamente
                    if (row.isDraft) {
                      setDraftData(prev => ({ ...prev, points: selectedLabel.points }));
                    } else {
                      onUpdateTask(data.id, { points: selectedLabel.points });
                    }
                  }
                }
              }}
              onKeyDown={(e) => handleKeyDown(e, row.id, col)}
              onBlur={() => handleBlur(row.id, col)}
              className={commonClass}
            >
              <option value="">-</option>
              {scopeLabels.map(l => (
                <option key={l.id} value={l.name}>{l.name} ({l.points} pts)</option>
              ))}
              <option value="__ADD__">+ Añadir</option>
            </select>
          );
        }
        // Texto libre
        return (
          <input
            ref={inputRef}
            type="text"
            value={editValue as string}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, row.id, col)}
            onBlur={() => handleBlur(row.id, col)}
            placeholder="Nombre"
            className={commonClass}
          />
        );
      }

      case "amount":
        return (
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            min="0"
            value={editValue as string}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, row.id, col)}
            onBlur={() => handleBlur(row.id, col)}
            placeholder="0.00"
            className={commonClass}
          />
        );

      case "account":
        return (
          <select
            ref={selectRef}
            value={editValue as string}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, row.id, col)}
            onBlur={() => handleBlur(row.id, col)}
            className={commonClass}
          >
            <option value="">-</option>
            {bankAccounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        );

      case "forecast": {
        const filteredLines = forecastLines.filter(f => f.type === data.type);
        return (
          <select
            ref={selectRef}
            value={editValue as string}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, row.id, col)}
            onBlur={() => handleBlur(row.id, col)}
            className={commonClass}
          >
            <option value="">-</option>
            {filteredLines.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        );
      }

      case "frequency":
        return (
          <select
            ref={selectRef}
            value={editValue as string}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, row.id, col)}
            onBlur={() => handleBlur(row.id, col)}
            className={commonClass}
          >
            {FREQUENCIES.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        );

      case "date": {
        const freq = data.extra?.frequency;
        if (isTaskUnscheduled(data)) {
          return <span className="text-slate-400 text-xs">-</span>;
        }
        if (freq === "SEMANAL") {
          // Multi-select días (usando string[] - códigos de día)
          const selected = (editValue as WeekdayCode[]) || [];
          return (
            <div className="flex gap-0.5">
              {WEEKDAY_CODES.map((dayCode) => (
                <button
                  key={dayCode}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()} // Evitar blur antes de guardar
                  onClick={() => {
                    const newVal: WeekdayCode[] = selected.includes(dayCode)
                      ? selected.filter(x => x !== dayCode)
                      : [...selected, dayCode].sort((a, b) => 
                          WEEKDAY_CODES.indexOf(a) - WEEKDAY_CODES.indexOf(b)
                        );
                    setEditValue(newVal);
                    // Guardar inmediatamente al hacer click
                    if (row.isDraft) {
                      applyEdit(row.id, "date", newVal);
                    } else {
                      saveEdit(row.id, "date", newVal);
                    }
                  }}
                  className={`w-5 h-5 text-[9px] rounded ${
                    selected.includes(dayCode) ? "bg-blue-500 text-white" : "bg-slate-100"
                  }`}
                >
                  {dayCode}
                </button>
              ))}
            </div>
          );
        }
        if (freq === "MENSUAL") {
          return (
            <input
              ref={inputRef}
              type="number"
              min="1"
              max="31"
              value={editValue as number}
              onChange={(e) => setEditValue(parseInt(e.target.value) || 1)}
              onKeyDown={(e) => handleKeyDown(e, row.id, col)}
              onBlur={() => handleBlur(row.id, col)}
              className={commonClass}
            />
          );
        }
        // Puntual: calendario
        return (
          <input
            ref={inputRef}
            type="date"
            value={editValue as string}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, row.id, col)}
            onBlur={() => handleBlur(row.id, col)}
            className={commonClass}
          />
        );
      }

      case "time": {
        if (isTaskUnscheduled(data)) {
          return <span className="text-slate-400 text-xs">-</span>;
        }
        // Input texto para HH:MM (sin selector de reloj)
        return (
          <input
            ref={inputRef}
            type="text"
            value={editValue as string}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, row.id, col)}
            onBlur={() => handleBlur(row.id, col)}
            placeholder="HH:MM"
            maxLength={5}
            className={commonClass}
          />
        );
      }

      case "points":
        return (
          <input
            ref={inputRef}
            type="number"
            min="1"
            max="10"
            value={editValue as number}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, row.id, col)}
            onBlur={() => handleBlur(row.id, col)}
            className={commonClass}
          />
        );

      case "description":
        return (
          <input
            ref={inputRef}
            type="text"
            value={editValue as string}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, row.id, col)}
            onBlur={() => handleBlur(row.id, col)}
            placeholder="Descripción"
            className={commonClass}
          />
        );

      default:
        return null;
    }
  };

  // Formatea número con separador de miles (1.000.000)
  const formatAmount = (num: number | string | undefined): string => {
    if (num === undefined || num === "") return "";
    const n = typeof num === "string" ? parseFloat(num) : num;
    if (isNaN(n)) return "";
    return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Formatea fecha ISO a dd/mm/aa
  const formatDateSpanish = (isoDate: string | undefined): string => {
    if (!isoDate) return "";
    const parts = isoDate.split("-");
    if (parts.length !== 3) return isoDate;
    const [y, m, d] = parts;
    return `${d}/${m}/${y.slice(-2)}`;
  };

  const renderCell = (row: { id: string; data: TaskData; isDraft: boolean }, col: string) => {
    const isEditing = editCell?.rowId === row.id && editCell?.col === col;
    const enabled = isColumnEnabled(col, row.data.type, row.data.scope);
    const data = row.data;

    // Columna Estado: checkbox directo (un solo click)
    if (col === "status") {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <input
            type="checkbox"
            checked={data.isCompleted || false}
            onChange={(e) => {
              if (row.isDraft) {
                setDraftData(prev => ({ ...prev, isCompleted: e.target.checked }));
              } else {
                onUpdateTask(data.id, { isCompleted: e.target.checked });
              }
            }}
            className="w-4 h-4 cursor-pointer accent-green-600"
          />
        </div>
      );
    }

    if (isEditing && enabled) {
      return renderEditCell(row, col);
    }

    // Celda deshabilitada
    if (!enabled) {
      const level = COLUMN_VISUAL_LEVEL[col] || 3;
      return (
        <div className={`w-full h-full px-1.5 flex items-center bg-slate-50/50 cursor-not-allowed ${
          level === 3 ? "text-[11px]" : "text-xs"
        } text-slate-300`}>
          —
        </div>
      );
    }

    // Valores especiales para display
    let displayValue = getCellValue(data, col);
    
    // Formato especial para Cantidad (miles)
    if (col === "amount" && displayValue) {
      displayValue = formatAmount(displayValue);
    }
    
    // Formato especial para Fecha (dd/mm/aa)
    if (col === "date" && displayValue && !isTaskUnscheduled(data) && data.extra?.frequency !== "SEMANAL" && data.extra?.frequency !== "MENSUAL") {
      displayValue = formatDateSpanish(displayValue);
    }

    const placeholder = row.isDraft && col === "title" ? "Nueva tarea..." : "";
    const finalDisplay = displayValue || placeholder;
    const level = COLUMN_VISUAL_LEVEL[col] || 3;
    
    // Estilos especiales para fecha según contexto
    let dateClass = "";
    if (col === "date" && displayValue && displayValue !== "-") {
      const today = new Date().toISOString().split("T")[0];
      const taskDate = data.date;
      if (taskDate === today) {
        dateClass = "text-blue-600 font-semibold"; // Hoy
      } else if (taskDate && taskDate < today) {
        dateClass = "text-red-500"; // Vencida
      }
    }
    
    return (
      <div
        onClick={() => startEdit(row.id, col)}
        className={`w-full h-full px-1.5 flex items-center truncate cursor-text ${
          CELL_LEVEL_CLASSES[level]
        } ${dateClass} ${
          !displayValue && row.isDraft ? "!text-slate-400 italic" : ""
        }`}
        title={finalDisplay}
      >
        {finalDisplay || <span className="text-slate-300">—</span>}
      </div>
    );
  };

  // ========== RENDER TABLE ==========

  const getFrozenLeft = (colIndex: number): number => {
    let left = 0;
    for (let i = 0; i < colIndex; i++) {
      if (COLUMNS[i].frozen) {
        left += COLUMNS[i].width;
      }
    }
    return left;
  };

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-left" style={{ minWidth: COLUMNS.reduce((a, c) => a + c.width, 0) }}>
        <thead className="sticky top-0 z-20">
          <tr className="bg-slate-50 border-b-2 border-slate-200">
            {COLUMNS.map((col, i) => {
              const level = COLUMN_VISUAL_LEVEL[col.key] || 3;
              return (
                <th
                  key={col.key}
                  className={`px-1.5 py-2 uppercase tracking-wide border-r border-slate-200 ${
                    HEADER_LEVEL_CLASSES[level]
                  } ${col.frozen ? "sticky z-30 bg-slate-50" : ""}`}
                  style={{
                    width: col.width,
                    minWidth: col.width,
                    maxWidth: col.width,
                    left: col.frozen ? getFrozenLeft(i) : undefined,
                  }}
                >
                  {col.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {allRows.map((row) => {
            const bgColor = row.isDraft ? "rgba(59, 130, 246, 0.05)" : TYPE_COLORS[row.data.type] || "transparent";
            const error = rowErrors[row.id];
            const level = row.data.level || 0;

            return (
              <tr
                key={row.id}
                className={`border-b border-slate-100 hover:bg-slate-50/50 transition-colors ${
                  error ? "bg-red-50/50" : ""
                }`}
                style={{ backgroundColor: error ? undefined : bgColor, height: 32 }}
              >
                {COLUMNS.map((col, i) => (
                  <td
                    key={col.key}
                    className={`border-r border-slate-100 ${col.frozen ? "sticky z-10" : ""}`}
                    style={{
                      width: col.width,
                      minWidth: col.width,
                      maxWidth: col.width,
                      left: col.frozen ? getFrozenLeft(i) : undefined,
                      backgroundColor: col.frozen ? (row.isDraft ? "rgba(59, 130, 246, 0.05)" : (error ? "#fef2f2" : bgColor)) : undefined,
                      paddingLeft: col.key === "title" ? level * 12 + 4 : undefined,
                    }}
                  >
                    {renderCell(row, col.key)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Errores */}
      {Object.entries(rowErrors).map(([rowId, err]) => (
        <div
          key={rowId}
          className="fixed bottom-4 right-4 px-3 py-2 bg-red-600 text-white text-xs rounded shadow-lg z-50"
        >
          {err}
          <button
            onClick={() => setRowErrors(prev => { const n = {...prev}; delete n[rowId]; return n; })}
            className="ml-2 hover:text-red-200"
          >
            ×
          </button>
        </div>
      ))}

      {saving && (
        <div className="fixed bottom-4 left-4 px-3 py-2 bg-slate-800 text-white text-xs rounded shadow-lg z-50">
          Guardando...
        </div>
      )}
    </div>
  );
}

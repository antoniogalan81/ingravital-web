"use client";

import { useCallback, useRef, useEffect, useState, useMemo } from "react";
import type { TaskRow, TaskData, TaskExtra, TaskType, TaskScope, Meta, BankAccount, ForecastLine, Label, Frequency } from "@/src/lib/types";
import { getUIType, SCORING_CATEGORY_TO_SCOPE } from "@/src/lib/types";
import { generateTaskId, createTaskFromTemplate } from "@/src/lib/tasks";

// ==================== TIPOS ====================

interface Props {
  tasks: TaskRow[];
  metas: Meta[];
  bankAccounts: BankAccount[];
  forecastLines: ForecastLine[];
  labels: Label[];
  onCreateTask: (taskData: TaskData) => Promise<{ success: boolean; error?: string }>;
  onUpdateTask: (id: string, taskData: Partial<TaskData>) => Promise<{ success: boolean; error?: string }>;
  onOpenMetaModal: (meta: Meta | null) => void;
}

type WeekdayCode = "L" | "M" | "X" | "J" | "V" | "S" | "D";
const WEEKDAY_CODES: WeekdayCode[] = ["L", "M", "X", "J", "V", "S", "D"];

type ScheduleType = "puntual" | "semanal" | "mensual" | "sin_programar";

// ==================== HELPERS ====================

function getTodayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function formatDateShort(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const date = new Date(isoDate + "T00:00:00");
  const day = date.getDate();
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${day} ${months[date.getMonth()]}`;
}

function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  return time.slice(0, 5);
}

function isTaskUnscheduled(data: TaskData): boolean {
  if (data.extra?.unscheduled === true) return true;
  if (data.extra?.unscheduled === false) return false;
  if (data.extra?.frequency) return false;
  return !data.date && !data.repeatRule;
}

function getScheduleType(data: TaskData): ScheduleType {
  if (isTaskUnscheduled(data)) return "sin_programar";
  const freq = data.extra?.frequency;
  if (freq === "SEMANAL") return "semanal";
  if (freq === "MENSUAL") return "mensual";
  return "puntual";
}

function getScheduleDisplay(data: TaskData): string {
  const schedType = getScheduleType(data);
  
  switch (schedType) {
    case "sin_programar":
      return "Sin programar";
    case "semanal": {
      const days = (data.extra?.weeklyDays as WeekdayCode[]) || [];
      const time = data.extra?.weeklyTime;
      return days.length > 0 
        ? time ? `${days.join(" ")} · ${formatTime(time)}` : days.join(" ")
        : "Semanal";
    }
    case "mensual": {
      const day = data.extra?.monthlyDay || 1;
      const time = data.extra?.monthlyTime;
      return time ? `Día ${day} · ${formatTime(time)}` : `Día ${day}`;
    }
    case "puntual":
    default: {
      const dateStr = formatDateShort(data.date);
      const time = data.time;
      return time ? `${dateStr} · ${formatTime(time)}` : dateStr || getTodayISO();
    }
  }
}

// Normaliza weeklyDays a string[]
function normalizeWeeklyDays(weeklyDays: unknown): WeekdayCode[] {
  if (!Array.isArray(weeklyDays)) return [];
  if (weeklyDays.length === 0) return [];
  if (typeof weeklyDays[0] === "string") {
    return weeklyDays.filter((d): d is WeekdayCode => WEEKDAY_CODES.includes(d as WeekdayCode));
  }
  if (typeof weeklyDays[0] === "number") {
    return weeklyDays
      .filter((i): i is number => typeof i === "number" && i >= 0 && i < 7)
      .map(i => WEEKDAY_CODES[i]);
  }
  return [];
}

// Construye repeatRule para SEMANAL
function buildWeeklyRepeatRule(weeklyDays: WeekdayCode[], weeklyTime?: string): string {
  return `WEEKLY|days=${weeklyDays.join(",")}|time=${weeklyTime || ""}`;
}

// Construye repeatRule para MENSUAL
function buildMonthlyRepeatRule(monthlyDay: number, monthlyTime?: string): string {
  return `MONTHLY|day=${monthlyDay}|time=${monthlyTime || ""}`;
}

// Construir árbol jerárquico
interface TreeNode {
  task: TaskRow;
  children: TreeNode[];
}

function buildTree(tasks: TaskRow[], metaId: string): TreeNode[] {
  const metaTasks = tasks.filter(t => t.data.metaId === metaId);
  const taskMap = new Map<string, TaskRow>(metaTasks.map(t => [t.data.id, t]));
  const childrenMap = new Map<string, TaskRow[]>();
  const roots: TaskRow[] = [];

  metaTasks.forEach(task => {
    const parentId = task.data.parentId;
    if (parentId && taskMap.has(parentId)) {
      const children = childrenMap.get(parentId) || [];
      children.push(task);
      childrenMap.set(parentId, children);
    } else {
      roots.push(task);
    }
  });

  // Ordenar por order, luego createdAt
  const sortTasks = (a: TaskRow, b: TaskRow) => {
    const orderA = a.data.order ?? 0;
    const orderB = b.data.order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return (a.data.createdAt || "").localeCompare(b.data.createdAt || "");
  };

  const buildNode = (task: TaskRow): TreeNode => {
    const children = (childrenMap.get(task.data.id) || []).sort(sortTasks);
    return {
      task,
      children: children.map(buildNode),
    };
  };

  return roots.sort(sortTasks).map(buildNode);
}

// Calcular nuevo order para insertar
function calculateInsertOrder(siblings: TaskRow[], position: "before" | "after", referenceTask?: TaskRow): number {
  if (siblings.length === 0) return 1000;
  
  const sorted = [...siblings].sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));
  
  if (!referenceTask) {
    // Insertar al final
    return (sorted[sorted.length - 1].data.order ?? 0) + 1000;
  }

  const refIndex = sorted.findIndex(t => t.data.id === referenceTask.data.id);
  if (refIndex === -1) return (sorted[sorted.length - 1].data.order ?? 0) + 1000;

  if (position === "before") {
    if (refIndex === 0) {
      return (sorted[0].data.order ?? 0) - 1000;
    }
    const prevOrder = sorted[refIndex - 1].data.order ?? 0;
    const currOrder = sorted[refIndex].data.order ?? 0;
    return Math.floor((prevOrder + currOrder) / 2);
  } else {
    if (refIndex === sorted.length - 1) {
      return (sorted[refIndex].data.order ?? 0) + 1000;
    }
    const currOrder = sorted[refIndex].data.order ?? 0;
    const nextOrder = sorted[refIndex + 1].data.order ?? 0;
    return Math.floor((currOrder + nextOrder) / 2);
  }
}

// ==================== COMPONENTE PRINCIPAL ====================

export default function TaskTreeView({
  tasks, metas, bankAccounts, forecastLines, labels,
  onCreateTask, onUpdateTask, onOpenMetaModal
}: Props) {
  // Estado
  const [selectedMetaId, setSelectedMetaId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<Partial<TaskData>>({});
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<{ taskId: string; data: TaskData }[]>([]);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Seleccionar primera meta si no hay ninguna seleccionada
  useEffect(() => {
    if (!selectedMetaId && metas.length > 0) {
      setSelectedMetaId(metas[0].id);
    }
  }, [metas, selectedMetaId]);

  // Árbol de tareas para la meta seleccionada
  const tree = useMemo(() => {
    if (!selectedMetaId) return [];
    return buildTree(tasks, selectedMetaId);
  }, [tasks, selectedMetaId]);

  const selectedMeta = useMemo(() => {
    return metas.find(m => m.id === selectedMetaId);
  }, [metas, selectedMetaId]);

  // Auto-focus en nombre al editar
  useEffect(() => {
    if (editingTaskId && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingTaskId]);

  // ==================== HANDLERS ====================

  const startEdit = useCallback((task: TaskRow, focusSchedule?: boolean) => {
    setEditingTaskId(task.data.id);
    setEditingData({ ...task.data });
    // Guardar estado para undo
    setUndoStack(prev => [...prev.slice(-10), { taskId: task.data.id, data: { ...task.data } }]);
  }, []);

  const closeEdit = useCallback(async () => {
    if (editingTaskId && Object.keys(editingData).length > 0) {
      await saveChanges();
    }
    setEditingTaskId(null);
    setEditingData({});
  }, [editingTaskId, editingData]);

  const saveChanges = useCallback(async () => {
    if (!editingTaskId) return;
    
    const task = tasks.find(t => t.data.id === editingTaskId);
    if (!task) return;

    // Construir updates solo con los campos modificados
    const updates: Partial<TaskData> = {};
    const original = task.data;
    
    Object.keys(editingData).forEach(key => {
      const k = key as keyof TaskData;
      if (JSON.stringify(editingData[k]) !== JSON.stringify(original[k])) {
        (updates as Record<string, unknown>)[k] = editingData[k];
      }
    });

    if (Object.keys(updates).length === 0) return;

    setSavingTaskId(editingTaskId);
    await onUpdateTask(editingTaskId, updates);
    setSavingTaskId(null);
  }, [editingTaskId, editingData, tasks, onUpdateTask]);

  // Debounced save
  const debouncedSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(saveChanges, 500);
  }, [saveChanges]);

  const updateField = useCallback(<K extends keyof TaskData>(field: K, value: TaskData[K]) => {
    setEditingData(prev => ({ ...prev, [field]: value }));
    debouncedSave();
  }, [debouncedSave]);

  const updateExtra = useCallback(<K extends keyof TaskExtra>(field: K, value: TaskExtra[K]) => {
    setEditingData(prev => ({
      ...prev,
      extra: { ...(prev.extra || {}), [field]: value }
    }));
    debouncedSave();
  }, [debouncedSave]);

  // Toggle completado
  const toggleCompleted = useCallback(async (task: TaskRow) => {
    await onUpdateTask(task.data.id, { isCompleted: !task.data.isCompleted });
  }, [onUpdateTask]);

  // Crear tarea
  const createTask = useCallback(async (
    position: "before" | "after" | "child",
    referenceTask: TaskRow
  ) => {
    if (!selectedMetaId) return;

    // Calcular parentId y level
    let parentId: string | null | undefined;
    let level: number;
    let siblings: TaskRow[];

    if (position === "child") {
      parentId = referenceTask.data.id;
      level = (referenceTask.data.level || 0) + 1;
      siblings = tasks.filter(t => t.data.parentId === referenceTask.data.id);
    } else {
      parentId = referenceTask.data.parentId;
      level = referenceTask.data.level || 0;
      siblings = tasks.filter(t => 
        t.data.metaId === selectedMetaId && 
        t.data.parentId === parentId
      );
    }

    // Calcular order
    const order = position === "child"
      ? calculateInsertOrder(siblings, "after")
      : calculateInsertOrder(siblings, position, referenceTask);

    // Crear nueva tarea heredando propiedades
    const newTaskData: TaskData = {
      ...createTaskFromTemplate(referenceTask.data),
      id: generateTaskId(),
      metaId: selectedMetaId,
      parentId,
      level,
      order,
      title: "",
      isCompleted: false,
    };

    const result = await onCreateTask(newTaskData);
    if (result.success) {
      // Abrir para editar
      const newTask: TaskRow = {
        id: newTaskData.id,
        user_id: "",
        data: newTaskData,
        client_updated_at: new Date().toISOString(),
        deleted_at: null,
      };
      startEdit(newTask);
    }
  }, [selectedMetaId, tasks, onCreateTask, startEdit]);

  // Crear tarea raíz
  const createRootTask = useCallback(async () => {
    if (!selectedMetaId) return;

    const rootTasks = tasks.filter(t => t.data.metaId === selectedMetaId && !t.data.parentId);
    const order = calculateInsertOrder(rootTasks, "after");

    const newTaskData: TaskData = {
      id: generateTaskId(),
      metaId: selectedMetaId,
      level: 0,
      order,
      type: "ACTIVIDAD",
      scope: "LABORAL",
      title: "",
      points: 2,
      isCompleted: false,
    };

    const result = await onCreateTask(newTaskData);
    if (result.success) {
      const newTask: TaskRow = {
        id: newTaskData.id,
        user_id: "",
        data: newTaskData,
        client_updated_at: new Date().toISOString(),
        deleted_at: null,
      };
      startEdit(newTask);
    }
  }, [selectedMetaId, tasks, onCreateTask, startEdit]);

  // Reordenar tarea
  const moveTask = useCallback(async (task: TaskRow, direction: "up" | "down") => {
    const metaId = task.data.metaId;
    const parentId = task.data.parentId;
    
    const siblings = tasks.filter(t => 
      t.data.metaId === metaId && 
      t.data.parentId === parentId &&
      t.data.id !== task.data.id
    ).sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));

    if (siblings.length === 0) return;

    const currentOrder = task.data.order ?? 0;
    
    if (direction === "up") {
      const prev = siblings.filter(s => (s.data.order ?? 0) < currentOrder).pop();
      if (prev) {
        const newOrder = calculateInsertOrder(siblings, "before", prev);
        await onUpdateTask(task.data.id, { order: newOrder });
      }
    } else {
      const next = siblings.find(s => (s.data.order ?? 0) > currentOrder);
      if (next) {
        const newOrder = calculateInsertOrder(siblings, "after", next);
        await onUpdateTask(task.data.id, { order: newOrder });
      }
    }
  }, [tasks, onUpdateTask]);

  // Undo
  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    await onUpdateTask(last.taskId, last.data);
  }, [undoStack, onUpdateTask]);

  // Keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-task-row]") && !target.closest("[data-edit-panel]")) {
        closeEdit();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [closeEdit]);

  // ==================== RENDER FILA COMPACTA ====================

  const renderCompactRow = (node: TreeNode, depth: number = 0) => {
    const { task, children } = node;
    const data = task.data;
    const isEditing = editingTaskId === data.id;
    const isHovered = hoveredTaskId === data.id;
    const isSaving = savingTaskId === data.id;
    const uiType = getUIType(data.type, data.scope, data.kind);
    const scheduleDisplay = getScheduleDisplay(data);
    const points = data.points ?? 2;

    // Nombre con detalle para Físico/Conocimiento
    const displayName = (data.scope === "FISICO" || data.scope === "CRECIMIENTO")
      ? (data.label ? `${data.title || ""} · ${data.label}`.trim() : data.title || "")
      : data.title || "";

    // Extras para INGRESO/GASTO
    const hasFinanceExtras = (data.type === "INGRESO" || data.type === "GASTO");
    const amount = data.extra?.amountEUR;
    const bank = bankAccounts.find(a => a.id === data.accountId)?.name;
    const forecast = forecastLines.find(f => f.id === data.forecastId)?.name;

    return (
      <div key={data.id} className="relative">
        {/* Fila compacta */}
        <div
          data-task-row
          className={`
            relative flex items-stretch min-h-[44px] border-b border-slate-100
            hover:bg-slate-50/50 transition-colors cursor-pointer
            ${isEditing ? "bg-blue-50/50 border-blue-200" : ""}
            ${isSaving ? "opacity-60" : ""}
          `}
          style={{ paddingLeft: depth * 24 + 8 }}
          onMouseEnter={() => setHoveredTaskId(data.id)}
          onMouseLeave={() => setHoveredTaskId(null)}
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest("button, input, select")) {
              startEdit(task);
            }
          }}
        >
          {/* Zona izquierda */}
          <div className="flex-1 flex items-center gap-2 py-2 pr-2 min-w-0">
            {/* Checkbox con puntos */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleCompleted(task);
              }}
              className={`
                relative flex-shrink-0 w-7 h-7 rounded-md border-2 
                flex items-center justify-center text-xs font-bold
                transition-all
                ${data.isCompleted 
                  ? "bg-green-500 border-green-500 text-white" 
                  : "border-slate-300 text-slate-500 hover:border-slate-400"
                }
              `}
            >
              {data.isCompleted ? "✓" : points}
            </button>

            {/* Nombre y extras */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`
                  text-sm truncate
                  ${data.isCompleted ? "line-through text-slate-400" : "text-slate-800"}
                  ${!displayName ? "text-slate-400 italic" : ""}
                `}>
                  {displayName || "Sin nombre"}
                </span>
              </div>
              
              {/* Extras en línea */}
              <div className="flex items-center gap-2 mt-0.5">
                {hasFinanceExtras && amount && (
                  <span className="text-xs text-slate-500">
                    {amount.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €
                  </span>
                )}
                {hasFinanceExtras && bank && (
                  <span className="text-xs text-slate-400">· {bank}</span>
                )}
                {hasFinanceExtras && forecast && (
                  <span className="text-xs text-slate-400">· {forecast}</span>
                )}
                {data.description && (
                  <span className="text-xs text-slate-400 truncate max-w-[200px]">
                    {data.description}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Zona derecha - Scheduling */}
          <div 
            className="flex-shrink-0 flex items-center px-3 text-xs text-slate-500 whitespace-nowrap"
            onClick={(e) => {
              e.stopPropagation();
              startEdit(task, true);
            }}
          >
            {scheduleDisplay}
          </div>

          {/* Botones de acción (hover) */}
          {isHovered && !isEditing && (
            <div className="absolute right-0 top-0 bottom-0 flex items-center gap-0.5 px-1 bg-gradient-to-l from-white via-white to-transparent">
              {/* Mover arriba */}
              <button
                onClick={(e) => { e.stopPropagation(); moveTask(task, "up"); }}
                className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
                title="Mover arriba"
              >
                ↑
              </button>
              {/* Mover abajo */}
              <button
                onClick={(e) => { e.stopPropagation(); moveTask(task, "down"); }}
                className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
                title="Mover abajo"
              >
                ↓
              </button>
              {/* Crear hermana arriba */}
              <button
                onClick={(e) => { e.stopPropagation(); createTask("before", task); }}
                className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-green-600 hover:bg-green-50 rounded text-xs"
                title="Crear tarea arriba"
              >
                +↑
              </button>
              {/* Crear hermana abajo */}
              <button
                onClick={(e) => { e.stopPropagation(); createTask("after", task); }}
                className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-green-600 hover:bg-green-50 rounded text-xs"
                title="Crear tarea abajo"
              >
                +↓
              </button>
              {/* Crear subtarea */}
              <button
                onClick={(e) => { e.stopPropagation(); createTask("child", task); }}
                className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded text-xs"
                title="Crear subtarea"
              >
                +→
              </button>
            </div>
          )}
        </div>

        {/* Panel de edición inline */}
        {isEditing && (
          <div
            data-edit-panel
            className="bg-slate-50 border-b-2 border-blue-300 px-4 py-3"
            style={{ marginLeft: depth * 24 + 8 }}
          >
            {renderEditPanel(task)}
          </div>
        )}

        {/* Hijos */}
        {children.map(child => renderCompactRow(child, depth + 1))}
      </div>
    );
  };

  // ==================== RENDER PANEL DE EDICIÓN ====================

  const renderEditPanel = (task: TaskRow) => {
    const data = editingData as TaskData;
    const uiType = getUIType(data.type || task.data.type, data.scope ?? task.data.scope, data.kind ?? task.data.kind);
    const isFinance = data.type === "INGRESO" || data.type === "GASTO";
    const isPhysicalKnowledge = data.scope === "FISICO" || data.scope === "CRECIMIENTO";
    const schedType = getScheduleType(data);

    return (
      <div className="space-y-4">
        {/* Nombre */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
          <input
            ref={nameInputRef}
            type="text"
            value={data.title || ""}
            onChange={(e) => updateField("title", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                createTask("after", task);
              } else if (e.key === "Tab" && !e.shiftKey) {
                e.preventDefault();
                createTask("child", task);
              }
            }}
            placeholder="Nombre de la tarea"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Scheduling */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Programación</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {(["puntual", "semanal", "mensual", "sin_programar"] as ScheduleType[]).map(type => (
              <button
                key={type}
                onClick={() => {
                  const extra = { ...(data.extra || {}) };
                  if (type === "sin_programar") {
                    extra.frequency = "PUNTUAL";
                    extra.unscheduled = true;
                    delete extra.weeklyDays;
                    delete extra.monthlyDay;
                    setEditingData(prev => ({ ...prev, date: undefined, time: undefined, repeatRule: undefined, extra }));
                  } else if (type === "puntual") {
                    extra.frequency = "PUNTUAL";
                    extra.unscheduled = false;
                    delete extra.weeklyDays;
                    delete extra.monthlyDay;
                    setEditingData(prev => ({ ...prev, date: prev.date || getTodayISO(), repeatRule: undefined, extra }));
                  } else if (type === "semanal") {
                    extra.frequency = "SEMANAL";
                    extra.unscheduled = false;
                    extra.weeklyDays = extra.weeklyDays || [];
                    delete extra.monthlyDay;
                    setEditingData(prev => ({ ...prev, date: undefined, extra }));
                  } else if (type === "mensual") {
                    extra.frequency = "MENSUAL";
                    extra.unscheduled = false;
                    extra.monthlyDay = extra.monthlyDay || 1;
                    delete extra.weeklyDays;
                    setEditingData(prev => ({ ...prev, date: undefined, extra }));
                  }
                  debouncedSave();
                }}
                className={`
                  px-3 py-1.5 text-xs rounded-full border transition-colors
                  ${schedType === type 
                    ? "bg-blue-500 text-white border-blue-500" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }
                `}
              >
                {type === "puntual" && "Puntual"}
                {type === "semanal" && "Semanal"}
                {type === "mensual" && "Mensual"}
                {type === "sin_programar" && "Sin programar"}
              </button>
            ))}
          </div>

          {/* Opciones según tipo */}
          {schedType === "puntual" && (
            <div className="flex gap-2">
              <input
                type="date"
                value={data.date || getTodayISO()}
                onChange={(e) => updateField("date", e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
              />
              <input
                type="time"
                value={data.time || ""}
                onChange={(e) => updateField("time", e.target.value)}
                className="w-24 px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                placeholder="HH:MM"
              />
            </div>
          )}

          {schedType === "semanal" && (
            <div className="space-y-2">
              <div className="flex gap-1">
                {WEEKDAY_CODES.map(day => {
                  const selected = normalizeWeeklyDays(data.extra?.weeklyDays).includes(day);
                  return (
                    <button
                      key={day}
                      onClick={() => {
                        const current = normalizeWeeklyDays(data.extra?.weeklyDays);
                        const newDays = selected 
                          ? current.filter(d => d !== day)
                          : [...current, day].sort((a, b) => WEEKDAY_CODES.indexOf(a) - WEEKDAY_CODES.indexOf(b));
                        const extra = { ...(data.extra || {}), weeklyDays: newDays };
                        if (newDays.length > 0) {
                          const repeatRule = buildWeeklyRepeatRule(newDays, extra.weeklyTime);
                          setEditingData(prev => ({ ...prev, repeatRule, extra }));
                        } else {
                          setEditingData(prev => ({ ...prev, repeatRule: undefined, extra }));
                        }
                        debouncedSave();
                      }}
                      className={`
                        w-8 h-8 text-xs rounded-lg border transition-colors
                        ${selected 
                          ? "bg-blue-500 text-white border-blue-500" 
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        }
                      `}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <input
                type="time"
                value={data.extra?.weeklyTime || ""}
                onChange={(e) => {
                  const weeklyTime = e.target.value;
                  const weeklyDays = normalizeWeeklyDays(data.extra?.weeklyDays);
                  const extra = { ...(data.extra || {}), weeklyTime };
                  if (weeklyDays.length > 0) {
                    const repeatRule = buildWeeklyRepeatRule(weeklyDays, weeklyTime);
                    setEditingData(prev => ({ ...prev, repeatRule, extra }));
                  } else {
                    setEditingData(prev => ({ ...prev, extra }));
                  }
                  debouncedSave();
                }}
                className="w-24 px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                placeholder="HH:MM"
              />
            </div>
          )}

          {schedType === "mensual" && (
            <div className="flex gap-2">
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500">Día</span>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={data.extra?.monthlyDay || 1}
                  onChange={(e) => {
                    const monthlyDay = parseInt(e.target.value) || 1;
                    const monthlyTime = data.extra?.monthlyTime;
                    const repeatRule = buildMonthlyRepeatRule(monthlyDay, monthlyTime);
                    const extra = { ...(data.extra || {}), monthlyDay };
                    setEditingData(prev => ({ ...prev, repeatRule, extra }));
                    debouncedSave();
                  }}
                  className="w-16 px-2 py-1.5 text-xs border border-slate-200 rounded-lg text-center"
                />
              </div>
              <input
                type="time"
                value={data.extra?.monthlyTime || ""}
                onChange={(e) => {
                  const monthlyTime = e.target.value;
                  const monthlyDay = data.extra?.monthlyDay || 1;
                  const repeatRule = buildMonthlyRepeatRule(monthlyDay, monthlyTime);
                  const extra = { ...(data.extra || {}), monthlyTime };
                  setEditingData(prev => ({ ...prev, repeatRule, extra }));
                  debouncedSave();
                }}
                className="w-24 px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                placeholder="HH:MM"
              />
            </div>
          )}
        </div>

        {/* Puntos */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Puntos</label>
          <input
            type="number"
            min="1"
            max="10"
            value={data.points ?? 2}
            onChange={(e) => updateField("points", parseInt(e.target.value) || 2)}
            className="w-20 px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
          />
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Descripción</label>
          <textarea
            value={data.description || ""}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="Descripción opcional"
            rows={2}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg resize-none"
          />
        </div>

        {/* Campos financieros */}
        {isFinance && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Cantidad</label>
              <input
                type="number"
                step="0.01"
                value={data.extra?.amountEUR || ""}
                onChange={(e) => updateExtra("amountEUR", parseFloat(e.target.value) || undefined)}
                placeholder="0.00"
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Banco</label>
              <select
                value={data.accountId || ""}
                onChange={(e) => updateField("accountId", e.target.value || undefined)}
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
              >
                <option value="">Sin asociar</option>
                {bankAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Previsión</label>
              <select
                value={data.forecastId || ""}
                onChange={(e) => updateField("forecastId", e.target.value || undefined)}
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
              >
                <option value="">Sin asociar</option>
                {forecastLines.filter(f => f.type === data.type).map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Campos Físico/Conocimiento */}
        {isPhysicalKnowledge && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Etiqueta</label>
            <div className="flex flex-wrap gap-1">
              {labels
                .filter(l => l.scope === data.scope)
                .map(label => (
                  <button
                    key={label.id}
                    onClick={() => {
                      setEditingData(prev => ({ 
                        ...prev, 
                        label: label.name,
                        points: label.points
                      }));
                      debouncedSave();
                    }}
                    className={`
                      px-2 py-1 text-xs rounded border transition-colors
                      ${data.label === label.name
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                      }
                    `}
                  >
                    {label.name} ({label.points}pts)
                  </button>
                ))
              }
            </div>
          </div>
        )}
      </div>
    );
  };

  // ==================== RENDER PRINCIPAL ====================

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Selector de metas */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto">
          {metas.map(meta => (
            <button
              key={meta.id}
              onClick={() => setSelectedMetaId(meta.id)}
              className={`
                flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${selectedMetaId === meta.id
                  ? "bg-blue-500 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                }
              `}
            >
              {meta.title}
            </button>
          ))}
          <button
            onClick={() => onOpenMetaModal(null)}
            className="flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 border border-dashed border-blue-300"
          >
            + Meta
          </button>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="flex-1 overflow-auto">
        {selectedMeta ? (
          <div>
            {/* Header de meta */}
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-lg">
                    {selectedMeta.title.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold text-slate-800">{selectedMeta.title}</h1>
                    {selectedMeta.description && (
                      <p className="text-xs text-slate-500">{selectedMeta.description}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={createRootTask}
                  className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
                >
                  + Tarea
                </button>
              </div>
            </div>

            {/* Árbol de tareas */}
            <div className="divide-y divide-slate-100">
              {tree.length > 0 ? (
                tree.map(node => renderCompactRow(node, 0))
              ) : (
                <div className="py-12 text-center text-slate-400">
                  <p className="text-sm">No hay tareas en esta meta</p>
                  <button
                    onClick={createRootTask}
                    className="mt-3 text-sm text-blue-600 hover:underline"
                  >
                    Crear primera tarea
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400">
            <div className="text-center">
              <p className="text-sm mb-3">Selecciona o crea una meta para comenzar</p>
              <button
                onClick={() => onOpenMetaModal(null)}
                className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600"
              >
                Crear meta
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Indicador de guardado */}
      {savingTaskId && (
        <div className="fixed bottom-4 right-4 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg">
          Guardando...
        </div>
      )}
    </div>
  );
}


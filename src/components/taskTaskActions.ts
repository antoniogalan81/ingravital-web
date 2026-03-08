"use client";

import type { TaskRow, TaskData, TaskExtra } from "@/src/lib/types";
import type { buildNewTaskData as BuildNewTaskDataFn } from "@/src/lib/tasks";
import { getTodayISO } from "@/src/components/taskDiagramTreeHelpers";

// ==================== FACTORY ====================

export function createTaskActions(params: {
  selectedMetaId: string | null;
  tasks: TaskRow[];
  onCreateTask: (taskData: TaskData) => Promise<{ success: boolean; error?: string }>;
  /** Añade la tarea al estado local como borrador SIN persistir en Supabase */
  onAddLocalDraft: (taskData: TaskData) => void;
  calculateInsertOrder: (siblings: TaskRow[], position: "before" | "after", referenceTask?: TaskRow) => number;
  buildNewTaskData: typeof BuildNewTaskDataFn;
  setEditingTaskId: (id: string | null) => void;
}): {
  createTask: (position: "before" | "after" | "child", referenceTask: TaskRow) => Promise<void>;
  createRootTask: () => Promise<void>;
  duplicateTask: (task: TaskRow) => Promise<void>;
} {
  const {
    selectedMetaId,
    tasks,
    onCreateTask,
    onAddLocalDraft,
    calculateInsertOrder,
    buildNewTaskData,
    setEditingTaskId,
  } = params;

  // ==================== createTask ====================
  const createTask = async (position: "before" | "after" | "child", referenceTask: TaskRow): Promise<void> => {
    if (!selectedMetaId) return;

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
      siblings = tasks.filter(t => t.data.metaId === selectedMetaId && t.data.parentId === parentId);
    }

    const order = position === "child"
      ? calculateInsertOrder(siblings, "after")
      : calculateInsertOrder(siblings, position, referenceTask);

    // Usar buildNewTaskData para garantizar objeto canónico igual que APP
    const ref = referenceTask.data;
    const refIsTitle = ref.kind === "TITLE";
    const isUnscheduled = ref.extra?.unscheduled === true || !ref.date;

    const newTaskData = buildNewTaskData({
      metaId: selectedMetaId,
      parentId: parentId ?? null,
      level,
      order,
      type: refIsTitle ? "ACTIVIDAD" : ref.type,
      scope: ref.scope,
      title: "",
      label: ref.label,
      points: ref.points ?? 2,
      date: refIsTitle ? getTodayISO() : ref.date,
      isTitle: false,
      unscheduled: refIsTitle ? false : isUnscheduled,
      accountId: ref.accountId,
      forecastId: ref.forecastId,
      amountEUR: ref.extra?.amountEUR,
    });

    // Añadir al estado local como borrador (SIN Supabase); la persistencia
    // ocurre en handleUpdateTask cuando el usuario proporcione un nombre válido.
    onAddLocalDraft(newTaskData);
    setEditingTaskId(newTaskData.id);
  };

  // ==================== createRootTask ====================
  const createRootTask = async (): Promise<void> => {
    if (!selectedMetaId) return;
    const rootTasks = tasks.filter(t => t.data.metaId === selectedMetaId && !t.data.parentId);
    const order = calculateInsertOrder(rootTasks, "after");

    // Usar buildNewTaskData para garantizar objeto canónico igual que APP
    const newTaskData = buildNewTaskData({
      metaId: selectedMetaId,
      parentId: null,
      level: 0,
      order,
      type: "ACTIVIDAD",
      scope: "LABORAL",
      title: "",
      points: 2,
    });

    // Añadir al estado local como borrador (SIN Supabase)
    onAddLocalDraft(newTaskData);
    setEditingTaskId(newTaskData.id);
  };

  // ==================== duplicateTask ====================
  const duplicateTask = async (task: TaskRow): Promise<void> => {
    if (!selectedMetaId) return;
    const siblings = tasks.filter(t =>
      t.data.metaId === selectedMetaId && t.data.parentId === task.data.parentId
    );
    const order = calculateInsertOrder(siblings, "after", task);

    // Usar buildNewTaskData para garantizar objeto canónico igual que APP
    const src = task.data;
    const isTitle = src.kind === "TITLE";
    const isUnscheduled = src.extra?.unscheduled === true || !src.date;

    // Preservar campos extra relevantes del original
    const extraOverrides: Partial<TaskExtra> = {};
    if (src.extra) {
      if (src.extra.frequency) extraOverrides.frequency = src.extra.frequency;
      if (src.extra.unit) extraOverrides.unit = src.extra.unit;
      if (src.extra.quantity !== undefined) extraOverrides.quantity = src.extra.quantity;
      if (src.extra.weeklyDays) extraOverrides.weeklyDays = [...src.extra.weeklyDays];
      if (src.extra.weeklyTime) extraOverrides.weeklyTime = src.extra.weeklyTime;
      if (src.extra.monthlyDay) extraOverrides.monthlyDay = src.extra.monthlyDay;
      if (src.extra.monthlyTime) extraOverrides.monthlyTime = src.extra.monthlyTime;
      if (src.extra.notes) extraOverrides.notes = src.extra.notes;
    }

    const newTaskData = buildNewTaskData({
      metaId: selectedMetaId,
      parentId: src.parentId ?? null,
      level: src.level,
      order,
      type: src.type,
      scope: src.scope,
      title: `${src.title || "Sin nombre"} (copia)`,
      label: src.label,
      description: src.description,
      date: src.date,
      points: src.points ?? 2,
      isTitle,
      unscheduled: isUnscheduled,
      accountId: src.accountId,
      forecastId: src.forecastId,
      amountEUR: src.extra?.amountEUR,
      extraOverrides,
    });

    // Copiar multiItems para tareas MULTI (deep copy)
    if (src.type === "MULTI" && Array.isArray(src.multiItems) && src.multiItems.length > 0) {
      newTaskData.multiItems = src.multiItems.map(item => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: item.title,
        done: false,
        order: item.order,
      }));
    }

    const result = await onCreateTask(newTaskData);
    if (result.success) {
      setEditingTaskId(newTaskData.id);
    }
  };

  return { createTask, createRootTask, duplicateTask };
}

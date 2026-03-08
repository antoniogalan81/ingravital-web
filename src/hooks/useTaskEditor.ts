"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { TaskRow, TaskData, Label } from "@/src/lib/types";

function getTaskName(data: Partial<TaskData>): string {
  return ((data.label || data.title || "") as string).trim();
}

export interface TaskEditorState {
  editingTaskId: string | null;
  editingData: Partial<TaskData>;
  savingTaskId: string | null;
  editError: string | null;
  localLabels: Label[];
  addingLabel: boolean;
  newLabelName: string;
}

export interface TaskEditorActions {
  setEditingData: React.Dispatch<React.SetStateAction<Partial<TaskData>>>;
  setLocalLabels: React.Dispatch<React.SetStateAction<Label[]>>;
  setAddingLabel: React.Dispatch<React.SetStateAction<boolean>>;
  setNewLabelName: React.Dispatch<React.SetStateAction<string>>;
  startEdit: (task: TaskRow) => void;
  closeEdit: () => Promise<boolean>;
  cancelEdit: () => void;
  saveChanges: () => Promise<{ success: boolean; error?: string }>;
  debouncedSave: () => void;
  updateField: <K extends keyof TaskData>(field: K, value: TaskData[K]) => void;
  updateExtra: <K extends keyof NonNullable<TaskData["extra"]>>(field: K, value: NonNullable<TaskData["extra"]>[K]) => void;
  handleDeleteTask: () => Promise<void>;
  handleSaveAndClose: () => Promise<void>;
}

interface UseTaskEditorParams {
  tasks: TaskRow[];
  labels: Label[];
  onUpdateTask: (id: string, updates: Partial<TaskData>) => Promise<{ success: boolean; error?: string }>;
  onDeleteTask: (id: string) => Promise<{ success: boolean; error?: string }>;
  /** Callback opcional para agregar al undoStack (solo Metas) */
  onStartEdit?: (task: TaskRow) => void;
  /** Indica si un task ID es un borrador local (no persistido en Supabase aún) */
  isDraftTask?: (id: string) => boolean;
  /** Descarta un borrador eliminándolo del estado local (sin llamar a Supabase) */
  onDiscardDraft?: (id: string) => void;
}

export function useTaskEditor({
  tasks,
  labels,
  onUpdateTask,
  onDeleteTask,
  onStartEdit,
  isDraftTask,
  onDiscardDraft,
}: UseTaskEditorParams): TaskEditorState & TaskEditorActions {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<Partial<TaskData>>({});
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [localLabels, setLocalLabels] = useState<Label[]>(labels);
  const [addingLabel, setAddingLabel] = useState<boolean>(false);
  const [newLabelName, setNewLabelName] = useState<string>("");

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync localLabels con labels prop
  useEffect(() => {
    setLocalLabels(labels);
  }, [labels]);

  const startEdit = useCallback((task: TaskRow) => {
    setEditingTaskId(task.data.id);
    setEditingData({ ...task.data });
    setEditError(null);
    onStartEdit?.(task);
  }, [onStartEdit]);

  const saveChanges = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!editingTaskId) return { success: true };
    const task = tasks.find(t => t.data.id === editingTaskId);
    if (!task) return { success: true };

    const updates: Partial<TaskData> = {};
    const original = task.data;
    Object.keys(editingData).forEach(key => {
      const k = key as keyof TaskData;
      if (JSON.stringify(editingData[k]) !== JSON.stringify(original[k])) {
        (updates as Record<string, unknown>)[k] = editingData[k];
      }
    });

    if (Object.keys(updates).length === 0) return { success: true };
    setSavingTaskId(editingTaskId);
    const result = await onUpdateTask(editingTaskId, updates);
    setSavingTaskId(null);
    
    if (!result.success) {
      const errorMsg = result.error || "Error al guardar";
      setEditError(errorMsg);
      return { success: false, error: errorMsg };
    }
    setEditError(null);
    return { success: true };
  }, [editingTaskId, editingData, tasks, onUpdateTask]);

  const closeEdit = useCallback(async (): Promise<boolean> => {
    if (!getTaskName(editingData)) {
      // Draft with no name: discard it (it was never in Supabase)
      if (editingTaskId && isDraftTask?.(editingTaskId)) {
        onDiscardDraft?.(editingTaskId);
        setEditingTaskId(null);
        setEditingData({});
        setEditError(null);
        return true;
      }
      setEditError("La tarea necesita un nombre");
      return false;
    }
    if (editingTaskId && Object.keys(editingData).length > 0) {
      const result = await saveChanges();
      if (!result.success) return false;
    }
    setEditingTaskId(null);
    setEditingData({});
    setEditError(null);
    return true;
  }, [editingTaskId, editingData, isDraftTask, onDiscardDraft, saveChanges]);

  const cancelEdit = useCallback(() => {
    // Draft with no name: discard from local state (no Supabase cleanup needed)
    if (editingTaskId && isDraftTask?.(editingTaskId) && !getTaskName(editingData)) {
      onDiscardDraft?.(editingTaskId);
    }
    setEditingTaskId(null);
    setEditingData({});
    setEditError(null);
  }, [editingTaskId, editingData, isDraftTask, onDiscardDraft]);

  const handleSaveAndClose = useCallback(async () => {
    if (!getTaskName(editingData)) {
      setEditError("La tarea necesita un nombre");
      return;
    }
    const result = await saveChanges();
    if (result.success) {
      setEditingTaskId(null);
      setEditingData({});
      setEditError(null);
    }
  }, [saveChanges, editingData]);

  const handleDeleteTask = useCallback(async () => {
    if (!editingTaskId) return;
    const confirmed = window.confirm("¿Eliminar esta tarea? Esta acción no se puede deshacer.");
    if (!confirmed) return;

    setSavingTaskId(editingTaskId);
    const result = await onDeleteTask(editingTaskId);
    setSavingTaskId(null);

    if (!result.success) {
      setEditError(result.error || "Error al eliminar");
      return;
    }

    setEditingTaskId(null);
    setEditingData({});
    setEditError(null);
  }, [editingTaskId, onDeleteTask]);

  const debouncedSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(saveChanges, 500);
  }, [saveChanges]);

  const updateField = useCallback(<K extends keyof TaskData>(field: K, value: TaskData[K]) => {
    setEditingData(prev => ({ ...prev, [field]: value }));
    debouncedSave();
  }, [debouncedSave]);

  const updateExtra = useCallback(<K extends keyof NonNullable<TaskData["extra"]>>(field: K, value: NonNullable<TaskData["extra"]>[K]) => {
    setEditingData(prev => ({
      ...prev,
      extra: { ...(prev.extra || {}), [field]: value }
    }));
    debouncedSave();
  }, [debouncedSave]);

  return {
    // State
    editingTaskId,
    editingData,
    savingTaskId,
    editError,
    localLabels,
    addingLabel,
    newLabelName,
    // Actions
    setEditingData,
    setLocalLabels,
    setAddingLabel,
    setNewLabelName,
    startEdit,
    closeEdit,
    cancelEdit,
    saveChanges,
    debouncedSave,
    updateField,
    updateExtra,
    handleDeleteTask,
    handleSaveAndClose,
  };
}


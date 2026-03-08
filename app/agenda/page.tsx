"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import type { TaskRow, TaskData, TaskFilters, FilterPreset, AgendaUIState, Meta, BankAccount, ForecastLine, Label, MultiItem } from "@/src/lib/types";
import { DEFAULT_FILTERS, DEFAULT_UI_STATE } from "@/src/lib/types";
import { 
  fetchTasks, fetchMetas, fetchBankAccounts, fetchForecastLines, fetchLabels,
  createTask, updateTask, deleteTask, restoreTask, createMeta, updateMeta, deleteMetaAndTasks,
  updateMetaOrder, updateMetaIsActive, filterTasks, sortTasksByHierarchy 
} from "@/src/lib/tasks";
import { loadUIState, saveUIState, savePreset, deletePreset } from "@/src/lib/localStorage";
import AgendaSidebar from "@/src/components/AgendaSidebar";
import TaskDiagramTree from "@/src/components/TaskDiagramTree";
import MetaModal from "@/src/components/MetaModal";
import TaskEditorContent from "@/src/components/TaskEditorContent";
import MultiItemsInline from "@/src/components/MultiItemsInline";
import { computeMultiProgress } from "@/src/lib/multiHelpers";
import type { AgendaUILocalStateV1 } from "@/src/lib/uiLocalState";
import { readUiState, writeUiState, pruneRecord, getAgendaKey, DEFAULT_AGENDA_LOCAL } from "@/src/lib/uiLocalState";
import { useTaskEditor } from "@/src/hooks/useTaskEditor";
import { useGlobalUi } from "@/src/hooks/useGlobalUi";

function calculateInsertOrder(
  siblings: TaskRow[],
  position: "before" | "after",
  referenceTask?: TaskRow
): number {
  if (siblings.length === 0) return 1000;
  const sorted = [...siblings].sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));
  if (!referenceTask) return (sorted[sorted.length - 1].data.order ?? 0) + 1000;

  const refIndex = sorted.findIndex(t => t.data.id === referenceTask.data.id);
  if (refIndex === -1) return (sorted[sorted.length - 1].data.order ?? 0) + 1000;

  if (position === "before") {
    if (refIndex === 0) return (sorted[0].data.order ?? 0) - 1000;
    const prevOrder = sorted[refIndex - 1].data.order ?? 0;
    const currOrder = sorted[refIndex].data.order ?? 0;
    return Math.floor((prevOrder + currOrder) / 2);
  } else {
    if (refIndex === sorted.length - 1) return (sorted[refIndex].data.order ?? 0) + 1000;
    const currOrder = sorted[refIndex].data.order ?? 0;
    const nextOrder = sorted[refIndex + 1].data.order ?? 0;
    return Math.floor((currOrder + nextOrder) / 2);
  }
}

type SaveMetaInput = {
  title: string;
  description?: string;
  targetDate: string;
  icon?: string | null;
  color?: string | null;
  horizon?: "1M" | "3M" | "6M" | "9M" | "1Y" | "3Y" | "5Y" | "10Y";
};

type AgendaView = "metas" | "agenda";

export default function AgendaPage() {
  // Vista activa: desde URL (?view=agenda|metas) o default agenda
  const [activeView, setActiveView] = useState<AgendaView>("agenda");
  // Sincronizar con URL al montar/navegar (p.ej. desde SiteShell)
  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const v = params.get("view");
    if (v === "metas") setActiveView("metas");
    else if (v === "agenda") setActiveView("agenda");
  }, []);

  // Auth
  const [authState, setAuthState] = useState<{ loading: boolean; authenticated: boolean }>({
    loading: true,
    authenticated: false,
  });
  // Stable userId — set once from supabase auth, before tasks load
  const [userId, setUserId] = useState<string | null>(null);

  // Draft task tracking: tareas añadidas localmente pero NO persistidas en Supabase aún
  const draftTaskIdsRef = useRef(new Set<string>());
  // Ref siempre actualizado a tasks — permite leerlos en callbacks sin deps
  const tasksRef = useRef<TaskRow[]>([]);

  // Data
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [forecastLines, setForecastLines] = useState<ForecastLine[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mantener tasksRef siempre actualizado (usado en callbacks con deps estables)
  tasksRef.current = tasks;

  // UI State
  const [uiState, setUIState] = useState<AgendaUIState>(DEFAULT_UI_STATE);
  // Ref estable para callbacks que necesitan leer uiState sin recrearse en cada render
  const uiStateRef = useRef<AgendaUIState>(DEFAULT_UI_STATE);
  uiStateRef.current = uiState;

  // Global UI (shared with Metas) — keyed by stable userId
  const { hideCompletedTasks, setHideCompletedTasks } = useGlobalUi(userId);

  // Vista Agenda: modo multi + colapsado por id (solo UI) — persistido en localStorage
  const [multiEnabled] = useState(true);
  const agendaStorageKey = useMemo(() => userId ? getAgendaKey(userId) : null, [userId]);
  const [collapsedById, setCollapsedById] = useState<Record<string, boolean>>({});
  const [hideDoneMultiByTaskId, setHideDoneMultiByTaskId] = useState<Record<string, boolean>>({});
  const agendaLocalHydrated = useRef(false);
  const [draggingMini, setDraggingMini] = useState<{ parentTaskId: string; itemId: string } | null>(null);
  const toggleCollapse = useCallback((taskId: string) => {
    setCollapsedById(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  }, []);
  const toggleHideDoneMulti = useCallback((taskId: string) => {
    setHideDoneMultiByTaskId(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  }, []);

  // Hydrate collapsed/hideDone from localStorage — only once userId is available
  useEffect(() => {
    if (!agendaStorageKey || agendaLocalHydrated.current) return;
    agendaLocalHydrated.current = true;
    const saved = readUiState<AgendaUILocalStateV1>(agendaStorageKey, DEFAULT_AGENDA_LOCAL);
    if (Object.keys(saved.collapsedById).length > 0) setCollapsedById(saved.collapsedById);
    if (Object.keys(saved.hideDoneMultiByTaskId).length > 0) setHideDoneMultiByTaskId(saved.hideDoneMultiByTaskId);
  }, [agendaStorageKey]);

  // Meta Modal
  const [metaModalOpen, setMetaModalOpen] = useState(false);
  const [metaToEdit, setMetaToEdit] = useState<Meta | null>(null);

  // Task Editor Modal (para vista Agenda)
  const [taskEditorOpen, setTaskEditorOpen] = useState(false);

  // Sidebar espera solo {id, title}
  const metasForSidebar = useMemo(() => metas.map(m => ({ id: m.id, title: m.title })), [metas]);
  const metasForSidebarRef = useRef(metasForSidebar);
  metasForSidebarRef.current = metasForSidebar;

  // Mapa de metas por id para lookup rápido (usado en vista Agenda)
  const metaById = useMemo(() => {
    const map = new Map<string, Meta>();
    metas.forEach(m => map.set(m.id, m));
    return map;
  }, [metas]);

  // ID de la meta que TaskDiagramTree debe seleccionar al montar
  const initialSelectedMetaId = useMemo(() => {
    const raw = (uiState.activeFilters as any)?.metaIds;
    const ids: string[] = Array.isArray(raw) ? raw.filter((x: unknown): x is string => typeof x === "string") : [];
    return metasForSidebar.find(m => ids.includes(m.id))?.id ?? null;
  }, [uiState.activeFilters, metasForSidebar]);

  // Auth check — also sets stable userId for persistence keys
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        window.location.href = "/login";
        return;
      }
      setUserId(session.user.id);
      setAuthState({ loading: false, authenticated: true });
    })();
  }, []);

  // Load UI state
  useEffect(() => {
    if (typeof window !== "undefined") {
      setUIState(loadUIState());
    }
  }, []);

  // Debounced persist of Agenda collapsedById + hideDoneMultiByTaskId
  useEffect(() => {
    if (!agendaStorageKey) return;
    const timer = setTimeout(() => {
      const state: AgendaUILocalStateV1 = { v: 1, collapsedById, hideDoneMultiByTaskId };
      writeUiState(agendaStorageKey, state);
    }, 300);
    return () => clearTimeout(timer);
  }, [collapsedById, hideDoneMultiByTaskId, agendaStorageKey]);

  // Prune stale ids when task list changes
  useEffect(() => {
    const ids = new Set(tasks.map(t => t.data.id));
    const pruned1 = pruneRecord(collapsedById, ids);
    const pruned2 = pruneRecord(hideDoneMultiByTaskId, ids);
    if (pruned1 !== collapsedById) setCollapsedById(pruned1);
    if (pruned2 !== hideDoneMultiByTaskId) setHideDoneMultiByTaskId(pruned2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  // Load all data
  useEffect(() => {
    if (!authState.authenticated) return;

    const loadData = async () => {
      setLoadingData(true);
      setError(null);

      const [tasksRes, metasRes, accountsRes, forecastRes, labelsRes] = await Promise.all([
        fetchTasks(),
        fetchMetas(),
        fetchBankAccounts(),
        fetchForecastLines(),
        fetchLabels(),
      ]);

      if (tasksRes.error) {
        setError(tasksRes.error);
      } else {
        setTasks(tasksRes.data || []);
      }

      setMetas(metasRes.data || []);
      setBankAccounts(accountsRes.data || []);
      setForecastLines(forecastRes.data || []);
      setLabels(labelsRes.data || []);

      setLoadingData(false);
    };

    loadData();
  }, [authState.authenticated]);

  // Auto-collapse sidebar on mobile (< 768px) on initial mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setUIState((prev) => {
        if (prev.sidebarCollapsed) return prev;
        const next = { ...prev, sidebarCollapsed: true };
        saveUIState(next);
        return next;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========== FILTERS ==========

  const handleFiltersChange = useCallback((filters: TaskFilters) => {
    const newState = { ...uiStateRef.current, activeFilters: filters };
    setUIState(newState);
    saveUIState(newState);
  }, []);

  const handleSavePreset = useCallback((preset: FilterPreset) => {
    setUIState(savePreset(preset));
  }, []);

  const handleDeletePreset = useCallback((presetId: string) => {
    setUIState(deletePreset(presetId));
  }, []);

  const handleApplyPreset = useCallback((preset: FilterPreset) => {
    const newState = { ...uiStateRef.current, activeFilters: preset.filters };
    setUIState(newState);
    saveUIState(newState);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    const cur = uiStateRef.current;
    const newState = { ...cur, sidebarCollapsed: !cur.sidebarCollapsed };
    setUIState(newState);
    saveUIState(newState);
  }, []);

  const goToMetasView = useCallback(() => {
    const currentMetas = metasForSidebarRef.current;
    if (currentMetas.length > 0) {
      const raw = (uiStateRef.current.activeFilters as any)?.metaIds;
      const ids: string[] = Array.isArray(raw) ? raw.filter((x: unknown): x is string => typeof x === "string") : [];
      const validIds = ids.filter((id: string) => currentMetas.some(m => m.id === id));
      if (validIds.length === 0) {
        handleFiltersChange({ ...uiStateRef.current.activeFilters, metaIds: currentMetas.map(m => m.id) });
      }
    }
    setActiveView("metas");
  }, [handleFiltersChange]);

  // ========== TASK HANDLERS ==========

  const handleCreateTask = useCallback(async (taskData: TaskData): Promise<{ success: boolean; error?: string }> => {
    const result = await createTask(taskData);
    if (result.error) {
      return { success: false, error: result.error };
    }
    if (result.data) {
      setTasks(prev => [...prev, result.data!]);
    }
    return { success: true };
  }, []);

  // Añade una tarea al estado local sin persistirla (borrador local)
  const handleAddLocalDraft = useCallback((taskData: TaskData) => {
    const userId = tasksRef.current[0]?.user_id ?? "";
    const draftRow: TaskRow = {
      id: taskData.id,
      user_id: userId,
      data: taskData,
      client_updated_at: new Date().toISOString(),
      deleted_at: null,
    };
    draftTaskIdsRef.current.add(taskData.id);
    setTasks(prev => [...prev, draftRow]);
  }, []);

  // Elimina un borrador del estado local (nunca estuvo en Supabase)
  const handleDiscardDraft = useCallback((id: string) => {
    draftTaskIdsRef.current.delete(id);
    setTasks(prev => prev.filter(t => t.data.id !== id));
  }, []);

  const isDraftTask = useCallback((id: string) => draftTaskIdsRef.current.has(id), []);

  const handleUpdateTask = useCallback(async (id: string, taskData: Partial<TaskData>): Promise<{ success: boolean; error?: string }> => {
    // Borrador local: actualizar estado local; persistir en Supabase solo cuando tenga nombre válido
    if (draftTaskIdsRef.current.has(id)) {
      const currentTask = tasksRef.current.find(t => t.data.id === id);
      if (!currentTask) return { success: true };
      const mergedData = { ...currentTask.data, ...taskData };
      // Actualizar estado local optimistamente
      setTasks(prev => prev.map(t => t.data.id === id ? { ...t, data: mergedData } : t));
      // Solo crear en Supabase si el nombre es válido
      const taskName = ((mergedData.label || mergedData.title || "") as string).trim();
      if (!taskName) return { success: true };
      // Nombre válido: crear en Supabase y dejar de ser borrador
      const result = await createTask(mergedData);
      if (result.error) return { success: false, error: result.error };
      if (result.data) {
        draftTaskIdsRef.current.delete(id);
        setTasks(prev => prev.map(t => t.data.id === id ? result.data! : t));
      }
      return { success: true };
    }
    // Tarea normal: actualizar en Supabase
    const result = await updateTask(id, taskData);
    if (result.error) {
      return { success: false, error: result.error };
    }
    if (result.data) {
      setTasks(prev => prev.map(t => t.data.id === id ? result.data! : t));
    }
    return { success: true };
  }, []);

  const handleDeleteTask = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    const result = await deleteTask(id);
    if (result.error) {
      return { success: false, error: result.error };
    }
    // Eliminar de UI tras éxito en Supabase
    setTasks(prev => prev.filter(t => t.data.id !== id));
    return { success: true };
  }, []);

  // Task Editor Hook (para vista Agenda) - después de handlers
  const taskEditor = useTaskEditor({
    tasks,
    labels,
    onUpdateTask: handleUpdateTask,
    onDeleteTask: handleDeleteTask,
    isDraftTask,
    onDiscardDraft: handleDiscardDraft,
  });

  // Encontrar la tarea que se está editando
  const editingTask = useMemo(() => {
    if (!taskEditor.editingTaskId) return null;
    return tasks.find(t => t.data.id === taskEditor.editingTaskId) || null;
  }, [tasks, taskEditor.editingTaskId]);

  const handleRestoreTask = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    const result = await restoreTask(id);
    if (result.error) {
      return { success: false, error: result.error };
    }
    // Recargar tareas para obtener la restaurada
    const tasksRes = await fetchTasks();
    if (tasksRes.data) {
      setTasks(tasksRes.data);
    }
    return { success: true };
  }, []);

  // ========== META MODAL ==========

  const handleOpenMetaModal = useCallback((meta: Meta | null) => {
    setMetaToEdit(meta);
    setMetaModalOpen(true);
  }, []);

  const handleCloseMetaModal = useCallback(() => {
    setMetaModalOpen(false);
    setMetaToEdit(null);
  }, []);

  const handleSaveMeta = useCallback(async (input: SaveMetaInput): Promise<{ success: boolean; error?: string }> => {
    if (metaToEdit) {
      const result = await updateMeta(metaToEdit.id, input, metaToEdit);
      if (result.error) {
        return { success: false, error: result.error };
      }
      if (result.data) {
        setMetas(prev => prev.map(m => m.id === metaToEdit.id ? result.data! : m));
      }
    } else {
      const result = await createMeta(input);
      if (result.error) {
        return { success: false, error: result.error };
      }
      if (result.data) {
        setMetas(prev => [...prev, result.data!]);
      }
    }
    return { success: true };
  }, [metaToEdit]);

  const handleDeleteMeta = useCallback(async (metaId: string): Promise<{ success: boolean; error?: string }> => {
    const result = await deleteMetaAndTasks(metaId);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    // Eliminar de UI tras éxito en Supabase
    setMetas(prev => prev.filter(m => m.id !== metaId));
    setTasks(prev => prev.filter(t => t.data.metaId !== metaId));
    return { success: true };
  }, []);

  // ========== TOGGLE META ACTIVE ==========

  const handleToggleMetaActive = useCallback(async (metaId: string, isActive: boolean): Promise<{ success: boolean; error?: string }> => {
    // Guardar estado previo para rollback
    const prevMetas = [...metas];

    // Actualización optimista: actualizar UI inmediatamente
    setMetas(prev => prev.map(m => m.id === metaId ? { ...m, isActive } : m));

    // Persistir en Supabase
    const existingMeta = metas.find(m => m.id === metaId);
    const result = await updateMetaIsActive(metaId, isActive, existingMeta);
    
    if (!result.success) {
      // Rollback
      setMetas(prevMetas);
      setError(`Error al ${isActive ? "activar" : "pausar"} meta: ${result.error}`);
      setTimeout(() => setError(null), 3000);
      return { success: false, error: result.error };
    }

    return { success: true };
  }, [metas]);

  // ========== REORDER METAS (Drag & Drop) ==========

  const handleReorderMetas = useCallback(async (reorderedMetas: Meta[]) => {
    // Guardar estado previo para rollback
    const prevMetas = [...metas];

    // Actualización optimista: actualizar UI inmediatamente
    setMetas(reorderedMetas);

    // Solo enviar updates para metas cuyo order realmente cambió
    const prevOrderMap = new Map(metas.map(m => [m.id, m.order ?? 0]));
    const changed = reorderedMetas.filter(m => (m.order ?? 0) !== prevOrderMap.get(m.id));
    if (changed.length === 0) return;

    // Persistir en Supabase
    try {
      const updatePromises = changed.map(m =>
        updateMetaOrder(m.id, m.order ?? 0, m)
      );
      const results = await Promise.all(updatePromises);
      
      // Verificar si hubo errores
      const failedUpdate = results.find(r => !r.success);
      if (failedUpdate) {
        // Rollback
        setMetas(prevMetas);
        setError(`Error al reordenar metas: ${failedUpdate.error}`);
        setTimeout(() => setError(null), 3000);
      }
    } catch (err) {
      // Rollback en caso de error
      setMetas(prevMetas);
      setError("Error al reordenar metas");
      setTimeout(() => setError(null), 3000);
    }
  }, [metas]);

  // ========== FILTER & SORT ==========

  const filteredTasks = useMemo(() => filterTasks(tasks, uiState.activeFilters), [tasks, uiState.activeFilters]);
  const sortedTasks = useMemo(() => sortTasksByHierarchy(filteredTasks), [filteredTasks]);

  const tasksForAgenda = useMemo(() => {
    const cmp = (a: TaskRow, b: TaskRow): number => {
      const ma = metaById.get(a.data.metaId ?? "")?.order ?? Number.MAX_SAFE_INTEGER;
      const mb = metaById.get(b.data.metaId ?? "")?.order ?? Number.MAX_SAFE_INTEGER;
      if (ma !== mb) return ma - mb;
      const ao = a.data.order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.data.order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      const ac = a.data.createdAt ?? "";
      const bc = b.data.createdAt ?? "";
      if (ac !== bc) return ac < bc ? -1 : 1;
      return a.data.id < b.data.id ? -1 : a.data.id > b.data.id ? 1 : 0;
    };
    return [...filteredTasks.filter(t =>
      t.data.kind !== "TITLE" && (!hideCompletedTasks || !t.data.isCompleted)
    )].sort(cmp);
  }, [filteredTasks, metaById, hideCompletedTasks]);

  // Helpers "modo multi" para Agenda (root + subtareas directas, sin recursión)
  const agendaIdSet = useMemo(() => new Set(tasksForAgenda.map(t => t.data.id)), [tasksForAgenda]);
  const childrenMap = useMemo(() => {
    const cmp = (a: TaskRow, b: TaskRow): number => {
      const ma = metaById.get(a.data.metaId ?? "")?.order ?? Number.MAX_SAFE_INTEGER;
      const mb = metaById.get(b.data.metaId ?? "")?.order ?? Number.MAX_SAFE_INTEGER;
      if (ma !== mb) return ma - mb;
      const ao = a.data.order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.data.order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      const ac = a.data.createdAt ?? "";
      const bc = b.data.createdAt ?? "";
      if (ac !== bc) return ac < bc ? -1 : 1;
      return a.data.id < b.data.id ? -1 : a.data.id > b.data.id ? 1 : 0;
    };
    const map = new Map<string, TaskRow[]>();
    for (const t of tasksForAgenda) {
      const pid = t.data.parentId;
      if (!pid) continue;
      const arr = map.get(pid);
      if (arr) arr.push(t);
      else map.set(pid, [t]);
    }
    for (const arr of map.values()) {
      arr.sort(cmp);
    }
    return map;
  }, [tasksForAgenda, metaById]);

  const agendaRoots = useMemo(() => {
    // .filter preserva el orden de tasksForAgenda (ya sorted por agendaCompare)
    return tasksForAgenda.filter(t => {
      const pid = t.data.parentId;
      return !pid || !agendaIdSet.has(pid);
    });
  }, [tasksForAgenda, agendaIdSet]);

  const getChildren = useCallback((taskId: string) => childrenMap.get(taskId) ?? [], [childrenMap]);

  const softDeleteTask = useCallback(async (task: TaskRow) => {
    const taskId = task.data.id;
    if (!confirm("¿Eliminar esta tarea?")) return;
    await handleDeleteTask(taskId);
  }, [handleDeleteTask]);

  const createRelativeTask = useCallback(async (position: "after" | "child", referenceTask: TaskRow) => {
    const ref = referenceTask.data;
    const now = new Date().toISOString();

    let parentId: string | null | undefined;
    let level: number;
    let siblings: TaskRow[];

    const refMetaId = ref.metaId;

    if (position === "child") {
      parentId = ref.id;
      level = (ref.level ?? 0) + 1;
      siblings = tasks.filter(t => t.data.metaId === refMetaId && t.data.parentId === ref.id);
    } else {
      parentId = ref.parentId ?? null;
      level = ref.level ?? 0;
      siblings = tasks.filter(t => t.data.metaId === refMetaId && (t.data.parentId ?? null) === (parentId ?? null));
    }

    const order = position === "child"
      ? calculateInsertOrder(siblings, "after")
      : calculateInsertOrder(siblings, "after", referenceTask);

    const newTaskData: TaskData = {
      id: crypto.randomUUID(),
      metaId: ref.metaId,
      parentId: parentId ?? null,
      level,
      order,
      type: ref.type || "ACTIVIDAD",
      scope: ref.scope,
      title: "",
      points: ref.points ?? 2,
      isCompleted: false,
      createdAt: now,
      updatedAt: now,
    };

    // Añadir como borrador local (sin Supabase); se persistirá cuando el usuario
    // proporcione un nombre válido al guardar desde el editor.
    handleAddLocalDraft(newTaskData);
    const newTask: TaskRow = {
      id: newTaskData.id,
      user_id: tasks[0]?.user_id ?? "",
      data: newTaskData,
      client_updated_at: now,
      deleted_at: null,
    };
    taskEditor.startEdit(newTask);
    setTaskEditorOpen(true);
  }, [tasks, handleAddLocalDraft, taskEditor]);

  // ========== MULTI-ITEM HANDLERS ==========

  const handleConvertMultiItem = useCallback(async (task: TaskRow, itemId: string) => {
    const item = task.data.multiItems?.find(i => i.id === itemId);
    if (!item) return;

    // Crear tarea normal como sibling del MULTI task
    const ref = task.data;
    const siblings = tasks.filter(t =>
      t.data.metaId === ref.metaId && (t.data.parentId ?? null) === (ref.parentId ?? null)
    );
    const order = calculateInsertOrder(siblings, "after", task);
    const now = new Date().toISOString();
    const newTaskData: TaskData = {
      id: crypto.randomUUID(),
      metaId: ref.metaId,
      parentId: ref.parentId ?? null,
      level: ref.level ?? 0,
      order,
      type: "ACTIVIDAD",
      scope: null,
      title: item.title,
      points: ref.points ?? 2,
      isCompleted: false,
      createdAt: now,
      updatedAt: now,
    };

    const result = await handleCreateTask(newTaskData);
    if (result.success) {
      const newMultiItems = (task.data.multiItems || []).filter(i => i.id !== itemId);
      await handleUpdateTask(task.data.id, { multiItems: newMultiItems });
      setTasks(prev => prev.map(t =>
        t.data.id === task.data.id
          ? { ...t, data: { ...t.data, multiItems: newMultiItems } }
          : t
      ));
    }
  }, [tasks, handleCreateTask, handleUpdateTask]);

  const handleDeleteMultiItem = useCallback(async (task: TaskRow, itemId: string) => {
    const newMultiItems = (task.data.multiItems || []).filter(i => i.id !== itemId);
    await handleUpdateTask(task.data.id, { multiItems: newMultiItems });
    setTasks(prev => prev.map(t =>
      t.data.id === task.data.id
        ? { ...t, data: { ...t.data, multiItems: newMultiItems } }
        : t
    ));
  }, [handleUpdateTask]);

  const handleAddMultiItem = useCallback(async (task: TaskRow, title: string) => {
    const items = task.data.multiItems || [];
    const newItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: title.trim(),
      done: false,
      order: items.length > 0 ? Math.max(...items.map(i => i.order)) + 1000 : 1000,
    };
    const newMultiItems = [...items, newItem];
    await handleUpdateTask(task.data.id, { multiItems: newMultiItems });
    setTasks(prev => prev.map(t =>
      t.data.id === task.data.id
        ? { ...t, data: { ...t.data, multiItems: newMultiItems } }
        : t
    ));
  }, [handleUpdateTask]);

  const handleReorderMultiItems = useCallback(async (task: TaskRow, items: MultiItem[]) => {
    const allItems = task.data.multiItems || [];
    const hideDone = hideDoneMultiByTaskId[task.data.id];
    let nextAll: MultiItem[];
    if (hideDone) {
      const doneItems = allItems.filter(i => i.done).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      nextAll = [...items, ...doneItems];
    } else {
      nextAll = items;
    }
    const withOrder = nextAll.map((it, i) => ({ ...it, order: (i + 1) * 1000 }));
    await handleUpdateTask(task.data.id, { multiItems: withOrder });
    setTasks(prev => prev.map(t =>
      t.data.id === task.data.id
        ? { ...t, data: { ...t.data, multiItems: withOrder } }
        : t
    ));
  }, [handleUpdateTask, hideDoneMultiByTaskId]);

  const handleRenameMultiItem = useCallback(async (task: TaskRow, itemId: string, newTitle: string) => {
    const allItems = task.data.multiItems ?? [];
    const updatedAll = allItems.map(it => it.id === itemId ? { ...it, title: newTitle } : it);
    await handleUpdateTask(task.data.id, { multiItems: updatedAll });
    setTasks(prev => prev.map(t =>
      t.data.id === task.data.id
        ? { ...t, data: { ...t.data, multiItems: updatedAll } }
        : t
    ));
  }, [handleUpdateTask]);

  const renderAgendaTaskRow = useCallback((task: TaskRow, opts: { hasChildren: boolean; isCollapsed: boolean; isMini: boolean; multiContent?: React.ReactNode }) => {
    const { hasChildren, isCollapsed, isMini, multiContent } = opts;
    const data = task.data;
    const taskId = data.id;
    const meta = !isMini && data.metaId ? metaById.get(data.metaId) : null;
    const metaIcon = meta?.icon?.trim() || "🎯";
    const metaColor = meta?.color && /^#[0-9A-Fa-f]{6}$/.test(meta.color) ? meta.color : null;
    const points = data.points ?? 2;
    const isCompleted = data.isCompleted ?? false;
    const isChildTask = !!data.parentId;
    const showPointsValue = isCompleted ? "✓" : ((uiState.activeFilters.hidePoints && !isChildTask) ? "" : points);
    const isMulti = data.type === "MULTI" && Array.isArray(data.multiItems) && data.multiItems.length > 0;
    const multiProgress = isMulti ? computeMultiProgress(data.multiItems!) : null;
    const showChevron = hasChildren || isMulti;

    const handleToggleComplete = async (e: React.MouseEvent) => {
      e.stopPropagation();
      await handleUpdateTask(taskId, { isCompleted: !isCompleted });
      setTasks(prev => prev.map(t =>
        t.data.id === taskId
          ? { ...t, data: { ...t.data, isCompleted: !isCompleted } }
          : t
      ));
    };

    const handleRowClick = () => {
      taskEditor.startEdit(task);
      setTaskEditorOpen(true);
    };

    const handleCreateAfter = async (e: React.MouseEvent) => {
      e.stopPropagation();
      await createRelativeTask("after", task);
    };

    const handleCreateChild = async (e: React.MouseEvent) => {
      e.stopPropagation();
      await createRelativeTask("child", task);
    };

    const handleDelete = async (e: React.MouseEvent) => {
      e.stopPropagation();
      await softDeleteTask(task);
    };

    // Formatear fecha: "3 feb"
    const formatDate = (dateStr: string) => {
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    };

    const dateDisplay = !isMini && data.date ? formatDate(data.date) : null;
    const timeDisplay = !isMini ? (data.time || null) : null;
    const reminderDisplay = !isMini && data.extra?.reminderEnabled && data.time
      ? (() => {
          const offset = data.extra?.reminderOffsetValue ?? 30;
          const unit = data.extra?.reminderOffsetUnit === "hor" ? "h" : "min";
          return `Aviso -${offset}${unit}`;
        })()
      : null;

    const isDimmedByMiniDrag = !isMini && !!draggingMini && taskId !== draggingMini.parentTaskId;

    const cardInner = (
      <>
        <div
          onClick={handleRowClick}
          className={`flex items-center gap-3 px-3 ${isMini ? "py-0.5 min-h-[30px]" : "py-1 min-h-[38px]"} transition-colors cursor-pointer ${
            !multiContent ? "rounded-lg border shadow-sm " : ""
          }${
            isCompleted
              ? "bg-slate-50 border-slate-100"
              : "bg-white border-slate-200 hover:border-slate-300"
          }`}
          style={isMini ? { paddingLeft: 24 } : undefined}
        >
          {/* Caret expand/collapse - si hay subtareas o mini-tareas MULTI */}
          {!isMini && showChevron ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleCollapse(taskId); }}
              className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              title={isCollapsed ? "Expandir" : "Contraer"}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                {isCollapsed
                  ? <path d="M3 1 L8 5 L3 9 Z" />
                  : <path d="M1 3 L5 8 L9 3 Z" />
                }
              </svg>
            </button>
          ) : (
            <div className="w-4" />
          )}

          {/* Checkbox/Cuadro de puntos (mini-items: sin número) */}
          <button
            onClick={handleToggleComplete}
            className={`
              flex-shrink-0 w-6 h-6 rounded-md border flex items-center justify-center
              text-[11px] font-semibold transition-all bg-white
              ${isCompleted
                ? "bg-emerald-500 border-emerald-500 text-white"
                : "border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-50"
              }
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50
            `}
            title={isCompleted ? "Marcar como pendiente" : "Marcar como completada"}
          >
            {showPointsValue}
          </button>

          {/* Icono de meta (solo en fila principal) */}
          {!isMini && <span className="text-sm flex-shrink-0">{metaIcon}</span>}

          {/* Título */}
          <span
            className={`text-sm leading-snug truncate flex-1 min-w-0 ${
              isCompleted ? "line-through text-slate-400" : "text-slate-800"
            }`}
          >
            {data.title || "Sin título"}
          </span>

          {/* Badge progreso MULTI: "X/Y" + ojo para toggle mini-tareas */}
          {multiProgress && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="px-1.5 py-0 text-[10px] font-medium text-slate-500 bg-slate-100 rounded-full whitespace-nowrap">
                {multiProgress.label}
              </span>
              <button
                data-no-drag
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleHideDoneMulti(taskId); }}
                className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                title={hideDoneMultiByTaskId[taskId] ? "Mostrar completadas" : "Ocultar completadas"}
              >
                {hideDoneMultiByTaskId[taskId] ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          )}

          {/* Fecha · Hora · Aviso (solo en fila principal) */}
          {!isMini && (dateDisplay || timeDisplay) && (
            <span className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">
              {[dateDisplay, timeDisplay, reminderDisplay].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
        {multiContent && (
          <div className="border-t border-slate-100">
            {multiContent}
          </div>
        )}
      </>
    );

    return (
      <div
        key={taskId}
        className={`group grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,720px)_220px] items-center gap-x-3 transition-opacity ${
          isDimmedByMiniDrag ? "opacity-40" : ""
        }`}
      >
        {/* CUADRO TAREA — wrapper único cuando hay mini-tareas */}
        {multiContent ? (
          <div
            className={`overflow-hidden rounded-lg border shadow-sm ${
              isCompleted
                ? "bg-slate-50 border-slate-100"
                : "bg-white border-slate-200 hover:border-slate-300"
            }`}
          >
            {cardInner}
          </div>
        ) : (
          cardInner
        )}

        {/* COLUMNA DERECHA: meta / acciones hover */}
        <div className="relative hidden lg:flex items-center h-full">
          {/* Meta nombre - oculto en hover (solo fila principal) */}
          {!isMini && meta && (
            <span
              className="text-xs font-medium transition-opacity group-hover:opacity-0 truncate max-w-full"
              style={{ color: metaColor || "#64748b" }}
            >
              {meta.title}
            </span>
          )}

          {/* Hover actions: +A, +↳, 🗑 */}
          <div className="absolute left-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCreateAfter}
              title="Crear tarea al mismo nivel"
              className="w-7 h-7 rounded-md bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700 hover:ring-1 hover:ring-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 text-sm"
            >
              +A
            </button>
            <button
              onClick={handleCreateChild}
              title="Crear subtarea"
              className="w-7 h-7 rounded-md bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700 hover:ring-1 hover:ring-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 text-sm"
            >
              +↳
            </button>
            <button
              onClick={handleDelete}
              title="Eliminar"
              className="w-7 h-7 rounded-md bg-transparent text-slate-500 hover:bg-red-50 hover:text-red-600 hover:ring-1 hover:ring-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 text-sm"
            >
              🗑
            </button>
          </div>
        </div>
      </div>
    );
  }, [createRelativeTask, metaById, softDeleteTask, taskEditor, toggleCollapse, toggleHideDoneMulti, uiState.activeFilters.hidePoints, handleUpdateTask, draggingMini, hideDoneMultiByTaskId]);

  // ========== RENDER ==========

  if (authState.loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-400 text-sm">Verificando sesión...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <header className="shrink-0 h-11 border-b border-slate-200 bg-white flex items-center justify-between px-3">
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center gap-2 hover:opacity-80 shrink-0">
            <img src="/logo.png" alt="" className="w-6 h-6" />
            <span className="hidden sm:inline font-semibold text-sm text-slate-800">Ingravital</span>
          </a>
          <span className="hidden sm:inline text-slate-200">|</span>
          {/* Selector de vistas */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setActiveView("agenda")}
              className={`px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeView === "agenda"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Agenda
            </button>
            <button
              onClick={goToMetasView}
              className={`px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeView === "metas"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Metas
            </button>
            <a
              href="/finanzas"
              className="hidden sm:inline px-3 py-1 text-xs font-medium rounded-md transition-colors text-slate-500 hover:text-slate-700"
            >
              Finanzas
            </a>
            <a
              href="/donaciones"
              className="hidden md:inline px-3 py-1 text-xs font-medium rounded-md transition-colors text-slate-500 hover:text-slate-700"
            >
              Servicios
            </a>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Toggle ocultar completadas (global) */}
          <button
            onClick={() => setHideCompletedTasks(!hideCompletedTasks)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              hideCompletedTasks
                ? "bg-slate-200 text-slate-700"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            }`}
            title={hideCompletedTasks ? "Mostrar completadas" : "Ocultar completadas"}
          >
            {hideCompletedTasks ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
            <span className="hidden sm:inline">{hideCompletedTasks ? "Completadas ocultas" : "Completadas"}</span>
          </button>
          <span className="text-[10px] text-slate-400 hidden sm:block">
            Enter: guardar · Tab: siguiente · Ctrl+D: duplicar
          </span>
          <a href="/account" className="text-xs text-slate-500 hover:text-slate-700">
            Mi cuenta
          </a>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {activeView === "metas" ? (
          <>
            {/* Sidebar */}
            <AgendaSidebar
              filters={uiState.activeFilters}
              onFiltersChange={handleFiltersChange}
              presets={uiState.presets}
              onSavePreset={handleSavePreset}
              onDeletePreset={handleDeletePreset}
              onApplyPreset={handleApplyPreset}
              metas={metasForSidebar}
              collapsed={uiState.sidebarCollapsed}
              onToggleCollapse={handleToggleSidebar}
            />

            {/* Table area */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Info bar */}
              <div className="shrink-0 h-7 flex items-center justify-between px-3 bg-slate-50 border-b border-slate-100">
                <div className="text-[11px] text-slate-500">
                  {loadingData ? (
                    "Cargando..."
                  ) : error ? (
                    <span className="text-red-500">{error}</span>
                  ) : (
                    <>
                      {sortedTasks.length} tarea{sortedTasks.length !== 1 ? "s" : ""}
                      {filteredTasks.length !== tasks.length && (
                        <span className="text-slate-400"> (de {tasks.length})</span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Table */}
              {loadingData ? (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                  Cargando tareas...
                </div>
              ) : error ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-red-500 text-sm">{error}</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="mt-3 px-3 py-1.5 text-xs bg-slate-800 text-white rounded hover:bg-slate-700"
                    >
                      Reintentar
                    </button>
                  </div>
                </div>
              ) : (
                <TaskDiagramTree
                  tasks={sortedTasks}
                  metas={metas}
                  initialSelectedMetaId={initialSelectedMetaId}
                  bankAccounts={bankAccounts}
                  forecastLines={forecastLines}
                  labels={labels}
                  hidePoints={uiState.activeFilters.hidePoints}
                  onCreateTask={handleCreateTask}
                  onUpdateTask={handleUpdateTask}
                  onDeleteTask={handleDeleteTask}
                  onRestoreTask={handleRestoreTask}
                  onOpenMetaModal={handleOpenMetaModal}
                  onReorderMetas={handleReorderMetas}
                  onToggleMetaActive={handleToggleMetaActive}
                  hideCompletedTasks={hideCompletedTasks}
                  onToggleHideCompleted={() => setHideCompletedTasks(!hideCompletedTasks)}
                  userId={userId}
                  onMetaChipSelect={(metaId) => {
                    const nextFilters = { ...uiState.activeFilters, metaIds: [metaId] };
                    handleFiltersChange(nextFilters);
                  }}
                  onAddLocalDraft={handleAddLocalDraft}
                  onDiscardDraft={handleDiscardDraft}
                  isDraftTask={isDraftTask}
                />
              )}
            </div>
          </>
        ) : (
          /* Vista Agenda - Lista de todas las tareas */
          <>
            {/* Sidebar */}
            <AgendaSidebar
              filters={uiState.activeFilters}
              onFiltersChange={handleFiltersChange}
              presets={uiState.presets}
              onSavePreset={handleSavePreset}
              onDeletePreset={handleDeletePreset}
              onApplyPreset={handleApplyPreset}
              metas={metasForSidebar}
              collapsed={uiState.sidebarCollapsed}
              onToggleCollapse={handleToggleSidebar}
            />

            {/* Lista de tareas */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Info bar */}
              <div className="shrink-0 h-7 flex items-center justify-between px-3 bg-slate-50 border-b border-slate-100">
                <div className="text-[11px] text-slate-500">
                  {loadingData ? (
                    "Cargando..."
                  ) : error ? (
                    <span className="text-red-500">{error}</span>
                  ) : (() => {
                    // Contar excluyendo TITULO (coherente con la lista)
                    const countForAgenda = filteredTasks.filter(t => t.data.kind !== "TITLE").length;
                    const totalNonTitle = tasks.filter(t => t.data.kind !== "TITLE").length;
                    return (
                      <>
                        {countForAgenda} tarea{countForAgenda !== 1 ? "s" : ""}
                        {countForAgenda !== totalNonTitle && (
                          <span className="text-slate-400"> (de {totalNonTitle})</span>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Lista */}
              {loadingData ? (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                  Cargando tareas...
                </div>
              ) : error ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-red-500 text-sm">{error}</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="mt-3 px-3 py-1.5 text-xs bg-slate-800 text-white rounded hover:bg-slate-700"
                    >
                      Reintentar
                    </button>
                  </div>
                </div>
              ) : (() => {
                if (tasksForAgenda.length === 0) {
                  return (
                    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                      No hay tareas que coincidan con los filtros
                    </div>
                  );
                }

                return (
                  <div className="flex-1 overflow-y-auto p-4">
                    {/* Contenedor alineado a la izquierda */}
                    <div className="w-full space-y-1">
                      {multiEnabled ? (
                        agendaRoots.map((root) => {
                          const rootId = root.data.id;
                          const children = getChildren(rootId);
                          const hasChildren = children.length > 0;
                          const isCollapsed = collapsedById[rootId] || false;
                          const rootIsMulti = root.data.type === "MULTI" && Array.isArray(root.data.multiItems) && root.data.multiItems.length > 0;

                          return (
                            <div key={rootId} className="space-y-0.5">
                              {renderAgendaTaskRow(root, {
                                hasChildren: hasChildren || rootIsMulti,
                                isCollapsed,
                                isMini: false,
                                multiContent: rootIsMulti && !isCollapsed ? (
                                  <MultiItemsInline
                                    items={hideDoneMultiByTaskId[rootId] ? (root.data.multiItems!).filter(i => !i.done) : root.data.multiItems!}
                                    allItems={root.data.multiItems!}
                                    parentTaskId={root.data.id}
                                    onAddItem={(title) => handleAddMultiItem(root, title)}
                                    onRename={(itemId, newTitle) => handleRenameMultiItem(root, itemId, newTitle)}
                                    onConvertItem={(itemId) => handleConvertMultiItem(root, itemId)}
                                    onDeleteItem={(itemId) => handleDeleteMultiItem(root, itemId)}
                                    onReorder={(items) => handleReorderMultiItems(root, items)}
                                    onDragStart={(itemId) => setDraggingMini({ parentTaskId: root.data.id, itemId })}
                                    onDragEnd={() => setDraggingMini(null)}
                                  />
                                ) : undefined,
                              })}
                              {hasChildren && !isCollapsed && (
                                <div className="space-y-0.5">
                                  {children.map((child) => {
                                    const childId = child.data.id;
                                    return (
                                      <div key={childId}>
                                        {renderAgendaTaskRow(child, { hasChildren: false, isCollapsed: false, isMini: true })}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        tasksForAgenda.map((task) => {
                          const data = task.data;
                          const taskId = data.id; // ID canónico (siempre data.id)
                          const meta = data.metaId ? metaById.get(data.metaId) : null;
                          const metaIcon = meta?.icon?.trim() || "🎯";
                          const metaColor = meta?.color && /^#[0-9A-Fa-f]{6}$/.test(meta.color) ? meta.color : null;
                          const points = data.points ?? 2;
                          const isCompleted = data.isCompleted ?? false;

                          // Handler para toggle complete (usando ID canónico data.id)
                          const handleToggleComplete = async (e: React.MouseEvent) => {
                            e.stopPropagation();
                            await handleUpdateTask(taskId, { isCompleted: !isCompleted });
                            setTasks(prev => prev.map(t =>
                              t.data.id === taskId
                                ? { ...t, data: { ...t.data, isCompleted: !isCompleted } }
                                : t
                            ));
                          };

                          // Handler para click en fila: abrir editor (igual que Metas)
                          const handleRowClick = () => {
                            taskEditor.startEdit(task);
                            setTaskEditorOpen(true);
                          };

                          // Handler para editar (acción hover)
                          const handleEdit = (e: React.MouseEvent) => {
                            e.stopPropagation();
                            taskEditor.startEdit(task);
                            setTaskEditorOpen(true);
                          };

                          // Handler para crear sibling (misma meta, mismo parent)
                          const handleCreateSibling = async (e: React.MouseEvent) => {
                            e.stopPropagation();
                            const now = new Date().toISOString();
                            const siblings = tasks.filter(t =>
                              t.data.metaId === data.metaId && t.data.parentId === data.parentId
                            );
                            const maxOrder = siblings.reduce((max, t) => Math.max(max, t.data.order ?? 0), 0);
                            const newTaskData: TaskData = {
                              id: crypto.randomUUID(),
                              metaId: data.metaId,
                              parentId: data.parentId,
                              level: data.level ?? 0,
                              order: maxOrder + 1,
                              type: data.type || "ACTIVIDAD",
                              scope: data.scope,
                              title: "",
                              points: data.points ?? 2,
                              isCompleted: false,
                              createdAt: now,
                              updatedAt: now,
                            };
                            const result = await handleCreateTask(newTaskData);
                            if (result.success) {
                              // Construir objeto para startEdit (NO insertar en tasks - handleCreateTask ya lo hace)
                              const newTask: TaskRow = {
                                id: newTaskData.id,
                                user_id: task.user_id,
                                data: newTaskData,
                                client_updated_at: now,
                                deleted_at: null,
                              };
                              // Abrir editor para nueva tarea
                              taskEditor.startEdit(newTask);
                              setTaskEditorOpen(true);
                            }
                          };

                          // Handler para duplicar
                          const handleDuplicate = async (e: React.MouseEvent) => {
                            e.stopPropagation();
                            const now = new Date().toISOString();
                            const siblings = tasks.filter(t =>
                              t.data.metaId === data.metaId && t.data.parentId === data.parentId
                            );
                            const maxOrder = siblings.reduce((max, t) => Math.max(max, t.data.order ?? 0), 0);
                            const newTaskData: TaskData = {
                              ...data,
                              id: crypto.randomUUID(),
                              title: `${data.title || "Sin nombre"} (copia)`,
                              order: maxOrder + 1,
                              isCompleted: false,
                              createdAt: now,
                              updatedAt: now,
                            };
                            // Limpiar historial de completados si existe
                            if (newTaskData.extra?.completedDates) {
                              newTaskData.extra = { ...newTaskData.extra, completedDates: [] };
                            }
                            const result = await handleCreateTask(newTaskData);
                            if (result.success) {
                              // Construir objeto para startEdit (NO insertar en tasks - handleCreateTask ya lo hace)
                              const newTask: TaskRow = {
                                id: newTaskData.id,
                                user_id: task.user_id,
                                data: newTaskData,
                                client_updated_at: now,
                                deleted_at: null,
                              };
                              // Abrir editor para nueva tarea
                              taskEditor.startEdit(newTask);
                              setTaskEditorOpen(true);
                            }
                          };

                          // Handler para eliminar (SIN undo en Agenda)
                          const handleDelete = async (e: React.MouseEvent) => {
                            e.stopPropagation();
                            if (!confirm("¿Eliminar esta tarea?")) return;
                            // Solo llamar a handleDeleteTask - ya hace setTasks internamente
                            await handleDeleteTask(taskId);
                          };

                          // Formatear fecha: "3 Feb"
                          const formatDate = (dateStr: string) => {
                            const d = new Date(dateStr + "T00:00:00");
                            return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
                          };

                          const flatIsMulti = data.type === "MULTI" && Array.isArray(data.multiItems) && data.multiItems.length > 0;
                          const flatMultiProgress = flatIsMulti ? computeMultiProgress(data.multiItems!) : null;
                          const flatIsCollapsed = collapsedById[taskId] || false;

                          // Construir texto de fecha/hora/aviso
                          const dateDisplay = data.date ? formatDate(data.date) : null;
                          const timeDisplay = data.time || null;
                          const reminderDisplay = data.extra?.reminderEnabled && data.time
                            ? (() => {
                                const offset = data.extra?.reminderOffsetValue ?? 30;
                                const unit = data.extra?.reminderOffsetUnit === "hor" ? "h" : "min";
                                return `Aviso -${offset}${unit}`;
                              })()
                            : null;

                          const flatIsDimmedByMiniDrag = !!draggingMini && taskId !== draggingMini.parentTaskId;

                          return (
                            <div key={taskId}>
                            <div
                              className={`group grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,480px)_180px] items-center gap-x-3 transition-opacity ${
                                flatIsDimmedByMiniDrag ? "opacity-40" : ""
                              }`}
                            >
                              {/* CUADRO TAREA — wrapper único cuando hay mini-tareas */}
                              {flatIsMulti && !flatIsCollapsed ? (
                                <div
                                  className={`overflow-hidden rounded-lg border shadow-sm ${
                                    isCompleted
                                      ? "bg-slate-50 border-slate-100"
                                      : "bg-white border-slate-200 hover:border-slate-300"
                                  }`}
                                >
                                  <div
                                    onClick={handleRowClick}
                                    className="flex items-center gap-2 px-3 py-2 min-h-[42px] transition-colors cursor-pointer"
                                  >
                                {/* Chevron expand/collapse para MULTI */}
                                {flatIsMulti ? (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleCollapse(taskId); }}
                                    className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                                    title={flatIsCollapsed ? "Expandir" : "Contraer"}
                                  >
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                                      {flatIsCollapsed
                                        ? <path d="M3 1 L8 5 L3 9 Z" />
                                        : <path d="M1 3 L5 8 L9 3 Z" />
                                      }
                                    </svg>
                                  </button>
                                ) : null}

                                {/* Checkbox/Cuadro de puntos */}
                                <button
                                  onClick={handleToggleComplete}
                                  className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center text-[10px] font-bold transition-colors ${
                                    isCompleted ? "bg-emerald-500 border-emerald-500 text-white" : "hover:bg-slate-50"
                                  }`}
                                  style={
                                    !isCompleted && metaColor
                                      ? { borderColor: metaColor, color: metaColor }
                                      : !isCompleted
                                      ? { borderColor: "#cbd5e1", color: "#64748b" }
                                      : undefined
                                  }
                                  title={isCompleted ? "Marcar como pendiente" : "Marcar como completada"}
                                >
                                  {isCompleted ? "✓" : (uiState.activeFilters.hidePoints ? "" : points)}
                                </button>

                                {/* Icono de meta */}
                                <span className="text-sm flex-shrink-0">{metaIcon}</span>

                                {/* Título (con min-w-0 para truncate correcto) */}
                                <span
                                  className={`text-sm truncate flex-1 min-w-0 ${
                                    isCompleted
                                      ? "line-through text-slate-400"
                                      : "text-slate-700"
                                  }`}
                                >
                                  {data.title || "Sin título"}
                                </span>

                                {/* Badge progreso MULTI: "X/Y" + ojo para toggle mini-tareas */}
                                {flatMultiProgress && (
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <span className="px-1.5 py-0 text-[10px] font-medium text-slate-500 bg-slate-100 rounded-full whitespace-nowrap">
                                      {flatMultiProgress.label}
                                    </span>
                                    <button
                                      data-no-drag
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); toggleHideDoneMulti(taskId); }}
                                      className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                                      title={hideDoneMultiByTaskId[taskId] ? "Mostrar completadas" : "Ocultar completadas"}
                                    >
                                      {hideDoneMultiByTaskId[taskId] ? (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                          <line x1="1" y1="1" x2="23" y2="23" />
                                        </svg>
                                      ) : (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                          <circle cx="12" cy="12" r="3" />
                                        </svg>
                                      )}
                                    </button>
                                  </div>
                                )}

                                {/* Fecha · Hora · Aviso */}
                                {(dateDisplay || timeDisplay) && (
                                  <span className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">
                                    {[dateDisplay, timeDisplay, reminderDisplay].filter(Boolean).join(" · ")}
                                  </span>
                                )}
                                  </div>
                                  <div className="border-t border-slate-100">
                                    <MultiItemsInline
                                      items={hideDoneMultiByTaskId[taskId] ? (data.multiItems!).filter(i => !i.done) : data.multiItems!}
                                      allItems={data.multiItems!}
                                      parentTaskId={task.data.id}
                                      onAddItem={(title) => handleAddMultiItem(task, title)}
                                      onRename={(itemId, newTitle) => handleRenameMultiItem(task, itemId, newTitle)}
                                      onConvertItem={(itemId) => handleConvertMultiItem(task, itemId)}
                                      onDeleteItem={(itemId) => handleDeleteMultiItem(task, itemId)}
                                      onReorder={(items) => handleReorderMultiItems(task, items)}
                                      onDragStart={(itemId) => setDraggingMini({ parentTaskId: task.data.id, itemId })}
                                      onDragEnd={() => setDraggingMini(null)}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div
                                  onClick={handleRowClick}
                                  className={`flex items-center gap-2 px-3 py-2 min-h-[42px] rounded-lg border shadow-sm transition-colors cursor-pointer ${
                                    isCompleted
                                      ? "bg-slate-50 border-slate-100"
                                      : "bg-white border-slate-200 hover:border-slate-300"
                                  }`}
                                >
                                  {flatIsMulti ? (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); toggleCollapse(taskId); }}
                                      className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                                      title={flatIsCollapsed ? "Expandir" : "Contraer"}
                                    >
                                      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                                        {flatIsCollapsed ? <path d="M3 1 L8 5 L3 9 Z" /> : <path d="M1 3 L5 8 L9 3 Z" />}
                                      </svg>
                                    </button>
                                  ) : null}
                                  <button
                                    onClick={handleToggleComplete}
                                    className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center text-[10px] font-bold transition-colors ${isCompleted ? "bg-emerald-500 border-emerald-500 text-white" : "hover:bg-slate-50"}`}
                                    style={!isCompleted && metaColor ? { borderColor: metaColor, color: metaColor } : !isCompleted ? { borderColor: "#cbd5e1", color: "#64748b" } : undefined}
                                    title={isCompleted ? "Marcar como pendiente" : "Marcar como completada"}
                                  >
                                    {isCompleted ? "✓" : (uiState.activeFilters.hidePoints ? "" : points)}
                                  </button>
                                  <span className="text-sm flex-shrink-0">{metaIcon}</span>
                                  <span className={`text-sm truncate flex-1 min-w-0 ${isCompleted ? "line-through text-slate-400" : "text-slate-700"}`}>
                                    {data.title || "Sin título"}
                                  </span>
                                  {flatMultiProgress && (
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <span className="px-1.5 py-0 text-[10px] font-medium text-slate-500 bg-slate-100 rounded-full whitespace-nowrap">{flatMultiProgress.label}</span>
                                      <button data-no-drag type="button" onClick={(e) => { e.stopPropagation(); toggleHideDoneMulti(taskId); }} className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer" title={hideDoneMultiByTaskId[taskId] ? "Mostrar completadas" : "Ocultar completadas"}>
                                        {hideDoneMultiByTaskId[taskId] ? (
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                        ) : (
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                        )}
                                      </button>
                                    </div>
                                  )}
                                  {(dateDisplay || timeDisplay) && (
                                    <span className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">{[dateDisplay, timeDisplay, reminderDisplay].filter(Boolean).join(" · ")}</span>
                                  )}
                                </div>
                              )}
                              {/* COLUMNA DERECHA: Meta nombre / Iconos en hover */}
                              <div className="relative hidden lg:flex items-center h-full">
                                {meta && (
                                  <span className="text-xs font-medium transition-opacity group-hover:opacity-0 truncate max-w-full" style={{ color: metaColor || "#64748b" }}>{meta.title}</span>
                                )}
                                <div className="absolute left-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={handleCreateSibling} title="Crear tarea al mismo nivel" className="w-6 h-6 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center text-sm">+</button>
                                  <button onClick={handleEdit} title="Editar" className="w-6 h-6 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center text-sm">✎</button>
                                  <button onClick={handleDuplicate} title="Duplicar" className="w-6 h-6 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center text-sm">⧉</button>
                                  <button onClick={handleDelete} title="Eliminar" className="w-6 h-6 rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 flex items-center justify-center text-sm">🗑</button>
                                </div>
                              </div>
                            </div>
                          </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>

      {/* Meta Modal */}
      <MetaModal
        isOpen={metaModalOpen}
        meta={metaToEdit}
        onClose={handleCloseMetaModal}
        onSave={handleSaveMeta}
        onDelete={handleDeleteMeta}
      />

      {/* Task Editor Modal (para vista Agenda) */}
      {taskEditorOpen && editingTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              taskEditor.closeEdit();
              setTaskEditorOpen(false);
            }
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-[520px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">Editar Tarea</h2>
              <button
                onClick={async () => {
                  const ok = await taskEditor.closeEdit();
                  if (ok) setTaskEditorOpen(false);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {/* Body - TaskEditorContent */}
            <div className="px-6 py-5">
              <TaskEditorContent
                task={editingTask}
                editingData={taskEditor.editingData}
                setEditingData={taskEditor.setEditingData}
                editingTaskId={taskEditor.editingTaskId}
                savingTaskId={taskEditor.savingTaskId}
                editError={taskEditor.editError}
                localLabels={taskEditor.localLabels}
                setLocalLabels={taskEditor.setLocalLabels}
                addingLabel={taskEditor.addingLabel}
                setAddingLabel={taskEditor.setAddingLabel}
                newLabelName={taskEditor.newLabelName}
                setNewLabelName={taskEditor.setNewLabelName}
                debouncedSave={taskEditor.debouncedSave}
                updateField={taskEditor.updateField}
                updateExtra={taskEditor.updateExtra}
                handleDeleteTask={async () => {
                  await taskEditor.handleDeleteTask();
                  setTaskEditorOpen(false);
                }}
                cancelEdit={() => {
                  taskEditor.cancelEdit();
                  setTaskEditorOpen(false);
                }}
                handleSaveAndClose={async () => {
                  await taskEditor.handleSaveAndClose();
                  if (!taskEditor.editingTaskId) setTaskEditorOpen(false);
                }}
                bankAccounts={bankAccounts}
                forecastLines={forecastLines}
                metas={metas}
                tasks={tasks}
                // NO pasamos onCreateTask - en Agenda Enter/Tab no crean tareas
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

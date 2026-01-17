"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import type { TaskRow, TaskData, TaskFilters, FilterPreset, AgendaUIState, Meta, BankAccount, ForecastLine, Label } from "@/src/lib/types";
import { DEFAULT_FILTERS, DEFAULT_UI_STATE } from "@/src/lib/types";
import { 
  fetchTasks, fetchMetas, fetchBankAccounts, fetchForecastLines, fetchLabels,
  createTask, updateTask, createMeta, updateMeta, 
  filterTasks, sortTasksByHierarchy, createTaskFromTemplate 
} from "@/src/lib/tasks";
import { loadUIState, saveUIState, savePreset, deletePreset } from "@/src/lib/localStorage";
import AgendaSidebar from "@/src/components/AgendaSidebar";
import TaskTable from "@/src/components/TaskTable";
import MetaModal from "@/src/components/MetaModal";

export default function AgendaPage() {
  // Auth
  const [authState, setAuthState] = useState<{ loading: boolean; authenticated: boolean }>({
    loading: true,
    authenticated: false,
  });

  // Data
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [forecastLines, setForecastLines] = useState<ForecastLine[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI State
  const [uiState, setUIState] = useState<AgendaUIState>(DEFAULT_UI_STATE);

  // Meta Modal
  const [metaModalOpen, setMetaModalOpen] = useState(false);
  const [metaToEdit, setMetaToEdit] = useState<Meta | null>(null);

  // Auth check
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        window.location.href = "/login";
        return;
      }
      setAuthState({ loading: false, authenticated: true });
    })();
  }, []);

  // Load UI state
  useEffect(() => {
    if (typeof window !== "undefined") {
      setUIState(loadUIState());
    }
  }, []);

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

  // ========== FILTERS ==========

  const handleFiltersChange = useCallback((filters: TaskFilters) => {
    const newState = { ...uiState, activeFilters: filters };
    setUIState(newState);
    saveUIState(newState);
  }, [uiState]);

  const handleSavePreset = useCallback((preset: FilterPreset) => {
    setUIState(savePreset(preset));
  }, []);

  const handleDeletePreset = useCallback((presetId: string) => {
    setUIState(deletePreset(presetId));
  }, []);

  const handleApplyPreset = useCallback((preset: FilterPreset) => {
    const newState = { ...uiState, activeFilters: preset.filters };
    setUIState(newState);
    saveUIState(newState);
  }, [uiState]);

  const handleToggleSidebar = useCallback(() => {
    const newState = { ...uiState, sidebarCollapsed: !uiState.sidebarCollapsed };
    setUIState(newState);
    saveUIState(newState);
  }, [uiState]);

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

  const handleUpdateTask = useCallback(async (id: string, taskData: Partial<TaskData>): Promise<{ success: boolean; error?: string }> => {
    const result = await updateTask(id, taskData);
    if (result.error) {
      return { success: false, error: result.error };
    }
    if (result.data) {
      setTasks(prev => prev.map(t => t.data.id === id ? result.data! : t));
    }
    return { success: true };
  }, []);

  const handleDuplicateTask = useCallback(async (task: TaskRow) => {
    const newTaskData = createTaskFromTemplate(task.data);
    newTaskData.title = `${task.data.title} (copia)`;
    
    const result = await createTask(newTaskData);
    if (result.data) {
      setTasks(prev => [...prev, result.data!]);
    }
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

  const handleSaveMeta = useCallback(async (title: string, description?: string): Promise<{ success: boolean; error?: string }> => {
    if (metaToEdit) {
      // Editar
      const result = await updateMeta(metaToEdit.id, title, description);
      if (result.error) {
        return { success: false, error: result.error };
      }
      if (result.data) {
        setMetas(prev => prev.map(m => m.id === metaToEdit.id ? result.data! : m));
      }
    } else {
      // Crear
      const result = await createMeta(title, description);
      if (result.error) {
        return { success: false, error: result.error };
      }
      if (result.data) {
        setMetas(prev => [...prev, result.data!]);
      }
    }
    return { success: true };
  }, [metaToEdit]);

  // ========== FILTER & SORT ==========

  const filteredTasks = filterTasks(tasks, uiState.activeFilters);
  const sortedTasks = sortTasksByHierarchy(filteredTasks);

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
          <a href="/" className="flex items-center gap-2 hover:opacity-80">
            <img src="/logo.png" alt="" className="w-6 h-6" />
            <span className="font-semibold text-sm text-slate-800">Ingravital</span>
          </a>
          <span className="text-slate-200">|</span>
          <span className="text-sm font-medium text-slate-600">Agenda</span>
        </div>
        
        <div className="flex items-center gap-3">
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
        {/* Sidebar */}
        <AgendaSidebar
          filters={uiState.activeFilters}
          onFiltersChange={handleFiltersChange}
          presets={uiState.presets}
          onSavePreset={handleSavePreset}
          onDeletePreset={handleDeletePreset}
          onApplyPreset={handleApplyPreset}
          metas={metas}
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
            <TaskTable
              tasks={sortedTasks}
              metas={metas}
              bankAccounts={bankAccounts}
              forecastLines={forecastLines}
              labels={labels}
              onCreateTask={handleCreateTask}
              onUpdateTask={handleUpdateTask}
              onDuplicateTask={handleDuplicateTask}
              onOpenMetaModal={handleOpenMetaModal}
            />
          )}
        </div>
      </div>

      {/* Meta Modal */}
      <MetaModal
        isOpen={metaModalOpen}
        meta={metaToEdit}
        onClose={handleCloseMetaModal}
        onSave={handleSaveMeta}
      />
    </div>
  );
}

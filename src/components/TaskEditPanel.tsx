"use client";

import React, { useCallback, useRef, useEffect, useState, useMemo } from "react";
import type { TaskRow, TaskData, TaskExtra, BankAccount, ForecastLine, Label, UITaskType, MultiItem, Meta } from "@/src/lib/types";
import { getUIType, UI_TYPE_MAPPING } from "@/src/lib/types";
import MetaParentSelector from "@/src/components/MetaParentSelector";
import { getReminderDisplay } from "@/src/lib/tasks";
import {
  type WeekdayCode,
  type SubUnit,
  WEEKDAY_CODES,
  getTodayISO,
  isTaskUnscheduled,
  normalizeWeeklyDays,
  isPhysLike,
  coerceUnitFromLegacy,
} from "@/src/components/taskDiagramTreeHelpers";

// ==================== PANEL-ONLY TYPES & CONFIG ====================

type SubTagConfigEntry = {
  units: SubUnit[];
  defaultUnit: SubUnit;
  defaults: Partial<Record<SubUnit, number>>;
};

type SubTagConfig = {
  FISICO: Record<string, SubTagConfigEntry>;
  CRECIMIENTO: Record<string, SubTagConfigEntry>;
};

const SUB_TAG_CONFIG: SubTagConfig = {
  FISICO: {
    gym:      { units: ["min", "hor"],         defaultUnit: "hor", defaults: { min: 60, hor: 1 } },
    correr:   { units: ["min", "hor", "km"],   defaultUnit: "min", defaults: { min: 45, hor: 1, km: 5 } },
    andar:    { units: ["min", "hor", "km"],   defaultUnit: "min", defaults: { min: 60, hor: 1, km: 5 } },
    peso:     { units: ["kg"],                 defaultUnit: "kg",  defaults: { kg: 50 } },
    descanso: { units: ["min", "hor"],         defaultUnit: "hor", defaults: { min: 30, hor: 8 } },
  },
  CRECIMIENTO: {
    estudiar: { units: ["min", "hor", "pag"],  defaultUnit: "hor", defaults: { min: 60, hor: 1, pag: 40 } },
    leer:     { units: ["min", "hor", "pag"],  defaultUnit: "hor", defaults: { min: 30, hor: 1, pag: 40 } },
    idiomas:  { units: ["min", "hor", "pag"],  defaultUnit: "hor", defaults: { min: 30, hor: 1, pag: 40 } },
    practica: { units: ["min", "hor"],         defaultUnit: "hor", defaults: { min: 30, hor: 1 } },
  },
};

type LabelCfg = {
  showQuantity: boolean;
  allowedUnits: SubUnit[];
  defaultUnit?: SubUnit;
  defaultQuantity?: number;
  defaultsByUnit?: Partial<Record<SubUnit, number>>;
};

const FALLBACK_LABEL_CFG: LabelCfg = {
  showQuantity: true,
  allowedUnits: ["min", "hor"],
  defaultUnit: "min",
  defaultQuantity: 30,
  defaultsByUnit: { min: 30, hor: 1 },
};

const LABEL_DEFAULTS: Record<string, LabelCfg> = {
  comida: { showQuantity: false, allowedUnits: [], defaultUnit: "min", defaultQuantity: 0 },
  correr: { showQuantity: true, allowedUnits: ["min", "hor", "km"], defaultUnit: "min", defaultsByUnit: { min: 45, hor: 1, km: 5 } },
  andar:  { showQuantity: true, allowedUnits: ["min", "hor", "km"], defaultUnit: "min", defaultsByUnit: { min: 60, hor: 1, km: 5 } },
  gym:    { showQuantity: true, allowedUnits: ["min", "hor"],       defaultUnit: "hor", defaultsByUnit: { min: 60, hor: 1 } },
  peso:   { showQuantity: true, allowedUnits: ["kg"],               defaultUnit: "kg",  defaultsByUnit: { kg: 50 } },
  descanso: { showQuantity: true, allowedUnits: ["min", "hor"],     defaultUnit: "hor", defaultsByUnit: { min: 30, hor: 8 } },
  estudiar: { showQuantity: true, allowedUnits: ["min", "hor"],     defaultUnit: "hor", defaultsByUnit: { min: 60, hor: 1 } },
  leer:     { showQuantity: true, allowedUnits: ["min", "hor"],     defaultUnit: "hor", defaultsByUnit: { min: 30, hor: 1 } },
  idiomas:  { showQuantity: true, allowedUnits: ["min", "hor"],     defaultUnit: "hor", defaultsByUnit: { min: 30, hor: 1 } },
  practica: { showQuantity: true, allowedUnits: ["min", "hor"],     defaultUnit: "hor", defaultsByUnit: { min: 30, hor: 1 } },
};

// ==================== PANEL-ONLY HELPERS ====================

function normalizeLabelKey(label?: string): string {
  return (label || "").trim().toLowerCase();
}

function getSubTagCfg(scope: TaskData["scope"] | undefined, labelKey: string): SubTagConfigEntry | null {
  if (!scope || !labelKey) return null;
  const scopedCfg = SUB_TAG_CONFIG[scope as keyof SubTagConfig];
  if (!scopedCfg) return null;
  return scopedCfg[labelKey] || null;
}

function isFoodLabel(name?: string): boolean {
  return normalizeLabelKey(name) === "comida";
}

function getLabelCfg(labelName?: string): LabelCfg {
  const key = normalizeLabelKey(labelName);
  return LABEL_DEFAULTS[key] || FALLBACK_LABEL_CFG;
}

function buildWeeklyRepeatRule(weeklyDays: WeekdayCode[], weeklyTime?: string): string {
  return `WEEKLY|days=${weeklyDays.join(",")}|time=${weeklyTime || ""}`;
}

function buildMonthlyRepeatRule(monthlyDay: number, monthlyTime?: string): string {
  return `MONTHLY|day=${monthlyDay}|time=${monthlyTime || ""}`;
}

function ensureScoringItemExists(category: "phys" | "know", label: string, initialPoints?: number): Promise<{ points?: number } | void> {
  return Promise.resolve({ points: initialPoints });
}

// ==================== PROPS ====================

interface TaskEditPanelProps {
  task: TaskRow;
  bankAccounts: BankAccount[];
  forecastLines: ForecastLine[];
  labels: Label[];
  onUpdateTask: (id: string, taskData: Partial<TaskData>) => Promise<{ success: boolean; error?: string }>;
  onDeleteTask: (id: string) => Promise<{ success: boolean; error?: string }>;
  onClose: () => void;
  onRequestCreateAfter: () => void;
  onRequestCreateChild: () => void;
  metas?: Meta[];
  tasks?: TaskRow[];
  /** Si la tarea es un borrador local (no persistida en Supabase aún) */
  isDraft?: boolean;
  /** Descarta el borrador del estado local sin persistir */
  onDiscardDraft?: () => void;
}

const UI_TYPES: UITaskType[] = ["Actividad", "Nota", "Fisico", "Conocimiento", "Ingreso", "Gasto", "Multi", "Titulo"];

// ==================== COMPONENT ====================

export default function TaskEditPanel({
  task,
  bankAccounts,
  forecastLines,
  labels,
  onUpdateTask,
  onDeleteTask,
  onClose,
  onRequestCreateAfter,
  onRequestCreateChild,
  metas,
  tasks,
  isDraft,
  onDiscardDraft,
}: TaskEditPanelProps) {
  // ==================== INTERNAL EDITING STATE ====================
  const [editingData, setEditingData] = useState<Partial<TaskData>>({ ...task.data });
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const skipSaveOnUnmountRef = useRef(false);

  // Refs for unmount cleanup (always up-to-date)
  const editingDataRef = useRef(editingData);
  editingDataRef.current = editingData;
  const taskRef = useRef(task);
  taskRef.current = task;
  const onUpdateTaskRef = useRef(onUpdateTask);
  onUpdateTaskRef.current = onUpdateTask;
  const isDraftRef = useRef(isDraft);
  isDraftRef.current = isDraft;
  const onDiscardDraftRef = useRef(onDiscardDraft);
  onDiscardDraftRef.current = onDiscardDraft;

  // Init/re-init when task changes
  useEffect(() => {
    setEditingData({ ...task.data });
    setEditError(null);
    skipSaveOnUnmountRef.current = false;
  }, [task.data.id]);

  // ==================== INTERNAL EDITING FUNCTIONS ====================
  const saveChanges = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const currentTask = taskRef.current;
    const currentData = editingDataRef.current;
    if (!currentTask || Object.keys(currentData).length === 0) return { success: true };

    const updates: Partial<TaskData> = {};
    const original = currentTask.data;
    Object.keys(currentData).forEach(key => {
      const k = key as keyof TaskData;
      if (JSON.stringify(currentData[k]) !== JSON.stringify(original[k])) {
        (updates as Record<string, unknown>)[k] = currentData[k];
      }
    });

    if (Object.keys(updates).length === 0) return { success: true };
    setSavingTaskId(currentTask.data.id);
    const result = await onUpdateTask(currentTask.data.id, updates);
    setSavingTaskId(null);

    if (!result.success) {
      const errorMsg = result.error || "Error al guardar";
      setEditError(errorMsg);
      return { success: false, error: errorMsg };
    }
    setEditError(null);
    return { success: true };
  }, [onUpdateTask]);

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

  const handleSaveAndClose = useCallback(async () => {
    const ed = editingDataRef.current as TaskData;
    // Validación nombre: label || title para physLike, solo title para el resto
    const taskName = ((ed.label || ed.title || "") as string).trim();
    if (!taskName) {
      setEditError("La tarea necesita un nombre");
      return;
    }
    // Validación Multi: título y al menos un item
    if (ed.type === "MULTI") {
      const itemsOk = Array.isArray(ed.multiItems) && ed.multiItems.length > 0;
      if (!itemsOk) {
        setEditError("Completa el título y añade al menos una mini-tarea");
        return;
      }
    }
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const result = await saveChanges();
    if (result.success) {
      skipSaveOnUnmountRef.current = true;
      onClose();
    }
  }, [saveChanges, onClose]);

  const cancelEdit = useCallback(() => {
    skipSaveOnUnmountRef.current = true;
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    // El descarte de borradores sin nombre lo gestiona onClose en TaskDiagramTree
    onClose();
  }, [onClose]);

  const handleDeleteTask = useCallback(async () => {
    const confirmed = window.confirm("¿Eliminar esta tarea? Esta acción no se puede deshacer.");
    if (!confirmed) return;

    setSavingTaskId(task.data.id);
    const result = await onDeleteTask(task.data.id);
    setSavingTaskId(null);

    if (!result.success) {
      setEditError(result.error || "Error al eliminar");
      return;
    }

    skipSaveOnUnmountRef.current = true;
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    onClose();
  }, [task.data.id, onDeleteTask, onClose]);

  // Unmount cleanup: flush pending save (fire-and-forget)
  useEffect(() => {
    return () => {
      if (skipSaveOnUnmountRef.current) return;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const currentData = editingDataRef.current;
      const currentTask = taskRef.current;
      if (!currentTask || Object.keys(currentData).length === 0) return;
      const updates: Partial<TaskData> = {};
      const original = currentTask.data;
      Object.keys(currentData).forEach(key => {
        const k = key as keyof TaskData;
        if (JSON.stringify(currentData[k]) !== JSON.stringify(original[k])) {
          (updates as Record<string, unknown>)[k] = currentData[k];
        }
      });
      if (Object.keys(updates).length > 0) {
        onUpdateTaskRef.current(currentTask.data.id, updates);
      }
    };
  }, []);

  // ==================== PANEL UI STATE ====================
  const [localLabels, setLocalLabels] = useState<Label[]>(labels);
  const [addingLabel, setAddingLabel] = useState<boolean>(false);
  const [newLabelName, setNewLabelName] = useState<string>("");
  const [multiDraft, setMultiDraft] = useState<string>("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const multiInputRef = useRef<HTMLInputElement>(null);

  // Sync labels from props
  useEffect(() => { setLocalLabels(labels); }, [labels]);

  // Auto-focus name input on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
  }, []);

  // Derived: leaf forecasts
  const onlyLeafForecasts = useMemo(() => {
    const parentIds = new Set<string>();
    forecastLines.forEach(f => { if (f.parentId) parentIds.add(f.parentId); });
    return forecastLines.filter(f => !parentIds.has(f.id));
  }, [forecastLines]);

  // Forecast auto-redirect: if forecastId points to a parent, redirect to leaf
  useEffect(() => {
    const d = editingData as TaskData;
    if (d.type !== "INGRESO" && d.type !== "GASTO") return;
    if (!d.forecastId) return;
    const parentIds = new Set<string>();
    forecastLines.forEach(f => { if (f.parentId) parentIds.add(f.parentId); });
    if (!parentIds.has(d.forecastId)) return;
    const leafChild = onlyLeafForecasts.find(f => f.parentId === d.forecastId);
    if (!leafChild) return;
    updateField("forecastId", leafChild.id);
  }, [editingData, forecastLines, onlyLeafForecasts, updateField]);

  // ==================== RENDER LOGIC (moved from renderEditPanel) ====================

  const data = editingData as TaskData;
  const currentUIType = getUIType(data.type, data.scope, data.kind);
  const isFinance = data.type === "INGRESO" || data.type === "GASTO";
  const isPhysicalKnowledge = data.scope === "FISICO" || data.scope === "CRECIMIENTO";
  const isTitleTask = data.kind === "TITLE";

  const schedType = isTaskUnscheduled(data) ? "sin_programar"
    : data.extra?.frequency === "SEMANAL" ? "semanal"
    : data.extra?.frequency === "MENSUAL" ? "mensual" : "puntual";

  // Handler para cambiar tipo
  const handleTypeChange = (newUIType: UITaskType) => {
    const mapping = UI_TYPE_MAPPING[newUIType];
    if (!mapping) return;

    if (newUIType === "Titulo") {
      const cleanExtra: TaskExtra = {};
      if (data.extra?.completedDates) cleanExtra.completedDates = data.extra.completedDates;
      if (data.extra?.notes) cleanExtra.notes = data.extra.notes;

      const updates: Partial<TaskData> = {
        kind: "TITLE",
        type: "ACTIVIDAD",
        scope: null,
        title: data.title || "",
        points: 0,
        date: null,
        time: null,
        repeatRule: null,
        accountId: null,
        forecastId: null,
        label: undefined,
        description: undefined,
        isCompleted: false,
        extra: Object.keys(cleanExtra).length > 0 ? cleanExtra : undefined,
      };

      setEditingData(prev => ({ ...prev, ...updates }));
      debouncedSave();
      return;
    }

    // Caso Nota: limpiar campos no aplicables, setear type:"NOTA"
    if (newUIType === "Nota") {
      const notaUpdates: Partial<TaskData> = {
        kind: "NORMAL",
        type: "NOTA",
        scope: null,
        label: undefined,
        accountId: undefined,
        forecastId: undefined,
        repeatRule: undefined,
        time: undefined,
        multiItems: undefined,
        extra: { frequency: "PUNTUAL" },
      };
      setEditingData(prev => ({ ...prev, ...notaUpdates }));
      debouncedSave();
      return;
    }

    // Caso Multi: limpiar campos no aplicables, setear type:"MULTI"
    if (newUIType === "Multi") {
      const cleanExtra: TaskExtra = {
        frequency: "PUNTUAL",
      };
      if (data.extra?.unscheduled) cleanExtra.unscheduled = true;
      if (data.extra?.completedDates) cleanExtra.completedDates = data.extra.completedDates;

      const multiUpdates: Partial<TaskData> = {
        kind: "NORMAL",
        type: "MULTI",
        scope: null,
        label: undefined,
        accountId: undefined,
        forecastId: undefined,
        repeatRule: undefined,
        time: undefined,
        description: undefined,
        extra: cleanExtra,
        multiItems: Array.isArray(data.multiItems) ? data.multiItems : [],
      };

      setEditingData(prev => ({ ...prev, ...multiUpdates }));
      debouncedSave();
      return;
    }

    const nextExtra = { ...(data.extra || {}) };
    const updates: Partial<TaskData> = { 
      kind: null,
      type: mapping.type, 
      scope: mapping.scope ?? undefined,
    };

    // Al salir de Multi, limpiar multiItems
    if (data.type === "MULTI") {
      updates.multiItems = undefined;
    }

    // Al salir de Nota, limpiar description (el contenido era title+description combinados)
    if (data.type === "NOTA") {
      updates.description = undefined;
    }

    if (mapping.type !== "INGRESO" && mapping.type !== "GASTO") {
      updates.accountId = undefined;
      updates.forecastId = undefined;
      delete nextExtra.amountEUR;
    }
    
    if ((mapping.scope === "FISICO" || mapping.scope === "CRECIMIENTO") !== isPhysicalKnowledge) {
      updates.label = undefined;
    }

    const sanitizedExtra = Object.keys(nextExtra).length > 0 ? nextExtra : undefined;
    setEditingData(prev => ({ ...prev, ...updates, extra: sanitizedExtra }));
    debouncedSave();
  };

  const renderTypeChips = () => (
    <div className="flex flex-wrap gap-2">
      {UI_TYPES.map(t => (
        <button
          key={t}
          data-no-drag
          onClick={() => handleTypeChange(t)}
          className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${currentUIType === t ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
        >
          {t}
        </button>
      ))}
    </div>
  );

  const renderPhysicalKnowledgeControls = () => {
    const physLike = isPhysLike(data);
    const currentLabelName = data.label || data.title || "";
    const labelKey = normalizeLabelKey(currentLabelName);
    const scopedCfg = getSubTagCfg(data.scope, labelKey);
    const cfg = getLabelCfg(currentLabelName);
    const isCustomTag = !!currentLabelName && !scopedCfg;
    const allowedUnits = cfg.allowedUnits?.length ? cfg.allowedUnits : FALLBACK_LABEL_CFG.allowedUnits;
    const coercedUnit = coerceUnitFromLegacy(data.extra?.unit as string | undefined);
    const selectedUnit: SubUnit | undefined = allowedUnits.includes(coercedUnit as SubUnit) ? coercedUnit as SubUnit : (cfg.defaultUnit ?? allowedUnits[0]);
    const showQuantity = physLike && !isFoodLabel(currentLabelName) && !isCustomTag && cfg.showQuantity !== false;
    const quantityValue = showQuantity
      ? (data.extra?.quantity ?? (selectedUnit ? cfg.defaultsByUnit?.[selectedUnit] : undefined) ?? cfg.defaultQuantity)
      : undefined;
    const detailsField = data.scope === "CRECIMIENTO" ? "knowledgeDetails" : "physicalDetails";

    const setUnitAndQuantity = (unit: SubUnit | undefined, quantity: number | undefined, labelForDetails: string) => {
      setEditingData(prev => {
        const extra = { ...(prev.extra || {}) };
        if (showQuantity && unit !== undefined && quantity !== undefined) {
          extra.unit = unit as any;
          extra.quantity = quantity;
        } else {
          delete extra.unit;
          delete extra.quantity;
        }
        if (physLike && (data.scope === "FISICO" || data.scope === "CRECIMIENTO")) {
          if (showQuantity && unit !== undefined && quantity !== undefined) {
            (extra as any)[detailsField] = { kind: data.scope, label: normalizeLabelKey(labelForDetails), unit, value: quantity };
          } else {
            delete (extra as any)[detailsField];
          }
        }
        return { ...prev, extra };
      });
      debouncedSave();
    };

    const handleLabelClick = async (labelItem: Label) => {
      const cfgForLabel = getLabelCfg(labelItem.name);
      const scopedCfgLabel = getSubTagCfg(data.scope, normalizeLabelKey(labelItem.name));
      const isCustom = !scopedCfgLabel;
      const nextUnit = cfgForLabel.showQuantity === false || isCustom ? undefined : (cfgForLabel.defaultUnit ?? cfgForLabel.allowedUnits[0]);
      const nextQty = cfgForLabel.showQuantity === false || isCustom
        ? undefined
        : (nextUnit ? cfgForLabel.defaultsByUnit?.[nextUnit] : undefined) ?? cfgForLabel.defaultQuantity ?? 1;

      setAddingLabel(false);
      setNewLabelName("");

      setEditingData(prev => {
        const extra = { ...(prev.extra || {}) };
        if (cfgForLabel.showQuantity === false || isCustom) {
          delete extra.unit;
          delete extra.quantity;
          delete (extra as any)[detailsField];
        } else {
          extra.unit = nextUnit as any;
          extra.quantity = nextQty;
          if (physLike && (data.scope === "FISICO" || data.scope === "CRECIMIENTO")) {
            (extra as any)[detailsField] = { kind: data.scope, label: normalizeLabelKey(labelItem.name), unit: nextUnit, value: nextQty };
          }
        }
        return {
          ...prev,
          label: labelItem.name,
          title: labelItem.name,
          points: labelItem.points,
          extra
        };
      });
      debouncedSave();
    };

    const handleUnitClick = (u: SubUnit) => {
      const cfgFor = getLabelCfg(currentLabelName);
      const nextQty = cfgFor.showQuantity === false ? undefined : (cfgFor.defaultsByUnit?.[u] ?? cfgFor.defaultQuantity ?? quantityValue ?? 1);
      setUnitAndQuantity(u, nextQty, currentLabelName);
    };

    const handleQuantityChange = (nextQty: number) => {
      if (!showQuantity) return;
      setUnitAndQuantity(selectedUnit || cfg.defaultUnit, nextQty, currentLabelName);
    };

    const handleAddLabelConfirm = async () => {
      const raw = newLabelName.trim().replace(/#/g, "").replace(/\s+/g, " ");
      if (!raw) return;
      const normalized = normalizeLabelKey(raw);
      const exists = localLabels.some(l => l.scope === data.scope && normalizeLabelKey(l.name) === normalized);
      if (exists) { setAddingLabel(false); setNewLabelName(""); return; }
      const category = data.scope === "FISICO" ? "phys" : "know";
      const res = await ensureScoringItemExists(category as "phys" | "know", raw, data.points);
      const newPoints = res && "points" in (res as any) && (res as any).points !== undefined ? (res as any).points : data.points;
      const newLabel: Label = {
        id: `new-${Date.now()}`,
        name: raw,
        points: newPoints || 2,
        scope: data.scope || "FISICO",
      };
      setLocalLabels(prev => [...prev, newLabel]);
      setAddingLabel(false);
      setNewLabelName("");
      await handleLabelClick(newLabel);
    };

    const handleAddLabelCancel = () => {
      setAddingLabel(false);
      setNewLabelName("");
    };

    if (!physLike) {
      return (
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
          <input
            data-no-drag
            ref={nameInputRef}
            type="text"
            value={data.title || ""}
            onChange={(e) => updateField("title", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onRequestCreateAfter(); }
              else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); onRequestCreateChild(); }
            }}
            placeholder="Nombre de la tarea"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {/* Etiquetas (solo Fisico/Conocimiento) */}
        <div className="flex flex-wrap gap-2 items-center">
          {localLabels.filter(l => l.scope === data.scope).map(labelItem => {
            const selected = data.label === labelItem.name;
            return (
              <button
                key={labelItem.id}
                data-no-drag
                onClick={() => handleLabelClick(labelItem)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${selected ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}
              >
                {labelItem.name}
              </button>
            );
          })}
          <button
            data-no-drag
            onClick={() => { setAddingLabel(true); setNewLabelName(""); }}
            className="px-3 py-1.5 text-xs rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 transition-colors"
          >
            Añadir+
          </button>
        </div>

        {addingLabel && (
          <div className="flex gap-2 items-center">
            <input
              data-no-drag
              type="text"
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddLabelConfirm(); } } }
              className="px-2 py-1 text-xs border border-slate-200 rounded w-40"
              placeholder="Nueva etiqueta"
            />
            <button data-no-drag onClick={handleAddLabelConfirm} className="px-2 py-1 text-xs rounded bg-blue-500 text-white">OK</button>
            <button data-no-drag onClick={handleAddLabelCancel} className="px-2 py-1 text-xs rounded border border-slate-200">Cancelar</button>
          </div>
        )}

        {/* Cantidad + Unidad */}
        {showQuantity && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                data-no-drag
                onClick={() => handleQuantityChange(Math.max(0, (quantityValue ?? 0) - 1))}
                className="w-7 h-7 text-sm rounded border border-slate-200 bg-white hover:border-slate-300"
              >
                -
              </button>
              <input
                data-no-drag
                type="number"
                value={quantityValue ?? 0}
                onChange={(e) => handleQuantityChange(Number(e.target.value) || 0)}
                className="w-14 px-2 py-1 text-xs border border-slate-200 rounded"
              />
              <button
                data-no-drag
                onClick={() => handleQuantityChange((quantityValue ?? 0) + 1)}
                className="w-7 h-7 text-sm rounded border border-slate-200 bg-white hover:border-slate-300"
              >
                +
              </button>
            </div>
            <div className="flex items-center gap-1">
              {allowedUnits.map(u => (
                <button
                  key={u}
                  data-no-drag
                  onClick={() => handleUnitClick(u)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${selectedUnit === u ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Nombre */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
          <input
            data-no-drag
            ref={nameInputRef}
            type="text"
            value={data.title || ""}
            onChange={(e) => updateField("title", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onRequestCreateAfter(); }
              else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); onRequestCreateChild(); }
            }}
            placeholder="Nombre de la tarea"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>
    );
  };

  const renderFinanceControls = () => {
    const financeLeafs = onlyLeafForecasts;
    return (
      <div className="space-y-3">
        {/* Nombre + Cantidad */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
            <input
              data-no-drag
              ref={nameInputRef}
              type="text"
              value={data.title || ""}
              onChange={(e) => updateField("title", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); onRequestCreateAfter(); }
                else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); onRequestCreateChild(); }
              }}
              placeholder="Nombre de la tarea"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="w-36">
            <label className="block text-xs font-medium text-slate-500 mb-1">Cantidad</label>
            <input
              data-no-drag
              type="number"
              value={data.extra?.amountEUR ?? ""}
              onChange={(e) => updateExtra("amountEUR", e.target.value === "" ? undefined : parseFloat(e.target.value))}
              placeholder="0,00"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* Cuenta y Previsión en fila */}
        <div className="grid grid-cols-2 gap-3 items-start">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Cuenta</div>
            <div className="flex flex-wrap gap-1">
              <button
                data-no-drag
                onClick={() => { updateField("accountId", undefined); }}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${!data.accountId ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
              >
                Sin asociar
              </button>
              {bankAccounts.map(acc => (
                <button
                  key={acc.id}
                  data-no-drag
                  onClick={() => { updateField("accountId", acc.id); }}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${data.accountId === acc.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                >
                  {acc.name}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Previsión</div>
            <div className="flex flex-wrap gap-1">
              <button
                data-no-drag
                onClick={() => { updateField("forecastId", undefined); }}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${!data.forecastId ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
              >
                Sin asociar
              </button>
              {financeLeafs.map(f => (
                <button
                  key={f.id}
                  data-no-drag
                  onClick={() => { updateField("forecastId", f.id); }}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${data.forecastId === f.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ==================== MULTI CONTROLS ====================
  const isMulti = data.type === "MULTI";
  const isNota = data.type === "NOTA";
  const multiItems: MultiItem[] = Array.isArray(data.multiItems) ? data.multiItems : [];
  const multiTitleOk = (data.title || "").trim().length > 0;
  const multiItemsOk = multiItems.length > 0;
  const multiCanSave = !isMulti || (multiTitleOk && multiItemsOk);
  const notaCanSave = !isNota || (data.title || "").trim().length > 0;

  const addMultiItem = () => {
    const text = multiDraft.trim();
    if (!text) return;
    const newItem: MultiItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: text,
      done: false,
      order: multiItems.length > 0 ? Math.max(...multiItems.map(i => i.order)) + 1000 : 1000,
    };
    setEditingData(prev => ({ ...prev, multiItems: [...(Array.isArray(prev.multiItems) ? prev.multiItems : []), newItem] }));
    setMultiDraft("");
    debouncedSave();
    requestAnimationFrame(() => multiInputRef.current?.focus());
  };

  const removeMultiItem = (itemId: string) => {
    setEditingData(prev => ({ ...prev, multiItems: (Array.isArray(prev.multiItems) ? prev.multiItems : []).filter(i => i.id !== itemId) }));
    debouncedSave();
  };

  const renderMultiControls = () => (
    <div className="space-y-3">
      {/* Nombre */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
        <input
          data-no-drag
          ref={nameInputRef}
          type="text"
          value={data.title || ""}
          onChange={(e) => updateField("title", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onRequestCreateAfter(); }
            else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); onRequestCreateChild(); }
          }}
          placeholder="Nombre de la tarea"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* Mini-tareas */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Mini-tareas</label>
        <div className="flex gap-2">
          <input
            data-no-drag
            ref={multiInputRef}
            type="text"
            value={multiDraft}
            onChange={(e) => setMultiDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                addMultiItem();
              }
            }}
            placeholder="Añadir mini-tarea"
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            data-no-drag
            type="button"
            onClick={addMultiItem}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-lg font-medium"
          >+</button>
        </div>
        {multiItems.length > 0 && (
          <div className="mt-2 space-y-1">
            {multiItems.map(item => (
              <div key={item.id} className="flex items-center justify-between px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-sm text-slate-700">{item.title}</span>
                <button
                  data-no-drag
                  type="button"
                  onClick={() => removeMultiItem(item.id)}
                  className="text-slate-400 hover:text-red-500 text-sm ml-2"
                >×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3 text-sm">
      {/* Meta / Padre */}
      {metas && tasks && (
        <MetaParentSelector
          taskId={editingData.id ?? task.data.id}
          metaId={editingData.metaId ?? task.data.metaId}
          parentId={editingData.parentId ?? task.data.parentId}
          metas={metas}
          tasks={tasks}
          onMetaChange={(newMetaId) => {
            setEditingData(prev => ({ ...prev, metaId: newMetaId, parentId: null }));
            debouncedSave();
          }}
          onParentChange={(newParentId) => {
            updateField("parentId", newParentId);
          }}
        />
      )}

      {/* Tipo como chips */}
      {renderTypeChips()}

      {/* Controles según tipo */}
      {isNota ? (
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Contenido</label>
          <textarea
            data-no-drag
            autoFocus
            rows={6}
            value={(data.title || "") + (data.description !== undefined ? "\n" + data.description : "")}
            onChange={(e) => {
              const raw = e.target.value;
              const newlineIdx = raw.indexOf("\n");
              const newTitle = newlineIdx === -1 ? raw : raw.slice(0, newlineIdx);
              const newDescription = newlineIdx === -1 ? undefined : raw.slice(newlineIdx + 1);
              setEditingData(prev => ({ ...prev, title: newTitle, description: newDescription }));
              debouncedSave();
            }}
            placeholder="Escribe tu nota aquí..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
        </div>
      ) : isMulti ? renderMultiControls() : isFinance ? renderFinanceControls() : renderPhysicalKnowledgeControls()}

      {/* Scheduling */}
      {!isTitleTask && !isMulti && (
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Programación</label>
          <div className="flex flex-wrap gap-1 mb-2">
            {(["puntual", "semanal", "mensual", "sin_programar"] as const).map(type => (
              <button
                key={type}
                onClick={() => {
                  const extra = { ...(data.extra || {}) };
                  if (type === "sin_programar") {
                    extra.frequency = "PUNTUAL"; extra.unscheduled = true;
                    delete extra.weeklyDays; delete extra.monthlyDay;
                    setEditingData(prev => ({ ...prev, date: undefined, time: undefined, repeatRule: undefined, extra }));
                  } else if (type === "puntual") {
                    extra.frequency = "PUNTUAL"; extra.unscheduled = false;
                    delete extra.weeklyDays; delete extra.monthlyDay;
                    setEditingData(prev => ({ ...prev, date: prev.date || getTodayISO(), repeatRule: undefined, extra }));
                  } else if (type === "semanal") {
                    extra.frequency = "SEMANAL"; extra.unscheduled = false;
                    extra.weeklyDays = extra.weeklyDays || []; delete extra.monthlyDay;
                    setEditingData(prev => ({ ...prev, date: undefined, extra }));
                  } else if (type === "mensual") {
                    extra.frequency = "MENSUAL"; extra.unscheduled = false;
                    extra.monthlyDay = extra.monthlyDay || 1; delete extra.weeklyDays;
                    setEditingData(prev => ({ ...prev, date: undefined, extra }));
                  }
                  debouncedSave();
                }}
                className={`px-2 py-1 text-xs rounded-full border transition-colors ${schedType === type ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
              >
                {type === "puntual" && "Puntual"}
                {type === "semanal" && "Semanal"}
                {type === "mensual" && "Mensual"}
                {type === "sin_programar" && "Sin programar"}
              </button>
            ))}
          </div>

          {/* ==================== BLOQUE REMINDER REUTILIZABLE ==================== */}
          {(() => {
            const getTimeForReminder = (): string | null => {
              if (schedType === "puntual") return data.time || null;
              if (schedType === "semanal") return data.extra?.weeklyTime as string || null;
              if (schedType === "mensual") return data.extra?.monthlyTime as string || null;
              return null;
            };
            const timeForReminder = getTimeForReminder();

            const reminderEnabled = data.extra?.reminderEnabled === true;
            const rawUnit = data.extra?.reminderOffsetUnit;
            const reminderUnit: "min" | "hor" = (rawUnit === "min" || rawUnit === "hor") ? rawUnit : "min";
            const rawValue = data.extra?.reminderOffsetValue;
            const reminderValue = (typeof rawValue === "number" && rawValue >= 1) ? rawValue : 30;

            const handleToggleReminder = () => {
              const newEnabled = !reminderEnabled;
              const newExtra = {
                ...(data.extra || {}),
                reminderEnabled: newEnabled,
                reminderOffsetUnit: reminderUnit,
                reminderOffsetValue: reminderValue,
              };
              setEditingData(prev => ({ ...prev, extra: newExtra }));
              debouncedSave();
            };

            const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
              const parsed = parseInt(e.target.value, 10);
              const finalValue = (parsed >= 1) ? parsed : 30;
              const newExtra = {
                ...(data.extra || {}),
                reminderEnabled,
                reminderOffsetUnit: reminderUnit,
                reminderOffsetValue: finalValue,
              };
              setEditingData(prev => ({ ...prev, extra: newExtra }));
              debouncedSave();
            };

            const handleUnitChange = (newUnit: "min" | "hor") => {
              if (newUnit === reminderUnit) return;
              const newExtra = {
                ...(data.extra || {}),
                reminderEnabled,
                reminderOffsetUnit: newUnit,
                reminderOffsetValue: reminderValue,
              };
              setEditingData(prev => ({ ...prev, extra: newExtra }));
              debouncedSave();
            };

            const reminderText = (reminderEnabled && timeForReminder)
              ? getReminderDisplay({ time: timeForReminder, extra: { reminderEnabled: true, reminderOffsetUnit: reminderUnit, reminderOffsetValue: reminderValue } })
              : null;

            const renderReminderBlock = () => {
              if (!timeForReminder) return null;
              return (
                <div className="flex flex-wrap items-center gap-2 text-xs mt-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={reminderEnabled}
                      onClick={handleToggleReminder}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400/50 ${
                        reminderEnabled ? "bg-blue-500" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          reminderEnabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    <span className="text-slate-600 whitespace-nowrap">Activar aviso previo</span>
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={reminderValue}
                    onChange={handleValueChange}
                    disabled={!reminderEnabled}
                    className={`w-14 px-2 py-1 text-xs border border-slate-200 rounded-lg text-center transition-opacity ${!reminderEnabled ? "opacity-50 bg-slate-50" : ""}`}
                  />

                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleUnitChange("min")}
                      disabled={!reminderEnabled}
                      className={`px-2 py-1 rounded-md border transition-colors ${
                        reminderUnit === "min"
                          ? "bg-blue-500 text-white border-blue-500"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                      } ${!reminderEnabled ? "opacity-50" : ""}`}
                    >
                      min
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUnitChange("hor")}
                      disabled={!reminderEnabled}
                      className={`px-2 py-1 rounded-md border transition-colors ${
                        reminderUnit === "hor"
                          ? "bg-blue-500 text-white border-blue-500"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                      } ${!reminderEnabled ? "opacity-50" : ""}`}
                    >
                      hor
                    </button>
                  </div>

                  {reminderText && (
                    <span className="text-[11px] text-slate-400 whitespace-nowrap ml-1">
                      {reminderText}
                    </span>
                  )}
                </div>
              );
            };

            return (
              <>
                {schedType === "puntual" && (
                  <div className="space-y-0">
                    <div className="flex gap-2">
                      <input type="date" value={data.date || getTodayISO()} onChange={(e) => updateField("date", e.target.value)} className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-lg" />
                      <input type="time" value={data.time || ""} onChange={(e) => updateField("time", e.target.value)} className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-lg" />
                    </div>
                    {renderReminderBlock()}
                  </div>
                )}

                {schedType === "semanal" && (
                  <div className="space-y-2">
                    <div className="flex gap-1">
                      {WEEKDAY_CODES.map(day => {
                        const selected = normalizeWeeklyDays(data.extra?.weeklyDays).includes(day);
                        return (
                          <button key={day} onClick={() => {
                            const current = normalizeWeeklyDays(data.extra?.weeklyDays);
                            const newDays = selected ? current.filter(d => d !== day) : [...current, day].sort((a, b) => WEEKDAY_CODES.indexOf(a) - WEEKDAY_CODES.indexOf(b));
                            const extra = { 
                              ...(data.extra || {}), 
                              weeklyDays: newDays,
                              reminderEnabled,
                              reminderOffsetUnit: reminderUnit,
                              reminderOffsetValue: reminderValue,
                            };
                            const repeatRule = newDays.length > 0 ? buildWeeklyRepeatRule(newDays, extra.weeklyTime) : undefined;
                            setEditingData(prev => ({ ...prev, repeatRule, extra }));
                            debouncedSave();
                          }} className={`w-7 h-7 text-xs rounded-lg border transition-colors ${selected ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200"}`}>
                            {day}
                          </button>
                        );
                      })}
                    </div>
                    <input type="time" value={data.extra?.weeklyTime || ""} onChange={(e) => {
                      const weeklyTime = e.target.value;
                      const weeklyDays = normalizeWeeklyDays(data.extra?.weeklyDays);
                      const extra = { 
                        ...(data.extra || {}), 
                        weeklyTime,
                        reminderEnabled,
                        reminderOffsetUnit: reminderUnit,
                        reminderOffsetValue: reminderValue,
                      };
                      const repeatRule = weeklyDays.length > 0 ? buildWeeklyRepeatRule(weeklyDays, weeklyTime) : undefined;
                      setEditingData(prev => ({ ...prev, repeatRule, extra }));
                      debouncedSave();
                    }} className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-lg" />
                    {renderReminderBlock()}
                  </div>
                )}

                {schedType === "mensual" && (
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-slate-500">Día</span>
                      <input type="number" min="1" max="31" value={data.extra?.monthlyDay || 1} onChange={(e) => {
                        const monthlyDay = parseInt(e.target.value) || 1;
                        const repeatRule = buildMonthlyRepeatRule(monthlyDay, data.extra?.monthlyTime);
                        const extra = { 
                          ...(data.extra || {}), 
                          monthlyDay,
                          reminderEnabled,
                          reminderOffsetUnit: reminderUnit,
                          reminderOffsetValue: reminderValue,
                        };
                        setEditingData(prev => ({ ...prev, repeatRule, extra }));
                        debouncedSave();
                      }} className="w-14 px-2 py-1 text-xs border border-slate-200 rounded-lg text-center" />
                      <input type="time" value={data.extra?.monthlyTime || ""} onChange={(e) => {
                        const monthlyTime = e.target.value;
                        const repeatRule = buildMonthlyRepeatRule(data.extra?.monthlyDay || 1, monthlyTime);
                        const extra = { 
                          ...(data.extra || {}), 
                          monthlyTime,
                          reminderEnabled,
                          reminderOffsetUnit: reminderUnit,
                          reminderOffsetValue: reminderValue,
                        };
                        setEditingData(prev => ({ ...prev, repeatRule, extra }));
                        debouncedSave();
                      }} className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-lg" />
                    </div>
                    {renderReminderBlock()}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Scheduling Multi: solo fecha + sin programar */}
      {isMulti && (
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Programación</label>
          <div className="flex flex-wrap gap-1 mb-2">
            <button
              onClick={() => {
                const extra = { ...(data.extra || {}), frequency: "PUNTUAL" as const, unscheduled: false };
                delete extra.weeklyDays; delete extra.monthlyDay;
                setEditingData(prev => ({ ...prev, date: prev.date || getTodayISO(), time: undefined, repeatRule: undefined, extra }));
                debouncedSave();
              }}
              className={`px-2 py-1 text-xs rounded-full border transition-colors ${schedType === "puntual" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
            >Fecha</button>
            <button
              onClick={() => {
                const extra = { ...(data.extra || {}), frequency: "PUNTUAL" as const, unscheduled: true };
                delete extra.weeklyDays; delete extra.monthlyDay;
                setEditingData(prev => ({ ...prev, date: undefined, time: undefined, repeatRule: undefined, extra }));
                debouncedSave();
              }}
              className={`px-2 py-1 text-xs rounded-full border transition-colors ${schedType === "sin_programar" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
            >Sin programar</button>
          </div>
          {schedType === "puntual" && (
            <input type="date" value={data.date || getTodayISO()} onChange={(e) => updateField("date", e.target.value)} className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg" />
          )}
        </div>
      )}

      {/* Puntos + Descripción */}
      {!isTitleTask && !isMulti && (
        <div className="flex gap-3">
          <div className="w-20">
            <label className="block text-xs font-medium text-slate-500 mb-1">Puntos</label>
            <input type="number" min="1" max="10" value={data.points ?? 2} onChange={(e) => updateField("points", parseInt(e.target.value) || 2)} className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg" />
          </div>
          {!isNota && (
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">Descripción</label>
              <input type="text" value={data.description || ""} onChange={(e) => updateField("description", e.target.value)} placeholder="Descripción" className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg" />
            </div>
          )}
        </div>
      )}

      {/* Puntos para Multi (sin descripción) */}
      {isMulti && (
        <div className="w-20">
          <label className="block text-xs font-medium text-slate-500 mb-1">Puntos</label>
          <input type="number" min="1" max="10" value={data.points ?? 2} onChange={(e) => updateField("points", parseInt(e.target.value) || 2)} className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg" />
        </div>
      )}

      {/* Error */}
      {editError && (
        <div className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded border border-red-200">
          {editError}
        </div>
      )}

      {/* Footer con botones */}
      <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 mt-2">
        <button
          data-no-drag
          onClick={handleDeleteTask}
          disabled={!!savingTaskId}
          className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          Eliminar tarea
        </button>
        <button
          data-no-drag
          onClick={cancelEdit}
          disabled={!!savingTaskId}
          className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          data-no-drag
          onClick={handleSaveAndClose}
          disabled={!!savingTaskId || !multiCanSave || !notaCanSave}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {savingTaskId ? "Guardando..." : "Guardar"}
        </button>
      </div>

    </div>
  );
}

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
  { value: "SIN_FECHA", label: "Sin fecha" },
  { value: "SEMANAL", label: "Semanal" },
  { value: "MENSUAL", label: "Mensual" },
];

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
function isColumnEnabled(col: string, type: TaskType, scope?: TaskScope): boolean {
  if (["amount", "account", "forecast"].includes(col)) {
    return type === "INGRESO" || type === "GASTO";
  }
  // Puntuación no editable para Físico/Conocimiento (viene del scoring settings)
  if (col === "points" && (scope === "FISICO" || scope === "CRECIMIENTO")) {
    return false;
  }
  return true;
}

export default function TaskTable({ 
  tasks, metas, bankAccounts, forecastLines, labels, 
  onCreateTask, onUpdateTask, onDuplicateTask, onOpenMetaModal 
}: Props) {
  const [draftData, setDraftData] = useState<TaskData>(() => createDraftData());
  const [editCell, setEditCell] = useState<{ rowId: string; col: string } | null>(null);
  const [editValue, setEditValue] = useState<string | number | boolean | number[]>("");
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
        return getUIType(data.type, data.scope);
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
        if (data.extra?.unscheduled) return "Sin fecha";
        if (freq === "SEMANAL") return "Semanal";
        if (freq === "MENSUAL") return "Mensual";
        return "Puntual";
      }
      case "date": {
        const freq = data.extra?.frequency;
        if (data.extra?.unscheduled) return "-";
        if (freq === "SEMANAL" && data.extra?.weeklyDays) {
          return data.extra.weeklyDays.map(d => WEEKDAYS[d]).join(",");
        }
        if (freq === "MENSUAL" && data.extra?.monthlyDay) {
          return `Día ${data.extra.monthlyDay}`;
        }
        // Default: fecha de hoy si no hay fecha (Puntual)
        return data.date || getTodayISO();
      }
      case "time": {
        const freq = data.extra?.frequency;
        if (data.extra?.unscheduled) return "-";
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
    let value: string | number | boolean | number[] = "";

    switch (col) {
      case "meta":
        value = data.metaId || "";
        break;
      case "parent":
        value = data.parentId || "";
        setParentSelection(data.parentId ? [data.parentId] : []);
        break;
      case "uiType":
        value = getUIType(data.type, data.scope);
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
        if (data.extra?.unscheduled) value = "SIN_FECHA";
        else value = data.extra?.frequency || "PUNTUAL";
        break;
      case "date":
        if (data.extra?.frequency === "SEMANAL") {
          value = data.extra?.weeklyDays || [];
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
          return { date: undefined, time: undefined, extra };
        }
        
        extra.frequency = freq as Frequency;
        extra.unscheduled = false;
        
        if (freq === "PUNTUAL") {
          delete extra.weeklyDays;
          delete extra.weeklyTime;
          delete extra.monthlyDay;
          delete extra.monthlyTime;
        } else if (freq === "SEMANAL") {
          delete extra.monthlyDay;
          delete extra.monthlyTime;
          if (!extra.weeklyDays) extra.weeklyDays = [];
        } else if (freq === "MENSUAL") {
          delete extra.weeklyDays;
          delete extra.weeklyTime;
          if (!extra.monthlyDay) extra.monthlyDay = 1;
        }
        
        return { extra };
      }
      case "date": {
        const freq = data.extra?.frequency;
        if (freq === "SEMANAL") {
          return { extra: { ...(data.extra || {}), weeklyDays: value as number[] } };
        } else if (freq === "MENSUAL") {
          return { extra: { ...(data.extra || {}), monthlyDay: value as number } };
        }
        return { date: value as string || undefined };
      }
      case "time": {
        const freq = data.extra?.frequency;
        if (freq === "SEMANAL") {
          return { extra: { ...(data.extra || {}), weeklyTime: value as string || undefined } };
        } else if (freq === "MENSUAL") {
          return { extra: { ...(data.extra || {}), monthlyTime: value as string || undefined } };
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

    setSaving(true);
    setRowErrors(prev => {
      const next = { ...prev };
      delete next[DRAFT_ID];
      return next;
    });

    const result = await onCreateTask(draftData);
    
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
    const commonClass = "w-full h-full px-1 text-xs border-0 bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-400";

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
        if (data.extra?.unscheduled) {
          return <span className="text-slate-400 text-xs">-</span>;
        }
        if (freq === "SEMANAL") {
          // Multi-select días
          const selected = (editValue as number[]) || [];
          return (
            <div className="flex gap-0.5">
              {WEEKDAYS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    const newVal = selected.includes(i) 
                      ? selected.filter(x => x !== i) 
                      : [...selected, i].sort();
                    setEditValue(newVal);
                  }}
                  className={`w-5 h-5 text-[9px] rounded ${
                    selected.includes(i) ? "bg-blue-500 text-white" : "bg-slate-100"
                  }`}
                >
                  {d}
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
        if (data.extra?.unscheduled) {
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
      return (
        <div className="w-full h-full px-1.5 flex items-center text-xs text-slate-300 bg-slate-100 cursor-not-allowed">
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
    if (col === "date" && displayValue && !data.extra?.unscheduled && data.extra?.frequency !== "SEMANAL" && data.extra?.frequency !== "MENSUAL") {
      displayValue = formatDateSpanish(displayValue);
    }

    const placeholder = row.isDraft && col === "title" ? "Nueva tarea..." : "";
    const finalDisplay = displayValue || placeholder;
    
    return (
      <div
        onClick={() => startEdit(row.id, col)}
        className={`w-full h-full px-1.5 flex items-center text-xs truncate cursor-text ${
          !displayValue && row.isDraft ? "text-slate-400 italic" : ""
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
          <tr className="bg-slate-100">
            {COLUMNS.map((col, i) => (
              <th
                key={col.key}
                className={`px-1 py-1.5 text-[9px] font-semibold text-slate-500 uppercase tracking-wider border-b border-r border-slate-200 ${
                  col.frozen ? "sticky z-30 bg-slate-100" : ""
                }`}
                style={{
                  width: col.width,
                  minWidth: col.width,
                  maxWidth: col.width,
                  left: col.frozen ? getFrozenLeft(i) : undefined,
                }}
              >
                {col.label}
              </th>
            ))}
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

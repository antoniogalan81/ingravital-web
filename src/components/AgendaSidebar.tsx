"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import type { TaskFilters, FilterPreset, TaskStatus, DatePreset, UITaskType } from "@/src/lib/types";
import { DEFAULT_FILTERS } from "@/src/lib/types";
import { generatePresetId } from "@/src/lib/localStorage";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "ALL", label: "Todas" },
  { value: "DAY", label: "Hoy" },
  { value: "WEEK", label: "Semana" },
  { value: "MONTH", label: "Mes" },
];

const UI_TYPES: { value: UITaskType; label: string }[] = [
  { value: "Actividad", label: "Actividad" },
  { value: "Nota", label: "Nota" },
  { value: "Fisico", label: "Físico" },
  { value: "Conocimiento", label: "Conocimiento" },
  { value: "Ingreso", label: "Ingreso" },
  { value: "Gasto", label: "Gasto" },
  { value: "Multi", label: "Multi" },
  { value: "Titulo", label: "Título" },
];

const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "pending", label: "Pendiente" },
   { value: "done", label: "Completada" },

];

interface Props {
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  presets: FilterPreset[];
  onSavePreset: (preset: FilterPreset) => void;
  onDeletePreset: (presetId: string) => void;
  onApplyPreset: (preset: FilterPreset) => void;
  metas: { id: string; title: string }[];
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function AgendaSidebar({
  filters,
  onFiltersChange,
  presets,
  onSavePreset,
  onDeletePreset,
  onApplyPreset,
  metas,
  collapsed,
  onToggleCollapse,
}: Props) {
  const [presetName, setPresetName] = useState("");
  const dateToRef = useRef<HTMLInputElement>(null);

  // Defensivo: metaIds debe ser string[]
  const metaIds = useMemo(() => {
    const raw = (filters as any)?.metaIds;
    if (!Array.isArray(raw)) return [];
    return raw.filter((x: unknown): x is string => typeof x === "string");
  }, [filters]);

  // Defensivo: uiTypes debe ser UITaskType[]
  const uiTypes = useMemo(() => {
    const raw = filters.uiTypes;
    if (!Array.isArray(raw)) return [];
    return raw;
  }, [filters]);

  const allMetaIds = useMemo(() => metas.map((m) => m.id), [metas]);
  const hasMetas = allMetaIds.length > 0;
  const allSelected = hasMetas && allMetaIds.every((id) => metaIds.includes(id));
  const someSelected = hasMetas && metaIds.length > 0 && !allSelected;

  const toggleMeta = useCallback(
    (metaId: string) => {
      const newMetaIds = metaIds.includes(metaId)
        ? metaIds.filter((id) => id !== metaId)
        : [...metaIds, metaId];
      onFiltersChange({ ...filters, metaIds: newMetaIds });
    },
    [filters, metaIds, onFiltersChange]
  );

  const toggleAllMetas = useCallback(() => {
    if (!hasMetas) return;
    if (allSelected) onFiltersChange({ ...filters, metaIds: [] });
    else onFiltersChange({ ...filters, metaIds: allMetaIds });
  }, [hasMetas, allSelected, allMetaIds, filters, onFiltersChange]);

  const toggleUIType = useCallback(
    (uiType: UITaskType) => {
      const newTypes = uiTypes.includes(uiType)
        ? uiTypes.filter((t) => t !== uiType)
        : [...uiTypes, uiType];
      onFiltersChange({ ...filters, uiTypes: newTypes });
    },
    [filters, uiTypes, onFiltersChange]
  );

  const toggleStatus = useCallback(
    (status: TaskStatus) => {
      const newStatuses = filters.statuses.includes(status)
        ? filters.statuses.filter((s) => s !== status)
        : [...filters.statuses, status];
      onFiltersChange({ ...filters, statuses: newStatuses });
    },
    [filters, onFiltersChange]
  );

  const setDateFrom = useCallback(
    (value: string) => {
      onFiltersChange({ ...filters, dateFrom: value || undefined, datePreset: undefined });
      // Auto-abrir dateTo después de seleccionar dateFrom
      if (value) {
        requestAnimationFrame(() => {
          if (dateToRef.current) {
            // showPicker() puede no existir en todos los navegadores
            if (typeof dateToRef.current.showPicker === 'function') {
              try {
                dateToRef.current.showPicker();
              } catch {
                dateToRef.current.focus();
              }
            } else {
              dateToRef.current.focus();
            }
          }
        });
      }
    },
    [filters, onFiltersChange]
  );

  const setDateTo = useCallback(
    (value: string) => {
      onFiltersChange({ ...filters, dateTo: value || undefined, datePreset: undefined });
    },
    [filters, onFiltersChange]
  );

  const setDatePreset = useCallback(
    (preset: DatePreset) => {
      onFiltersChange({ ...filters, datePreset: preset === "ALL" ? "ALL" : preset, dateFrom: undefined, dateTo: undefined });
    },
    [filters, onFiltersChange]
  );

  const toggleIncludeUnscheduled = useCallback(() => {
    onFiltersChange({ ...filters, includeUnscheduled: !filters.includeUnscheduled });
  }, [filters, onFiltersChange]);

  const toggleHidePoints = useCallback(() => {
    onFiltersChange({ ...filters, hidePoints: !filters.hidePoints });
  }, [filters, onFiltersChange]);

  const handleSavePreset = useCallback(() => {
    if (!presetName.trim()) return;
    onSavePreset({
      id: generatePresetId(),
      name: presetName.trim(),
      filters: { ...filters },
    });
    setPresetName("");
  }, [presetName, filters, onSavePreset]);

  const handleReset = useCallback(() => {
    onFiltersChange(DEFAULT_FILTERS);
  }, [onFiltersChange]);

  const hasActiveFilters =
    metaIds.length > 0 ||
    uiTypes.length > 0 ||
    filters.statuses.length > 0 ||
    !!filters.dateFrom ||
    !!filters.dateTo ||
    (filters.datePreset && filters.datePreset !== "ALL") ||
    filters.includeUnscheduled ||
    filters.hidePoints;

  // Colapsado
  if (collapsed) {
    return (
      <aside className="w-10 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col items-center py-2">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded hover:bg-slate-200"
          title="Expandir"
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {hasActiveFilters && (
          <div className="mt-2 w-1.5 h-1.5 rounded-full bg-blue-500" title="Filtros activos" />
        )}
      </aside>
    );
  }

  return (
    <aside className="w-52 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-slate-200">
        <span className="font-semibold text-slate-700">Filtros</span>
        <button onClick={onToggleCollapse} className="p-1 rounded hover:bg-slate-200" title="Colapsar">
          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-3">
        {/* Chips activos */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-1">
            {/* Preset fecha */}
            {filters.datePreset && filters.datePreset !== "ALL" && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px]">
                {DATE_PRESETS.find((p) => p.value === filters.datePreset)?.label}
                <button onClick={() => setDatePreset("ALL")} className="hover:text-amber-900 ml-0.5">×</button>
              </span>
            )}
            {/* Rango fechas */}
            {(filters.dateFrom || filters.dateTo) && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px]">
                {filters.dateFrom && filters.dateTo
                  ? `${filters.dateFrom} - ${filters.dateTo}`
                  : filters.dateFrom || filters.dateTo}
                <button
                  onClick={() => onFiltersChange({ ...filters, dateFrom: undefined, dateTo: undefined })}
                  className="hover:text-amber-900 ml-0.5"
                >×</button>
              </span>
            )}
            {/* Tareas sin programar */}
            {filters.includeUnscheduled && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px]">
                Tareas sin programar
                <button onClick={toggleIncludeUnscheduled} className="hover:text-slate-900 ml-0.5">×</button>
              </span>
            )}
            {/* Metas */}
            {metaIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]"
              >
                {metas.find((m) => m.id === id)?.title || id}
                <button onClick={() => toggleMeta(id)} className="hover:text-blue-900 ml-0.5">×</button>
              </span>
            ))}
            {/* UI Types */}
            {uiTypes.map((uiType) => (
              <span
                key={uiType}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px]"
              >
                {UI_TYPES.find((t) => t.value === uiType)?.label}
                <button onClick={() => toggleUIType(uiType)} className="hover:text-purple-900 ml-0.5">×</button>
              </span>
            ))}
            {/* Statuses */}
            {filters.statuses.map((status) => (
              <span
                key={status}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px]"
              >
                {TASK_STATUSES.find((s) => s.value === status)?.label}
                <button onClick={() => toggleStatus(status)} className="hover:text-green-900 ml-0.5">×</button>
              </span>
            ))}
            {/* Ocultar puntos */}
            {filters.hidePoints && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px]">
                Ocultar puntos
                <button onClick={toggleHidePoints} className="hover:text-slate-900 ml-0.5">×</button>
              </span>
            )}
          </div>
        )}

        {/* Presets */}
        {presets.length > 0 && (
          <section>
            <h3 className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Presets</h3>
            <div className="space-y-0.5">
              {presets.map((preset) => (
                <div key={preset.id} className="flex items-center gap-0.5">
                  <button
                    onClick={() => onApplyPreset(preset)}
                    className="flex-1 text-left px-1.5 py-1 rounded hover:bg-slate-200 truncate"
                  >
                    {preset.name}
                  </button>
                  <button
                    onClick={() => onDeletePreset(preset.id)}
                    className="p-0.5 rounded hover:bg-red-100 text-slate-300 hover:text-red-500"
                  >×</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Fecha */}
        <section>
          <h3 className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Fecha</h3>
          {/* Chips de preset */}
          <div className="flex flex-wrap gap-1 mb-2">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setDatePreset(preset.value)}
                className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                  (filters.datePreset ?? "ALL") === preset.value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {/* Inputs Desde/Hasta */}
          <div className="grid grid-cols-2 gap-1 mb-2">
            <input
              type="date"
              value={filters.dateFrom || ""}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-1.5 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
              placeholder="Desde"
            />
            <input
              ref={dateToRef}
              type="date"
              value={filters.dateTo || ""}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-1.5 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
              placeholder="Hasta"
            />
          </div>
          {/* Switch Tareas sin programar */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-[11px] text-slate-600">Tareas sin programar</span>
            <button
              type="button"
              onClick={toggleIncludeUnscheduled}
              className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
                filters.includeUnscheduled ? "bg-blue-600" : "bg-slate-200"
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  filters.includeUnscheduled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>
        </section>

        {/* Metas */}
        <section>
          <h3 className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Metas</h3>
          {metas.length === 0 ? (
            <p className="text-slate-400 text-[10px]">Sin metas</p>
          ) : (
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              <label className="flex items-center gap-1.5 cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={!hasMetas}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleAllMetas}
                  className="w-3 h-3 rounded border-slate-300 text-blue-600"
                />
                <span className="font-medium">Todas</span>
              </label>
              {metas.map((meta) => (
                <label key={meta.id} className="flex items-center gap-1.5 cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={metaIds.includes(meta.id)}
                    onChange={() => toggleMeta(meta.id)}
                    className="w-3 h-3 rounded border-slate-300 text-blue-600"
                  />
                  <span className="truncate">{meta.title}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* Actividad */}
        <section>
          <h3 className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Actividad</h3>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            {UI_TYPES.map((uiType) => (
              <label key={uiType.value} className="flex items-center gap-1.5 cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={uiTypes.includes(uiType.value)}
                  onChange={() => toggleUIType(uiType.value)}
                  className="w-3 h-3 rounded border-slate-300 text-blue-600"
                />
                <span className="truncate">{uiType.label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Estado */}
        <section>
          <h3 className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Estado</h3>
          <div className="flex gap-3 mb-2">
            {TASK_STATUSES.map((status) => (
              <label key={status.value} className="flex items-center gap-1.5 cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={filters.statuses.includes(status.value)}
                  onChange={() => toggleStatus(status.value)}
                  className="w-3 h-3 rounded border-slate-300 text-blue-600"
                />
                <span>{status.label}</span>
              </label>
            ))}
          </div>
          {/* Ocultar puntos - Switch */}
          <label className="flex items-center justify-between cursor-pointer py-1">
            <span className="text-slate-600">Ocultar puntos</span>
            <button
              type="button"
              role="switch"
              aria-checked={filters.hidePoints ?? false}
              onClick={toggleHidePoints}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                filters.hidePoints ? "bg-blue-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  filters.hidePoints ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>
        </section>

        {/* Guardar preset */}
        <section>
          <h3 className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Guardar preset</h3>
          <div className="flex gap-1">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Nombre"
              className="flex-1 px-1.5 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
              onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
            />
            <button
              onClick={handleSavePreset}
              disabled={!presetName.trim()}
              className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              +
            </button>
          </div>
        </section>
      </div>

      {/* Eliminar filtros - siempre visible */}
      <div className="border-t border-slate-200 p-2">
        <button
          onClick={handleReset}
          className="w-full px-2 py-1.5 text-slate-500 border border-slate-300 rounded hover:bg-slate-100"
        >
          Eliminar filtros
        </button>
      </div>
    </aside>
  );
}

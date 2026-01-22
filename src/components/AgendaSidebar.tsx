"use client";

import { useState, useCallback, useMemo } from "react";
import type { TaskFilters, FilterPreset, TaskType, TaskStatus } from "@/src/lib/types";
import { DEFAULT_FILTERS } from "@/src/lib/types";
import { generatePresetId } from "@/src/lib/localStorage";

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

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: "ACTIVIDAD", label: "Actividad" },
  { value: "INGRESO", label: "Ingreso" },
  { value: "GASTO", label: "Gasto" },
];

const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "done", label: "Hecha" },
  { value: "pending", label: "Pendiente" },
];

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

  // ✅ DEFENSIVO: metaIds debe ser string[]; si por bug viene con objetos, los ignora para no crashear UI
  const metaIds = useMemo(() => {
    const raw = (filters as any)?.metaIds;
    if (!Array.isArray(raw)) return [];
    return raw.filter((x: unknown): x is string => typeof x === "string");
  }, [filters]);

  const toggleMeta = useCallback(
    (metaId: string) => {
      const newMetaIds = metaIds.includes(metaId)
        ? metaIds.filter((id) => id !== metaId)
        : [...metaIds, metaId];
      onFiltersChange({ ...filters, metaIds: newMetaIds } as TaskFilters);
    },
    [filters, metaIds, onFiltersChange]
  );

  const toggleType = useCallback(
    (type: TaskType) => {
      const newTypes = filters.types.includes(type)
        ? filters.types.filter((t) => t !== type)
        : [...filters.types, type];
      onFiltersChange({ ...filters, types: newTypes });
    },
    [filters, onFiltersChange]
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

  const setDate = useCallback(
    (field: "dateFrom" | "dateTo", value: string) => {
      onFiltersChange({ ...filters, [field]: value || undefined });
    },
    [filters, onFiltersChange]
  );

  const handleSavePreset = useCallback(() => {
    if (!presetName.trim()) return;
    // ✅ guarda tal cual (si quieres arreglar la raiz, hay que normalizar aqui/metaIds en agenda/page.tsx)
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
    filters.types.length > 0 ||
    filters.statuses.length > 0 ||
    !!filters.dateFrom ||
    !!filters.dateTo;

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
            {metaIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]"
              >
                {metas.find((m) => m.id === id)?.title || id}
                <button onClick={() => toggleMeta(id)} className="hover:text-blue-900 ml-0.5">
                  ×
                </button>
              </span>
            ))}
            {filters.types.map((type) => (
              <span
                key={type}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px]"
              >
                {TASK_TYPES.find((t) => t.value === type)?.label}
                <button onClick={() => toggleType(type)} className="hover:text-purple-900 ml-0.5">
                  ×
                </button>
              </span>
            ))}
            {filters.statuses.map((status) => (
              <span
                key={status}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px]"
              >
                {TASK_STATUSES.find((s) => s.value === status)?.label}
                <button onClick={() => toggleStatus(status)} className="hover:text-green-900 ml-0.5">
                  ×
                </button>
              </span>
            ))}
            {(filters.dateFrom || filters.dateTo) && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px]">
                {filters.dateFrom && filters.dateTo
                  ? `${filters.dateFrom} - ${filters.dateTo}`
                  : filters.dateFrom || filters.dateTo}
                <button
                  onClick={() => {
                    setDate("dateFrom", "");
                    setDate("dateTo", "");
                  }}
                  className="hover:text-amber-900 ml-0.5"
                >
                  ×
                </button>
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
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Metas */}
        <section>
          <h3 className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Metas</h3>
          {metas.length === 0 ? (
            <p className="text-slate-400 text-[10px]">Sin metas</p>
          ) : (
            <div className="space-y-0.5 max-h-24 overflow-y-auto">
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

        {/* Tipo */}
        <section>
          <h3 className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Tipo</h3>
          <div className="grid grid-cols-2 gap-0.5">
            {TASK_TYPES.map((type) => (
              <label key={type.value} className="flex items-center gap-1.5 cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={filters.types.includes(type.value)}
                  onChange={() => toggleType(type.value)}
                  className="w-3 h-3 rounded border-slate-300 text-blue-600"
                />
                <span>{type.label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Estado */}
        <section>
          <h3 className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Estado</h3>
          <div className="flex gap-2">
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
        </section>

        {/* Fecha */}
        <section>
          <h3 className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Fecha</h3>
          <div className="grid grid-cols-2 gap-1">
            <input
              type="date"
              value={filters.dateFrom || ""}
              onChange={(e) => setDate("dateFrom", e.target.value)}
              className="px-1.5 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Desde"
            />
            <input
              type="date"
              value={filters.dateTo || ""}
              onChange={(e) => setDate("dateTo", e.target.value)}
              className="px-1.5 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Hasta"
            />
          </div>
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
              className="flex-1 px-1.5 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400"
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

      {/* Reset */}
      {hasActiveFilters && (
        <div className="border-t border-slate-200 p-2">
          <button
            onClick={handleReset}
            className="w-full px-2 py-1.5 text-slate-500 border border-slate-300 rounded hover:bg-slate-100"
          >
            Limpiar filtros
          </button>
        </div>
      )}
    </aside>
  );
}

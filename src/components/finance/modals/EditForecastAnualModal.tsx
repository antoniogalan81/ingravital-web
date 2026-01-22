"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ==================== TIPOS ====================

interface ForecastTypeState {
  base?: number;
  expected?: number;
  variable?: boolean;
  cutoffISO?: string | null;
}

type ForecastMonthState = {
  INGRESO?: ForecastTypeState;
  GASTO?: ForecastTypeState;
  expected?: number;
  base?: number;
};

type ForecastMonths = Record<string, ForecastMonthState>;

export interface ForecastLineFull {
  id: string;
  name: string;
  type: "INGRESO" | "GASTO";
  parentId?: string | null;
  months?: ForecastMonths;
  enabledTypes?: { INGRESO?: boolean; GASTO?: boolean };
}

// ==================== HELPERS ====================

function parseEURInput(val: string): number | null {
  if (!val || val.trim() === "") return 0;
  const cleaned = val.replace(/[^\d,.-]/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

// ==================== PROPS ====================

interface EditForecastAnualModalProps {
  open: boolean;
  lineId: string | null;
  onClose: () => void;
  getLineById: (id: string) => ForecastLineFull | undefined;
  onSave: (line: ForecastLineFull) => Promise<{ error: string | null }>;
  onDelete: (lineId: string) => Promise<{ error: string | null }>;
  /** IDs de líneas hijas (para eliminarlas antes del padre si es grupo) */
  getChildrenIds?: (lineId: string) => string[];
}

// ==================== COMPONENT ====================

export function EditForecastAnualModal({
  open,
  lineId,
  onClose,
  getLineById,
  onSave,
  onDelete,
  getChildrenIds,
}: EditForecastAnualModalProps) {
  // Estado interno del modal (draft)
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [draftName, setDraftName] = useState("");
  const [draftEnabledTypes, setDraftEnabledTypes] = useState<{ INGRESO: boolean; GASTO: boolean }>({ INGRESO: true, GASTO: false });
  const [draftMonths, setDraftMonths] = useState<ForecastMonths>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Inicializar draft cuando se abre el modal
  useEffect(() => {
    if (!open || !lineId) return;

    const line = getLineById(lineId);
    if (!line) return;

    setDraftName(line.name || "");
    setDraftEnabledTypes({
      INGRESO: line.enabledTypes?.INGRESO ?? true,
      GASTO: line.enabledTypes?.GASTO ?? false,
    });
    setDraftMonths(line.months ? JSON.parse(JSON.stringify(line.months)) : {});
    setError(null);
    setSaving(false);

    // Focus input
    setTimeout(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
    }, 50);
  }, [open, lineId, getLineById]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  // Handlers internos
  const handleSave = useCallback(async () => {
    if (!lineId) return;

    const trimmedName = draftName.trim();
    if (!trimmedName) {
      setError("El nombre es obligatorio");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const originalLine = getLineById(lineId);
      const line: ForecastLineFull = {
        id: lineId,
        name: trimmedName,
        type: draftEnabledTypes.GASTO && !draftEnabledTypes.INGRESO ? "GASTO" : "INGRESO",
        parentId: originalLine?.parentId || null,
        months: draftMonths,
        enabledTypes: draftEnabledTypes,
      };

      const result = await onSave(line);
      if (result.error) {
        setError(result.error);
        setSaving(false);
        return;
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [lineId, draftName, draftEnabledTypes, draftMonths, getLineById, onSave, onClose]);

  const handleDelete = useCallback(async () => {
    if (!lineId) return;

    const confirmed = window.confirm("¿Eliminar esta fuente? Esta acción no se puede deshacer.");
    if (!confirmed) return;

    setSaving(true);
    setError(null);

    try {
      // Delete children first (if group)
      if (getChildrenIds) {
        const childrenIds = getChildrenIds(lineId);
        for (const childId of childrenIds) {
          await onDelete(childId);
        }
      }

      // Delete main line
      const result = await onDelete(lineId);
      if (result.error) {
        setError(result.error);
        setSaving(false);
        return;
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setSaving(false);
    }
  }, [lineId, getChildrenIds, onDelete, onClose]);

  const updateMonthExpected = (monthId: string, type: "INGRESO" | "GASTO", value: number) => {
    setDraftMonths((prev) => {
      const updated = { ...prev };
      if (!updated[monthId]) updated[monthId] = {};
      if (!updated[monthId][type]) updated[monthId][type] = {};
      updated[monthId][type] = { ...updated[monthId][type], expected: value };
      return updated;
    });
  };

  const updateMonthBase = (monthId: string, type: "INGRESO" | "GASTO", value: number) => {
    setDraftMonths((prev) => {
      const updated = { ...prev };
      if (!updated[monthId]) updated[monthId] = {};
      if (!updated[monthId][type]) updated[monthId][type] = {};
      updated[monthId][type] = { ...updated[monthId][type], base: value };
      return updated;
    });
  };

  const getExpectedValue = (monthId: string, type: "INGRESO" | "GASTO"): number => {
    const m = draftMonths[monthId];
    if (!m) return 0;
    const ts = m[type];
    if (ts && typeof ts.expected === "number") return ts.expected;
    return 0;
  };

  const getBaseValue = (monthId: string, type: "INGRESO" | "GASTO"): number => {
    const m = draftMonths[monthId];
    if (!m) return 0;
    const ts = m[type];
    if (ts && typeof ts.base === "number") return ts.base;
    return 0;
  };

  // No renderizar si no está abierto o no hay lineId
  if (!open || !lineId) return null;

  const line = getLineById(lineId);
  if (!line) return null;

  const monthIds = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return `${year}-${String(m).padStart(2, "0")}`;
  });
  const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl max-h-[90vh] rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500"
          >
            ×
          </button>
          <span className="text-sm font-semibold text-slate-700">Editar fuente</span>
          <div className="w-8" />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">
              {error}
            </div>
          )}

          {/* Nombre */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
            <input
              ref={nameRef}
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Nombre de la fuente"
            />
          </div>

          {/* Tipos habilitados */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Tipos</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDraftEnabledTypes((prev) => ({ ...prev, INGRESO: !prev.INGRESO }))}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  draftEnabledTypes.INGRESO
                    ? "bg-green-100 border-green-300 text-green-700"
                    : "bg-white border-slate-200 text-slate-400"
                }`}
              >
                Ingreso
              </button>
              <button
                onClick={() => setDraftEnabledTypes((prev) => ({ ...prev, GASTO: !prev.GASTO }))}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  draftEnabledTypes.GASTO
                    ? "bg-red-100 border-red-300 text-red-700"
                    : "bg-white border-slate-200 text-slate-400"
                }`}
              >
                Gasto
              </button>
            </div>
          </div>

          {/* Selector de año */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Año</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setYear((y) => y - 1)}
                className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm"
              >
                ‹
              </button>
              <span className="text-sm font-semibold text-slate-800 min-w-[50px] text-center">
                {year}
              </span>
              <button
                onClick={() => setYear((y) => y + 1)}
                className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm"
              >
                ›
              </button>
            </div>
          </div>

          {/* Tabla de distribución mensual */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">Previsiones mensuales</label>
            <div className="border border-slate-200 rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  {/* Fila 1: grupos de tipo */}
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th rowSpan={2} className="px-2 py-2 text-left text-xs font-medium text-slate-500 w-14 border-r border-slate-200">Mes</th>
                    {draftEnabledTypes.INGRESO && (
                      <th colSpan={2} className="px-2 py-1 text-center text-xs font-semibold text-green-600 border-r border-slate-200">Ingreso</th>
                    )}
                    {draftEnabledTypes.GASTO && (
                      <th colSpan={2} className="px-2 py-1 text-center text-xs font-semibold text-red-600">Gasto</th>
                    )}
                  </tr>
                  {/* Fila 2: Real / Prev por tipo */}
                  <tr className="bg-slate-50">
                    {draftEnabledTypes.INGRESO && (
                      <>
                        <th className="px-2 py-1 text-center text-[10px] font-medium text-slate-500 border-r border-slate-100 w-20">Real</th>
                        <th className="px-2 py-1 text-center text-[10px] font-medium text-blue-500 border-r border-slate-200 w-20">Prev</th>
                      </>
                    )}
                    {draftEnabledTypes.GASTO && (
                      <>
                        <th className="px-2 py-1 text-center text-[10px] font-medium text-slate-500 border-r border-slate-100 w-20">Real</th>
                        <th className="px-2 py-1 text-center text-[10px] font-medium text-blue-500 w-20">Prev</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {monthIds.map((monthId, idx) => (
                    <tr key={monthId} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 text-xs font-medium text-slate-600 border-r border-slate-200">{MONTH_NAMES[idx]}</td>
                      {draftEnabledTypes.INGRESO && (
                        <>
                          {/* Real Ingreso */}
                          <td className="px-1 py-1 border-r border-slate-100">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={getBaseValue(monthId, "INGRESO") || ""}
                              onChange={(e) => {
                                const parsed = parseEURInput(e.target.value);
                                if (parsed !== null) updateMonthBase(monthId, "INGRESO", parsed);
                              }}
                              className="w-full px-1.5 py-1 border border-slate-200 rounded text-center text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 bg-slate-50/50"
                              placeholder="0"
                            />
                          </td>
                          {/* Prev Ingreso */}
                          <td className="px-1 py-1 border-r border-slate-200">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={getExpectedValue(monthId, "INGRESO") || ""}
                              onChange={(e) => {
                                const parsed = parseEURInput(e.target.value);
                                if (parsed !== null) updateMonthExpected(monthId, "INGRESO", parsed);
                              }}
                              className="w-full px-1.5 py-1 border border-blue-200 rounded text-center text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-blue-50/30"
                              placeholder="0"
                            />
                          </td>
                        </>
                      )}
                      {draftEnabledTypes.GASTO && (
                        <>
                          {/* Real Gasto */}
                          <td className="px-1 py-1 border-r border-slate-100">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={getBaseValue(monthId, "GASTO") || ""}
                              onChange={(e) => {
                                const parsed = parseEURInput(e.target.value);
                                if (parsed !== null) updateMonthBase(monthId, "GASTO", parsed);
                              }}
                              className="w-full px-1.5 py-1 border border-slate-200 rounded text-center text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 bg-slate-50/50"
                              placeholder="0"
                            />
                          </td>
                          {/* Prev Gasto */}
                          <td className="px-1 py-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={getExpectedValue(monthId, "GASTO") || ""}
                              onChange={(e) => {
                                const parsed = parseEURInput(e.target.value);
                                if (parsed !== null) updateMonthExpected(monthId, "GASTO", parsed);
                              }}
                              className="w-full px-1.5 py-1 border border-blue-200 rounded text-center text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-blue-50/30"
                              placeholder="0"
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleDelete}
              disabled={saving}
              className="py-2 px-3 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              Eliminar fuente
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              className="py-2 px-3 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="py-2 px-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  parseEURInput,
  generateLocalId,
  type ForecastLineFull,
} from "@/src/lib/finance/financeData";
import { upsertForecastLine, deleteForecastLine } from "@/src/lib/finance/financeApi";

// ==================== TYPES ====================

interface TypeFormState {
  enabled: boolean;
  base: string;
  expected: string;
}

interface ChildDraftState {
  id: string;
  name: string;
  typeForms: { INGRESO: TypeFormState; GASTO: TypeFormState };
}

interface SourceModalProps {
  open: boolean;
  mode: "create" | "edit";
  editId: string | null;
  onClose: () => void;
  forecastLines: ForecastLineFull[];
  selectedMonthId: string;
  onForecastLinesChange: React.Dispatch<React.SetStateAction<ForecastLineFull[]>>;
}

// ==================== COMPONENT ====================

export function SourceModal({
  open,
  mode,
  editId,
  onClose,
  forecastLines,
  selectedMonthId,
  onForecastLinesChange,
}: SourceModalProps) {
  const [sourceName, setSourceName] = useState("Nueva fuente");
  const [sourceIsGroup, setSourceIsGroup] = useState(false);
  const [sourceIsChild, setSourceIsChild] = useState(false);
  const [sourceOriginalParentId, setSourceOriginalParentId] = useState<string | null>(null);
  const [sourceTypeForms, setSourceTypeForms] = useState<{ INGRESO: TypeFormState; GASTO: TypeFormState }>({
    INGRESO: { enabled: true, base: "0", expected: "0" },
    GASTO: { enabled: false, base: "0", expected: "0" },
  });
  const [sourceChildren, setSourceChildren] = useState<ChildDraftState[]>([]);
  const [sourceRemovedChildIds, setSourceRemovedChildIds] = useState<string[]>([]);
  const [sourceSaving, setSourceSaving] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const sourceNameRef = useRef<HTMLInputElement>(null);
  const [initialSourceName, setInitialSourceName] = useState("");
  const [initialSourceIsGroup, setInitialSourceIsGroup] = useState(false);
  const [initialSourceTypeForms, setInitialSourceTypeForms] = useState<string>("");
  const [initialSourceChildren, setInitialSourceChildren] = useState<string>("");

  // Initialize state when modal opens or mode/editId changes
  useEffect(() => {
    if (!open) return;

    if (mode === "create") {
      setSourceName("Nueva fuente");
      setSourceIsGroup(false);
      setSourceIsChild(false);
      setSourceOriginalParentId(null);
      const defaultTypeForms = {
        INGRESO: { enabled: true, base: "0", expected: "0" },
        GASTO: { enabled: false, base: "0", expected: "0" },
      };
      setSourceTypeForms(defaultTypeForms);
      setSourceChildren([]);
      setSourceRemovedChildIds([]);
      setSourceError(null);
      setInitialSourceName("Nueva fuente");
      setInitialSourceIsGroup(false);
      setInitialSourceTypeForms(JSON.stringify(defaultTypeForms));
      setInitialSourceChildren(JSON.stringify([]));
      setTimeout(() => sourceNameRef.current?.select(), 50);
    } else if (mode === "edit" && editId) {
      const line = forecastLines.find((fl) => fl.id === editId);
      if (!line) return;

      const children = forecastLines.filter((fl) => fl.parentId === editId);
      const isGroup = children.length > 0;
      const isChild = !!line.parentId;

      setSourceName(line.name || "");
      setSourceIsGroup(isGroup);
      setSourceIsChild(isChild);
      setSourceOriginalParentId(line.parentId || null);

      let typeForms: { INGRESO: TypeFormState; GASTO: TypeFormState };
      let childrenDraft: ChildDraftState[] = [];

      if (isGroup) {
        typeForms = {
          INGRESO: { enabled: false, base: "0", expected: "0" },
          GASTO: { enabled: false, base: "0", expected: "0" },
        };
        childrenDraft = children.map((child) => {
          const monthData = child.months?.[selectedMonthId];
          const ingData = monthData?.INGRESO || {};
          const gasData = monthData?.GASTO || {};
          return {
            id: child.id,
            name: child.name || "",
            typeForms: {
              INGRESO: {
                enabled: child.enabledTypes?.INGRESO ?? true,
                base: String(ingData.base ?? 0),
                expected: String(ingData.expected ?? 0),
              },
              GASTO: {
                enabled: child.enabledTypes?.GASTO ?? false,
                base: String(gasData.base ?? 0),
                expected: String(gasData.expected ?? 0),
              },
            },
          };
        });
        setSourceTypeForms(typeForms);
        setSourceChildren(childrenDraft);
      } else {
        const monthData = line.months?.[selectedMonthId];
        const ingData = monthData?.INGRESO || {};
        const gasData = monthData?.GASTO || {};
        typeForms = {
          INGRESO: {
            enabled: line.enabledTypes?.INGRESO ?? true,
            base: String(ingData.base ?? 0),
            expected: String(ingData.expected ?? 0),
          },
          GASTO: {
            enabled: line.enabledTypes?.GASTO ?? false,
            base: String(gasData.base ?? 0),
            expected: String(gasData.expected ?? 0),
          },
        };
        setSourceTypeForms(typeForms);
        setSourceChildren([]);
      }

      setSourceRemovedChildIds([]);
      setSourceError(null);
      setInitialSourceName(line.name || "");
      setInitialSourceIsGroup(isGroup);
      setInitialSourceTypeForms(JSON.stringify(typeForms));
      setInitialSourceChildren(JSON.stringify(childrenDraft));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, editId]);

  const sourceIsDirty = useMemo(() => {
    if (sourceName !== initialSourceName) return true;
    if (sourceIsGroup !== initialSourceIsGroup) return true;
    if (JSON.stringify(sourceTypeForms) !== initialSourceTypeForms) return true;
    if (JSON.stringify(sourceChildren) !== initialSourceChildren) return true;
    if (sourceRemovedChildIds.length > 0) return true;
    return false;
  }, [sourceName, sourceIsGroup, sourceTypeForms, sourceChildren, sourceRemovedChildIds, initialSourceName, initialSourceIsGroup, initialSourceTypeForms, initialSourceChildren]);

  const addSourceChild = useCallback(() => {
    const newChild: ChildDraftState = {
      id: generateLocalId(),
      name: `Subcategoría ${sourceChildren.length + 1}`,
      typeForms: {
        INGRESO: { enabled: true, base: "0", expected: "0" },
        GASTO: { enabled: false, base: "0", expected: "0" },
      },
    };
    setSourceChildren((prev) => [...prev, newChild]);
  }, [sourceChildren.length]);

  const removeSourceChild = useCallback((childId: string) => {
    setSourceChildren((prev) => prev.filter((c) => c.id !== childId));
    if (mode === "edit") {
      const existingChild = forecastLines.find((fl) => fl.id === childId);
      if (existingChild) {
        setSourceRemovedChildIds((prev) => [...prev, childId]);
      }
    }
  }, [mode, forecastLines]);

  const updateSourceChildName = useCallback((childId: string, name: string) => {
    setSourceChildren((prev) => prev.map((c) => (c.id === childId ? { ...c, name } : c)));
  }, []);

  const updateSourceChildType = useCallback((childId: string, type: "INGRESO" | "GASTO", enabled: boolean) => {
    setSourceChildren((prev) => prev.map((c) => {
      if (c.id !== childId) return c;
      const other = type === "INGRESO" ? "GASTO" : "INGRESO";
      if (!enabled && !c.typeForms[other].enabled) return c;
      return {
        ...c,
        typeForms: {
          ...c.typeForms,
          [type]: { ...c.typeForms[type], enabled },
        },
      };
    }));
  }, []);

  const updateSourceChildValue = useCallback((childId: string, type: "INGRESO" | "GASTO", field: "base" | "expected", value: string) => {
    setSourceChildren((prev) => prev.map((c) => {
      if (c.id !== childId) return c;
      return {
        ...c,
        typeForms: {
          ...c.typeForms,
          [type]: { ...c.typeForms[type], [field]: value },
        },
      };
    }));
  }, []);

  const toggleSourceType = useCallback((type: "INGRESO" | "GASTO") => {
    setSourceTypeForms((prev) => {
      const other = type === "INGRESO" ? "GASTO" : "INGRESO";
      const newEnabled = !prev[type].enabled;
      if (!newEnabled && !prev[other].enabled) return prev;
      return {
        ...prev,
        [type]: { ...prev[type], enabled: newEnabled },
      };
    });
  }, []);

  const updateSourceTypeValue = useCallback((type: "INGRESO" | "GASTO", field: "base" | "expected", value: string) => {
    setSourceTypeForms((prev) => ({
      ...prev,
      [type]: { ...prev[type], [field]: value },
    }));
  }, []);

  const handleSaveSource = useCallback(async () => {
    setSourceSaving(true);
    setSourceError(null);

    try {
      const trimmedName = sourceName.trim() || "Nueva fuente";

      if (sourceIsGroup) {
        if (sourceChildren.length === 0) {
          setSourceError("Añade al menos una subcategoría");
          setSourceSaving(false);
          return;
        }

        for (const child of sourceChildren) {
          if (!child.typeForms.INGRESO.enabled && !child.typeForms.GASTO.enabled) {
            setSourceError(`La subcategoría "${child.name || "Sin nombre"}" debe tener al menos un tipo activado`);
            setSourceSaving(false);
            return;
          }
        }

        const parentId = editId || generateLocalId();
        const parentLine: ForecastLineFull = {
          id: parentId,
          name: trimmedName,
          type: "INGRESO",
          parentId: null,
          enabledTypes: { INGRESO: false, GASTO: false },
          months: {},
        };

        const parentResult = await upsertForecastLine(parentLine);
        if (parentResult.error) {
          setSourceError(parentResult.error);
          setSourceSaving(false);
          return;
        }

        for (const child of sourceChildren) {
          const parseNum = (s: string) => parseEURInput(s) ?? 0;
          const childLine: ForecastLineFull = {
            id: child.id,
            name: child.name.trim() || `Subcategoría`,
            type: child.typeForms.INGRESO.enabled ? "INGRESO" : "GASTO",
            parentId: parentId,
            enabledTypes: {
              INGRESO: child.typeForms.INGRESO.enabled,
              GASTO: child.typeForms.GASTO.enabled,
            },
            months: {
              [selectedMonthId]: {
                INGRESO: {
                  base: parseNum(child.typeForms.INGRESO.base),
                  expected: parseNum(child.typeForms.INGRESO.expected),
                },
                GASTO: {
                  base: parseNum(child.typeForms.GASTO.base),
                  expected: parseNum(child.typeForms.GASTO.expected),
                },
              },
            },
          };
          const childResult = await upsertForecastLine(childLine);
          if (childResult.error) {
            setSourceError(childResult.error);
            setSourceSaving(false);
            return;
          }
        }

        for (const removedId of sourceRemovedChildIds) {
          await deleteForecastLine(removedId);
        }

        if (mode === "edit" && editId) {
          const oldChildren = forecastLines.filter((fl) => fl.parentId === editId && !sourceChildren.some((c) => c.id === fl.id));
          for (const oldChild of oldChildren) {
            await deleteForecastLine(oldChild.id);
          }
        }

        onForecastLinesChange((prev) => {
          let updated = prev.filter((fl) => fl.id !== parentId && !sourceChildren.some((c) => c.id === fl.id) && !sourceRemovedChildIds.includes(fl.id));
          updated = [...updated, parentLine, ...sourceChildren.map((child) => {
            const parseNum = (s: string) => parseEURInput(s) ?? 0;
            return {
              id: child.id,
              name: child.name.trim() || `Subcategoría`,
              type: (child.typeForms.INGRESO.enabled ? "INGRESO" : "GASTO") as "INGRESO" | "GASTO",
              parentId: parentId,
              enabledTypes: {
                INGRESO: child.typeForms.INGRESO.enabled,
                GASTO: child.typeForms.GASTO.enabled,
              },
              months: {
                [selectedMonthId]: {
                  INGRESO: {
                    base: parseNum(child.typeForms.INGRESO.base),
                    expected: parseNum(child.typeForms.INGRESO.expected),
                  },
                  GASTO: {
                    base: parseNum(child.typeForms.GASTO.base),
                    expected: parseNum(child.typeForms.GASTO.expected),
                  },
                },
              },
            };
          })];
          return updated;
        });
      } else {
        if (!sourceTypeForms.INGRESO.enabled && !sourceTypeForms.GASTO.enabled) {
          setSourceError("Activa al menos un tipo (Ingreso o Gasto)");
          setSourceSaving(false);
          return;
        }

        if (sourceIsChild && !sourceOriginalParentId) {
          setSourceError("Error interno: subfuente sin padre");
          setSourceSaving(false);
          return;
        }

        const parseNum = (s: string) => parseEURInput(s) ?? 0;
        const lineId = editId || generateLocalId();
        const finalParentId = sourceIsChild ? sourceOriginalParentId : null;

        const line: ForecastLineFull = {
          id: lineId,
          name: trimmedName,
          type: sourceTypeForms.INGRESO.enabled ? "INGRESO" : "GASTO",
          parentId: finalParentId,
          enabledTypes: {
            INGRESO: sourceTypeForms.INGRESO.enabled,
            GASTO: sourceTypeForms.GASTO.enabled,
          },
          months: {
            [selectedMonthId]: {
              INGRESO: {
                base: parseNum(sourceTypeForms.INGRESO.base),
                expected: parseNum(sourceTypeForms.INGRESO.expected),
              },
              GASTO: {
                base: parseNum(sourceTypeForms.GASTO.base),
                expected: parseNum(sourceTypeForms.GASTO.expected),
              },
            },
          },
        };

        const result = await upsertForecastLine(line);
        if (result.error) {
          setSourceError(result.error);
          setSourceSaving(false);
          return;
        }

        if (mode === "edit" && editId && !sourceIsChild) {
          const oldChildren = forecastLines.filter((fl) => fl.parentId === editId);
          for (const oldChild of oldChildren) {
            await deleteForecastLine(oldChild.id);
          }
        }

        onForecastLinesChange((prev) => {
          let updated = prev.filter((fl) => fl.id !== lineId);
          if (mode === "edit" && editId && !sourceIsChild) {
            updated = updated.filter((fl) => fl.parentId !== editId);
          }
          return [...updated, line];
        });
      }

      onClose();
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSourceSaving(false);
    }
  }, [sourceName, sourceIsGroup, sourceIsChild, sourceOriginalParentId, sourceChildren, sourceTypeForms, editId, mode, selectedMonthId, forecastLines, sourceRemovedChildIds, onForecastLinesChange, onClose]);

  const handleDeleteSource = useCallback(async () => {
    if (!editId) return;

    const confirmed = window.confirm("¿Eliminar esta fuente? Esta acción no se puede deshacer.");
    if (!confirmed) return;

    setSourceSaving(true);
    setSourceError(null);

    try {
      const children = forecastLines.filter((fl) => fl.parentId === editId);
      for (const child of children) {
        await deleteForecastLine(child.id);
      }

      const result = await deleteForecastLine(editId);
      if (result.error) {
        setSourceError(result.error);
        setSourceSaving(false);
        return;
      }

      onForecastLinesChange((prev) => prev.filter((fl) => fl.id !== editId && fl.parentId !== editId));
      onClose();
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setSourceSaving(false);
    }
  }, [editId, forecastLines, onForecastLinesChange, onClose]);

  const handleRequestClose = useCallback(async () => {
    if (sourceSaving) return;
    if (sourceIsDirty) {
      await handleSaveSource();
    } else {
      onClose();
    }
  }, [sourceIsDirty, sourceSaving, handleSaveSource, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleRequestClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, handleRequestClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={handleRequestClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
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
          <span className="text-sm font-semibold text-slate-700">
            {mode === "create" ? "Crear fuente" : "Editar fuente"}
          </span>
          <div className="w-8" />
        </div>

        {/* Body - scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {sourceError && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">
              {sourceError}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
                <input
                  ref={sourceNameRef}
                  type="text"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Nueva fuente"
                />
              </div>
              {!sourceIsChild && (
                <div className="flex flex-col items-end">
                  <span className="text-xs font-semibold text-slate-700 mb-1">Subcategorías</span>
                  <button
                    onClick={() => {
                      if (!sourceIsGroup && sourceChildren.length === 0) {
                        setSourceChildren([{
                          id: generateLocalId(),
                          name: "Subcategoría 1",
                          typeForms: {
                            INGRESO: { enabled: sourceTypeForms.INGRESO.enabled, base: sourceTypeForms.INGRESO.base, expected: sourceTypeForms.INGRESO.expected },
                            GASTO: { enabled: sourceTypeForms.GASTO.enabled, base: sourceTypeForms.GASTO.base, expected: sourceTypeForms.GASTO.expected },
                          },
                        }]);
                      }
                      setSourceIsGroup((v) => !v);
                    }}
                    className={`w-12 h-6 rounded-full transition-colors ${sourceIsGroup ? "bg-blue-500" : "bg-slate-300"} relative`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${sourceIsGroup ? "translate-x-[22px]" : "translate-x-0"}`}
                    />
                  </button>
                </div>
              )}
            </div>
            {!sourceIsChild && (
              <p className="text-xs text-slate-400">
                {sourceIsGroup ? "Crea varias subcategorías bajo una misma fuente." : "Fuente simple sin subcategorías."}
              </p>
            )}
          </div>

          {/* Simple mode */}
          {!sourceIsGroup && (
            <>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleSourceType("INGRESO")}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    sourceTypeForms.INGRESO.enabled
                      ? "bg-green-100 border-green-300 text-green-700"
                      : "bg-white border-slate-200 text-slate-400"
                  }`}
                >
                  Ingreso
                </button>
                <button
                  onClick={() => toggleSourceType("GASTO")}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    sourceTypeForms.GASTO.enabled
                      ? "bg-red-100 border-red-300 text-red-700"
                      : "bg-white border-slate-200 text-slate-400"
                  }`}
                >
                  Gasto
                </button>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 w-24"></th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500">REAL</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500">PREVISTO</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={`border-t border-slate-100 ${!sourceTypeForms.INGRESO.enabled ? "opacity-40" : ""}`}>
                      <td className="px-3 py-2 text-xs font-medium text-green-600">Ingreso</td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={sourceTypeForms.INGRESO.base}
                          onChange={(e) => updateSourceTypeValue("INGRESO", "base", e.target.value)}
                          disabled={!sourceTypeForms.INGRESO.enabled}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-center text-sm disabled:bg-slate-50 disabled:text-slate-300"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={sourceTypeForms.INGRESO.expected}
                          onChange={(e) => updateSourceTypeValue("INGRESO", "expected", e.target.value)}
                          disabled={!sourceTypeForms.INGRESO.enabled}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-center text-sm disabled:bg-slate-50 disabled:text-slate-300"
                          placeholder="0"
                        />
                      </td>
                    </tr>
                    <tr className={`border-t border-slate-100 ${!sourceTypeForms.GASTO.enabled ? "opacity-40" : ""}`}>
                      <td className="px-3 py-2 text-xs font-medium text-red-600">Gasto</td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={sourceTypeForms.GASTO.base}
                          onChange={(e) => updateSourceTypeValue("GASTO", "base", e.target.value)}
                          disabled={!sourceTypeForms.GASTO.enabled}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-center text-sm disabled:bg-slate-50 disabled:text-slate-300"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={sourceTypeForms.GASTO.expected}
                          onChange={(e) => updateSourceTypeValue("GASTO", "expected", e.target.value)}
                          disabled={!sourceTypeForms.GASTO.enabled}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-center text-sm disabled:bg-slate-50 disabled:text-slate-300"
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Group mode */}
          {sourceIsGroup && (
            <div className="space-y-3">
              {sourceChildren.map((child, idx) => (
                <div key={child.id} className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={child.name}
                      onChange={(e) => updateSourceChildName(child.id, e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      placeholder={`Subcategoría ${idx + 1}`}
                    />
                    <button
                      onClick={() => removeSourceChild(child.id)}
                      className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                      title="Eliminar subcategoría"
                    >
                      ×
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateSourceChildType(child.id, "INGRESO", !child.typeForms.INGRESO.enabled)}
                      className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                        child.typeForms.INGRESO.enabled
                          ? "bg-green-100 border-green-300 text-green-700"
                          : "bg-white border-slate-200 text-slate-400"
                      }`}
                    >
                      Ingreso
                    </button>
                    <button
                      onClick={() => updateSourceChildType(child.id, "GASTO", !child.typeForms.GASTO.enabled)}
                      className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                        child.typeForms.GASTO.enabled
                          ? "bg-red-100 border-red-300 text-red-700"
                          : "bg-white border-slate-200 text-slate-400"
                      }`}
                    >
                      Gasto
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded overflow-hidden bg-white">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="px-2 py-1 text-left text-xs font-medium text-slate-400 w-16"></th>
                          <th className="px-2 py-1 text-center text-xs font-medium text-slate-400">Real</th>
                          <th className="px-2 py-1 text-center text-xs font-medium text-slate-400">Prev</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className={`border-t border-slate-100 ${!child.typeForms.INGRESO.enabled ? "opacity-40" : ""}`}>
                          <td className="px-2 py-1 text-xs text-green-600">Ing</td>
                          <td className="px-1 py-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={child.typeForms.INGRESO.base}
                              onChange={(e) => updateSourceChildValue(child.id, "INGRESO", "base", e.target.value)}
                              disabled={!child.typeForms.INGRESO.enabled}
                              className="w-full px-1 py-1 border border-slate-200 rounded text-center text-xs disabled:bg-slate-50 disabled:text-slate-300"
                              placeholder="0"
                            />
                          </td>
                          <td className="px-1 py-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={child.typeForms.INGRESO.expected}
                              onChange={(e) => updateSourceChildValue(child.id, "INGRESO", "expected", e.target.value)}
                              disabled={!child.typeForms.INGRESO.enabled}
                              className="w-full px-1 py-1 border border-slate-200 rounded text-center text-xs disabled:bg-slate-50 disabled:text-slate-300"
                              placeholder="0"
                            />
                          </td>
                        </tr>
                        <tr className={`border-t border-slate-100 ${!child.typeForms.GASTO.enabled ? "opacity-40" : ""}`}>
                          <td className="px-2 py-1 text-xs text-red-600">Gas</td>
                          <td className="px-1 py-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={child.typeForms.GASTO.base}
                              onChange={(e) => updateSourceChildValue(child.id, "GASTO", "base", e.target.value)}
                              disabled={!child.typeForms.GASTO.enabled}
                              className="w-full px-1 py-1 border border-slate-200 rounded text-center text-xs disabled:bg-slate-50 disabled:text-slate-300"
                              placeholder="0"
                            />
                          </td>
                          <td className="px-1 py-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={child.typeForms.GASTO.expected}
                              onChange={(e) => updateSourceChildValue(child.id, "GASTO", "expected", e.target.value)}
                              disabled={!child.typeForms.GASTO.enabled}
                              className="w-full px-1 py-1 border border-slate-200 rounded text-center text-xs disabled:bg-slate-50 disabled:text-slate-300"
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              <button
                onClick={addSourceChild}
                className="w-full py-2.5 border-2 border-dashed border-slate-300 rounded-lg text-sm font-medium text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                + Añadir subcategoría
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
          <div className="flex items-center justify-end gap-2">
            {mode === "edit" && (
              <button
                onClick={handleDeleteSource}
                disabled={sourceSaving}
                className="py-2 px-3 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                Eliminar fuente
              </button>
            )}
            <button
              onClick={onClose}
              disabled={sourceSaving}
              className="py-2 px-3 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveSource}
              disabled={sourceSaving}
              className="py-2 px-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {sourceSaving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

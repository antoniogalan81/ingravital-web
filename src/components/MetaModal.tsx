"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Meta } from "@/src/lib/types";

type MetaType = "MOONSHOT" | "LARGO_PLAZO" | "CORTO_PLAZO";
type Horizon = "1M" | "3M" | "6M" | "9M" | "1Y" | "3Y" | "5Y" | "10Y";

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isValidISODate(dateISO: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return false;
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function addMonthsISO(baseISO: string, months: number): string {
  const [y, m, d] = baseISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setMonth(dt.getMonth() + months);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addYearsISO(baseISO: string, years: number): string {
  const [y, m, d] = baseISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setFullYear(dt.getFullYear() + years);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function diffMonthsApprox(fromISO: string, toISO: string): number {
  const [fy, fm] = fromISO.split("-").map(Number);
  const [ty, tm] = toISO.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function computeMetaTypeAuto(targetDateISO: string): MetaType {
  const months = diffMonthsApprox(todayISO(), targetDateISO);
  if (months >= 60) return "MOONSHOT";
  if (months >= 12) return "LARGO_PLAZO";
  return "CORTO_PLAZO";
}

function horizonToTargetDateISO(h: Horizon, base = todayISO()): string {
  switch (h) {
    case "1M": return addMonthsISO(base, 1);
    case "3M": return addMonthsISO(base, 3);
    case "6M": return addMonthsISO(base, 6);
    case "9M": return addMonthsISO(base, 9);
    case "1Y": return addYearsISO(base, 1);
    case "3Y": return addYearsISO(base, 3);
    case "5Y": return addYearsISO(base, 5);
    case "10Y": return addYearsISO(base, 10);
    default: return addMonthsISO(base, 3);
  }
}

function metaTypeLabel(t: MetaType): string {
  if (t === "MOONSHOT") return "Moonshot";
  if (t === "LARGO_PLAZO") return "Largo plazo";
  return "Corto plazo";
}

function horizonLabel(h: Horizon): string {
  const map: Record<Horizon, string> = {
    "1M": "1 mes",
    "3M": "3 meses",
    "6M": "6 meses",
    "9M": "9 meses",
    "1Y": "1 año",
    "3Y": "3 años",
    "5Y": "5 años",
    "10Y": "10 años",
  };
  return map[h];
}

type SaveMetaInput = {
  title: string;
  description?: string;
  targetDate: string;
  metaType: MetaType;
  horizon?: Horizon;
};

interface Props {
  isOpen: boolean;
  meta: Meta | null;
  onClose: () => void;
  onSave: (input: SaveMetaInput) => Promise<{ success: boolean; error?: string }>;
  onDelete?: (metaId: string) => Promise<{ success: boolean; error?: string }>;
}

export default function MetaModal({ isOpen, meta, onClose, onSave, onDelete }: Props) {
  const isEdit = !!meta;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState<string>(todayISO());
  const [metaType, setMetaType] = useState<MetaType>("CORTO_PLAZO");
  const [metaTypeManual, setMetaTypeManual] = useState<boolean>(false);
  const [horizon, setHorizon] = useState<Horizon | "">("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar valores al abrir
  useEffect(() => {
    if (!isOpen) return;

    setTitle(meta?.title || "");
    setDescription(meta?.description || "");

    const metaAny = meta as unknown as Record<string, unknown> | null;
    const existingTarget = metaAny?.targetDate as string | null | undefined;
    const initialTarget = existingTarget && isValidISODate(existingTarget) ? existingTarget : todayISO();
    setTargetDate(initialTarget);

    const existingMetaTypeRaw = (metaAny?.metaType as string | undefined) || undefined;
    const existingMetaType =
      existingMetaTypeRaw === "MOONSHOT" || existingMetaTypeRaw === "LARGO_PLAZO" || existingMetaTypeRaw === "CORTO_PLAZO"
        ? (existingMetaTypeRaw as MetaType)
        : "CORTO_PLAZO";

    setMetaTypeManual(isEdit);
    setMetaType(isEdit ? existingMetaType : computeMetaTypeAuto(initialTarget));

    const existingHorizonRaw = (metaAny?.horizon as string | undefined) || undefined;
    const existingHorizon =
      existingHorizonRaw === "1M" || existingHorizonRaw === "3M" || existingHorizonRaw === "6M" ||
      existingHorizonRaw === "9M" || existingHorizonRaw === "1Y" || existingHorizonRaw === "3Y" ||
      existingHorizonRaw === "5Y" || existingHorizonRaw === "10Y"
        ? (existingHorizonRaw as Horizon)
        : "";
    setHorizon(existingHorizon);

    setError(null);
  }, [isOpen, meta, isEdit]);

  // Auto metaType según targetDate si no es manual
  useEffect(() => {
    if (!isOpen) return;
    if (metaTypeManual) return;
    if (!isValidISODate(targetDate)) return;
    setMetaType(computeMetaTypeAuto(targetDate));
  }, [isOpen, targetDate, metaTypeManual]);

  const canSave = useMemo(() => {
    if (!title.trim()) return false;
    if (!isValidISODate(targetDate)) return false;
    return true;
  }, [title, targetDate]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      setError("El título es obligatorio");
      return;
    }
    if (!isValidISODate(targetDate)) {
      setError("Fecha objetivo inválida (formato YYYY-MM-DD)");
      return;
    }

    setSaving(true);
    setError(null);

    const payload: SaveMetaInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      targetDate,
      metaType,
      horizon: horizon || undefined,
    };

    const result = await onSave(payload);

    if (result.success) {
      onClose();
    } else {
      setError(result.error || "Error al guardar");
    }

    setSaving(false);
  }, [title, description, targetDate, metaType, horizon, onSave, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && e.ctrlKey) {
        handleSave();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [handleSave, onClose]
  );

  const handleDelete = useCallback(async () => {
    if (!meta || !onDelete) return;

    const confirmed = window.confirm(
      "¿Eliminar esta meta y TODAS sus tareas asociadas? Esta acción no se puede deshacer."
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    const result = await onDelete(meta.id);

    if (result.success) {
      onClose();
    } else {
      setError(result.error || "Error al eliminar");
    }

    setDeleting(false);
  }, [meta, onDelete, onClose]);

  const onPickMetaType = (t: MetaType) => {
    setMetaTypeManual(true);
    setMetaType(t);
  };

  const onPickHorizon = (h: Horizon | "") => {
    setHorizon(h);
    if (!h) return;
    const newTarget = horizonToTargetDateISO(h, todayISO());
    setTargetDate(newTarget);
  };

  if (!isOpen) return null;

  const HORIZONS: Horizon[] = ["1M", "3M", "6M", "9M", "1Y", "3Y", "5Y", "10Y"];
  const META_TYPES: MetaType[] = ["CORTO_PLAZO", "LARGO_PLAZO", "MOONSHOT"];

  // Estilo base para chips
  const chipBase = "inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-medium transition-colors";
  const chipActive = "bg-blue-600 text-white border-blue-600";
  const chipInactive = "bg-white text-slate-600 border-slate-200 hover:bg-slate-50";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-[480px] max-w-[95vw] max-h-[90vh] overflow-y-auto"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">
            {isEdit ? "Editar Meta" : "Crear Meta"}
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Tipo de meta - CHIPS */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Tipo de meta</label>
            <div className="flex flex-wrap gap-2">
              {META_TYPES.map((t) => {
                const active = metaType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onPickMetaType(t)}
                    className={`${chipBase} ${active ? chipActive : chipInactive}`}
                  >
                    {metaTypeLabel(t)}
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
              <span>{metaTypeManual ? "Manual" : "Auto"}</span>
              {metaTypeManual && (
                <button
                  type="button"
                  className="text-blue-600 hover:text-blue-700 hover:underline"
                  onClick={() => setMetaTypeManual(false)}
                >
                  Volver a auto
                </button>
              )}
            </div>
          </div>

          {/* Nombre y Descripción en fila (responsive) */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nombre de la meta"
                autoFocus
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400/50"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">Descripción</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción opcional"
                rows={1}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                style={{ minHeight: "38px" }}
              />
            </div>
          </div>

          {/* Horizonte temporal - CHIPS */}
          <div>
            {/* Fila superior: label + chip (Opcional) clickable */}
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">Horizonte temporal (opcional)</label>
            </div>
            {/* Fila inferior: chips de horizonte */}
            <div className="flex flex-wrap gap-1.5">
              {HORIZONS.map((h) => {
                const active = horizon === h;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onPickHorizon(h)}
                    className={`${chipBase} ${active ? chipActive : chipInactive}`}
                  >
                    {horizonLabel(h)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fecha objetivo */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Fecha objetivo <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            />
            <div className="mt-1 text-[11px] text-slate-400">
              {!metaTypeManual && "El tipo se calcula automáticamente según la fecha."}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
          {isEdit && onDelete && (
            <button
              onClick={handleDelete}
              disabled={saving || deleting}
              className="px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {deleting ? "Eliminando..." : "Eliminar meta"}
            </button>
          )}
          <button
            onClick={onClose}
            disabled={saving || deleting}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || deleting || !canSave}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import type { Meta } from "@/src/lib/types";

interface Props {
  isOpen: boolean;
  meta: Meta | null; // null = crear, Meta = editar
  onClose: () => void;
  onSave: (title: string, description?: string) => Promise<{ success: boolean; error?: string }>;
}

export default function MetaModal({ isOpen, meta, onClose, onSave }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!meta;

  useEffect(() => {
    if (isOpen) {
      setTitle(meta?.title || "");
      setDescription(meta?.description || "");
      setError(null);
    }
  }, [isOpen, meta]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      setError("El título es obligatorio");
      return;
    }

    setSaving(true);
    setError(null);

    const result = await onSave(title.trim(), description.trim() || undefined);
    
    if (result.success) {
      onClose();
    } else {
      setError(result.error || "Error al guardar");
    }

    setSaving(false);
  }, [title, description, onSave, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      handleSave();
    } else if (e.key === "Escape") {
      onClose();
    }
  }, [handleSave, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        className="bg-white rounded-lg shadow-xl w-80 max-w-[90vw]"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">
            {isEdit ? "Editar Meta" : "Crear Meta"}
          </h2>
        </div>

        {/* Body - Vertical */}
        <div className="px-4 py-3 space-y-3">
          {/* Título */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Título <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nombre de la meta"
              autoFocus
              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción opcional"
              rows={3}
              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-xs text-slate-600 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}


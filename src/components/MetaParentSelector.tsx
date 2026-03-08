"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import type { Meta, TaskRow } from "@/src/lib/types";

interface Props {
  taskId: string;
  metaId?: string | null;
  parentId?: string | null;
  metas: Meta[];
  tasks: TaskRow[];
  onMetaChange: (metaId: string) => void;
  onParentChange: (parentId: string | null) => void;
}

function collectDescendantIds(tasks: TaskRow[], taskId: string, metaId: string): Set<string> {
  const childrenMap = new Map<string, string[]>();
  for (const t of tasks) {
    if (t.data.metaId === metaId && t.data.parentId) {
      const arr = childrenMap.get(t.data.parentId);
      if (arr) arr.push(t.data.id);
      else childrenMap.set(t.data.parentId, [t.data.id]);
    }
  }
  const result = new Set<string>();
  const queue = [taskId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const children = childrenMap.get(id) || [];
    for (const c of children) {
      result.add(c);
      queue.push(c);
    }
  }
  return result;
}

export default function MetaParentSelector({
  taskId, metaId, parentId, metas, tasks, onMetaChange, onParentChange,
}: Props) {
  const [open, setOpen] = useState<"meta" | "parent" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentMeta = metas.find(m => m.id === metaId);
  const currentParent = parentId ? tasks.find(t => t.data.id === parentId) : null;
  const metaName = currentMeta?.title || "Sin meta";
  const parentName = currentParent?.data.title || currentParent?.data.label || "(sin nombre)";

  const tasksInMeta = useMemo(() => {
    if (!metaId) return [];
    return tasks.filter(t => t.data.metaId === metaId && !t.deleted_at);
  }, [tasks, metaId]);

  const validParents = useMemo(() => {
    if (!metaId) return [];
    const descendants = collectDescendantIds(tasks, taskId, metaId);
    return tasksInMeta
      .filter(t => t.data.id !== taskId && !descendants.has(t.data.id))
      .sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));
  }, [tasksInMeta, tasks, taskId, metaId]);

  return (
    <div ref={containerRef} className="relative flex gap-1" data-no-drag>
      {/* Meta button */}
      <button
        type="button"
        onClick={() => setOpen(open === "meta" ? null : "meta")}
        className="flex-1 flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 min-w-0"
        title="Cambiar meta"
      >
        <span className="text-slate-400 shrink-0 text-[10px]">META</span>
        <span className="truncate font-medium">{metaName}</span>
      </button>

      {/* Parent button */}
      <button
        type="button"
        onClick={() => setOpen(open === "parent" ? null : "parent")}
        className="flex-1 flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 min-w-0"
        title="Cambiar tarea padre"
      >
        <span className="text-slate-400 shrink-0">↳</span>
        <span className="truncate">{parentId ? parentName : "Principal"}</span>
      </button>

      {/* Meta dropdown */}
      {open === "meta" && (
        <div className="absolute top-full left-0 z-50 mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1 max-h-52 overflow-y-auto">
          {metas.length === 0 && (
            <span className="block px-3 py-2 text-xs text-slate-400">Sin metas</span>
          )}
          {metas.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onMetaChange(m.id); setOpen(null); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 truncate ${m.id === metaId ? "font-semibold text-blue-600" : "text-slate-700"}`}
            >
              {m.title}
            </button>
          ))}
        </div>
      )}

      {/* Parent dropdown */}
      {open === "parent" && (
        <div className="absolute top-full right-0 z-50 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1 max-h-52 overflow-y-auto">
          <button
            type="button"
            onClick={() => { onParentChange(null); setOpen(null); }}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 ${!parentId ? "font-semibold text-blue-600" : "text-slate-700"}`}
          >
            Principal
          </button>
          {validParents.map(t => (
            <button
              key={t.data.id}
              type="button"
              onClick={() => { onParentChange(t.data.id); setOpen(null); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 truncate ${t.data.id === parentId ? "font-semibold text-blue-600" : "text-slate-600"}`}
              style={{ paddingLeft: `${Math.min((t.data.level ?? 0) * 8 + 12, 48)}px` }}
            >
              {t.data.title || t.data.label || "(sin nombre)"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import type { MultiItem } from "@/src/lib/types";
import { sortMultiItems, reorderAfterToggle } from "@/src/lib/multiHelpers";

const DRAG_THRESHOLD = 5;

interface MultiItemsInlineProps {
  /** Items visibles (pueden estar filtrados si hideDone). Se usan para display y drag. */
  items: MultiItem[];
  /** Lista completa para reorderAfterToggle al marcar done. Si no se pasa, se usa items. */
  allItems?: MultiItem[];
  parentTaskId: string;
  onAddItem: (title: string) => void;
  onRename: (itemId: string, title: string) => void;
  onConvertItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onReorder: (items: MultiItem[]) => void;
  onDragStart: (itemId: string) => void;
  onDragEnd: () => void;
}

/**
 * Bloque expandido de mini-tareas MULTI: composer + lista con drag & drop.
 *
 * Drag desde toda la fila (excepto botones/inputs).
 * Click en texto (sin arrastrar) abre inline edit — decidido en pointerUp,
 * no en onClick, porque setPointerCapture impide que click llegue al span.
 */
export default function MultiItemsInline({
  items,
  allItems,
  parentTaskId,
  onAddItem,
  onRename,
  onConvertItem,
  onDeleteItem,
  onReorder,
  onDragStart,
  onDragEnd,
}: MultiItemsInlineProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inlineEditInputRef = useRef<HTMLTextAreaElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const itemRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

  // Drag-vs-click tracking
  const didDragMiniRef = useRef(false);
  const clickCandidateRef = useRef<{ itemId: string; startedOnText: boolean } | null>(null);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  // Drag state
  const [dragState, setDragState] = useState<{
    itemId: string;
    startX: number;
    startY: number;
    pointerId: number;
    isActive: boolean;
    offsetX: number;
    offsetY: number;
    ghostWidth: number;
  } | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  useEffect(() => setDraft(""), [parentTaskId]);

  // Focus + select cuando se abre el editor
  useEffect(() => {
    if (editingId) {
      requestAnimationFrame(() => {
        inlineEditInputRef.current?.focus();
        inlineEditInputRef.current?.select();
      });
    }
  }, [editingId]);

  // Auto-grow del textarea según contenido
  useLayoutEffect(() => {
    const el = inlineEditInputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  }, [editingId, draftTitle]);

  const handleSubmit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    onAddItem(text);
    setDraft("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [draft, onAddItem]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft("");
    }
  }, [handleSubmit]);

  const sorted = sortMultiItems(items);

  const computeDropIndex = useCallback((clientY: number): number | null => {
    if (!listContainerRef.current) return null;
    const containerRect = listContainerRef.current.getBoundingClientRect();
    if (clientY < containerRect.top || clientY > containerRect.bottom) return null;
    const ids = sorted.map(i => i.id);
    for (let i = 0; i < ids.length; i++) {
      const el = itemRefsMap.current.get(ids[i]);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY < rect.top) return i;
      if (clientY <= rect.bottom) {
        const ratioY = (clientY - rect.top) / rect.height;
        return ratioY < 0.5 ? i : i + 1;
      }
    }
    return ids.length;
  }, [sorted]);

  // ---- Pointer handlers (en la fila del mini-item) ----

  const handlePointerDown = useCallback((e: React.PointerEvent, itemId: string) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, select, a, [data-no-drag], [data-inline-editor]")) return;
    e.stopPropagation();

    const startedOnText = !!target.closest("[data-mini-title]");
    clickCandidateRef.current = { itemId, startedOnText };
    didDragMiniRef.current = false;

    const el = itemRefsMap.current.get(itemId);
    const rect = el?.getBoundingClientRect();
    const offsetX = rect ? e.clientX - rect.left : 0;
    const offsetY = rect ? e.clientY - rect.top : 0;
    const ghostWidth = rect?.width ?? 200;

    setDragState({
      itemId,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      isActive: false,
      offsetX,
      offsetY,
      ghostWidth,
    });
    setGhostPos({ x: e.clientX, y: e.clientY });
    setDropIndex(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (!dragState.isActive && distance > DRAG_THRESHOLD) {
      didDragMiniRef.current = true;
      onDragStart(dragState.itemId);
      setDragState(prev => prev ? { ...prev, isActive: true } : null);
    }
    if (dragState.isActive || distance > DRAG_THRESHOLD) {
      setGhostPos({ x: e.clientX, y: e.clientY });
      const idx = computeDropIndex(e.clientY);
      setDropIndex(idx);
    }
  }, [dragState, computeDropIndex, onDragStart]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(dragState.pointerId);
    const wasActive = dragState.isActive;
    const itemId = dragState.itemId;
    const candidate = clickCandidateRef.current;

    // Limpiar estado de drag
    setDragState(null);
    setGhostPos(null);
    setDropIndex(null);
    clickCandidateRef.current = null;

    if (wasActive) {
      // Drag real — reordenar + notificar padre
      onDragEnd();
      setTimeout(() => { didDragMiniRef.current = false; }, 0);
      const idx = computeDropIndex(e.clientY);
      if (idx === null) return;
      const fromIdx = sorted.findIndex(i => i.id === itemId);
      if (fromIdx === -1) return;
      let toIdx = idx;
      if (toIdx > fromIdx) toIdx--;
      if (toIdx === fromIdx) return;
      const reordered = [...sorted];
      const [removed] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, removed);
      const withNewOrder = reordered.map((it, i) => ({ ...it, order: (i + 1) * 1000 }));
      onReorder(withNewOrder);
    } else {
      // Click sin drag — abrir editor si fue sobre el texto
      if (candidate?.startedOnText) {
        const item = sorted.find(i => i.id === candidate.itemId);
        if (item) {
          setEditingId(item.id);
          setDraftTitle(item.title);
        }
      }
    }
  }, [dragState, sorted, computeDropIndex, onDragEnd, onReorder]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    if (dragState) {
      (e.currentTarget as HTMLElement).releasePointerCapture(dragState.pointerId);
      const wasActive = dragState.isActive;
      setDragState(null);
      setGhostPos(null);
      setDropIndex(null);
      clickCandidateRef.current = null;
      if (wasActive) {
        onDragEnd();
      }
      setTimeout(() => { didDragMiniRef.current = false; }, 0);
    }
  }, [dragState, onDragEnd]);

  // ---- Inline edit helpers ----

  const cancelRename = useCallback(() => {
    setEditingId(null);
    setDraftTitle("");
  }, []);

  const commitRename = useCallback(() => {
    const newTitle = draftTitle.trim();
    if (!newTitle) {
      cancelRename();
      return;
    }
    if (editingId && newTitle !== (sorted.find(i => i.id === editingId)?.title ?? "")) {
      onRename(editingId, newTitle);
    }
    cancelRename();
  }, [draftTitle, editingId, sorted, onRename, cancelRename]);

  return (
    <div className="pl-10 pr-3 pb-1">
      <div className="flex gap-2 mb-2">
        <input
          ref={inputRef}
          data-no-drag
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Añadir mini-tarea"
          className="flex-1 min-w-0 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          data-no-drag
          type="button"
          onClick={(e) => { e.stopPropagation(); handleSubmit(); }}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-800 transition-colors text-sm font-medium"
          title="Añadir mini-tarea"
        >
          +
        </button>
      </div>
      <div ref={listContainerRef}>
        {sorted.map((item, idx) => (
          <React.Fragment key={item.id}>
            {dropIndex === idx && (
              <div className="h-0.5 rounded bg-blue-400 my-[5px] -mx-2" data-no-drag />
            )}
            <div
              ref={(el) => {
                if (el) itemRefsMap.current.set(item.id, el);
                else itemRefsMap.current.delete(item.id);
              }}
              data-mini-item
              onPointerDown={(e) => handlePointerDown(e, item.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              className={`group/mini flex items-start gap-2 py-[3px] text-sm cursor-grab active:cursor-grabbing touch-none ${
                dragState?.itemId === item.id && dragState?.isActive ? "opacity-30" : ""
              }`}
            >
          {/* Checkbox — toggle done (reordena al final del grupo vía onReorder) */}
          <button
            data-no-drag
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const full = allItems ?? items;
              const nextItems = reorderAfterToggle(full, item.id, !item.done);
              onReorder(nextItems);
            }}
            className={`flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors mt-0.5 ${
              item.done
                ? "bg-slate-100 border-slate-300 text-slate-400"
                : "border-slate-300 text-slate-400 hover:border-slate-400 hover:bg-slate-50"
            }`}
            title={item.done ? "Marcar como pendiente" : "Marcar como completada"}
          >
            {item.done ? "✓" : ""}
          </button>

          {/* Título — inline edit cuando editingId coincide */}
          {editingId === item.id ? (
            <div className="flex-1 min-w-0">
              <textarea
                ref={inlineEditInputRef}
                data-no-drag
                data-inline-editor
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                  else if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
                }}
                onBlur={commitRename}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                rows={1}
                className="w-full min-w-0 resize-none whitespace-pre-wrap break-words leading-snug overflow-hidden px-1 py-0.5 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/50"
              />
            </div>
          ) : (
            <span
              data-mini-title
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setEditingId(item.id);
                  setDraftTitle(item.title);
                }
              }}
              className={`flex-1 min-w-0 whitespace-normal break-words cursor-text text-left ${
                item.done ? "line-through text-slate-400" : "text-slate-600"
              }`}
            >
              {item.title}
            </span>
          )}

          {/* Acciones hover */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover/mini:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
            <button
              data-no-drag
              onClick={(e) => { e.stopPropagation(); onConvertItem(item.id); }}
              title="Convertir en tarea normal"
              className="w-6 h-6 rounded text-[10px] font-medium text-slate-400 hover:bg-blue-50 hover:text-blue-600 hover:w-7 hover:h-7 hover:text-sm transition-all duration-150 flex items-center justify-center"
            >
              +A
            </button>
            <button
              data-no-drag
              onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id); }}
              title="Eliminar mini-tarea"
              className="w-6 h-6 rounded text-[10px] text-slate-400 hover:bg-red-50 hover:text-red-600 hover:w-7 hover:h-7 hover:text-sm transition-all duration-150 flex items-center justify-center"
            >
              ×
            </button>
          </div>
        </div>
          </React.Fragment>
        ))}
        {dropIndex === sorted.length && sorted.length > 0 && (
          <div className="h-0.5 rounded bg-blue-400 my-[5px] -mx-2" data-no-drag />
        )}
      </div>

      {/* Ghost flotante — estilo consistente con drag de tareas principales */}
      {typeof document !== "undefined" &&
        dragState?.isActive &&
        ghostPos &&
        (() => {
          const item = sorted.find(i => i.id === dragState!.itemId);
          if (!item) return null;
          return ReactDOM.createPortal(
            <div
              className="fixed pointer-events-none z-[9999]"
              style={{
                left: ghostPos.x - dragState!.offsetX,
                top: ghostPos.y - dragState!.offsetY,
                width: dragState!.ghostWidth,
                transform: "scale(1.02)",
              }}
            >
              <div className="flex items-start gap-2 py-[3px] px-2 text-sm bg-white rounded-lg border-2 border-blue-400 shadow-xl opacity-90">
                <span
                  className={`flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center mt-0.5 ${
                    item.done ? "bg-slate-100 border-slate-300 text-slate-400" : "border-slate-300"
                  }`}
                >
                  {item.done ? "✓" : ""}
                </span>
                <span
                  className={`flex-1 min-w-0 whitespace-normal break-words ${
                    item.done ? "line-through text-slate-400" : "text-slate-600"
                  }`}
                >
                  {item.title}
                </span>
              </div>
            </div>,
            document.body
          );
        })()}
    </div>
  );
}

import type { MultiItem } from "./types";

/** Calcula progreso de mini-tareas: cuántas hechas / total */
export function computeMultiProgress(items: MultiItem[]): {
  doneCount: number;
  totalCount: number;
  label: string;
} {
  const totalCount = items.length;
  const doneCount = items.filter(i => i.done).length;
  return { doneCount, totalCount, label: `${doneCount}/${totalCount}` };
}

/** Devuelve copia ordenada: undone primero, done después; dentro de cada grupo por order asc, tie-break por id */
export function sortMultiItems(items: MultiItem[]): MultiItem[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}

/** Reordena tras toggle done: item va al final de su grupo (undone o done) y se reasignan orders en pasos 1000 */
export function reorderAfterToggle(items: MultiItem[], toggledId: string, nextDone: boolean): MultiItem[] {
  const undone = items.filter(i => !i.done);
  const done = items.filter(i => i.done);
  const toggled = items.find(i => i.id === toggledId);
  if (!toggled) return items;

  const updated = items.map(i =>
    i.id === toggledId ? { ...i, done: nextDone } : i
  );

  const newUndone = updated.filter(i => !i.done).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const newDone = updated.filter(i => i.done).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const result: MultiItem[] = [
    ...newUndone.map((it, idx) => ({ ...it, order: (idx + 1) * 1000 })),
    ...newDone.map((it, idx) => ({ ...it, order: (newUndone.length + idx + 1) * 1000 })),
  ];
  return result;
}

"use client";

import React from "react";
import { useCallback, useRef, useEffect, useState, useMemo, useLayoutEffect } from "react";
import ReactDOM from "react-dom";
import type { TaskRow, TaskData, Meta, BankAccount, ForecastLine, Label, UITaskType, TaskExtra } from "@/src/lib/types";
import { getUIType, UI_TYPE_MAPPING } from "@/src/lib/types";
import { generateTaskId, createTaskFromTemplate, buildNewTaskData, getReminderDisplay } from "@/src/lib/tasks";

// ==================== CONSTANTES DE LAYOUT ====================

const META_NODE_W = 420;
const META_NODE_H = 44;
const TASK_NODE_W = 820;
const TASK_NODE_MIN_H = 36;   // Altura mínima compacta
const EDIT_PANEL_H = 340;
const INDENT_X = 56;
const GAP_Y = 6;              // Espacio vertical compacto entre nodos
const CONNECTOR_RADIUS = 4;

// ==================== TIPOS ====================

interface Props {
  tasks: TaskRow[];
  metas: Meta[];
  bankAccounts: BankAccount[];
  forecastLines: ForecastLine[];
  labels: Label[];
  onCreateTask: (taskData: TaskData) => Promise<{ success: boolean; error?: string }>;
  onUpdateTask: (id: string, taskData: Partial<TaskData>) => Promise<{ success: boolean; error?: string }>;
  onDeleteTask: (id: string) => Promise<{ success: boolean; error?: string }>;
  onRestoreTask: (id: string) => Promise<{ success: boolean; error?: string }>;
  onOpenMetaModal: (meta: Meta | null) => void;
  onReorderMetas?: (reorderedMetas: Meta[]) => void;
  onToggleMetaActive?: (metaId: string, isActive: boolean) => Promise<{ success: boolean; error?: string }>;
}

type WeekdayCode = "L" | "M" | "X" | "J" | "V" | "S" | "D";
const WEEKDAY_CODES: WeekdayCode[] = ["L", "M", "X", "J", "V", "S", "D"];

interface TreeNode {
  id: string;
  task: TaskRow | null; // null para nodo meta
  children: TreeNode[];
  // Posiciones calculadas
  x: number;
  y: number;
  w: number;
  h: number;
  subtreeHeight: number;
}

interface LayoutResult {
  nodes: Map<string, TreeNode>;
  edges: Array<{ from: string; to: string }>;
  totalWidth: number;
  totalHeight: number;
}

interface EditPanelPortalProps {
  task: TaskRow;
  anchorEl: HTMLDivElement | null | undefined;
  renderContent: (task: TaskRow) => React.ReactNode;
}

type SubUnit = "min" | "hor" | "pasos" | "pag" | "kg" | "km";

type SubTagConfigEntry = {
  units: SubUnit[];
  defaultUnit: SubUnit;
  defaults: Partial<Record<SubUnit, number>>;
};

type SubTagConfig = {
  FISICO: Record<string, SubTagConfigEntry>;
  CRECIMIENTO: Record<string, SubTagConfigEntry>;
};

const SUB_TAG_CONFIG: SubTagConfig = {
  FISICO: {
    gym:      { units: ["min", "hor"],         defaultUnit: "hor", defaults: { min: 60, hor: 1 } },
    correr:   { units: ["min", "hor", "km"],   defaultUnit: "min", defaults: { min: 45, hor: 1, km: 5 } },
    andar:    { units: ["min", "hor", "km"],   defaultUnit: "min", defaults: { min: 60, hor: 1, km: 5 } },
    peso:     { units: ["kg"],                 defaultUnit: "kg",  defaults: { kg: 50 } },
    descanso: { units: ["min", "hor"],         defaultUnit: "hor", defaults: { min: 30, hor: 8 } },
  },
  CRECIMIENTO: {
    estudiar: { units: ["min", "hor", "pag"],  defaultUnit: "hor", defaults: { min: 60, hor: 1, pag: 40 } },
    leer:     { units: ["min", "hor", "pag"],  defaultUnit: "hor", defaults: { min: 30, hor: 1, pag: 40 } },
    idiomas:  { units: ["min", "hor", "pag"],  defaultUnit: "hor", defaults: { min: 30, hor: 1, pag: 40 } },
    practica: { units: ["min", "hor"],         defaultUnit: "hor", defaults: { min: 30, hor: 1 } },
  },
};

type LabelCfg = {
  showQuantity: boolean;
  allowedUnits: SubUnit[];
  defaultUnit?: SubUnit;
  defaultQuantity?: number;
  defaultsByUnit?: Partial<Record<SubUnit, number>>;
};

const FALLBACK_LABEL_CFG: LabelCfg = {
  showQuantity: true,
  allowedUnits: ["min", "hor"],
  defaultUnit: "min",
  defaultQuantity: 30,
  defaultsByUnit: { min: 30, hor: 1 },
};

const LABEL_DEFAULTS: Record<string, LabelCfg> = {
  comida: { showQuantity: false, allowedUnits: [], defaultUnit: "min", defaultQuantity: 0 },
  correr: { showQuantity: true, allowedUnits: ["min", "hor", "km"], defaultUnit: "min", defaultsByUnit: { min: 45, hor: 1, km: 5 } },
  andar:  { showQuantity: true, allowedUnits: ["min", "hor", "km"], defaultUnit: "min", defaultsByUnit: { min: 60, hor: 1, km: 5 } },
  gym:    { showQuantity: true, allowedUnits: ["min", "hor"],       defaultUnit: "hor", defaultsByUnit: { min: 60, hor: 1 } },
  peso:   { showQuantity: true, allowedUnits: ["kg"],               defaultUnit: "kg",  defaultsByUnit: { kg: 50 } },
  descanso: { showQuantity: true, allowedUnits: ["min", "hor"],     defaultUnit: "hor", defaultsByUnit: { min: 30, hor: 8 } },
  estudiar: { showQuantity: true, allowedUnits: ["min", "hor"],     defaultUnit: "hor", defaultsByUnit: { min: 60, hor: 1 } },
  leer:     { showQuantity: true, allowedUnits: ["min", "hor"],     defaultUnit: "hor", defaultsByUnit: { min: 30, hor: 1 } },
  idiomas:  { showQuantity: true, allowedUnits: ["min", "hor"],     defaultUnit: "hor", defaultsByUnit: { min: 30, hor: 1 } },
  practica: { showQuantity: true, allowedUnits: ["min", "hor"],     defaultUnit: "hor", defaultsByUnit: { min: 30, hor: 1 } },
};

// ==================== HELPERS ====================

function getTodayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function formatNumberES(n: number): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "0";
  // Si es entero, sin decimales
  if (Number.isInteger(n)) {
    return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n);
  }
  // Si tiene decimales, max 2, sin ceros finales
  const formatted = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(n);
  // Quitar cero final si termina en ",X0"
  return formatted.replace(/,(\d)0$/, ",$1");
}

function formatEURCompact(amount?: number): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return "0 €";
  return `${formatNumberES(amount)} €`;
}

function formatEUR(amount?: number): string {
  return formatEURCompact(amount);
}

function getInlinePrimaryText(
  data: TaskData,
  _bankAccounts: BankAccount[],
  _forecastLines: ForecastLine[]
): string {
  const isFinance = data.type === "INGRESO" || data.type === "GASTO";
  const physLike = isPhysLike(data);

  const title = (data.title || "").trim();
  const label = (data.label || "").trim();
  const base = title || label || "Sin nombre";

  // Para finanzas: solo el título base (amount/banco/previsión se muestran aparte)
  if (isFinance) {
    return base;
  }

  // Para físicas: solo el título base (quantity+unit se muestran aparte en columna derecha)
  if (physLike) {
    return base;
  }

  // Actividad / otros
  return `${base}`.trim();
}

function formatDateShort(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const date = new Date(isoDate + "T00:00:00");
  const day = date.getDate();
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${day} ${months[date.getMonth()]}`;
}

function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  return time.slice(0, 5);
}

function isTaskUnscheduled(data: TaskData): boolean {
  if (data.extra?.unscheduled === true) return true;
  if (data.extra?.unscheduled === false) return false;
  if (data.extra?.frequency) return false;
  return !data.date && !data.repeatRule;
}

function getScheduleDisplay(data: TaskData): string {
  if (isTaskUnscheduled(data)) return "Sin programar";
  
  const freq = data.extra?.frequency;
  if (freq === "SEMANAL") {
    const days = (data.extra?.weeklyDays as WeekdayCode[]) || [];
    const time = data.extra?.weeklyTime;
    if (days.length === 0) return "Semanal";
    return time ? `${days.join(" ")} · ${formatTime(time)}` : days.join(" ");
  }
  if (freq === "MENSUAL") {
    const day = data.extra?.monthlyDay || 1;
    const time = data.extra?.monthlyTime;
    return time ? `Día ${day} · ${formatTime(time)}` : `Día ${day}`;
  }
  // Puntual
  const dateStr = formatDateShort(data.date);
  const time = data.time;
  return time ? `${dateStr} · ${formatTime(time)}` : dateStr || formatDateShort(getTodayISO());
}

function normalizeWeeklyDays(weeklyDays: unknown): WeekdayCode[] {
  if (!Array.isArray(weeklyDays)) return [];
  if (weeklyDays.length === 0) return [];
  if (typeof weeklyDays[0] === "string") {
    return weeklyDays.filter((d): d is WeekdayCode => WEEKDAY_CODES.includes(d as WeekdayCode));
  }
  if (typeof weeklyDays[0] === "number") {
    return weeklyDays
      .filter((i): i is number => typeof i === "number" && i >= 0 && i < 7)
      .map(i => WEEKDAY_CODES[i]);
  }
  return [];
}

function buildWeeklyRepeatRule(weeklyDays: WeekdayCode[], weeklyTime?: string): string {
  return `WEEKLY|days=${weeklyDays.join(",")}|time=${weeklyTime || ""}`;
}

function buildMonthlyRepeatRule(monthlyDay: number, monthlyTime?: string): string {
  return `MONTHLY|day=${monthlyDay}|time=${monthlyTime || ""}`;
}

function EditPanelPortal({ task, anchorEl, renderContent }: EditPanelPortalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const computePosition = useCallback(() => {
    if (!anchorEl) return;
  
    const rect = anchorEl.getBoundingClientRect();
    const panelRect = panelRef.current?.getBoundingClientRect();
    const panelWidth = panelRect?.width ?? TASK_NODE_W;
    const panelHeight = panelRect?.height ?? EDIT_PANEL_H;
  
    const margin = 8;
  
    // X clamp
    let left = rect.left;
    left = Math.min(left, window.innerWidth - panelWidth - margin);
    left = Math.max(margin, left);
  
    // Preferir ABAJO
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
  
    let top: number;
  
    if (spaceBelow >= panelHeight) {
      top = rect.bottom + margin;
    } else if (spaceAbove >= panelHeight) {
      top = rect.top - panelHeight - margin;
    } else {
      // no cabe completo en ninguno -> donde haya más espacio, y clamp
      const preferAbove = spaceAbove > spaceBelow;
      top = preferAbove ? rect.top - panelHeight - margin : rect.bottom + margin;
      top = Math.min(Math.max(margin, top), window.innerHeight - panelHeight - margin);
    }
  
    setStyle({ top, left });
  }, [anchorEl]);
  

  useLayoutEffect(() => {
    computePosition();
    window.addEventListener("resize", computePosition);
    window.addEventListener("scroll", computePosition, true);
    return () => {
      window.removeEventListener("resize", computePosition);
      window.removeEventListener("scroll", computePosition, true);
    };
  }, [computePosition]);

  if (!anchorEl) return null;

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      data-edit-panel
      data-no-drag
      className="fixed bg-white rounded-lg border border-blue-400 shadow-lg p-4 z-[9999]"
      style={{ top: style.top, left: style.left, maxWidth: TASK_NODE_W }}
    >
      {renderContent(task)}
    </div>,
    document.body
  );
}

// Portal para chips inline (banco/previsiones/días)
interface InlineChipsPortalProps {
  anchorEl: HTMLElement | null;
  children: React.ReactNode;
}

function InlineChipsPortal({ anchorEl, children }: InlineChipsPortalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 300 });

  const computePosition = useCallback(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const margin = 4;
    let top = rect.bottom + margin;
    let left = rect.left;
    const width = Math.min(rect.width, 500);
    
    // Clamp para no salir de pantalla
    if (left + width > window.innerWidth - 8) {
      left = window.innerWidth - width - 8;
    }
    if (left < 8) left = 8;
    if (top + 100 > window.innerHeight) {
      top = rect.top - 100 - margin;
    }
    
    setStyle({ top, left, width });
  }, [anchorEl]);

  useLayoutEffect(() => {
    computePosition();
    window.addEventListener("resize", computePosition);
    window.addEventListener("scroll", computePosition, true);
    return () => {
      window.removeEventListener("resize", computePosition);
      window.removeEventListener("scroll", computePosition, true);
    };
  }, [computePosition]);

  if (!anchorEl) return null;

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      data-inline-editor
      data-no-drag
      className="fixed bg-white rounded-md border border-slate-200 shadow-lg p-2 z-[9999]"
      style={{ top: style.top, left: style.left, minWidth: style.width }}
    >
      {children}
    </div>,
    document.body
  );
}

function ensureScoringItemExists(category: "phys" | "know", label: string, initialPoints?: number): Promise<{ points?: number } | void> {
  // Placeholder/compatibilidad: en móvil existe; aquí evitamos romper compilación.
  return Promise.resolve({ points: initialPoints });
}

function normalizeLabelKey(label?: string): string {
  return (label || "").trim().toLowerCase();
}

function getSubTagCfg(scope: TaskData["scope"] | undefined, labelKey: string): SubTagConfigEntry | null {
  if (!scope || !labelKey) return null;
  const scopedCfg = SUB_TAG_CONFIG[scope as keyof SubTagConfig];
  if (!scopedCfg) return null;
  return scopedCfg[labelKey] || null;
}

function coerceUnitFromLegacy(unit?: string | null): SubUnit | undefined {
  if (!unit) return undefined;
  if (unit === "h") return "hor";
  const known: SubUnit[] = ["min", "hor", "pasos", "pag", "kg", "km"];
  return known.includes(unit as SubUnit) ? (unit as SubUnit) : undefined;
}

function applySubTagDefaults(params: {
  scope?: TaskData["scope"];
  labelName?: string;
  currentUnit?: string | null;
  currentQty?: number;
}) {
  const { scope, labelName, currentUnit, currentQty } = params;
  const labelKey = normalizeLabelKey(labelName);
  const cfg = getSubTagCfg(scope, labelKey);

  const coercedUnit = coerceUnitFromLegacy(currentUnit);
  const units = cfg?.units || [];

  let unit: SubUnit | undefined = coercedUnit;
  if (!unit || (cfg && !units.includes(unit))) {
    unit = cfg?.defaultUnit ?? coercedUnit;
  }

  let quantity = currentQty;
  if (cfg) {
    if (!unit || !units.includes(unit)) {
      unit = cfg.defaultUnit;
    }
    const defaultForUnit = cfg.defaults[unit];
    if (quantity === undefined || quantity === null || Number.isNaN(quantity) || defaultForUnit === undefined) {
      quantity = defaultForUnit ?? quantity;
    }
  }

  const detailsField = scope === "CRECIMIENTO" ? "knowledgeDetails" : "physicalDetails";
  const details =
    scope === "FISICO" || scope === "CRECIMIENTO"
      ? { kind: scope, label: labelKey, unit, value: quantity }
      : undefined;

  return { labelKey, unit, quantity, details, detailsField };
}

function isPhysLike(data: TaskData | Partial<TaskData> | undefined): boolean {
  return !!data && data.type === "ACTIVIDAD" && (data.scope === "FISICO" || data.scope === "CRECIMIENTO");
}

function isFoodLabel(name?: string): boolean {
  return normalizeLabelKey(name) === "comida";
}

function getLabelCfg(labelName?: string): LabelCfg {
  const key = normalizeLabelKey(labelName);
  return LABEL_DEFAULTS[key] || FALLBACK_LABEL_CFG;
}

// ==================== ALGORITMO DE LAYOUT ====================

function buildTreeStructure(tasks: TaskRow[], metaId: string): TreeNode {
  const metaTasks = tasks.filter(t => t.data.metaId === metaId && !t.data.deletedAt);
  const taskMap = new Map<string, TaskRow>(metaTasks.map(t => [t.data.id, t]));
  const childrenMap = new Map<string, TaskRow[]>();
  const roots: TaskRow[] = [];

  metaTasks.forEach(task => {
    const parentId = task.data.parentId;
    if (parentId && taskMap.has(parentId)) {
      const children = childrenMap.get(parentId) || [];
      children.push(task);
      childrenMap.set(parentId, children);
    } else {
      roots.push(task);
    }
  });

  const sortTasks = (a: TaskRow, b: TaskRow) => {
    const orderA = a.data.order ?? 0;
    const orderB = b.data.order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return (a.data.createdAt || "").localeCompare(b.data.createdAt || "");
  };

  const buildNode = (task: TaskRow): TreeNode => {
    const children = (childrenMap.get(task.data.id) || []).sort(sortTasks);
    return {
      id: task.data.id,
      task,
      children: children.map(buildNode),
      x: 0, y: 0, w: TASK_NODE_W, h: TASK_NODE_MIN_H, subtreeHeight: 0,
    };
  };

  // Nodo raíz = meta
  return {
    id: `meta_${metaId}`,
    task: null,
    children: roots.sort(sortTasks).map(buildNode),
    x: 0, y: 0, w: META_NODE_W, h: META_NODE_H, subtreeHeight: 0,
  };
}

function calculateLayout(
  root: TreeNode, 
  editingTaskId: string | null,
  collapsedById: Record<string, boolean>,
  measuredHeights: Record<string, number>,
  baseX: number = 32,
  baseY: number = 32
): LayoutResult {
  const nodes = new Map<string, TreeNode>();
  const edges: Array<{ from: string; to: string }> = [];

  // Cursor Y global - crece solo hacia abajo en preorden
  let cursorY = baseY;

  // Recorrido en preorden: padre primero, luego hijos (si no está colapsado)
  function positionPreorder(node: TreeNode, level: number) {
    const isEditing = node.task && node.task.data.id === editingTaskId;
    const taskId = node.task?.data.id;
    const isCollapsed = taskId ? collapsedById[taskId] : false;
    
    // Posicionar este nodo
    node.x = baseX + level * INDENT_X;
    node.y = cursorY;
    node.w = node.task ? TASK_NODE_W : META_NODE_W;
    // Usar altura medida si existe, sino mínimo
    node.h = node.task 
      ? (taskId && measuredHeights[taskId] ? measuredHeights[taskId] : TASK_NODE_MIN_H)
      : META_NODE_H;
    
    nodes.set(node.id, node);

    // Avanzar cursor después del nodo
    cursorY += node.h + GAP_Y;

    // Procesar hijos solo si NO está colapsado
    if (!isCollapsed) {
      node.children.forEach(child => {
        edges.push({ from: node.id, to: child.id });
        positionPreorder(child, level + 1);
      });
    }
  }

  positionPreorder(root, 0);

  // Calcular dimensiones totales
  let maxX = 0, maxY = 0;
  nodes.forEach(n => {
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  });

  return {
    nodes,
    edges,
    totalWidth: maxX + 80,
    totalHeight: Math.max(maxY + 80, cursorY + 40),
  };
}

function calculateInsertOrder(siblings: TaskRow[], position: "before" | "after", referenceTask?: TaskRow): number {
  if (siblings.length === 0) return 1000;
  const sorted = [...siblings].sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));
  if (!referenceTask) return (sorted[sorted.length - 1].data.order ?? 0) + 1000;

  const refIndex = sorted.findIndex(t => t.data.id === referenceTask.data.id);
  if (refIndex === -1) return (sorted[sorted.length - 1].data.order ?? 0) + 1000;

  if (position === "before") {
    if (refIndex === 0) return (sorted[0].data.order ?? 0) - 1000;
    const prevOrder = sorted[refIndex - 1].data.order ?? 0;
    const currOrder = sorted[refIndex].data.order ?? 0;
    return Math.floor((prevOrder + currOrder) / 2);
  } else {
    if (refIndex === sorted.length - 1) return (sorted[refIndex].data.order ?? 0) + 1000;
    const currOrder = sorted[refIndex].data.order ?? 0;
    const nextOrder = sorted[refIndex + 1].data.order ?? 0;
    return Math.floor((currOrder + nextOrder) / 2);
  }
}

// ==================== COMPONENTE PRINCIPAL ====================

export default function TaskDiagramTree({
  tasks, metas, bankAccounts, forecastLines, labels,
  onCreateTask, onUpdateTask, onDeleteTask, onRestoreTask, onOpenMetaModal, onReorderMetas, onToggleMetaActive
}: Props) {
  type UndoEntry =
    | { kind: "update"; taskId: string; data: TaskData }
    | { kind: "delete"; taskId: string; prev: TaskData };

  const [selectedMetaId, setSelectedMetaId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<Partial<TaskData>>({});
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [undoToast, setUndoToast] = useState<{ entry: UndoEntry; expiresAt: number } | null>(null);
  const [collapsedById, setCollapsedById] = useState<Record<string, boolean>>({});
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const [localLabels, setLocalLabels] = useState<Label[]>(labels);
  const [addingLabel, setAddingLabel] = useState<boolean>(false);
  const [newLabelName, setNewLabelName] = useState<string>("");

  // ==================== META DRAG STATE (Pointer Events) ====================
  const [metaDrag, setMetaDrag] = useState<{ id: string; startX: number; startY: number; pointerId: number; isDragActive: boolean } | null>(null);
  const [metaDragOverId, setMetaDragOverId] = useState<string | null>(null);
  const [metaReorderError, setMetaReorderError] = useState<string | null>(null);
  const [metaDragPos, setMetaDragPos] = useState<{ x: number; y: number } | null>(null);
  const [metaDragGhost, setMetaDragGhost] = useState<{ label: string; w: number; h: number; offsetX: number; offsetY: number } | null>(null);
  const [metaInsertSide, setMetaInsertSide] = useState<"before" | "after" | null>(null);
  const metaChipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const suppressMetaClickRef = useRef(false);
  const META_DRAG_THRESHOLD = 5;

  // ==================== INLINE EDIT STATE ====================
  type InlineField = "title" | "date" | "time" | "amount" | "bankAccountId" | "forecastLineId" | "repeatDays";
  const [inlineEdit, setInlineEdit] = useState<{
    taskId: string;
    field: InlineField;
    draft: string | number | WeekdayCode[];
    prev: string | number | WeekdayCode[] | undefined;
  } | null>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const didFocusInlineRef = useRef(false);
  const dateInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const inlineAnchorRef = useRef<HTMLElement | null>(null);
  const [inlineTimeInvalid, setInlineTimeInvalid] = useState(false);
  
  // Drag & drop state (pointer events)
  const [dragging, setDragging] = useState<{
    id: string;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    pointerId: number;
    isDragActive: boolean; // true cuando supera el umbral
  } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ targetId: string; position: "before" | "after" | "inside" } | null>(null);
  // UNICA FUENTE DE VERDAD: IDs de fuentes que tienen hijos (NO son hojas)
  const parentIdsWithChildren = useMemo(() => {
    const set = new Set<string>();
    forecastLines.forEach(f => {
      if (f.parentId) set.add(f.parentId);
    });
    return set;
  }, [forecastLines]);

  // SOLO HOJAS: fuentes que NO tienen hijos
  const onlyLeafForecasts = useMemo(
    () => forecastLines.filter(f => !parentIdsWithChildren.has(f.id)),
    [forecastLines, parentIdsWithChildren]
  );


  // Helper: buscar una fuente SOLO en hojas (para display seguro)
  const findLeafForecast = useCallback(
    (id: string | null | undefined) => id ? onlyLeafForecasts.find(f => f.id === id) : undefined,
    [onlyLeafForecasts]
  );

  // Legacy alias
  const hasForecastChildren = useCallback((id?: string) => !!(id && parentIdsWithChildren.has(id)), [parentIdsWithChildren]);
  
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const nodeRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const autoScrollRef = useRef<number | null>(null);

  // Toggle colapsar/expandir subtareas
  const toggleCollapse = useCallback((taskId: string) => {
    setCollapsedById(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  }, []);

  // Callback para medir altura de nodos (evita re-renders infinitos)
  const measureNodeHeight = useCallback((taskId: string, height: number) => {
    setMeasuredHeights(prev => {
      const current = prev[taskId] ?? TASK_NODE_MIN_H;
      // Solo actualizar si cambia más de 2px (evitar bucles)
      if (Math.abs(current - height) > 2) {
        return { ...prev, [taskId]: height };
      }
      return prev;
    });
  }, []);

  // Seleccionar primera meta
  useEffect(() => {
    if (!selectedMetaId && metas.length > 0) {
      setSelectedMetaId(metas[0].id);
    }
  }, [metas, selectedMetaId]);

  const selectedMeta = useMemo(() => metas.find(m => m.id === selectedMetaId), [metas, selectedMetaId]);

  useEffect(() => {
    setLocalLabels(labels);
  }, [labels]);

  // Construir árbol y calcular layout
  const layout = useMemo(() => {
    if (!selectedMetaId) return null;
    const tree = buildTreeStructure(tasks, selectedMetaId);
    return calculateLayout(tree, editingTaskId, collapsedById, measuredHeights);
  }, [tasks, selectedMetaId, editingTaskId, collapsedById, measuredHeights]);

  // Auto-focus en nombre al editar
  useEffect(() => {
    if (editingTaskId) {
      requestAnimationFrame(() => {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      });
    }
  }, [editingTaskId]);

  // Auto-focus inline input - SOLO una vez al abrir (no en cada cambio de draft)
  useEffect(() => {
    if (!inlineEdit) {
      didFocusInlineRef.current = false;
      return;
    }
    if (didFocusInlineRef.current) return;
    didFocusInlineRef.current = true;
    requestAnimationFrame(() => {
      inlineInputRef.current?.focus();
      inlineInputRef.current?.select();
    });
  }, [inlineEdit?.taskId, inlineEdit?.field]);

  // ==================== INLINE EDIT HELPERS ====================

  const normalizeTimeInput = (raw: string): { value: string | null } => {
    if (!raw) return { value: null };
    const trimmed = raw.trim();
    if (!trimmed) return { value: null };

    const cleaned = trimmed.replace(/[.\-\s]/g, ":");
    let hh = "";
    let mm = "";

    if (cleaned.includes(":")) {
      const [hPart, mPart = ""] = cleaned.split(":");
      hh = hPart;
      mm = mPart;
    } else {
      const digits = cleaned.replace(/\D/g, "");
      if (digits.length === 3) {
        hh = digits.slice(0, 1);
        mm = digits.slice(1);
      } else if (digits.length === 4) {
        hh = digits.slice(0, 2);
        mm = digits.slice(2);
      } else {
        return { value: null };
      }
    }

    if (hh === "" || mm === "") return { value: null };
    const hNum = Number(hh);
    const mNum = Number(mm);
    if (!Number.isInteger(hNum) || !Number.isInteger(mNum)) return { value: null };
    if (hNum < 0 || hNum > 23 || mNum < 0 || mNum > 59) return { value: null };

    const hNorm = hNum.toString().padStart(2, "0");
    const mNorm = mNum.toString().padStart(2, "0");
    return { value: `${hNorm}:${mNorm}` };
  };

  const openInline = useCallback((
    task: TaskRow,
    field: InlineField,
    initialDraft: string | number | WeekdayCode[],
    prevValue: string | number | WeekdayCode[] | undefined
  ) => {
    // Cerrar panel de edición si está abierto
    if (editingTaskId) {
      setEditingTaskId(null);
      setEditingData({});
    }
    if (field === "time") {
      setInlineTimeInvalid(false);
    }
    setInlineEdit({ taskId: task.data.id, field, draft: initialDraft, prev: prevValue });
  }, [editingTaskId]);

  const commitInline = useCallback(async () => {
    if (!inlineEdit) return;
    const task = tasks.find(t => t.data.id === inlineEdit.taskId);
    if (!task) {
      setInlineEdit(null);
      return;
    }

    const { field, draft } = inlineEdit;
    let updates: Partial<TaskData> = {};

    switch (field) {
      case "title":
        updates = { title: draft as string };
        break;
      case "date":
        updates = { 
          date: draft as string,
          extra: { ...task.data.extra, unscheduled: false, frequency: undefined }
        };
        break;
      case "time":
        {
          const normalized = normalizeTimeInput(String(draft));
          if (!normalized.value) {
            setInlineTimeInvalid(true);
            return;
          }
          setInlineTimeInvalid(false);
          const freq = task.data.extra?.frequency;
          if (freq === "SEMANAL") {
            updates = { extra: { ...task.data.extra, weeklyTime: normalized.value } };
          } else if (freq === "MENSUAL") {
            updates = { extra: { ...task.data.extra, monthlyTime: normalized.value } };
          } else {
            updates = { time: normalized.value };
          }
        }
        break;
      case "amount": {
        const amountStr = draft as string;
        const amountNum = amountStr === "" ? undefined : parseFloat(amountStr);
        const isFinancial = task.data.type === "INGRESO" || task.data.type === "GASTO";
        if (isFinancial) {
          updates = { extra: { ...task.data.extra, amountEUR: amountNum } };
        } else {
          // Para tareas físicas: actualizar quantity
          updates = { extra: { ...task.data.extra, quantity: amountNum } };
        }
        break;
      }
      case "bankAccountId":
        updates = { accountId: draft as string || undefined };
        break;
      case "forecastLineId":
        updates = { forecastId: draft as string || undefined };
        break;
      case "repeatDays":
        const days = draft as WeekdayCode[];
        updates = { 
          extra: { 
            ...task.data.extra, 
            frequency: "SEMANAL",
            weeklyDays: days,
            unscheduled: false
          }
        };
        break;
    }

    if (Object.keys(updates).length > 0) {
      setSavingTaskId(inlineEdit.taskId);
      await onUpdateTask(inlineEdit.taskId, updates);
      setSavingTaskId(null);
    }
    setInlineEdit(null);
  }, [inlineEdit, tasks, onUpdateTask]);

  const cancelInline = useCallback(() => {
    setInlineTimeInvalid(false);
    setInlineEdit(null);
  }, []);

  // Click outside para inline edit
  useEffect(() => {
    if (!inlineEdit) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-inline-editor]")) {
        if (inlineEdit.field === "time") {
          const normalized = normalizeTimeInput(String(inlineEdit.draft ?? ""));
          if (!normalized.value) {
            cancelInline();
          } else {
            commitInline();
          }
        } else {
          commitInline();
        }
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [inlineEdit, commitInline, cancelInline]);

  // ==================== HANDLERS ====================

  const startEdit = useCallback((task: TaskRow) => {
    setEditingTaskId(task.data.id);
    setEditingData({ ...task.data });
    setEditError(null);
    setUndoStack(prev => [...prev.slice(-10), { kind: "update", taskId: task.data.id, data: { ...task.data } }]);
  }, []);

  const saveChanges = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!editingTaskId) return { success: true };
    const task = tasks.find(t => t.data.id === editingTaskId);
    if (!task) return { success: true };

    const updates: Partial<TaskData> = {};
    const original = task.data;
    Object.keys(editingData).forEach(key => {
      const k = key as keyof TaskData;
      if (JSON.stringify(editingData[k]) !== JSON.stringify(original[k])) {
        (updates as Record<string, unknown>)[k] = editingData[k];
      }
    });

    if (Object.keys(updates).length === 0) return { success: true };
    setSavingTaskId(editingTaskId);
    const result = await onUpdateTask(editingTaskId, updates);
    setSavingTaskId(null);
    
    if (!result.success) {
      const errorMsg = result.error || "Error al guardar";
      setEditError(errorMsg);
      return { success: false, error: errorMsg };
    }
    setEditError(null);
    return { success: true };
  }, [editingTaskId, editingData, tasks, onUpdateTask]);

  const closeEdit = useCallback(async () => {
    if (editingTaskId && Object.keys(editingData).length > 0) {
      const result = await saveChanges();
      if (!result.success) {
        // No cerrar si hay error
        return;
      }
    }
    setEditingTaskId(null);
    setEditingData({});
    setEditError(null);
  }, [editingTaskId, editingData, saveChanges]);

  const cancelEdit = useCallback(() => {
    setEditingTaskId(null);
    setEditingData({});
    setEditError(null);
  }, []);

  const handleSaveAndClose = useCallback(async () => {
    const result = await saveChanges();
    if (result.success) {
      setEditingTaskId(null);
      setEditingData({});
      setEditError(null);
    }
  }, [saveChanges]);

  const handleDeleteTask = useCallback(async () => {
    if (!editingTaskId) return;
    const confirmed = window.confirm("¿Eliminar esta tarea? Esta acción no se puede deshacer.");
    if (!confirmed) return;

    setSavingTaskId(editingTaskId);
    const result = await onDeleteTask(editingTaskId);
    setSavingTaskId(null);

    if (!result.success) {
      setEditError(result.error || "Error al eliminar");
      return;
    }

    setEditingTaskId(null);
    setEditingData({});
    setEditError(null);
  }, [editingTaskId, onDeleteTask]);

  const debouncedSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(saveChanges, 500);
  }, [saveChanges]);

  const updateField = useCallback(<K extends keyof TaskData>(field: K, value: TaskData[K]) => {
    setEditingData(prev => ({ ...prev, [field]: value }));
    debouncedSave();
  }, [debouncedSave]);

  const updateExtra = useCallback(<K extends keyof NonNullable<TaskData["extra"]>>(field: K, value: NonNullable<TaskData["extra"]>[K]) => {
    setEditingData(prev => ({
      ...prev,
      extra: { ...(prev.extra || {}), [field]: value }
    }));
    debouncedSave();
  }, [debouncedSave]);

  const toggleCompleted = useCallback(async (task: TaskRow) => {
    if (task.data.kind === "TITLE") return;
    await onUpdateTask(task.data.id, { isCompleted: !task.data.isCompleted });
  }, [onUpdateTask]);

  useEffect(() => {
    const data = editingData as TaskData;
    if (!editingTaskId || !data || (data.type !== "INGRESO" && data.type !== "GASTO")) return;
    if (!data.forecastId) return;
    if (!hasForecastChildren(data.forecastId)) return;
    const leafChild = onlyLeafForecasts.find(f => f.parentId === data.forecastId);
    if (!leafChild) return;
    updateField("forecastId", leafChild.id);
  }, [editingTaskId, editingData, hasForecastChildren, onlyLeafForecasts, updateField]);

  const createTask = useCallback(async (position: "before" | "after" | "child", referenceTask: TaskRow) => {
    if (!selectedMetaId) return;

    let parentId: string | null | undefined;
    let level: number;
    let siblings: TaskRow[];

    if (position === "child") {
      parentId = referenceTask.data.id;
      level = (referenceTask.data.level || 0) + 1;
      siblings = tasks.filter(t => t.data.parentId === referenceTask.data.id);
    } else {
      parentId = referenceTask.data.parentId;
      level = referenceTask.data.level || 0;
      siblings = tasks.filter(t => t.data.metaId === selectedMetaId && t.data.parentId === parentId);
    }

    const order = position === "child"
      ? calculateInsertOrder(siblings, "after")
      : calculateInsertOrder(siblings, position, referenceTask);

    // Usar buildNewTaskData para garantizar objeto canónico igual que APP
    const ref = referenceTask.data;
    const isTitle = ref.kind === "TITLE";
    const isUnscheduled = ref.extra?.unscheduled === true || !ref.date;

    const newTaskData = buildNewTaskData({
      metaId: selectedMetaId,
      parentId: parentId ?? null,
      level,
      order,
      type: ref.type,
      scope: ref.scope,
      title: "",
      label: ref.label,
      points: ref.points ?? 2,
      date: ref.date,
      isTitle,
      unscheduled: isUnscheduled,
      accountId: ref.accountId,
      forecastId: ref.forecastId,
      amountEUR: ref.extra?.amountEUR,
    });

    const result = await onCreateTask(newTaskData);
    if (result.success) {
      setEditingTaskId(newTaskData.id);
      setEditingData(newTaskData);
    }
  }, [selectedMetaId, tasks, onCreateTask]);

  const createRootTask = useCallback(async () => {
    if (!selectedMetaId) return;
    const rootTasks = tasks.filter(t => t.data.metaId === selectedMetaId && !t.data.parentId);
    const order = calculateInsertOrder(rootTasks, "after");

    // Usar buildNewTaskData para garantizar objeto canónico igual que APP
    const newTaskData = buildNewTaskData({
      metaId: selectedMetaId,
      parentId: null,
      level: 0,
      order,
      type: "ACTIVIDAD",
      scope: "LABORAL",
      title: "",
      points: 2,
    });

    const result = await onCreateTask(newTaskData);
    if (result.success) {
      setEditingTaskId(newTaskData.id);
      setEditingData(newTaskData);
    }
  }, [selectedMetaId, tasks, onCreateTask]);


  const duplicateTask = useCallback(async (task: TaskRow) => {
    if (!selectedMetaId) return;
    const siblings = tasks.filter(t =>
      t.data.metaId === selectedMetaId && t.data.parentId === task.data.parentId
    );
    const order = calculateInsertOrder(siblings, "after", task);

    // Usar buildNewTaskData para garantizar objeto canónico igual que APP
    const src = task.data;
    const isTitle = src.kind === "TITLE";
    const isUnscheduled = src.extra?.unscheduled === true || !src.date;

    // Preservar campos extra relevantes del original
    const extraOverrides: Partial<TaskExtra> = {};
    if (src.extra) {
      if (src.extra.frequency) extraOverrides.frequency = src.extra.frequency;
      if (src.extra.unit) extraOverrides.unit = src.extra.unit;
      if (src.extra.quantity !== undefined) extraOverrides.quantity = src.extra.quantity;
      if (src.extra.weeklyDays) extraOverrides.weeklyDays = [...src.extra.weeklyDays];
      if (src.extra.weeklyTime) extraOverrides.weeklyTime = src.extra.weeklyTime;
      if (src.extra.monthlyDay) extraOverrides.monthlyDay = src.extra.monthlyDay;
      if (src.extra.monthlyTime) extraOverrides.monthlyTime = src.extra.monthlyTime;
      if (src.extra.notes) extraOverrides.notes = src.extra.notes;
    }

    const newTaskData = buildNewTaskData({
      metaId: selectedMetaId,
      parentId: src.parentId ?? null,
      level: src.level,
      order,
      type: src.type,
      scope: src.scope,
      title: `${src.title || "Sin nombre"} (copia)`,
      label: src.label,
      description: src.description,
      date: src.date,
      points: src.points ?? 2,
      isTitle,
      unscheduled: isUnscheduled,
      accountId: src.accountId,
      forecastId: src.forecastId,
      amountEUR: src.extra?.amountEUR,
      extraOverrides,
    });

    const result = await onCreateTask(newTaskData);
    if (result.success) {
      setEditingTaskId(newTaskData.id);
      setEditingData(newTaskData);
      // Focus y select en el input de nombre después del render
      requestAnimationFrame(() => {
        setTimeout(() => {
          nameInputRef.current?.focus();
          nameInputRef.current?.select();
        }, 50);
      });
    }
  }, [selectedMetaId, tasks, onCreateTask]);

  const softDeleteTask = useCallback(async (task: TaskRow) => {
    // Guardar snapshot antes de borrar
    const prevData = { ...task.data };
    const entry: UndoEntry = { kind: "delete", taskId: task.data.id, prev: prevData };
    
    // Aplicar soft delete en Supabase
    const result = await onDeleteTask(task.data.id);
    
    if (!result.success) {
      // Si falla, mostrar error y NO eliminar de UI
      alert(`Error al eliminar: ${result.error || "Error desconocido"}`);
      return;
    }
    
    // Éxito: agregar al undoStack y mostrar toast
    setUndoStack(prev => [...prev.slice(-10), entry]);
    setUndoToast({ entry, expiresAt: Date.now() + 5000 });
    
    // Cerrar edición si estaba editando esta tarea
    if (editingTaskId === task.data.id) {
      setEditingTaskId(null);
      setEditingData({});
    }
    setHoveredNodeId(null);
  }, [onDeleteTask, editingTaskId]);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    
    if (last.kind === "delete") {
      // Restaurar tarea borrada (quitar deleted_at en Supabase)
      const result = await onRestoreTask(last.taskId);
      if (!result.success) {
        alert(`Error al restaurar: ${result.error || "Error desconocido"}`);
      }
      setUndoToast(null); // Cerrar toast
    } else {
      // Restaurar datos anteriores (update)
      await onUpdateTask(last.taskId, last.data);
    }
  }, [undoStack, onUpdateTask, onRestoreTask]);

  // Auto-close undo toast después de 5 segundos
  useEffect(() => {
    if (!undoToast) return;
    const remaining = undoToast.expiresAt - Date.now();
    if (remaining <= 0) {
      setUndoToast(null);
      return;
    }
    const timer = setTimeout(() => setUndoToast(null), remaining);
    return () => clearTimeout(timer);
  }, [undoToast]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "d" && editingTaskId) {
        e.preventDefault();
        const task = tasks.find(t => t.data.id === editingTaskId);
        if (task) duplicateTask(task);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, editingTaskId, tasks, duplicateTask]);

  // Click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-node]") && !target.closest("[data-edit-panel]")) {
        closeEdit();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [closeEdit]);

  // ==================== DRAG & DROP (POINTER EVENTS) ====================

  const DRAG_THRESHOLD = 5; // px para distinguir click vs drag
  const INSIDE_X_THRESHOLD = 24; // px - desplazamiento a la derecha para "inside"
  const BEFORE_AFTER_Y_RATIO = 0.25; // ratio Y - zona before: 0-40%, zona after: 60-100%

  // Ref para detectar si hubo drag real (evita clicks residuales abriendo inline edit)
  const didDragRef = useRef(false);

  // Helper: verificar si targetId es descendiente de dragId (para evitar ciclos)
  const isDescendant = useCallback((dragId: string, targetId: string): boolean => {
    let currentId: string | null | undefined = targetId;
    const visited = new Set<string>();
    while (currentId) {
      if (currentId === dragId) return true;
      if (visited.has(currentId)) break;
      visited.add(currentId);
      const task = tasks.find(t => t.data.id === currentId);
      currentId = task?.data.parentId;
    }
    return false;
  }, [tasks]);

  // Iniciar drag potencial
  const handlePointerDown = useCallback((e: React.PointerEvent, task: TaskRow) => {
    // No iniciar drag desde controles realmente interactivos (no incluir data-no-drag general)
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, textarea, [data-edit-panel], [data-inline-editor]")) return;
    
    didDragRef.current = false;
    const rect = e.currentTarget.getBoundingClientRect();
    setDragging({
      id: task.data.id,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      pointerId: e.pointerId,
      isDragActive: false,
    });
    setDragPos({ x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  // Mover durante drag
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;

    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Activar drag real si supera umbral
    if (!dragging.isDragActive && distance > DRAG_THRESHOLD) {
      // Cerrar edición si está abierta
      if (editingTaskId) {
        closeEdit();
      }
      suppressClickRef.current = true;
      didDragRef.current = true;
      setDragging(prev => prev ? { ...prev, isDragActive: true } : null);
    }

    if (dragging.isDragActive || distance > DRAG_THRESHOLD) {
      setDragPos({ x: e.clientX, y: e.clientY });

      // Hit testing determinista: recolectar candidatos y elegir el más cercano
      type Candidate = { taskId: string; rect: DOMRect; distY: number };
      const candidates: Candidate[] = [];
      
      nodeRefsMap.current.forEach((el, taskId) => {
        if (taskId === dragging.id) return; // no puede ser target de sí mismo
        if (isDescendant(dragging.id, taskId)) return; // no puede ser descendiente
        
        const rect = el.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const centerY = rect.top + rect.height / 2;
          const distY = Math.abs(centerY - e.clientY);
          candidates.push({ taskId, rect, distY });
        }
      });

      let foundTarget: { targetId: string; position: "before" | "after" | "inside" } | null = null;

      if (candidates.length > 0) {
        // Elegir el candidato con menor distancia al centro vertical
        candidates.sort((a, b) => a.distY - b.distY);
        const best = candidates[0];
        const rect = best.rect;
        const relX = e.clientX - rect.left;
        const ratioY = (e.clientY - rect.top) / rect.height;
        
        let position: "before" | "after" | "inside";
        // Primero: determinar BEFORE/AFTER por posición Y (siempre aplica)
        if (ratioY < BEFORE_AFTER_Y_RATIO) {
          position = "before";
        } else if (ratioY > 1 - BEFORE_AFTER_Y_RATIO) {
          position = "after";
        } else {
          // Zona central: si X >= umbral => inside, sino => after (default)
          position = relX >= INSIDE_X_THRESHOLD ? "inside" : "after";
        }
        foundTarget = { targetId: best.taskId, position };
      }

      setDragOver(foundTarget);

      // Auto-scroll si está cerca de los bordes
      if (containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const scrollMargin = 50;
        const scrollSpeed = 8;
        
        if (e.clientY < containerRect.top + scrollMargin) {
          containerRef.current.scrollTop -= scrollSpeed;
        } else if (e.clientY > containerRect.bottom - scrollMargin) {
          containerRef.current.scrollTop += scrollSpeed;
        }
        if (e.clientX < containerRect.left + scrollMargin) {
          containerRef.current.scrollLeft -= scrollSpeed;
        } else if (e.clientX > containerRect.right - scrollMargin) {
          containerRef.current.scrollLeft += scrollSpeed;
        }
      }
    }
  }, [dragging, editingTaskId, closeEdit, isDescendant]);

  // Helper: obtener hijos directos de una tarea
  const getChildren = useCallback((taskId: string): TaskRow[] => {
    return tasks.filter(t => t.data.parentId === taskId);
  }, [tasks]);

  // Helper: recolectar todos los ids del subárbol (DFS)
  const collectSubtreeIds = useCallback((rootId: string): string[] => {
    const result: string[] = [rootId];
    const stack = [rootId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      const children = getChildren(current);
      for (const child of children) {
        result.push(child.data.id);
        stack.push(child.data.id);
      }
    }
    return result;
  }, [getChildren]);

  // Soltar / finalizar drag
  const handlePointerUp = useCallback(async (e: React.PointerEvent) => {
    if (!dragging) return;

    (e.currentTarget as HTMLElement).releasePointerCapture(dragging.pointerId);

    // Si no fue un drag real, tratar como click
    if (!dragging.isDragActive) {
      const task = tasks.find(t => t.data.id === dragging.id);
      if (task && !suppressClickRef.current) {
        startEdit(task);
      }
      setDragging(null);
      setDragPos(null);
      setDragOver(null);
      setTimeout(() => { 
        suppressClickRef.current = false;
        didDragRef.current = false;
      }, 0);
      return;
    }

    // Drag real: aplicar drop si hay target válido
    if (dragOver && selectedMetaId) {
      const dragTask = tasks.find(t => t.data.id === dragging.id);
      const targetTask = tasks.find(t => t.data.id === dragOver.targetId);

      if (dragTask && targetTask) {
        let newParentId: string | null | undefined;
        let newLevel: number;
        let newOrder: number;

        if (dragOver.position === "inside") {
          newParentId = dragOver.targetId;
          newLevel = (targetTask.data.level ?? 0) + 1;
          const siblings = tasks.filter(t =>
            t.data.parentId === dragOver.targetId && t.data.id !== dragging.id
          );
          newOrder = calculateInsertOrder(siblings, "after");
          // Expandir el padre si estaba colapsado
          if (collapsedById[dragOver.targetId]) {
            setCollapsedById(prev => ({ ...prev, [dragOver.targetId]: false }));
          }
        } else {
          newParentId = targetTask.data.parentId;
          newLevel = targetTask.data.level ?? 0;
          const siblings = tasks.filter(t =>
            t.data.metaId === selectedMetaId &&
            t.data.parentId === newParentId &&
            t.data.id !== dragging.id
          );
          newOrder = calculateInsertOrder(siblings, dragOver.position, targetTask);
        }

        // Calcular delta de level para actualizar descendientes
        const oldLevel = dragTask.data.level ?? 0;
        const levelDelta = newLevel - oldLevel;

        // Primero actualizar la tarea raíz movida
        await onUpdateTask(dragging.id, {
          parentId: newParentId,
          level: newLevel,
          order: newOrder,
        });

        // Si hubo cambio de level, actualizar descendientes (solo su level, no parentId)
        if (levelDelta !== 0) {
          const subtreeIds = collectSubtreeIds(dragging.id);
          // Excluir el root (ya actualizado)
          const descendantIds = subtreeIds.filter(id => id !== dragging.id);
          for (const childId of descendantIds) {
            const childTask = tasks.find(t => t.data.id === childId);
            if (childTask) {
              const childOldLevel = childTask.data.level ?? 0;
              const childNewLevel = childOldLevel + levelDelta;
              await onUpdateTask(childId, { level: childNewLevel });
            }
          }
        }
      }
    }

    setDragging(null);
    setDragPos(null);
    setDragOver(null);
    setTimeout(() => { 
      suppressClickRef.current = false;
      didDragRef.current = false;
    }, 50);
  }, [dragging, dragOver, selectedMetaId, tasks, startEdit, onUpdateTask, collapsedById, collectSubtreeIds]);

  // Cancelar drag si pierde el puntero
  const handlePointerCancel = useCallback(() => {
    setDragging(null);
    setDragPos(null);
    setDragOver(null);
    suppressClickRef.current = false;
    didDragRef.current = false;
  }, []);

  // Aplicar etiqueta (físico/conocimiento)
  const handleApplyLabel = useCallback(async (task: TaskRow, labelItem: Label) => {
    const updates: Partial<TaskData> = {
      title: labelItem.name,
      points: labelItem.points,
      label: labelItem.name,
    };
    if (editingTaskId === task.data.id) {
      setEditingData(prev => ({ ...prev, ...updates }));
    }
    await onUpdateTask(task.data.id, updates);
  }, [editingTaskId, setEditingData, onUpdateTask]);

  // ==================== RENDER NODO TAREA ====================

  const renderTaskNode = (node: TreeNode) => {
    if (!node.task) return null;
    const task = node.task;
    const data = task.data;
    const isEditing = editingTaskId === data.id;
    const isHovered = hoveredNodeId === data.id;
    const points = data.points ?? 2;
    const scheduleDisplay = getScheduleDisplay(data);
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsedById[data.id] || false;
    const isDraggingThis = dragging?.id === data.id && dragging.isDragActive;
    const isDropTarget = dragOver?.targetId === data.id;
    const dropPosition = isDropTarget ? dragOver.position : null;
    const primaryText = getInlinePrimaryText(data, bankAccounts, forecastLines);
    const isTitleTask = data.kind === "TITLE";

    // Ref callback para medir altura y guardar referencia para hit-testing
    const cardRef = (el: HTMLDivElement | null) => {
      if (el) {
        const h = el.offsetHeight;
        if (h > 0) measureNodeHeight(data.id, h);
        nodeRefsMap.current.set(data.id, el);
      } else {
        nodeRefsMap.current.delete(data.id);
      }
    };

    return (
      <div
        key={node.id}
        data-node
        className={`absolute ${isDraggingThis ? "opacity-30" : ""}`}
        style={{ left: node.x, top: node.y, width: node.w }}
        onMouseEnter={() => !dragging?.isDragActive && setHoveredNodeId(data.id)}
        onMouseLeave={() => !dragging?.isDragActive && setHoveredNodeId(null)}
      >
        {/* Placeholder drop BEFORE */}
        {isDropTarget && dropPosition === "before" && (
          <div 
            className="absolute left-0 right-0 border-2 border-dashed border-blue-400 bg-blue-50/50 rounded-lg z-30"
            style={{ top: -TASK_NODE_MIN_H / 2 - GAP_Y / 2, height: TASK_NODE_MIN_H }}
          />
        )}

        <div className="relative group flex items-center gap-2">
          {/* Card compacta - arrastrable desde cualquier parte */}
          <div
            ref={cardRef}
            onPointerDown={(e) => handlePointerDown(e, task)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            className={`
              relative bg-white rounded-lg border transition-all select-none touch-none
              ${isEditing ? "border-blue-400 shadow-md cursor-text" : "border-slate-200 hover:border-slate-300 shadow-sm cursor-grab"}
              ${savingTaskId === data.id ? "opacity-60" : ""}
              ${isDropTarget && dropPosition === "inside" ? "border-blue-400 bg-blue-50 shadow-md" : ""}
              ${dragging?.id === data.id && !dragging.isDragActive ? "cursor-grabbing" : ""}
            `}
            style={{ width: node.w, minHeight: TASK_NODE_MIN_H }}
          >
            {isTitleTask ? (
              <div className="flex items-center justify-center px-3 py-2">
                <div className="flex-1 flex items-center justify-center">
                  {inlineEdit?.taskId === data.id && inlineEdit.field === "title" ? (
                    <div data-inline-editor className="w-full">
                      <input
                        ref={inlineInputRef}
                        data-no-drag
                        type="text"
                        value={inlineEdit.draft as string}
                        onChange={(e) => setInlineEdit(prev => prev ? { ...prev, draft: e.target.value } : null)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") { e.preventDefault(); commitInline(); }
                          if (e.key === "Escape") { e.preventDefault(); cancelInline(); }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full text-center text-sm font-semibold leading-snug px-2 py-1 border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 min-w-[160px]"
                      />
                    </div>
                  ) : (
                    <span
                      data-no-drag
                      onClick={(e) => {
                        e.stopPropagation();
                        if (didDragRef.current) return;
                        openInline(task, "title", data.title || "", data.title);
                      }}
                      className="w-full text-sm font-semibold text-slate-700 text-center cursor-pointer hover:bg-slate-50 rounded px-2"
                    >
                      {primaryText || "Sin nombre"}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center px-3 py-1 gap-3">
                {/* Botón colapsar (solo si tiene hijos) */}
                {hasChildren ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleCollapse(data.id); }}
                    className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                    title={isCollapsed ? "Expandir" : "Contraer"}
                    data-no-drag
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                      {isCollapsed 
                        ? <path d="M3 1 L8 5 L3 9 Z" />
                        : <path d="M1 3 L5 8 L9 3 Z" />
                      }
                    </svg>
                  </button>
                ) : (
                  <div className="w-4" />
                )}
                

                {/* Checkbox con puntos */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleCompleted(task); }}
                  className={`
                    flex-shrink-0 w-6 h-6 rounded-md border flex items-center justify-center
                    text-[11px] font-semibold transition-all bg-white
                    ${data.isCompleted
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-50"
                    }
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50
                  `}
                  data-no-drag
                >
                  {data.isCompleted ? "✓" : points}
                </button>

                {/* Contenido: título + extras + fecha con edición inline */}
                <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                  {/* Título inline editable + cantidad física pegada */}
                  <div className="min-w-0 flex items-center">
                    {inlineEdit?.taskId === data.id && inlineEdit.field === "title" ? (
                      <div data-inline-editor className="inline-block">
                        <input
                          ref={inlineInputRef}
                          data-no-drag
                          type="text"
                          value={inlineEdit.draft as string}
                          onChange={(e) => setInlineEdit(prev => prev ? { ...prev, draft: e.target.value } : null)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") { e.preventDefault(); commitInline(); }
                            if (e.key === "Escape") { e.preventDefault(); cancelInline(); }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm leading-snug px-1 py-0.5 border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 w-full min-w-[120px]"
                        />
                      </div>
                    ) : (
                      <span
                        data-no-drag
                        onClick={(e) => {
                          e.stopPropagation();
                          if (didDragRef.current) return;
                          openInline(task, "title", data.title || "", data.title);
                        }}
                        className={`text-sm leading-snug cursor-pointer hover:bg-slate-50 rounded px-1 ${data.isCompleted ? "line-through text-slate-400" : "text-slate-800"}`}
                      >
                        {primaryText || "Sin nombre"}
                      </span>
                    )}

                    {/* Cantidad física pegada al título */}
                    {(() => {
                      const isFinancial = data.type === "INGRESO" || data.type === "GASTO";
                      const isPhysOrKnow = data.scope === "FISICO" || data.scope === "CRECIMIENTO";
                      const hasQuantity = data.extra?.quantity !== undefined && data.extra?.quantity !== null;
                      // Solo mostrar quantity si es tarea física/conocimiento Y tiene quantity
                      if (isFinancial || !isPhysOrKnow || !hasQuantity) return null;

                      if (inlineEdit?.taskId === data.id && inlineEdit.field === "amount") {
                        return (
                          <div data-inline-editor className="ml-1 inline-block">
                            <input
                              ref={inlineInputRef}
                              data-no-drag
                              type="text"
                              inputMode="decimal"
                              value={inlineEdit.draft as string}
                              onChange={(e) => setInlineEdit(prev => prev ? { ...prev, draft: e.target.value } : null)}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Enter") { e.preventDefault(); commitInline(); }
                                else if (e.key === "Escape") { e.preventDefault(); cancelInline(); }
                              }}
                              className="w-16 text-sm px-1 py-0.5 border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                            />
                          </div>
                        );
                      }

                      const currentVal = data.extra?.quantity ?? "";
                      const unit = coerceUnitFromLegacy(data.extra?.unit as string | undefined);
                      const unitLabel = unit === "hor" ? "h" : unit === "km" ? "km" : unit === "pasos" ? "pasos" : unit === "pag" ? "pag" : unit === "kg" ? "kg" : unit ? "min" : "";

                      return (
                        <span className="ml-1 inline-flex items-center gap-0.5">
                          <span
                            data-no-drag
                            onClick={(e) => {
                              e.stopPropagation();
                              if (didDragRef.current) return;
                              openInline(task, "amount", String(currentVal), currentVal);
                            }}
                            className="text-sm text-slate-500 cursor-pointer hover:bg-slate-50 rounded px-1"
                          >
                            {formatNumberES(data.extra?.quantity ?? 0)}
                          </span>
                          {unitLabel && <span className="text-sm text-slate-400">{unitLabel}</span>}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Bloque derecho: fecha/hora + extras inline */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Cantidad inline: solo finanzas (amountEUR) - físicas van junto al título */}
                    {(() => {
                      const isFinancial = data.type === "INGRESO" || data.type === "GASTO";
                      if (!isFinancial) return null;

                      if (inlineEdit?.taskId === data.id && inlineEdit.field === "amount") {
                        return (
                          <div data-inline-editor className="inline-block">
                            <input
                              ref={inlineInputRef}
                              data-no-drag
                              type="text"
                              inputMode="decimal"
                              value={inlineEdit.draft as string}
                              onChange={(e) => setInlineEdit(prev => prev ? { ...prev, draft: e.target.value } : null)}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Enter") { e.preventDefault(); commitInline(); }
                                else if (e.key === "Escape") { e.preventDefault(); cancelInline(); }
                              }}
                              className="w-20 text-xs px-1 py-0.5 border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                            />
                          </div>
                        );
                      }

                      const currentVal = data.extra?.amountEUR ?? "";
                      return (
                        <span
                          data-no-drag
                          onClick={(e) => {
                            e.stopPropagation();
                            if (didDragRef.current) return;
                            openInline(task, "amount", String(currentVal), currentVal);
                          }}
                          className="text-xs text-slate-500 cursor-pointer hover:bg-slate-50 rounded px-1"
                        >
                          {formatEURCompact(data.extra?.amountEUR ?? 0)}
                        </span>
                      );
                    })()}

                    {/* Banco inline (solo finanzas) */}
                    {(data.type === "INGRESO" || data.type === "GASTO") && bankAccounts.length > 0 && (
                      <span
                        data-no-drag
                        onClick={(e) => {
                          e.stopPropagation();
                          if (didDragRef.current) return;
                          inlineAnchorRef.current = e.currentTarget as HTMLElement;
                          openInline(task, "bankAccountId", data.accountId || "", data.accountId ?? undefined);
                        }}
                        className="text-xs text-slate-500 cursor-pointer hover:bg-slate-50 rounded px-1"
                      >
                        {data.accountId ? bankAccounts.find(b => b.id === data.accountId)?.name || "Banco" : "Sin asociar"}
                      </span>
                    )}

                    {/* Previsión inline (solo finanzas) - SOLO HOJAS */}
                    {(data.type === "INGRESO" || data.type === "GASTO") && onlyLeafForecasts.length > 0 && (
                      <span
                        data-no-drag
                        onClick={(e) => {
                          e.stopPropagation();
                          if (didDragRef.current) return;
                          inlineAnchorRef.current = e.currentTarget as HTMLElement;
                          openInline(task, "forecastLineId", data.forecastId || "", data.forecastId ?? undefined);
                        }}
                        className="text-xs text-slate-500 cursor-pointer hover:bg-slate-50 rounded px-1"
                      >
                        {data.forecastId ? findLeafForecast(data.forecastId)?.name || "Sin asociar" : "Sin asociar"}
                      </span>
                    )}

                    {/* Fecha inline con overlay nativo */}
                    {(() => {
                      const freq = data.extra?.frequency;
                      const isWeekly = freq === "SEMANAL";
                      const isMontly = freq === "MENSUAL";
                      const unscheduled = isTaskUnscheduled(data);
                      // Mostrar fecha (o "Sin programar" / días semana / día mes)
                      const datePart = unscheduled
                        ? "Sin programar"
                        : isWeekly
                          ? ((data.extra?.weeklyDays as WeekdayCode[]) || []).join(" ") || "Semanal"
                          : isMontly
                            ? `Día ${data.extra?.monthlyDay || 1}`
                            : formatDateShort(data.date) || formatDateShort(getTodayISO());
                      
                      // Para semanal, usar el popover de repeatDays en lugar del date picker
                      if (isWeekly) {
                        return (
                          <span
                            data-no-drag
                            data-field="date"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (didDragRef.current) return;
                              inlineAnchorRef.current = e.currentTarget as HTMLElement;
                              const currentDays = normalizeWeeklyDays(data.extra?.weeklyDays);
                              openInline(task, "repeatDays", currentDays, currentDays);
                            }}
                            className="text-xs text-slate-400 whitespace-nowrap cursor-pointer hover:bg-slate-50 rounded px-1"
                          >
                            {datePart}
                          </span>
                        );
                      }
                      
                      // Para puntual/mensual/sin programar: input date overlay
                      return (
                        <span className="relative inline-block" data-no-drag>

                          <span className="text-xs text-slate-400 whitespace-nowrap px-1 pointer-events-none">
                            {datePart}
                          </span>
                          <input
                            type="date"
                            value={data.date || ""}
                            onChange={async (e) => {
                              if (didDragRef.current) return;
                              const newDate = e.target.value;
                              if (newDate) {
                                setSavingTaskId(data.id);
                                await onUpdateTask(data.id, {
                                  date: newDate,
                                  extra: { 
                                    ...data.extra, 
                                    unscheduled: false,
                                    frequency: undefined,
                                  },
                                  repeatRule: undefined,
                                });
                                setSavingTaskId(null);
                              }
                            }}
                            onMouseDown={(e) => {
                              if (didDragRef.current) { e.preventDefault(); e.stopPropagation(); return; }
                              e.stopPropagation();
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute inset-0 opacity-0 cursor-pointer pointer-events-auto z-10"
                          />
                        </span>
                      );
                    })()}

                    {/* Hora inline editable */}
                    {(() => {
                      // Determinar qué hora mostrar según frecuencia
                      const freq = data.extra?.frequency;
                      const timeVal = freq === "SEMANAL"
                        ? data.extra?.weeklyTime
                        : freq === "MENSUAL"
                          ? data.extra?.monthlyTime
                          : data.time;
                      if (!timeVal) return null;
                      if (inlineEdit?.taskId === data.id && inlineEdit.field === "time") {
                        const draftVal = inlineEdit.draft as string;
                        const normalized = normalizeTimeInput(draftVal);
                        const invalid = inlineTimeInvalid || (!!draftVal && !normalized.value);
                        return (
                          <div data-inline-editor className="inline-flex items-center gap-1">
                            <input
                              ref={inlineInputRef}
                              data-no-drag
                              type="text"
                              value={draftVal}
                              placeholder="HH:MM"
                              onChange={(e) => setInlineEdit(prev => prev ? { ...prev, draft: e.target.value } : null)}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Enter") { e.preventDefault(); commitInline(); }
                                else if (e.key === "Escape") { e.preventDefault(); cancelInline(); }
                              }}
                              className={`w-16 text-xs px-1 py-0.5 border rounded bg-white focus:outline-none focus:ring-2 ${
                                invalid ? "border-red-300 focus:ring-red-200" : "border-slate-200 focus:ring-blue-400/50"
                              }`}
                            />
                            {invalid && <span className="text-[10px] text-red-500">Hora invalida</span>}
                          </div>
                        );
                      }

                      return (
                        <span
                          data-no-drag
                          className="text-xs text-slate-400 whitespace-nowrap px-1 cursor-pointer hover:bg-slate-50 rounded"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (didDragRef.current) return;
                            const current = formatTime(timeVal as string);
                            openInline(task, "time", current, timeVal as string);
                          }}
                        >
                          {formatTime(timeVal as string)}
                        </span>
                      );
                    })()}

                    {/* Texto de aviso/recordatorio */}
                    {(() => {
                      const reminderText = getReminderDisplay(data);
                      if (!reminderText) return null;
                      return (
                        <span className="text-[10px] text-amber-600 whitespace-nowrap px-1 flex items-center gap-0.5">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                          {reminderText}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Barra de acciones (fuera de la card, horizontal) */}
          {!dragging?.isDragActive && (
            <div
              className={`
                flex flex-row items-center gap-1 transition-all duration-150
                ${isEditing || isHovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"}
              `}
              data-no-drag
              style={{ zIndex: 30 }}
            >
              <button
                data-no-drag
                aria-label="Crear tarea al mismo nivel"
                title="Crear tarea al mismo nivel"
                onClick={(e) => { e.stopPropagation(); createTask("after", task); }}
                className="w-7 h-7 rounded-md bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700 hover:ring-1 hover:ring-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
              >
                +
              </button>
              <button
                data-no-drag
                aria-label="Crear subtarea"
                title="Crear subtarea"
                onClick={(e) => { e.stopPropagation(); createTask("child", task); }}
                className="w-7 h-7 rounded-md bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700 hover:ring-1 hover:ring-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
              >
                +↳
              </button>
              <button
                data-no-drag
                aria-label="Editar"
                title="Editar"
                onClick={(e) => { e.stopPropagation(); startEdit(task); }}
                className="w-7 h-7 rounded-md bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700 hover:ring-1 hover:ring-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
              >
                ✎
              </button>
              <button
                data-no-drag
                aria-label="Duplicar"
                title="Duplicar"
                onClick={(e) => { e.stopPropagation(); duplicateTask(task); }}
                className="w-7 h-7 rounded-md bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700 hover:ring-1 hover:ring-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
              >
                ⧉
              </button>
              <button
                data-no-drag
                aria-label="Eliminar"
                title="Eliminar"
                onClick={(e) => { e.stopPropagation(); softDeleteTask(task); }}
                className="w-7 h-7 rounded-md bg-transparent text-slate-500 hover:bg-red-50 hover:text-red-600 hover:ring-1 hover:ring-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
              >
                🗑
              </button>
            </div>
          )}
        </div>

        {/* Placeholder drop AFTER */}
        {isDropTarget && dropPosition === "after" && (
          <div 
            className="absolute left-0 right-0 border-2 border-dashed border-blue-400 bg-blue-50/50 rounded-lg z-30"
            style={{ bottom: -TASK_NODE_MIN_H / 2 - GAP_Y / 2, height: TASK_NODE_MIN_H }}
          />
        )}

        {/* Panel de edición expandido */}
        {isEditing && (
          <EditPanelPortal
            task={task}
            anchorEl={nodeRefsMap.current.get(data.id) as HTMLDivElement | undefined}
            renderContent={renderEditPanel}
          />
        )}
      </div>
    );
  };

  // ==================== RENDER NODO META ====================

  const renderMetaNode = (node: TreeNode) => {
    if (!selectedMeta) return null;
    const isHovered = hoveredNodeId === node.id;
    const isMetaActive = selectedMeta.isActive !== false; // default true

    const handleToggleActive = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!onToggleMetaActive) return;
      await onToggleMetaActive(selectedMeta.id, !isMetaActive);
    };

    return (
      <div
        key={node.id}
        data-node
        className="absolute group"
        style={{ left: node.x, top: node.y, width: node.w }}
        onMouseEnter={() => setHoveredNodeId(node.id)}
        onMouseLeave={() => setHoveredNodeId(null)}
      >
        <div 
          className={`rounded-lg shadow-md px-4 py-2 flex items-center justify-between text-white cursor-pointer transition-all ${
            isMetaActive 
              ? "bg-gradient-to-r from-blue-500 to-blue-600" 
              : "bg-gradient-to-r from-slate-400 to-slate-500 opacity-80"
          }`}
          style={{ minHeight: META_NODE_H }}
          onClick={() => onOpenMetaModal(selectedMeta)}
          title="Editar meta"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className={`text-lg font-semibold truncate ${!isMetaActive ? "opacity-70" : ""}`}>
              {selectedMeta.title}
            </span>
            {!isMetaActive && (
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                Pausada
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            {/* Botón play/pause: visible en hover (desktop) o touch devices */}
            {onToggleMetaActive && (
              <button
                onClick={handleToggleActive}
                className={`w-7 h-7 rounded-md bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all ${
                  isHovered ? "opacity-100" : "opacity-0 group-hover:opacity-100 md:opacity-0"
                } touch-device:opacity-100`}
                title={isMetaActive ? "Pausar meta" : "Activar meta"}
              >
                {isMetaActive ? (
                  // Icono Pause
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  // Icono Play
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7L8 5z" />
                  </svg>
                )}
              </button>
            )}
            
            <button
              onClick={(e) => { e.stopPropagation(); createRootTask(); }}
              className={`w-7 h-7 rounded-md bg-white/20 hover:bg-white/30 flex items-center justify-center text-base font-bold transition-colors ${isHovered ? "opacity-100" : "opacity-80"}`}
              title="Crear tarea"
            >
              +
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ==================== RENDER PANEL DE EDICIÓN ====================

  const UI_TYPES: UITaskType[] = ["Actividad", "Fisico", "Conocimiento", "Ingreso", "Gasto", "Titulo"];

  const renderEditPanel = (task: TaskRow) => {
    const data = editingData as TaskData;
    const currentUIType = getUIType(data.type, data.scope, data.kind);
    const isFinance = data.type === "INGRESO" || data.type === "GASTO";
    const isPhysicalKnowledge = data.scope === "FISICO" || data.scope === "CRECIMIENTO";
    const isTitleTask = data.kind === "TITLE";

    const schedType = isTaskUnscheduled(data) ? "sin_programar"
      : data.extra?.frequency === "SEMANAL" ? "semanal"
      : data.extra?.frequency === "MENSUAL" ? "mensual" : "puntual";

    // Handler para cambiar tipo
    const handleTypeChange = (newUIType: UITaskType) => {
      const mapping = UI_TYPE_MAPPING[newUIType];
      if (!mapping) return;

      // Cambiar a Titulo: setear kind="TITLE", scope=null, points=0, limpiar campos
      if (newUIType === "Titulo") {
        const cleanExtra: TaskExtra = {};
        if (data.extra?.completedDates) cleanExtra.completedDates = data.extra.completedDates;
        if (data.extra?.notes) cleanExtra.notes = data.extra.notes;

        const updates: Partial<TaskData> = {
          kind: "TITLE",
          type: "ACTIVIDAD",
          scope: null,
          title: data.title || "",
          points: 0,
          date: null,
          time: null,
          repeatRule: null,
          accountId: null,
          forecastId: null,
          label: undefined,
          description: undefined,
          isCompleted: false,
          extra: Object.keys(cleanExtra).length > 0 ? cleanExtra : undefined,
        };

        setEditingData(prev => ({ ...prev, ...updates }));
        debouncedSave();
        return;
      }

      // Cambiar desde Titulo a otro tipo: quitar kind
      const nextExtra = { ...(data.extra || {}) };

      const updates: Partial<TaskData> = { 
        kind: null,
        type: mapping.type, 
        scope: mapping.scope ?? undefined,
      };

      // Limpiar campos incompatibles si cambia a no-financiero
      if (mapping.type !== "INGRESO" && mapping.type !== "GASTO") {
        updates.accountId = undefined;
        updates.forecastId = undefined;
        delete nextExtra.amountEUR;
      }
      
      // Limpiar label si cambia desde/hacia Fisico/Conocimiento
      if ((mapping.scope === "FISICO" || mapping.scope === "CRECIMIENTO") !== isPhysicalKnowledge) {
        updates.label = undefined;
      }

      const sanitizedExtra = Object.keys(nextExtra).length > 0 ? nextExtra : undefined;
      setEditingData(prev => ({ ...prev, ...updates, extra: sanitizedExtra }));
      debouncedSave();
    };

    const renderTypeChips = () => (
      <div className="flex flex-wrap gap-2">
        {UI_TYPES.map(t => (
          <button
            key={t}
            data-no-drag
            onClick={() => handleTypeChange(t)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${currentUIType === t ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
          >
            {t}
          </button>
        ))}
      </div>
    );

    const renderPhysicalKnowledgeControls = () => {
      const physLike = isPhysLike(data);
      const currentLabelName = data.label || data.title || "";
      const labelKey = normalizeLabelKey(currentLabelName);
      const scopedCfg = getSubTagCfg(data.scope, labelKey);
      const cfg = getLabelCfg(currentLabelName);
      const isCustomTag = !!currentLabelName && !scopedCfg;
      const allowedUnits = cfg.allowedUnits?.length ? cfg.allowedUnits : FALLBACK_LABEL_CFG.allowedUnits;
      const coercedUnit = coerceUnitFromLegacy(data.extra?.unit as string | undefined);
      const selectedUnit: SubUnit | undefined = allowedUnits.includes(coercedUnit as SubUnit) ? coercedUnit as SubUnit : (cfg.defaultUnit ?? allowedUnits[0]);
      const showQuantity = physLike && !isFoodLabel(currentLabelName) && !isCustomTag && cfg.showQuantity !== false;
      const quantityValue = showQuantity
        ? (data.extra?.quantity ?? (selectedUnit ? cfg.defaultsByUnit?.[selectedUnit] : undefined) ?? cfg.defaultQuantity)
        : undefined;
      const detailsField = data.scope === "CRECIMIENTO" ? "knowledgeDetails" : "physicalDetails";

      const setUnitAndQuantity = (unit: SubUnit | undefined, quantity: number | undefined, labelForDetails: string) => {
        setEditingData(prev => {
          const extra = { ...(prev.extra || {}) };
          if (showQuantity && unit !== undefined && quantity !== undefined) {
            extra.unit = unit as any;
            extra.quantity = quantity;
          } else {
            delete extra.unit;
            delete extra.quantity;
          }
          if (physLike && (data.scope === "FISICO" || data.scope === "CRECIMIENTO")) {
            if (showQuantity && unit !== undefined && quantity !== undefined) {
              (extra as any)[detailsField] = { kind: data.scope, label: normalizeLabelKey(labelForDetails), unit, value: quantity };
            } else {
              delete (extra as any)[detailsField];
            }
          }
          return { ...prev, extra };
        });
        debouncedSave();
      };

      const handleLabelClick = async (labelItem: Label) => {
        const cfgForLabel = getLabelCfg(labelItem.name);
        const scopedCfgLabel = getSubTagCfg(data.scope, normalizeLabelKey(labelItem.name));
        const isCustom = !scopedCfgLabel;
        const nextUnit = cfgForLabel.showQuantity === false || isCustom ? undefined : (cfgForLabel.defaultUnit ?? cfgForLabel.allowedUnits[0]);
        const nextQty = cfgForLabel.showQuantity === false || isCustom
          ? undefined
          : (nextUnit ? cfgForLabel.defaultsByUnit?.[nextUnit] : undefined) ?? cfgForLabel.defaultQuantity ?? 1;

        setAddingLabel(false);
        setNewLabelName("");

        setEditingData(prev => {
          const extra = { ...(prev.extra || {}) };
          if (cfgForLabel.showQuantity === false || isCustom) {
            delete extra.unit;
            delete extra.quantity;
            delete (extra as any)[detailsField];
          } else {
            extra.unit = nextUnit as any;
            extra.quantity = nextQty;
            if (physLike && (data.scope === "FISICO" || data.scope === "CRECIMIENTO")) {
              (extra as any)[detailsField] = { kind: data.scope, label: normalizeLabelKey(labelItem.name), unit: nextUnit, value: nextQty };
            }
          }
          return {
            ...prev,
            label: labelItem.name,
            title: labelItem.name,
            points: labelItem.points,
            extra
          };
        });
        debouncedSave();
      };

      const handleUnitClick = (u: SubUnit) => {
        const cfgFor = getLabelCfg(currentLabelName);
        const nextQty = cfgFor.showQuantity === false ? undefined : (cfgFor.defaultsByUnit?.[u] ?? cfgFor.defaultQuantity ?? quantityValue ?? 1);
        setUnitAndQuantity(u, nextQty, currentLabelName);
      };

      const handleQuantityChange = (nextQty: number) => {
        if (!showQuantity) return;
        setUnitAndQuantity(selectedUnit || cfg.defaultUnit, nextQty, currentLabelName);
      };

      const handleAddLabelConfirm = async () => {
        const raw = newLabelName.trim().replace(/#/g, "").replace(/\s+/g, " ");
        if (!raw) return;
        const normalized = normalizeLabelKey(raw);
        const exists = localLabels.some(l => l.scope === data.scope && normalizeLabelKey(l.name) === normalized);
        if (exists) { setAddingLabel(false); setNewLabelName(""); return; }
        const category = data.scope === "FISICO" ? "phys" : "know";
        const res = await ensureScoringItemExists(category as "phys" | "know", raw, data.points);
        const newPoints = res && "points" in (res as any) && (res as any).points !== undefined ? (res as any).points : data.points;
        const newLabel: Label = {
          id: `new-${Date.now()}`,
          name: raw,
          points: newPoints || 2,
          scope: data.scope || "FISICO",
        };
        setLocalLabels(prev => [...prev, newLabel]);
        setAddingLabel(false);
        setNewLabelName("");
        await handleLabelClick(newLabel);
      };

      const handleAddLabelCancel = () => {
        setAddingLabel(false);
        setNewLabelName("");
      };

      if (!physLike) {
        return (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
            <input
              data-no-drag
              ref={nameInputRef}
              type="text"
              value={data.title || ""}
              onChange={(e) => updateField("title", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); createTask("after", task); }
                else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); createTask("child", task); }
              }}
              placeholder="Nombre de la tarea"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {/* Etiquetas (solo Fisico/Conocimiento) */}
          <div className="flex flex-wrap gap-2 items-center">
            {localLabels.filter(l => l.scope === data.scope).map(labelItem => {
              const selected = data.label === labelItem.name;
              return (
                <button
                  key={labelItem.id}
                  data-no-drag
                  onClick={() => handleLabelClick(labelItem)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${selected ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}
                >
                  {labelItem.name}
                </button>
              );
            })}
            <button
              data-no-drag
              onClick={() => { setAddingLabel(true); setNewLabelName(""); }}
              className="px-3 py-1.5 text-xs rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 transition-colors"
            >
              Añadir+
            </button>
          </div>

          {addingLabel && (
            <div className="flex gap-2 items-center">
              <input
                data-no-drag
                type="text"
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddLabelConfirm(); } } }
                className="px-2 py-1 text-xs border border-slate-200 rounded w-40"
                placeholder="Nueva etiqueta"
              />
              <button data-no-drag onClick={handleAddLabelConfirm} className="px-2 py-1 text-xs rounded bg-blue-500 text-white">OK</button>
              <button data-no-drag onClick={handleAddLabelCancel} className="px-2 py-1 text-xs rounded border border-slate-200">Cancelar</button>
            </div>
          )}

          {/* Cantidad + Unidad */}
          {showQuantity && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                <button
                  data-no-drag
                  onClick={() => handleQuantityChange(Math.max(0, (quantityValue ?? 0) - 1))}
                  className="w-7 h-7 text-sm rounded border border-slate-200 bg-white hover:border-slate-300"
                >
                  -
                </button>
                <input
                  data-no-drag
                  type="number"
                  value={quantityValue ?? 0}
                  onChange={(e) => handleQuantityChange(Number(e.target.value) || 0)}
                  className="w-14 px-2 py-1 text-xs border border-slate-200 rounded"
                />
                <button
                  data-no-drag
                  onClick={() => handleQuantityChange((quantityValue ?? 0) + 1)}
                  className="w-7 h-7 text-sm rounded border border-slate-200 bg-white hover:border-slate-300"
                >
                  +
                </button>
              </div>
              <div className="flex items-center gap-1">
                {allowedUnits.map(u => (
                  <button
                    key={u}
                    data-no-drag
                    onClick={() => handleUnitClick(u)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${selectedUnit === u ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Nombre */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
            <input
              data-no-drag
              ref={nameInputRef}
              type="text"
              value={data.title || ""}
              onChange={(e) => updateField("title", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); createTask("after", task); }
                else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); createTask("child", task); }
              }}
              placeholder="Nombre de la tarea"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>
      );
    };

    const renderFinanceControls = () => {
      // SOLO HOJAS (sin filtrar por type - INGRESO y GASTO usan las mismas fuentes)
      const financeLeafs = onlyLeafForecasts;
      return (
        <div className="space-y-3">
          {/* Nombre + Cantidad */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
              <input
                data-no-drag
                ref={nameInputRef}
                type="text"
                value={data.title || ""}
                onChange={(e) => updateField("title", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); createTask("after", task); }
                  else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); createTask("child", task); }
                }}
                placeholder="Nombre de la tarea"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="w-36">
              <label className="block text-xs font-medium text-slate-500 mb-1">Cantidad</label>
              <input
                data-no-drag
                type="number"
                value={data.extra?.amountEUR ?? ""}
                onChange={(e) => updateExtra("amountEUR", e.target.value === "" ? undefined : parseFloat(e.target.value))}
                placeholder="0,00"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Cuenta y Previsión en fila */}
          <div className="grid grid-cols-2 gap-3 items-start">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Cuenta</div>
              <div className="flex flex-wrap gap-1">
                {/* Opción "Sin asociar" */}
                <button
                  data-no-drag
                  onClick={() => { updateField("accountId", undefined); }}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${!data.accountId ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                >
                  Sin asociar
                </button>
                {bankAccounts.map(acc => (
                  <button
                    key={acc.id}
                    data-no-drag
                    onClick={() => { updateField("accountId", acc.id); }}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${data.accountId === acc.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                  >
                    {acc.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Previsión</div>
              <div className="flex flex-wrap gap-1">
                {/* Opción "Sin asociar" */}
                <button
                  data-no-drag
                  onClick={() => { updateField("forecastId", undefined); }}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${!data.forecastId ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                >
                  Sin asociar
                </button>
                {financeLeafs.map(f => (
                  <button
                    key={f.id}
                    data-no-drag
                    onClick={() => { updateField("forecastId", f.id); }}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${data.forecastId === f.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-3 text-sm">
        {/* Tipo como chips */}
        {renderTypeChips()}

        {/* Controles según tipo */}
        {isFinance ? renderFinanceControls() : renderPhysicalKnowledgeControls()}

        {/* Scheduling */}
        {!isTitleTask && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Programación</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {(["puntual", "semanal", "mensual", "sin_programar"] as const).map(type => (
                <button
                  key={type}
                  onClick={() => {
                    const extra = { ...(data.extra || {}) };
                    if (type === "sin_programar") {
                      extra.frequency = "PUNTUAL"; extra.unscheduled = true;
                      delete extra.weeklyDays; delete extra.monthlyDay;
                      setEditingData(prev => ({ ...prev, date: undefined, time: undefined, repeatRule: undefined, extra }));
                    } else if (type === "puntual") {
                      extra.frequency = "PUNTUAL"; extra.unscheduled = false;
                      delete extra.weeklyDays; delete extra.monthlyDay;
                      setEditingData(prev => ({ ...prev, date: prev.date || getTodayISO(), repeatRule: undefined, extra }));
                    } else if (type === "semanal") {
                      extra.frequency = "SEMANAL"; extra.unscheduled = false;
                      extra.weeklyDays = extra.weeklyDays || []; delete extra.monthlyDay;
                      setEditingData(prev => ({ ...prev, date: undefined, extra }));
                    } else if (type === "mensual") {
                      extra.frequency = "MENSUAL"; extra.unscheduled = false;
                      extra.monthlyDay = extra.monthlyDay || 1; delete extra.weeklyDays;
                      setEditingData(prev => ({ ...prev, date: undefined, extra }));
                    }
                    debouncedSave();
                  }}
                  className={`px-2 py-1 text-xs rounded-full border transition-colors ${schedType === type ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                >
                  {type === "puntual" && "Puntual"}
                  {type === "semanal" && "Semanal"}
                  {type === "mensual" && "Mensual"}
                  {type === "sin_programar" && "Sin programar"}
                </button>
              ))}
            </div>

            {/* ==================== BLOQUE REMINDER REUTILIZABLE ==================== */}
            {(() => {
              // Determinar la hora base según frecuencia
              const getTimeForReminder = (): string | null => {
                if (schedType === "puntual") return data.time || null;
                if (schedType === "semanal") return data.extra?.weeklyTime as string || null;
                if (schedType === "mensual") return data.extra?.monthlyTime as string || null;
                return null;
              };
              const timeForReminder = getTimeForReminder();

              // Normalización defensiva - DEFAULTS OBLIGATORIOS: false, "min", 30
              const reminderEnabled = data.extra?.reminderEnabled === true;
              const rawUnit = data.extra?.reminderOffsetUnit;
              const reminderUnit: "min" | "hor" = (rawUnit === "min" || rawUnit === "hor") ? rawUnit : "min";
              const rawValue = data.extra?.reminderOffsetValue;
              const reminderValue = (typeof rawValue === "number" && rawValue >= 1) ? rawValue : 30;

              // Handler para toggle de reminder (SWITCH)
              const handleToggleReminder = () => {
                const newEnabled = !reminderEnabled;
                // SIEMPRE guardar los 3 campos
                const newExtra = {
                  ...(data.extra || {}),
                  reminderEnabled: newEnabled,
                  reminderOffsetUnit: reminderUnit,
                  reminderOffsetValue: reminderValue,
                };
                setEditingData(prev => ({ ...prev, extra: newExtra }));
                debouncedSave();
              };

              // Handler para cambio de valor
              const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                const parsed = parseInt(e.target.value, 10);
                const finalValue = (parsed >= 1) ? parsed : 30;
                // SIEMPRE guardar los 3 campos
                const newExtra = {
                  ...(data.extra || {}),
                  reminderEnabled,
                  reminderOffsetUnit: reminderUnit,
                  reminderOffsetValue: finalValue,
                };
                setEditingData(prev => ({ ...prev, extra: newExtra }));
                debouncedSave();
              };

              // Handler para cambio de unidad
              const handleUnitChange = (newUnit: "min" | "hor") => {
                if (newUnit === reminderUnit) return;
                // SIEMPRE guardar los 3 campos
                const newExtra = {
                  ...(data.extra || {}),
                  reminderEnabled,
                  reminderOffsetUnit: newUnit,
                  reminderOffsetValue: reminderValue,
                };
                setEditingData(prev => ({ ...prev, extra: newExtra }));
                debouncedSave();
              };

              // Calcular texto de aviso usando la función pura
              const reminderText = (reminderEnabled && timeForReminder)
                ? getReminderDisplay({ time: timeForReminder, extra: { reminderEnabled: true, reminderOffsetUnit: reminderUnit, reminderOffsetValue: reminderValue } })
                : null;

              // Render del bloque reminder
              const renderReminderBlock = () => {
                if (!timeForReminder) return null;
                return (
                  <div className="flex flex-wrap items-center gap-2 text-xs mt-2">
                    {/* SWITCH toggle */}
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={reminderEnabled}
                        onClick={handleToggleReminder}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400/50 ${
                          reminderEnabled ? "bg-blue-500" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            reminderEnabled ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                      <span className="text-slate-600 whitespace-nowrap">Activar aviso previo</span>
                    </label>

                    {/* Input numérico */}
                    <input
                      type="number"
                      min="1"
                      value={reminderValue}
                      onChange={handleValueChange}
                      disabled={!reminderEnabled}
                      className={`w-14 px-2 py-1 text-xs border border-slate-200 rounded-lg text-center transition-opacity ${!reminderEnabled ? "opacity-50 bg-slate-50" : ""}`}
                    />

                    {/* Chips de unidad */}
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleUnitChange("min")}
                        disabled={!reminderEnabled}
                        className={`px-2 py-1 rounded-md border transition-colors ${
                          reminderUnit === "min"
                            ? "bg-blue-500 text-white border-blue-500"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        } ${!reminderEnabled ? "opacity-50" : ""}`}
                      >
                        min
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUnitChange("hor")}
                        disabled={!reminderEnabled}
                        className={`px-2 py-1 rounded-md border transition-colors ${
                          reminderUnit === "hor"
                            ? "bg-blue-500 text-white border-blue-500"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        } ${!reminderEnabled ? "opacity-50" : ""}`}
                      >
                        hor
                      </button>
                    </div>

                    {/* Texto de aviso calculado - SOLO si enabled */}
                    {reminderText && (
                      <span className="text-[11px] text-slate-400 whitespace-nowrap ml-1">
                        {reminderText}
                      </span>
                    )}
                  </div>
                );
              };

              return (
                <>
                  {schedType === "puntual" && (
                    <div className="space-y-0">
                      <div className="flex gap-2">
                        <input type="date" value={data.date || getTodayISO()} onChange={(e) => updateField("date", e.target.value)} className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-lg" />
                        <input type="time" value={data.time || ""} onChange={(e) => updateField("time", e.target.value)} className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-lg" />
                      </div>
                      {renderReminderBlock()}
                    </div>
                  )}

                  {schedType === "semanal" && (
                    <div className="space-y-2">
                      <div className="flex gap-1">
                        {WEEKDAY_CODES.map(day => {
                          const selected = normalizeWeeklyDays(data.extra?.weeklyDays).includes(day);
                          return (
                            <button key={day} onClick={() => {
                              const current = normalizeWeeklyDays(data.extra?.weeklyDays);
                              const newDays = selected ? current.filter(d => d !== day) : [...current, day].sort((a, b) => WEEKDAY_CODES.indexOf(a) - WEEKDAY_CODES.indexOf(b));
                              // MERGE profundo: conservar reminder fields
                              const extra = { 
                                ...(data.extra || {}), 
                                weeklyDays: newDays,
                                reminderEnabled,
                                reminderOffsetUnit: reminderUnit,
                                reminderOffsetValue: reminderValue,
                              };
                              const repeatRule = newDays.length > 0 ? buildWeeklyRepeatRule(newDays, extra.weeklyTime) : undefined;
                              setEditingData(prev => ({ ...prev, repeatRule, extra }));
                              debouncedSave();
                            }} className={`w-7 h-7 text-xs rounded-lg border transition-colors ${selected ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200"}`}>
                              {day}
                            </button>
                          );
                        })}
                      </div>
                      <input type="time" value={data.extra?.weeklyTime || ""} onChange={(e) => {
                        const weeklyTime = e.target.value;
                        const weeklyDays = normalizeWeeklyDays(data.extra?.weeklyDays);
                        // MERGE profundo: conservar reminder fields
                        const extra = { 
                          ...(data.extra || {}), 
                          weeklyTime,
                          reminderEnabled,
                          reminderOffsetUnit: reminderUnit,
                          reminderOffsetValue: reminderValue,
                        };
                        const repeatRule = weeklyDays.length > 0 ? buildWeeklyRepeatRule(weeklyDays, weeklyTime) : undefined;
                        setEditingData(prev => ({ ...prev, repeatRule, extra }));
                        debouncedSave();
                      }} className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-lg" />
                      {renderReminderBlock()}
                    </div>
                  )}

                  {schedType === "mensual" && (
                    <div className="space-y-2">
                      <div className="flex gap-2 items-center">
                        <span className="text-xs text-slate-500">Día</span>
                        <input type="number" min="1" max="31" value={data.extra?.monthlyDay || 1} onChange={(e) => {
                          const monthlyDay = parseInt(e.target.value) || 1;
                          const repeatRule = buildMonthlyRepeatRule(monthlyDay, data.extra?.monthlyTime);
                          // MERGE profundo: conservar reminder fields
                          const extra = { 
                            ...(data.extra || {}), 
                            monthlyDay,
                            reminderEnabled,
                            reminderOffsetUnit: reminderUnit,
                            reminderOffsetValue: reminderValue,
                          };
                          setEditingData(prev => ({ ...prev, repeatRule, extra }));
                          debouncedSave();
                        }} className="w-14 px-2 py-1 text-xs border border-slate-200 rounded-lg text-center" />
                        <input type="time" value={data.extra?.monthlyTime || ""} onChange={(e) => {
                          const monthlyTime = e.target.value;
                          const repeatRule = buildMonthlyRepeatRule(data.extra?.monthlyDay || 1, monthlyTime);
                          // MERGE profundo: conservar reminder fields
                          const extra = { 
                            ...(data.extra || {}), 
                            monthlyTime,
                            reminderEnabled,
                            reminderOffsetUnit: reminderUnit,
                            reminderOffsetValue: reminderValue,
                          };
                          setEditingData(prev => ({ ...prev, repeatRule, extra }));
                          debouncedSave();
                        }} className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-lg" />
                      </div>
                      {renderReminderBlock()}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Puntos + Descripción */}
        {!isTitleTask && (
          <div className="flex gap-3">
            <div className="w-20">
              <label className="block text-xs font-medium text-slate-500 mb-1">Puntos</label>
              <input type="number" min="1" max="10" value={data.points ?? 2} onChange={(e) => updateField("points", parseInt(e.target.value) || 2)} className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">Descripción</label>
              <input type="text" value={data.description || ""} onChange={(e) => updateField("description", e.target.value)} placeholder="Descripción" className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg" />
            </div>
          </div>
        )}

        {/* Error */}
        {editError && (
          <div className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded border border-red-200">
            {editError}
          </div>
        )}

        {/* Footer con botones */}
        <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 mt-2">
          <button
            data-no-drag
            onClick={handleDeleteTask}
            disabled={savingTaskId === editingTaskId}
            className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            Eliminar tarea
          </button>
          <button
            data-no-drag
            onClick={cancelEdit}
            disabled={savingTaskId === editingTaskId}
            className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            data-no-drag
            onClick={handleSaveAndClose}
            disabled={savingTaskId === editingTaskId}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {savingTaskId === editingTaskId ? "Guardando..." : "Guardar"}
          </button>
        </div>

      </div>
    );
  };

  // ==================== RENDER SVG CONECTORES ====================

  const renderConnectors = () => {
    if (!layout) return null;

    return (
      <svg
        className="absolute top-0 left-0 pointer-events-none"
        style={{ width: layout.totalWidth, height: layout.totalHeight }}
      >
        {layout.edges.map((edge, i) => {
          const from = layout.nodes.get(edge.from);
          const to = layout.nodes.get(edge.to);
          if (!from || !to) return null;

          // Layout vertical: línea sale del borde izquierdo del padre y baja hasta el hijo
          // Start: borde izquierdo del padre, un poco abajo del centro
          const startX = from.x + 16;
          const startY = from.y + from.h;
          
          // End: borde izquierdo del hijo, centro vertical
          const endX = to.x;
          const endY = to.y + to.h / 2;

          // Línea en L con curva: baja verticalmente, luego gira hacia la derecha
          const cornerX = startX;
          const cornerY = endY;

          const path = `M ${startX} ${startY} 
                        L ${cornerX} ${cornerY - 8} 
                        Q ${cornerX} ${cornerY}, ${cornerX + 8} ${cornerY}
                        L ${endX} ${cornerY}`;

          return (
            <g key={i}>
              <path
                d={path}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="2"
                strokeLinecap="round"
              />
              {/* Círculo en el punto de unión */}
              <circle cx={startX} cy={startY} r={CONNECTOR_RADIUS} fill="#cbd5e1" />
            </g>
          );
        })}
      </svg>
    );
  };

  // ==================== RENDER PRINCIPAL ====================

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Selector de metas */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white">
        {metaReorderError && (
          <div className="px-4 py-1 bg-red-100 text-red-700 text-xs">
            {metaReorderError}
          </div>
        )}
        <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto relative">
          {metas.map(meta => (
            <button
              key={meta.id}
              ref={(el) => { if (el) metaChipRefs.current.set(meta.id, el); else metaChipRefs.current.delete(meta.id); }}
              onPointerDown={(e) => {
                if (!onReorderMetas) return;
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                setMetaDrag({ id: meta.id, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId, isDragActive: false });
                setMetaDragOverId(null);
                setMetaInsertSide(null);
                suppressMetaClickRef.current = false;
              }}
              onPointerMove={(e) => {
                if (!metaDrag || metaDrag.id !== meta.id) return;
                const dx = e.clientX - metaDrag.startX;
                const dy = e.clientY - metaDrag.startY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > META_DRAG_THRESHOLD && !metaDrag.isDragActive) {
                  setMetaDrag({ ...metaDrag, isDragActive: true });
                  suppressMetaClickRef.current = true;
                  const el = metaChipRefs.current.get(meta.id);
                  if (el) {
                    const r = el.getBoundingClientRect();
                    setMetaDragGhost({ label: meta.title, w: r.width, h: r.height, offsetX: e.clientX - r.left, offsetY: e.clientY - r.top });
                  }
                }
                if (metaDrag.isDragActive) {
                  setMetaDragPos({ x: e.clientX, y: e.clientY });
                  let foundId: string | null = null;
                  let side: "before" | "after" | null = null;
                  metaChipRefs.current.forEach((el, id) => {
                    if (id === metaDrag.id) return;
                    const rect = el.getBoundingClientRect();
                    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                      foundId = id;
                      const midX = (rect.left + rect.right) / 2;
                      side = e.clientX < midX ? "before" : "after";
                    }
                  });
                  setMetaDragOverId(foundId);
                  setMetaInsertSide(side);
                }
              }}
              onPointerUp={(e) => {
                if (!metaDrag || metaDrag.id !== meta.id) return;
                (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                if (metaDrag.isDragActive && metaDragOverId && metaDragOverId !== metaDrag.id && onReorderMetas) {
                  const fromIdx = metas.findIndex(m => m.id === metaDrag.id);
                  let toIdx = metas.findIndex(m => m.id === metaDragOverId);
                  if (fromIdx !== -1 && toIdx !== -1) {
                    if (metaInsertSide === "after") toIdx += 1;
                    if (fromIdx < toIdx) toIdx -= 1;
                    const newMetas = [...metas];
                    const [removed] = newMetas.splice(fromIdx, 1);
                    newMetas.splice(toIdx, 0, removed);
                    const reorderedMetas = newMetas.map((m, idx) => ({ ...m, order: idx + 1 }));
                    onReorderMetas(reorderedMetas);
                  }
                }
                setMetaDrag(null);
                setMetaDragOverId(null);
                setMetaDragPos(null);
                setMetaDragGhost(null);
                setMetaInsertSide(null);
                setTimeout(() => { suppressMetaClickRef.current = false; }, 0);
              }}
              onPointerCancel={() => {
                setMetaDrag(null);
                setMetaDragOverId(null);
                setMetaDragPos(null);
                setMetaDragGhost(null);
                setMetaInsertSide(null);
                suppressMetaClickRef.current = false;
              }}
              onClick={() => {
                if (suppressMetaClickRef.current) return;
                setSelectedMetaId(meta.id);
                setEditingTaskId(null);
              }}
              className={`relative flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors select-none touch-none ${
                selectedMetaId === meta.id ? "bg-blue-500 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              } ${
                metaDrag?.id === meta.id && metaDrag.isDragActive ? "opacity-30" : ""
              }`}
            >
              {meta.title}
              {metaDragOverId === meta.id && metaInsertSide && (
                <span
                  className="absolute top-0 bottom-0 w-[3px] bg-blue-500 rounded-full"
                  style={{ [metaInsertSide === "before" ? "left" : "right"]: -5 }}
                />
              )}
            </button>
          ))}
          <button onClick={() => onOpenMetaModal(null)} className="flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 border border-dashed border-blue-300">
            + Meta
          </button>
          {/* Ghost flotante */}
          {metaDrag?.isDragActive && metaDragPos && metaDragGhost && (
            <div
              className="fixed pointer-events-none z-[9999] px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white shadow-xl"
              style={{
                left: metaDragPos.x - metaDragGhost.offsetX,
                top: metaDragPos.y - metaDragGhost.offsetY,
                width: metaDragGhost.w,
                transform: "scale(1.05)",
                opacity: 0.95,
              }}
            >
              {metaDragGhost.label}
            </div>
          )}
        </div>
      </div>

      {/* Área del diagrama */}
      <div className="flex-1 overflow-auto" ref={containerRef}>
        {layout ? (
          <div className="relative" style={{ width: layout.totalWidth, height: layout.totalHeight, minHeight: "100%" }}>
            {/* Capa SVG - Conectores */}
            {renderConnectors()}

            {/* Capa Nodos */}
            {Array.from(layout.nodes.values()).map(node => 
              node.task ? renderTaskNode(node) : renderMetaNode(node)
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400">
            <div className="text-center">
              <p className="text-sm mb-3">Selecciona o crea una meta</p>
              <button onClick={() => onOpenMetaModal(null)} className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">
                Crear meta
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Indicador de guardado */}
      {savingTaskId && (
        <div className="fixed bottom-4 right-4 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg">
          Guardando...
        </div>
      )}

      {/* Toast de undo (eliminar tarea) */}
      {undoToast && (
        <div className="fixed bottom-4 right-4 px-4 py-3 bg-orange-500 text-white text-sm rounded-lg shadow-lg flex items-center gap-3 z-50">
          <span>Tarea eliminada</span>
          <button
            onClick={() => { handleUndo(); setUndoToast(null); }}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors"
          >
            Deshacer
          </button>
          <span className="text-xs text-white/70">Ctrl+Z</span>
        </div>
      )}

      {/* Drag Ghost - clon visual que sigue el cursor */}
      {dragging?.isDragActive && dragPos && (() => {
        const dragTask = tasks.find(t => t.data.id === dragging.id);
        if (!dragTask) return null;
        const data = dragTask.data;
        const points = data.points ?? 2;
        const scheduleDisplay = getScheduleDisplay(data);
        const isTitleTask = data.kind === "TITLE";
        
        return (
          <div
            className="fixed pointer-events-none z-[9999]"
            style={{
              left: dragPos.x - dragging.offsetX,
              top: dragPos.y - dragging.offsetY,
              width: TASK_NODE_W,
            }}
          >
            <div className="bg-white rounded-lg border-2 border-blue-400 shadow-xl opacity-90">
              {isTitleTask ? (
                <div className="flex items-center justify-center px-3 py-2">
                  <span className="flex-1 text-center text-sm font-semibold text-slate-700">
                    {data.title || "Sin nombre"}
                  </span>
                </div>
              ) : (
                <div className="flex items-center px-3 py-1.5 gap-2">
                  <div className="w-4" />
                  <div className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center text-[10px] font-bold ${data.isCompleted ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 text-slate-500"}`}>
                    {data.isCompleted ? "✓" : points}
                  </div>
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                    <span className={`text-sm leading-snug ${data.isCompleted ? "line-through text-slate-400" : "text-slate-700"}`}>
                      {data.title || <span className="text-slate-400 italic">Sin nombre</span>}
                    </span>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{scheduleDisplay}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Popover chips inline anclado */}
      {inlineEdit && (inlineEdit.field === "bankAccountId" || inlineEdit.field === "forecastLineId" || inlineEdit.field === "repeatDays") && inlineAnchorRef.current && ReactDOM.createPortal(
        (() => {
          const anchorRect = inlineAnchorRef.current!.getBoundingClientRect();
          const task = tasks.find(t => t.data.id === inlineEdit.taskId);
          if (!task) return null;
          const data = task.data;
          
          return (
            <div
              data-inline-editor
              className="fixed z-[9999] px-2 py-1 rounded-md border border-slate-200 bg-white shadow-sm"
              style={{
                left: anchorRect.left + anchorRect.width / 2,
                top: anchorRect.bottom + 6,
                transform: "translateX(-50%)",
              }}
            >
              <div className="flex flex-row flex-wrap justify-center gap-1 max-w-[320px]">
                {inlineEdit.field === "bankAccountId" && (
                  <>
                    <button
                      data-no-drag
                      onClick={(e) => { e.stopPropagation(); setInlineEdit(prev => prev ? { ...prev, draft: "" } : null); commitInline(); }}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${!inlineEdit.draft ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}
                    >
                      Sin banco
                    </button>
                    {bankAccounts.map(ba => (
                      <button
                        key={ba.id}
                        data-no-drag
                        onClick={(e) => { e.stopPropagation(); setInlineEdit(prev => prev ? { ...prev, draft: ba.id } : null); setTimeout(commitInline, 0); }}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${inlineEdit.draft === ba.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}
                      >
                        {ba.name}
                      </button>
                    ))}
                  </>
                )}
                {inlineEdit.field === "forecastLineId" && (
                  <>
                    <button
                      data-no-drag
                      onClick={(e) => { e.stopPropagation(); setInlineEdit(prev => prev ? { ...prev, draft: "" } : null); commitInline(); }}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${!inlineEdit.draft ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}
                    >
                      Sin asociar
                    </button>
                    {/* SOLO HOJAS (sin filtrar por type) */}
                    {onlyLeafForecasts.map(fl => (
                      <button
                        key={fl.id}
                        data-no-drag
                        onClick={(e) => { e.stopPropagation(); setInlineEdit(prev => prev ? { ...prev, draft: fl.id } : null); setTimeout(commitInline, 0); }}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${inlineEdit.draft === fl.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}
                      >
                        {fl.name}
                      </button>
                    ))}
                  </>
                )}
                {inlineEdit.field === "repeatDays" && (
                  <>
                    {WEEKDAY_CODES.map(day => {
                      const selected = (inlineEdit.draft as WeekdayCode[]).includes(day);
                      return (
                        <button
                          key={day}
                          data-no-drag
                          onClick={(e) => {
                            e.stopPropagation();
                            const current = inlineEdit.draft as WeekdayCode[];
                            const next = selected ? current.filter(d => d !== day) : [...current, day];
                            setInlineEdit(prev => prev ? { ...prev, draft: next } : null);
                          }}
                          className={`text-xs w-7 h-7 rounded-full border transition-colors ${selected ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}
                        >
                          {day}
                        </button>
                      );
                    })}
                    <button
                      data-no-drag
                      onClick={(e) => { e.stopPropagation(); commitInline(); }}
                      className="ml-1 text-xs px-2 py-0.5 rounded-full bg-blue-500 text-white hover:bg-blue-600"
                    >
                      OK
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
}


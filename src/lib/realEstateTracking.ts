// src/lib/realEstateTracking.ts — Seguimiento y gestión de una Inversión Inmobiliaria (WEB).
//
// Estos tipos amplían REOperation con la capa de GESTIÓN Y CONTROL (gastos reales,
// ventas, hitos, progreso, media y compartición con inversores). Se almacenan
// ANIDADOS dentro de REOperation (columna JSON `operaciones_inmobiliarias.data`),
// por lo que NO requieren nueva tabla ni migración: viajan con la operación en el
// mismo sync engine (ver src/sync/syncEngine.ts → pushItem serializa el item entero).
//
// Shapes IDÉNTICOS a APP/models/realEstateTracking.ts para que los datos sean
// compatibles entre WEB y APP (misma tabla, mismo blob JSON). No inventar campos.
//
// Todos los campos numéricos son opcionales: cuando faltan, la capa de cálculo los
// trata como "no disponible" (null) — nunca como 0 inventado.

// ── Gastos ────────────────────────────────────────────────────────────────────

export type REExpenseCategory =
  | "COMPRA"
  | "IMPUESTOS"
  | "NOTARIA"
  | "REGISTRO"
  | "LICENCIAS"
  | "PROYECTO_TECNICO"
  | "ARQUITECTO"
  | "APAREJADOR"
  | "INGENIERIA"
  | "OBRA"
  | "MATERIALES"
  | "MANO_OBRA"
  | "INSTALACIONES"
  | "SUMINISTROS"
  | "MOBILIARIO"
  | "COMERCIALIZACION"
  | "FINANCIACION"
  | "INTERESES"
  | "COMISIONES"
  | "OTROS";

export const RE_EXPENSE_CATEGORIES: { key: REExpenseCategory; label: string }[] = [
  { key: "COMPRA", label: "Compra" },
  { key: "IMPUESTOS", label: "Impuestos" },
  { key: "NOTARIA", label: "Notaría" },
  { key: "REGISTRO", label: "Registro" },
  { key: "LICENCIAS", label: "Licencias" },
  { key: "PROYECTO_TECNICO", label: "Proyecto técnico" },
  { key: "ARQUITECTO", label: "Arquitecto" },
  { key: "APAREJADOR", label: "Aparejador" },
  { key: "INGENIERIA", label: "Ingeniería" },
  { key: "OBRA", label: "Obra" },
  { key: "MATERIALES", label: "Materiales" },
  { key: "MANO_OBRA", label: "Mano de obra" },
  { key: "INSTALACIONES", label: "Instalaciones" },
  { key: "SUMINISTROS", label: "Suministros" },
  { key: "MOBILIARIO", label: "Mobiliario" },
  { key: "COMERCIALIZACION", label: "Comercialización" },
  { key: "FINANCIACION", label: "Financiación" },
  { key: "INTERESES", label: "Intereses" },
  { key: "COMISIONES", label: "Comisiones" },
  { key: "OTROS", label: "Otros" },
];

export const RE_EXPENSE_CATEGORY_LABEL: Record<REExpenseCategory, string> =
  RE_EXPENSE_CATEGORIES.reduce(
    (acc, c) => {
      acc[c.key] = c.label;
      return acc;
    },
    {} as Record<REExpenseCategory, string>,
  );

export type REExpenseStatus = "PENDIENTE" | "PARCIAL" | "PAGADO";

export const RE_EXPENSE_STATUS_LABEL: Record<REExpenseStatus, string> = {
  PENDIENTE: "Pendiente",
  PARCIAL: "Parcial",
  PAGADO: "Pagado",
};

export type REExpense = {
  id: string;
  category: REExpenseCategory;
  concept: string;
  provider?: string;
  estimated?: number; // importe estimado (presupuestado)
  real?: number; // importe real (facturado)
  paid?: number; // cantidad ya pagada (para calcular pendiente)
  status: REExpenseStatus;
  date?: string; // ISO (yyyy-mm-dd)
  invoiceUri?: string; // factura por enlace externo (http)
  invoiceName?: string; // nombre visible de la factura
  invoiceStoragePath?: string; // ruta en Storage cuando la factura es un archivo subido
  invoiceBucket?: string;
  invoiceMime?: string;
  invoiceSize?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

// ── Ventas ────────────────────────────────────────────────────────────────────

export type RESaleStatus =
  | "DISPONIBLE"
  | "RESERVADO"
  | "SENALADO" // señalado
  | "APALABRADO"
  | "VENDIDO";

export const RE_SALE_STATUS_LABEL: Record<RESaleStatus, string> = {
  DISPONIBLE: "Disponible",
  RESERVADO: "Reservado",
  SENALADO: "Señalado",
  APALABRADO: "Apalabrado",
  VENDIDO: "Vendido",
};

export const RE_SALE_STATUSES: RESaleStatus[] = [
  "DISPONIBLE",
  "RESERVADO",
  "SENALADO",
  "APALABRADO",
  "VENDIDO",
];

// Estados que consideramos "cerrada" (ingreso comprometido/realizado).
export const RE_SALE_CLOSED_STATUSES: RESaleStatus[] = ["VENDIDO"];
export const RE_SALE_COMMITTED_STATUSES: RESaleStatus[] = [
  "RESERVADO",
  "SENALADO",
  "APALABRADO",
  "VENDIDO",
];

export type RESale = {
  id: string;
  title: string; // unidad o activo (ej. "Vivienda 1ºA")
  unitId?: string; // vínculo opcional a REUnit
  estimatedPrice?: number; // precio estimado
  realPrice?: number; // precio real de venta
  status: RESaleStatus;
  date?: string; // ISO
  buyer?: string; // cliente / comprador
  deposit?: number; // señal entregada
  collected?: number; // ingreso ya cobrado
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

// ── Hitos / tiempos / pagos pendientes ──────────────────────────────────────────

export type REMilestoneStatus = "PENDIENTE" | "EN_CURSO" | "COMPLETADO" | "DESVIADO";

export const RE_MILESTONE_STATUS_LABEL: Record<REMilestoneStatus, string> = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  COMPLETADO: "Completado",
  DESVIADO: "Desviado",
};

export const RE_MILESTONE_STATUSES: REMilestoneStatus[] = [
  "PENDIENTE",
  "EN_CURSO",
  "COMPLETADO",
  "DESVIADO",
];

// Hitos base sugeridos para una promoción (el usuario puede añadir/editar libremente).
export const RE_MILESTONE_TEMPLATES: string[] = [
  "Licencias",
  "Proyecto técnico",
  "Inicio de obra",
  "Fin de obra",
  "Comercialización",
  "Ventas",
  "Escrituración",
  "Entrega",
];

export type REMilestone = {
  id: string;
  title: string;
  status: REMilestoneStatus;
  dueDate?: string; // ISO — fecha prevista
  realDate?: string; // ISO — fecha real
  amountPending?: number; // pago pendiente asociado al hito
  note?: string;
  createdAt: string;
  updatedAt: string;
};

// ── Media (fotos / vídeos del estado actual / evolución) ─────────────────────────

export type REMediaType = "FOTO" | "VIDEO";

export type REMediaItem = {
  id: string;
  type: REMediaType;
  uri: string; // enlace externo (http) — vacío cuando es un archivo subido a Storage
  storagePath?: string; // ruta en el bucket cuando es archivo subido (Supabase Storage)
  bucket?: string; // bucket del archivo subido
  mime?: string;
  size?: number;
  caption?: string;
  date?: string; // ISO — fecha del estado capturado
  createdAt: string;
};

// ── Progreso / tiempos ──────────────────────────────────────────────────────────

export type REProgress = {
  obraPct?: number; // 0-100, avance de obra (manual)
  licenciasPct?: number; // 0-100, licencias completadas (manual)
  startDate?: string; // ISO — inicio de obra/proyecto
  endDateEstimated?: string; // ISO — fin estimado
};

// ── Reparto de rentabilidad promotor / inversor ─────────────────────────────────

export type REInvestorSplit = {
  investorCapital?: number; // capital aportado por los inversores
  investorSharePct?: number; // % del beneficio para el inversor (0-100)
  // La parte del promotor se deriva: 100 - investorSharePct.
};

// ── Compartición con inversores + visibilidad granular ───────────────────────────

export type REVisibilityKey =
  | "resumen"
  | "progreso"
  | "media"
  | "hitos"
  | "tiempos"
  | "gastos"
  | "gastosImportes"
  | "facturas"
  | "ventas"
  | "ventasPrecios"
  | "costesTotales"
  | "ingresos"
  | "pendientePago"
  | "rentabilidadEstimada"
  | "rentabilidadReal"
  | "rentabilidadPromotor"
  | "rentabilidadInversor";

export const RE_VISIBILITY_DEFS: {
  key: REVisibilityKey;
  label: string;
  group: string;
  sensitive: boolean; // true = dato financiero sensible (oculto por defecto)
}[] = [
  { key: "resumen", label: "Resumen de la operación", group: "General", sensitive: false },
  { key: "progreso", label: "Barras de avance", group: "General", sensitive: false },
  { key: "media", label: "Fotos y vídeos", group: "General", sensitive: false },
  { key: "hitos", label: "Hitos", group: "General", sensitive: false },
  { key: "tiempos", label: "Tiempos estimados", group: "General", sensitive: false },
  { key: "gastos", label: "Tabla de gastos", group: "Gastos", sensitive: false },
  { key: "gastosImportes", label: "Importes de los gastos", group: "Gastos", sensitive: true },
  { key: "facturas", label: "Facturas asociadas", group: "Gastos", sensitive: true },
  { key: "ventas", label: "Estado de ventas", group: "Ventas", sensitive: false },
  { key: "ventasPrecios", label: "Precios de venta", group: "Ventas", sensitive: true },
  { key: "costesTotales", label: "Costes totales acumulados", group: "Financiero", sensitive: true },
  { key: "ingresos", label: "Ingresos obtenidos", group: "Financiero", sensitive: true },
  { key: "pendientePago", label: "Cantidades pendientes de pago", group: "Financiero", sensitive: true },
  { key: "rentabilidadEstimada", label: "Rentabilidad estimada", group: "Rentabilidad", sensitive: true },
  { key: "rentabilidadReal", label: "Rentabilidad real", group: "Rentabilidad", sensitive: true },
  { key: "rentabilidadPromotor", label: "Rentabilidad del promotor", group: "Rentabilidad", sensitive: true },
  { key: "rentabilidadInversor", label: "Rentabilidad del inversor", group: "Rentabilidad", sensitive: true },
];

export type REShareRecipient = {
  id: string;
  name: string;
  email?: string;
};

export type REShareSettings = {
  enabled: boolean;
  recipients?: REShareRecipient[];
  visibility: Record<REVisibilityKey, boolean>;
};

/**
 * Visibilidad por defecto: los datos financieros SENSIBLES quedan OCULTOS.
 * Solo se muestran, por defecto, general/progreso/media/hitos/tiempos y las
 * tablas de gastos/ventas SIN importes ni precios. El promotor decide activar
 * cada dato sensible de forma explícita.
 */
export function defaultVisibility(
  overrides?: Partial<Record<REVisibilityKey, boolean>>,
): Record<REVisibilityKey, boolean> {
  const base = {} as Record<REVisibilityKey, boolean>;
  for (const def of RE_VISIBILITY_DEFS) {
    base[def.key] = def.sensitive ? false : true;
  }
  return { ...base, ...(overrides ?? {}) };
}

export function defaultShareSettings(
  overrides?: Partial<Record<REVisibilityKey, boolean>>,
): REShareSettings {
  return {
    enabled: false,
    recipients: [],
    visibility: defaultVisibility(overrides),
  };
}

// ── Utilidad de id estable (sin dependencias) ────────────────────────────────────

export function newTrackingId(prefix: string): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rnd}`;
}

// ── Fábricas de filas nuevas (compartidas por paneles y acciones rápidas del hub) ─

export function makeExpense(): REExpense {
  const now = new Date().toISOString();
  return { id: newTrackingId("exp"), category: "OTROS", concept: "", status: "PENDIENTE", createdAt: now, updatedAt: now };
}

export function makeSale(): RESale {
  const now = new Date().toISOString();
  return { id: newTrackingId("sale"), title: "", status: "DISPONIBLE", createdAt: now, updatedAt: now };
}

export function makeMilestone(title = ""): REMilestone {
  const now = new Date().toISOString();
  return { id: newTrackingId("ms"), title, status: "PENDIENTE", createdAt: now, updatedAt: now };
}

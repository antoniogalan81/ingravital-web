// ==================== TIPOS ====================

export interface BankAccountFull {
  id: string;
  name: string;
  type?: "PERSONAL" | "SOCIEDAD";
  balance?: number;
  order?: number;
}

export interface ForecastTypeState {
  base?: number;
  expected?: number;
  variable?: boolean;
  cutoffISO?: string | null;
}

export interface ForecastMonthState {
  INGRESO?: ForecastTypeState;
  GASTO?: ForecastTypeState;
  expected?: number;
  base?: number;
}

export type ForecastMonths = Record<string, ForecastMonthState>;

export interface ForecastLineFull {
  id: string;
  name: string;
  type: "INGRESO" | "GASTO";
  parentId?: string | null;
  months?: ForecastMonths;
  enabledTypes?: { INGRESO?: boolean; GASTO?: boolean };
  order?: number;
}

export interface FinanceMovement {
  id: string;
  date: string;
  concept: string;
  amount: number;
  type: "INGRESO" | "GASTO";
  accountId?: string;
  forecastId?: string;
  note?: string;
}

// ==================== FORMATTERS ====================

export function formatNumberES(n: number): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "0";
  if (Number.isInteger(n)) {
    return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n);
  }
  const formatted = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(n);
  return formatted.replace(/,(\d)0$/, ",$1");
}

export function formatEUR(amount?: number): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return "0 €";
  return `${formatNumberES(amount)} €`;
}

export function parseEURInput(value: string): number | null {
  if (!value || value.trim() === "") return null;
  let clean = value.replace(/[€\s]/g, "").trim();
  const hasSpanishFormat = clean.includes(",") && (clean.indexOf(",") > clean.lastIndexOf(".") || !clean.includes("."));
  if (hasSpanishFormat) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else {
    clean = clean.replace(/,/g, "");
  }
  const num = parseFloat(clean);
  return Number.isNaN(num) ? null : num;
}

// ==================== DATE HELPERS ====================

export function getCurrentMonthId(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getMonthLabel(monthId: string): string {
  const [year, month] = monthId.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  const label = date.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function addMonths(monthId: string, delta: number): string {
  const [year, month] = monthId.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

// ==================== ID GENERATION ====================

export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function generateLocalId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// ==================== FORECAST HELPERS ====================

export function getMonthExpected(
  line: ForecastLineFull,
  monthId: string,
  type: "INGRESO" | "GASTO"
): number {
  const m = line.months?.[monthId];
  if (!m) return 0;
  const typeState = m[type];
  if (typeState) {
    if (typeof typeState.expected === "number") return typeState.expected;
    if (typeof typeState.base === "number") return typeState.base;
  }
  if (line.type === type) {
    if (typeof m.expected === "number") return m.expected;
    if (typeof m.base === "number") return m.base;
  }
  return 0;
}

export function getMonthBase(
  line: ForecastLineFull,
  monthId: string,
  type: "INGRESO" | "GASTO"
): number {
  const m = line.months?.[monthId];
  if (!m) return 0;
  const typeState = m[type];
  if (typeState) {
    if (typeof typeState.base === "number") return typeState.base;
  }
  // Legacy fallback
  if (line.type === type) {
    if (typeof m.base === "number") return m.base;
  }
  return 0;
}

// ==================== UI COLORS ====================

export const FIN_COLORS = {
  real: {
    chip: "text-slate-700 border-slate-300 bg-slate-50",
    label: "text-slate-700",
  },
  prev: {
    chip: "text-blue-600 border-blue-300 bg-blue-50",
    label: "text-blue-600",
  },
  dif: {
    chip: "text-slate-900 border-slate-400 bg-slate-50",
    label: "text-slate-900",
  },
  ingreso: {
    chip: "text-green-600 border-green-300 bg-green-50",
    label: "text-green-600",
  },
  gasto: {
    chip: "text-red-600 border-red-300 bg-red-50",
    label: "text-red-600",
  },
  total: {
    chip: "text-slate-800 border-slate-300 bg-slate-50",
    label: "text-slate-800",
  },
  sourceTitle: "text-slate-900 font-bold text-base",
  sourceChipActive: "bg-blue-50 text-blue-700 border-blue-300",
  sourceChipInactive: "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
} as const;

export function getFinanceChipClass({
  variant,
  selected,
}: {
  variant: "REAL" | "PREV" | "GASTO" | "GASTOS" | "INGRESO" | "TOTAL" | "DIF";
  selected: boolean;
}): string {
  const base = "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition select-none cursor-pointer";
  const map: Record<typeof variant, { on: string; off: string }> = {
    REAL: {
      on: "bg-[color:#4F9D3C] text-white border-[color:#4F9D3C]",
      off: "bg-white text-[color:#4F9D3C] border-[color:#4F9D3C] hover:bg-[color:#4F9D3C]/10",
    },
    PREV: {
      on: "bg-[color:#CD966C] text-white border-[color:#CD966C]",
      off: "bg-white text-[color:#CD966C] border-[color:#CD966C] hover:bg-[color:#CD966C]/10",
    },
    GASTO: {
      on: "bg-red-600 text-white border-red-600",
      off: "bg-white text-red-600 border-red-300 hover:bg-red-50",
    },
    GASTOS: {
      on: "bg-red-600 text-white border-red-600",
      off: "bg-white text-red-600 border-red-300 hover:bg-red-50",
    },
    INGRESO: {
      on: "bg-green-600 text-white border-green-600",
      off: "bg-white text-green-600 border-green-300 hover:bg-green-50",
    },
    TOTAL: {
      on: "bg-black text-white border-black",
      off: "bg-white text-slate-700 border-slate-300 hover:bg-slate-50",
    },
    DIF: {
      on: "bg-black text-white border-black",
      off: "bg-white text-slate-700 border-slate-300 hover:bg-slate-50",
    },
  };
  const key = (variant === "GASTOS" ? "GASTO" : variant) as keyof typeof map;
  const variantClasses = selected ? map[key].on : map[key].off;
  return `${base} ${variantClasses}`;
}


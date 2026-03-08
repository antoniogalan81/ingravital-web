// ==================== MOVEMENT UTILITIES ====================
// Cloned 1:1 from APP (Expo/Zustand) logic

import type { BankAccountFull, FinanceMovement } from "./financeData";

// ==================== CATEGORIES ====================

export const DEFAULT_EXPENSE_CATEGORIES = ["Gasolina", "Comida", "Supermercado", "Alquiler", "Otro"];
export const DEFAULT_INCOME_CATEGORIES = ["Sueldo", "Alquiler", "Bolsa"];

const CUSTOM_CATEGORIES_KEY = "ingravital_custom_categories";

export function loadCustomCategories(): { expense: string[]; income: string[] } {
  if (typeof window === "undefined") return { expense: [], income: [] };
  try {
    const stored = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { expense: [], income: [] };
}

export function saveCustomCategories(cats: { expense: string[]; income: string[] }): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(cats));
  } catch { /* ignore */ }
}

// ==================== CONCEPT / LABEL / NOTE ====================

export function extractNameFromConcept(concept: string): string {
  if (concept.includes(" - ")) {
    return concept.split(" - ")[0].trim();
  }
  return concept;
}

export function buildConceptAndLabel(
  selectedLabel: string | null,
  movementName: string,
  movementNote: string,
): { concept: string; label: string | null; tags: string[] } {
  const trimmedNote = movementNote.trim();
  const nameTrimmed = movementName.trim();
  const finalLabel = selectedLabel ?? null;
  const nameValue = (finalLabel ?? nameTrimmed).trim();

  let conceptValue: string;
  if (nameValue && trimmedNote) {
    conceptValue = `${nameValue} - ${trimmedNote}`;
  } else if (nameValue) {
    conceptValue = nameValue;
  } else if (trimmedNote) {
    conceptValue = trimmedNote;
  } else {
    conceptValue = "Sin concepto";
  }

  return {
    concept: conceptValue,
    label: nameValue || null,
    tags: nameValue ? [nameValue] : [],
  };
}

// ==================== FREQUENCY / NOTE ====================

export function buildFrequencyText(
  frequency: "PUNTUAL" | "SEMANAL" | "MENSUAL",
  weeklyDays: string[],
  weeklyTime: string,
  monthlyDay: number,
  monthlyTime: string,
): string | null {
  if (frequency === "SEMANAL" && weeklyDays.length > 0) {
    const daysCsv = weeklyDays.join(",");
    const timeOpt = weeklyTime ? ` ${weeklyTime}` : "";
    return `Freq semanal: ${daysCsv}${timeOpt}`;
  }
  if (frequency === "MENSUAL") {
    const day = Math.max(1, Math.min(31, monthlyDay));
    const timeOpt = monthlyTime ? ` ${monthlyTime}` : "";
    return `Freq mensual: dia ${day}${timeOpt}`;
  }
  return null;
}

export function buildFinalNote(
  noteBase: string | null,
  freqText: string | null,
): string | null {
  if (!freqText) return noteBase;
  if (noteBase) return `${noteBase} | ${freqText}`;
  return freqText;
}

// Regex idéntica a la APP
const WEEKLY_REGEX = /(?:\| )?Freq semanal: ([LMXJVSD](?:,[LMXJVSD])*)(?: (\d{2}:\d{2}))?/;
const MONTHLY_REGEX = /(?:\| )?Freq mensual: dia (\d{1,2})(?: (\d{2}:\d{2}))?/;

export function parseWeeklyFromNote(note: string): { days: string[]; time?: string } | null {
  const match = note.match(WEEKLY_REGEX);
  if (!match) return null;
  const days = match[1].split(",");
  return { days, time: match[2] || undefined };
}

export function parseMonthlyFromNote(note: string): { day: number; time?: string } | null {
  const match = note.match(MONTHLY_REGEX);
  if (!match) return null;
  return { day: parseInt(match[1], 10), time: match[2] || undefined };
}

export function extractBaseNote(note: string): string {
  return note.replace(/\s*\|\s*Freq (semanal|mensual):.*$/, "").trim();
}

// ==================== BALANCE ====================

/**
 * applyMovementToAccounts – idéntico a APP.
 * direction +1 = aplicar, -1 = revertir
 */
export function applyMovementToAccounts(
  accounts: BankAccountFull[],
  movement: { accountId?: string | null; type: "INGRESO" | "GASTO"; amount: number },
  direction: 1 | -1,
): BankAccountFull[] {
  if (!movement.accountId) return accounts;
  const delta = (movement.type === "GASTO" ? -movement.amount : movement.amount) * direction;
  return accounts.map((acc) => {
    if (acc.id !== movement.accountId) return acc;
    return { ...acc, balance: (acc.balance ?? 0) + delta };
  });
}

// ==================== LOCAL ID ====================

export function generateMovementLocalId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// ==================== ACCOUNT ORDER (stable) ====================

export function sortAccountsStable(accounts: BankAccountFull[]): BankAccountFull[] {
  return [...accounts].sort((a, b) => {
    const orderA = a.order ?? 0;
    const orderB = b.order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    const createdA = (a as BankAccountFull & { createdAt?: string }).createdAt || "";
    const createdB = (b as BankAccountFull & { createdAt?: string }).createdAt || "";
    if (createdA !== createdB) return createdA < createdB ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

// ==================== DATE HELPERS ====================

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDateLabel(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isoToInputDate(iso: string): string {
  // YYYY-MM-DD → DD/MM/YYYY
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function inputDateToISO(input: string): string | null {
  const parts = input.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length !== 4) return null;
  const date = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T12:00:00`);
  if (isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

// ==================== UI PERSISTENCE ====================

const FINANCE_UI_KEY = "ingravital_finance_ui";

export interface FinanceUIState {
  accountsExpanded: boolean;
  movementsExpanded: boolean;
  incomeSourcesExpanded: boolean;
  subSourceExpandedById: Record<string, boolean>;
  lastUsedMovementAccountId: string | null;
}

const DEFAULT_FINANCE_UI: FinanceUIState = {
  accountsExpanded: true,
  movementsExpanded: true,
  incomeSourcesExpanded: true,
  subSourceExpandedById: {},
  lastUsedMovementAccountId: null,
};

export function loadFinanceUI(): FinanceUIState {
  if (typeof window === "undefined") return DEFAULT_FINANCE_UI;
  try {
    const stored = localStorage.getItem(FINANCE_UI_KEY);
    if (stored) return { ...DEFAULT_FINANCE_UI, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return DEFAULT_FINANCE_UI;
}

export function saveFinanceUI(state: FinanceUIState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FINANCE_UI_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}


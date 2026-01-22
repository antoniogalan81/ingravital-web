import type { BankAccountFull, ForecastLineFull, ForecastMonths, ForecastTypeState } from "./financeData";

function cleanObject<T extends Record<string, unknown>>(obj: T, preserveKeys: string[] = []): Partial<T> {
  const keep = new Set(preserveKeys);
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (keep.has(k)) {
      (out as Record<string, unknown>)[k] = v;
      continue;
    }
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function normalizeBankAccountForDbWeb(acc: Partial<BankAccountFull> & { id: string; createdAt?: string; updatedAt?: string }): Record<string, unknown> {
  const now = new Date().toISOString();
  const name = typeof acc.name === "string" ? acc.name : "";
  const type = acc.type === "SOCIEDAD" ? "SOCIEDAD" : "PERSONAL";
  const order = Number.isFinite(acc.order) ? Number(acc.order) : 0;
  const balance = Number.isFinite(acc.balance) ? Number(acc.balance) : 0;

  return cleanObject(
    {
      id: acc.id,
      name,
      type,
      order,
      balance,
      createdAt: acc.createdAt || now,
      updatedAt: now,
    },
    ["id", "name", "type", "order", "balance", "createdAt", "updatedAt"]
  );
}

function normalizeTypeState(state?: ForecastTypeState): ForecastTypeState | undefined {
  if (!state) return undefined;
  const base = Number.isFinite(state.base) ? Number(state.base) : 0;
  const expected = Number.isFinite(state.expected) ? Number(state.expected) : 0;
  const variable = state.variable === true ? true : undefined;
  const cutoffISO = typeof state.cutoffISO === "string" && state.cutoffISO ? state.cutoffISO : undefined;

  const cleaned = cleanObject<ForecastTypeState>(
    { base, expected, variable, cutoffISO },
    ["base", "expected"]
  );
  return Object.keys(cleaned).length > 0 ? (cleaned as ForecastTypeState) : undefined;
}

function normalizeMonths(months?: ForecastMonths): ForecastMonths | undefined {
  if (!months) return undefined;
  const result: ForecastMonths = {};
  for (const [monthId, monthData] of Object.entries(months)) {
    const ingreso = normalizeTypeState(monthData.INGRESO);
    const gasto = normalizeTypeState(monthData.GASTO);
    const cleanedMonth: ForecastMonthState = {};
    if (ingreso) cleanedMonth.INGRESO = ingreso;
    if (gasto) cleanedMonth.GASTO = gasto;
    if (Object.keys(cleanedMonth).length > 0) {
      result[monthId] = cleanedMonth;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function normalizeForecastSourceForDbWeb(line: Partial<ForecastLineFull> & { id: string; createdAt?: string; updatedAt?: string }): Record<string, unknown> {
  const now = new Date().toISOString();
  const name = typeof line.name === "string" ? line.name : "";
  const order = Number.isFinite(line.order) ? Number(line.order) : 0;
  const enabledTypes = {
    GASTO: line.enabledTypes?.GASTO === true,
    INGRESO: line.enabledTypes?.INGRESO === true,
  };

  const normalizedMonths = normalizeMonths(line.months);

  const parentId = typeof line.parentId === "string" && line.parentId ? line.parentId : undefined;

  const payload: Record<string, unknown> = {
    id: line.id,
    name,
    order,
    enabledTypes,
    parentId,
    months: normalizedMonths,
    createdAt: line.createdAt || now,
    updatedAt: now,
  };

  // Eliminar type siempre y limpiar null/undefined/objetos vacíos
  delete (payload as any).type;
  const cleaned = cleanObject(payload, ["id", "name", "order", "enabledTypes", "createdAt", "updatedAt"]);
  if (parentId) cleaned.parentId = parentId;
  if (normalizedMonths) cleaned.months = normalizedMonths;

  return cleaned;
}


import type { TaskData } from "@/src/lib/types";

export type WeekdayCode = "L" | "M" | "X" | "J" | "V" | "S" | "D";
export const WEEKDAY_CODES: WeekdayCode[] = ["L", "M", "X", "J", "V", "S", "D"];

export type SubUnit = "min" | "hor" | "pasos" | "pag" | "kg" | "km";

export function getTodayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function isTaskUnscheduled(data: TaskData): boolean {
  if (data.extra?.unscheduled === true) return true;
  if (data.extra?.unscheduled === false) return false;
  if (data.extra?.frequency) return false;
  return !data.date && !data.repeatRule;
}

export function normalizeWeeklyDays(weeklyDays: unknown): WeekdayCode[] {
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

export function isPhysLike(data: TaskData | Partial<TaskData> | undefined): boolean {
  return !!data && data.type === "ACTIVIDAD" && (data.scope === "FISICO" || data.scope === "CRECIMIENTO");
}

export function coerceUnitFromLegacy(unit?: string | null): SubUnit | undefined {
  if (!unit) return undefined;
  if (unit === "h") return "hor";
  const known: SubUnit[] = ["min", "hor", "pasos", "pag", "kg", "km"];
  return known.includes(unit as SubUnit) ? (unit as SubUnit) : undefined;
}

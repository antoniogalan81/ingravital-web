// src/lib/management.ts — Campos de GESTIÓN OPERATIVA de una operación (WEB).
//
// Campos OPCIONALES persistidos en el JSON de REOperation (sin migración): prioridad,
// temperatura, probabilidad y próxima acción. No incluye `owner` porque el proyecto
// no tiene aún un concepto real de usuario/responsable (no se inventa).

export type Priority = "alta" | "media" | "baja";
export type Temperature = "fria" | "templada" | "caliente";

export type PriorityDef = { key: Priority; label: string; color: string; soft: string };
export type TemperatureDef = { key: Temperature; label: string; color: string; soft: string; icon: string };

export const PRIORITIES: PriorityDef[] = [
  { key: "alta", label: "Alta", color: "#c0392b", soft: "#fbe9e7" },
  { key: "media", label: "Media", color: "#b7791f", soft: "#fbf1dd" },
  { key: "baja", label: "Baja", color: "#697586", soft: "#f1f4f8" },
];

export const TEMPERATURES: TemperatureDef[] = [
  { key: "caliente", label: "Caliente", color: "#c0392b", soft: "#fbe9e7", icon: "🔥" },
  { key: "templada", label: "Templada", color: "#b7791f", soft: "#fbf1dd", icon: "🌤️" },
  { key: "fria", label: "Fría", color: "#1e4fa3", soft: "#e8eff9", icon: "❄️" },
];

const PRIORITY_MAP = PRIORITIES.reduce((a, p) => { a[p.key] = p; return a; }, {} as Record<Priority, PriorityDef>);
const TEMPERATURE_MAP = TEMPERATURES.reduce((a, t) => { a[t.key] = t; return a; }, {} as Record<Temperature, TemperatureDef>);

const PRIORITY_KEYS = new Set<string>(PRIORITIES.map((p) => p.key));
const TEMPERATURE_KEYS = new Set<string>(TEMPERATURES.map((t) => t.key));

export function priorityDef(v: string | undefined): PriorityDef | null {
  return v && PRIORITY_KEYS.has(v) ? PRIORITY_MAP[v as Priority] : null;
}
export function temperatureDef(v: string | undefined): TemperatureDef | null {
  return v && TEMPERATURE_KEYS.has(v) ? TEMPERATURE_MAP[v as Temperature] : null;
}

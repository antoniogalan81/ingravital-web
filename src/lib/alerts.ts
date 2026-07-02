// src/lib/alerts.ts — Alertas de gestión de una operación. Puras y honestas:
// si falta el dato necesario, NO se genera la alerta (nada inventado).

import type { REOperation } from "./realEstate";
import { stageOf } from "./pipeline";
import { expenseTotals } from "./realEstateTrackingCalc";

export type AlertSeverity = "danger" | "warn" | "info";
export type OpAlert = { key: string; severity: AlertSeverity; text: string };

export const STALE_DAYS = 30; // sin actividad reciente
export const OFERTA_STALE_DAYS = 21; // "Oferta" parada
export const SOON_DAYS = 7; // próxima acción inminente

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 86_400_000;
}

/** Días hasta una fecha ISO (yyyy-mm-dd); negativo = ya vencida. null si inválida. */
function daysUntil(iso: string | undefined, nowISO: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  const n = Date.parse(nowISO.slice(0, 10));
  if (!Number.isFinite(t) || !Number.isFinite(n)) return null;
  return Math.round((t - n) / 86_400_000);
}

/**
 * Alertas de una operación en el momento `nowISO`. Se apoya en `Date.now()` para la
 * antigüedad por updatedAt (dato real del sync) y en las fechas de próxima acción.
 */
export function computeOpAlerts(op: REOperation, nowISO: string): OpAlert[] {
  const out: OpAlert[] = [];

  const due = daysUntil(op.nextActionDueDate, nowISO);
  if (op.nextActionText && op.nextActionText.trim() && due != null) {
    if (due < 0) out.push({ key: "action_overdue", severity: "danger", text: "Próxima acción vencida" });
    else if (due <= SOON_DAYS) out.push({ key: "action_soon", severity: "warn", text: `Acción en ${due} día${due === 1 ? "" : "s"}` });
  }

  const idle = daysSince(op.updatedAt);
  if (idle != null && idle > STALE_DAYS) out.push({ key: "stale", severity: "warn", text: "Sin actividad reciente" });
  if (stageOf(op) === "oferta" && idle != null && idle > OFERTA_STALE_DAYS)
    out.push({ key: "oferta_stale", severity: "warn", text: "Oferta sin mover" });

  if (op.isDraft || !(op.purchasePrice > 0)) out.push({ key: "no_key_data", severity: "info", text: "Sin datos clave" });

  const exp = expenseTotals(op);
  if (exp.hasData && exp.diff > 0) out.push({ key: "over_cost", severity: "danger", text: "Gasto real sobre estimado" });

  return out;
}

/** Ordena por severidad (danger > warn > info) para mostrar primero lo importante. */
export function sortAlerts(alerts: OpAlert[]): OpAlert[] {
  const rank: Record<AlertSeverity, number> = { danger: 0, warn: 1, info: 2 };
  return [...alerts].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export const ALERT_COLOR: Record<AlertSeverity, { color: string; soft: string }> = {
  danger: { color: "var(--negative)", soft: "var(--negative-soft)" },
  warn: { color: "var(--warning)", soft: "var(--warning-soft)" },
  info: { color: "var(--ink-muted)", soft: "#f1f4f8" },
};

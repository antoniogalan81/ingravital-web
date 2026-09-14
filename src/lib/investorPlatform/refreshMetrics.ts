// src/lib/investorPlatform/refreshMetrics.ts — Recalcula `investment_opportunities.metrics`
// desde los datos ACTUALES de la operación. Única capa de recálculo: la usan la ruta
// /api/investor/refresh-metrics (al abrir la oportunidad) y las pruebas.
//
// Cualquier cambio relevante (gasto, financiación, venta, unidad, cobro, documento aprobado,
// propuesta IA, cambio en la APP) queda reflejado la próxima vez que un inversor mira: no
// depende de volver a guardar la oferta ni de que el promotor tenga la WEB abierta.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { REOperation } from "../realEstate";
import { calcResults } from "../realEstateCalc";
import { buildOpportunityMetrics } from "./metrics";

export type RefreshResult = { refreshed: boolean; reason?: "not_found" | "unchanged" };

/** JSON canónico (claves ordenadas): `jsonb` no conserva el orden de las claves. */
const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`
      : JSON.stringify(v ?? null);

const withoutStamp = (m: unknown) => {
  if (!m || typeof m !== "object") return m;
  const { generatedAt: _g, ...rest } = m as Record<string, unknown>;
  return rest;
};

/**
 * `admin` = cliente con la clave de servidor. La AUTORIZACIÓN la hace el llamante antes
 * (con la sesión del inversor): aquí solo se lee la cadena invitación → oportunidad →
 * operación del MISMO propietario y se escribe la columna `metrics`.
 */
export async function refreshOpportunityMetrics(admin: SupabaseClient, invitationId: string, nowISO = new Date().toISOString()): Promise<RefreshResult> {
  const { data: inv, error: e1 } = await admin.from("opportunity_invitations").select("opportunity_id, owner_id").eq("id", invitationId).maybeSingle();
  if (e1) throw e1;
  if (!inv) return { refreshed: false, reason: "not_found" };

  const { data: opp, error: e2 } = await admin
    .from("investment_opportunities")
    .select("id, operation_id, owner_id, metrics")
    .eq("id", inv.opportunity_id)
    .eq("owner_id", inv.owner_id)
    .maybeSingle();
  if (e2) throw e2;
  if (!opp) return { refreshed: false, reason: "not_found" };

  const { data: row, error: e3 } = await admin
    .from("operaciones_inmobiliarias")
    .select("id, data")
    .eq("id", opp.operation_id)
    .eq("user_id", opp.owner_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (e3) throw e3;
  if (!row) return { refreshed: false, reason: "not_found" };

  const op = { ...(row.data as REOperation), id: row.id };
  const metrics = buildOpportunityMetrics(op, calcResults(op), nowISO);
  if (canonical(withoutStamp(metrics)) === canonical(withoutStamp(opp.metrics))) return { refreshed: false, reason: "unchanged" };

  const { error: e4 } = await admin.from("investment_opportunities").update({ metrics }).eq("id", opp.id).eq("owner_id", opp.owner_id);
  if (e4) throw e4;
  return { refreshed: true };
}

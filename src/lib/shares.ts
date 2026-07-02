// src/lib/shares.ts — Compartición real de inversiones con inversores.
// CRUD contra `investment_shares` (RLS por owner/inversor) + construcción del
// SNAPSHOT filtrado por visibilidad que se publica para el inversor (así el JSON
// completo de la operación nunca sale del owner). Errores propagados.

import { supabase } from "./supabaseClient";
import type { REOperation, REResults } from "./realEstate";
import { expenseTotals, profitability, progressMetrics, salesStats } from "./realEstateTrackingCalc";
import {
  RE_EXPENSE_CATEGORY_LABEL,
  RE_SALE_STATUS_LABEL,
  defaultShareSettings,
  type REVisibilityKey,
} from "./realEstateTracking";

export type ShareStatus = "active" | "revoked";

export type InvestmentShare = {
  id: string;
  ownerId: string;
  operationId: string;
  investorEmail: string | null;
  investorUserId: string | null;
  token: string | null;
  status: ShareStatus;
  permissions: Record<string, unknown>;
  visibility: Record<string, boolean>;
  payload: InvestorSnapshot | Record<string, never>;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Snapshot que ve el inversor (ya filtrado y COMPUTADO — sin inputs sensibles) ──

export type SnapshotFile = { bucket: string; path: string } | { url: string };

export type InvestorSnapshot = {
  name: string;
  address?: string;
  generatedAt: string;
  finance?: { costesTotales?: number; ingresos?: number; pendientePago?: number; pendienteCobro?: number };
  progreso?: {
    obraPct: number | null;
    licenciasPct: number | null;
    ventasCerradasPct: number | null;
    tiempoTranscurridoPct: number | null;
    daysRemaining: number | null;
  };
  rentabilidad?: { estimada?: number | null; real?: number | null; promotorBenef?: number | null; inversorBenef?: number | null };
  ventas?: { title: string; status: string; statusLabel: string; price?: number }[];
  gastos?: { concept: string; category: string; amount?: number; invoice?: SnapshotFile }[];
  hitos?: { title: string; status: string }[];
  media?: { type: string; caption?: string; file: SnapshotFile }[];
};

const isHttp = (s?: string) => !!s && /^https?:\/\//i.test(s);

/**
 * Construye el snapshot filtrado por la visibilidad configurada en la operación.
 * Solo incluye lo permitido; los KPIs van YA computados (no se envían inputs
 * sensibles como precio de compra, costes o financiación).
 */
export function buildInvestorSnapshot(op: REOperation, results: REResults, nowISO: string): InvestorSnapshot {
  const vis = (op.share ?? defaultShareSettings()).visibility;
  const can = (k: REVisibilityKey) => vis[k] === true;

  const exp = expenseTotals(op);
  const sales = salesStats(op);
  const pm = progressMetrics(op, results, nowISO);
  const prof = profitability(op, results);

  const snap: InvestorSnapshot = { name: op.name || "Operación", address: op.address || undefined, generatedAt: nowISO };

  if (can("costesTotales") || can("ingresos") || can("pendientePago")) {
    snap.finance = {};
    if (can("costesTotales")) snap.finance.costesTotales = results.totalInvestment;
    if (can("ingresos")) snap.finance.ingresos = sales.collected;
    if (can("pendientePago")) {
      snap.finance.pendientePago = exp.pending;
      snap.finance.pendienteCobro = sales.pendingIncome;
    }
  }

  if (can("progreso")) {
    snap.progreso = {
      obraPct: pm.obraPct,
      licenciasPct: pm.licenciasPct,
      ventasCerradasPct: pm.ventasCerradasPct,
      tiempoTranscurridoPct: can("tiempos") ? pm.tiempoTranscurridoPct : null,
      daysRemaining: can("tiempos") ? pm.daysRemaining : null,
    };
  }

  if (can("rentabilidadEstimada") || can("rentabilidadReal") || can("rentabilidadPromotor") || can("rentabilidadInversor")) {
    snap.rentabilidad = {};
    if (can("rentabilidadEstimada")) snap.rentabilidad.estimada = results.saleYield;
    if (can("rentabilidadReal")) snap.rentabilidad.real = prof.realYield;
    if (can("rentabilidadPromotor")) snap.rentabilidad.promotorBenef = prof.estimatedPromoterBenefit;
    if (can("rentabilidadInversor")) snap.rentabilidad.inversorBenef = prof.estimatedInvestorBenefit;
  }

  if (can("ventas")) {
    snap.ventas = (op.sales ?? []).map((s) => ({
      title: s.title || "Unidad",
      status: s.status,
      statusLabel: RE_SALE_STATUS_LABEL[s.status],
      price: can("ventasPrecios") ? (s.realPrice ?? s.estimatedPrice ?? undefined) : undefined,
    }));
  }

  if (can("gastos")) {
    snap.gastos = (op.expenses ?? []).map((e) => {
      const g: { concept: string; category: string; amount?: number; invoice?: SnapshotFile } = {
        concept: e.concept || RE_EXPENSE_CATEGORY_LABEL[e.category],
        category: RE_EXPENSE_CATEGORY_LABEL[e.category],
      };
      if (can("gastosImportes")) g.amount = e.real ?? e.estimated ?? undefined;
      if (can("facturas")) {
        if (e.invoiceStoragePath && e.invoiceBucket) g.invoice = { bucket: e.invoiceBucket, path: e.invoiceStoragePath };
        else if (isHttp(e.invoiceUri)) g.invoice = { url: e.invoiceUri as string };
      }
      return g;
    });
  }

  if (can("hitos")) {
    snap.hitos = (op.milestones ?? []).map((m) => ({ title: m.title || "Hito", status: m.status }));
  }

  if (can("media")) {
    snap.media = (op.media ?? []).map((m) => ({
      type: m.type,
      caption: m.caption,
      file: m.storagePath && m.bucket ? { bucket: m.bucket, path: m.storagePath } : { url: m.uri },
    }));
  }

  return snap;
}

// ── Mapeo fila ↔ objeto ──

function rowToShare(r: Record<string, unknown>): InvestmentShare {
  return {
    id: r.id as string,
    ownerId: r.owner_id as string,
    operationId: r.operation_id as string,
    investorEmail: (r.investor_email as string) ?? null,
    investorUserId: (r.investor_user_id as string) ?? null,
    token: (r.token as string) ?? null,
    status: (r.status as ShareStatus) ?? "active",
    permissions: (r.permissions as Record<string, unknown>) ?? {},
    visibility: (r.visibility as Record<string, boolean>) ?? {},
    payload: (r.payload as InvestorSnapshot) ?? {},
    expiresAt: (r.expires_at as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function newShareToken(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
}

// ── CRUD (owner) ──

export async function listSharesForOperation(operationId: string): Promise<InvestmentShare[]> {
  const { data, error } = await supabase
    .from("investment_shares")
    .select("*")
    .eq("operation_id", operationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToShare);
}

export async function createShare(input: {
  operationId: string;
  investorEmail?: string;
  visibility: Record<string, boolean>;
  payload: InvestorSnapshot;
  expiresAt?: string | null;
}): Promise<InvestmentShare> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const ownerId = userData.user?.id;
  if (!ownerId) throw new Error("No hay sesión activa.");

  const { data, error } = await supabase
    .from("investment_shares")
    .insert({
      owner_id: ownerId,
      operation_id: input.operationId,
      investor_email: input.investorEmail?.trim() || null,
      token: newShareToken(),
      status: "active",
      visibility: input.visibility,
      payload: input.payload,
      expires_at: input.expiresAt ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToShare(data);
}

/** Republica el snapshot/visibilidad de un share (p.ej. tras cambiar datos). */
export async function updateSharePayload(id: string, visibility: Record<string, boolean>, payload: InvestorSnapshot): Promise<void> {
  const { error } = await supabase.from("investment_shares").update({ visibility, payload }).eq("id", id);
  if (error) throw error;
}

export async function setShareStatus(id: string, status: ShareStatus): Promise<void> {
  const { error } = await supabase.from("investment_shares").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteShare(id: string): Promise<void> {
  const { error } = await supabase.from("investment_shares").delete().eq("id", id);
  if (error) throw error;
}

// ── Lectura (inversor): shares activos asignados a mí (RLS filtra) ──

export async function listMyInvestorShares(): Promise<InvestmentShare[]> {
  const { data, error } = await supabase
    .from("investment_shares")
    .select("*")
    .eq("status", "active")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  // La RLS ya limita a los asignados a mi email/uid; excluyo por seguridad los míos como owner.
  const { data: me } = await supabase.auth.getUser();
  const myId = me.user?.id;
  return (data ?? []).map(rowToShare).filter((s) => s.ownerId !== myId);
}

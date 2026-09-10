// src/lib/investorPlatform/service.ts
// Acceso a datos de la plataforma de inversores. Única capa que habla con Supabase
// para roles, CRM, oportunidades, invitaciones e inversiones.
//
// Principios:
//  · Los errores se PROPAGAN. Nunca se devuelve un éxito falso ni se traga un fallo.
//  · La seguridad la impone la RLS, no este fichero. Aquí no hay comprobaciones
//    que "protejan" nada: si la RLS no lo permite, la consulta no devuelve la fila.
//  · El inversor no lee tablas internas: usa las RPC del final.

import { supabase } from "../supabaseClient";
import type {
  ContactStatus,
  Invitation,
  InvitationChannel,
  InterestValue,
  Investment,
  InvestmentModel,
  InvestmentStatus,
  InvestorContact,
  InvestorSnapshot,
  Opportunity,
  OpportunityMetrics,
  OpportunityStatus,
  UserRole,
  VisibilityMap,
} from "./types";

type Row = Record<string, unknown>;

const str = (v: unknown): string => (v as string) ?? "";
const nstr = (v: unknown): string | null => (v == null ? null : (v as string));
const num = (v: unknown): number | null => (v == null ? null : Number(v));

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error("No hay sesión activa.");
  return id;
}

// ── Roles ─────────────────────────────────────────────────────────────────────

export async function getMyRoles(): Promise<UserRole[]> {
  const { data, error } = await supabase.from("user_roles").select("role");
  if (error) throw error;
  return (data ?? []).map((r) => (r as Row).role as UserRole);
}

/** Alta idempotente de un rol para el usuario actual. */
export async function grantMyRole(role: UserRole): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("user_roles")
    .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
  if (error) throw error;
}

// ── CRM de contactos ──────────────────────────────────────────────────────────

function rowToContact(r: Row): InvestorContact {
  return {
    id: str(r.id),
    ownerId: str(r.owner_id),
    firstName: str(r.first_name),
    lastName: nstr(r.last_name),
    email: nstr(r.email),
    phone: nstr(r.phone),
    whatsapp: nstr(r.whatsapp),
    notes: nstr(r.notes),
    status: (r.status as ContactStatus) ?? "nuevo",
    source: nstr(r.source),
    linkedUserId: nstr(r.linked_user_id),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export async function listContacts(): Promise<InvestorContact[]> {
  const { data, error } = await supabase
    .from("investor_contacts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToContact);
}

export type ContactInput = {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  notes?: string | null;
  status?: ContactStatus;
  source?: string | null;
};

/**
 * Crea un contacto. La normalización de email/teléfono la hace un trigger en la BD,
 * así que WEB y APP producen exactamente el mismo dato canónico.
 */
export async function createContact(input: ContactInput): Promise<InvestorContact> {
  const ownerId = await requireUserId();
  if (!input.firstName.trim()) throw new Error("El nombre es obligatorio.");
  if (!input.email?.trim() && !input.phone?.trim()) {
    throw new Error("Hace falta al menos un email o un teléfono para poder contactar.");
  }

  const { data, error } = await supabase
    .from("investor_contacts")
    .insert({
      owner_id: ownerId,
      first_name: input.firstName.trim(),
      last_name: input.lastName?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      notes: input.notes?.trim() || null,
      status: input.status ?? "nuevo",
      source: input.source ?? "manual",
    })
    .select("*")
    .single();

  if (error) {
    // 23505 = índice único: ya existe ese email/teléfono en el CRM de este promotor.
    if ((error as { code?: string }).code === "23505") {
      throw new Error("Ya tienes un contacto con ese email o teléfono.");
    }
    throw error;
  }
  return rowToContact(data as Row);
}

export async function updateContact(id: string, patch: Partial<ContactInput>): Promise<void> {
  const payload: Row = {};
  if (patch.firstName !== undefined) payload.first_name = patch.firstName.trim();
  if (patch.lastName !== undefined) payload.last_name = patch.lastName?.trim() || null;
  if (patch.email !== undefined) payload.email = patch.email?.trim() || null;
  if (patch.phone !== undefined) payload.phone = patch.phone?.trim() || null;
  if (patch.whatsapp !== undefined) payload.whatsapp = patch.whatsapp?.trim() || null;
  if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null;
  if (patch.status !== undefined) payload.status = patch.status;
  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase.from("investor_contacts").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from("investor_contacts").delete().eq("id", id);
  if (error) throw error;
}

// ── Oportunidades ─────────────────────────────────────────────────────────────

function rowToOpportunity(r: Row): Opportunity {
  return {
    id: str(r.id),
    ownerId: str(r.owner_id),
    operationId: str(r.operation_id),
    status: (r.status as OpportunityStatus) ?? "borrador",
    title: str(r.title),
    location: nstr(r.location),
    summary: nstr(r.summary),
    strategy: nstr(r.strategy),
    risks: nstr(r.risks),
    internalNotes: nstr(r.internal_notes),
    targetCapital: num(r.target_capital),
    minTicket: num(r.min_ticket),
    targetTicket: num(r.target_ticket),
    maxTicket: num(r.max_ticket),
    offeredYieldPct: num(r.offered_yield_pct),
    termMonths: num(r.term_months),
    startDate: nstr(r.start_date),
    returnDate: nstr(r.return_date),
    investmentModel: (r.investment_model as InvestmentModel) ?? "prestamo",
    conditions: nstr(r.conditions),
    guarantee: nstr(r.guarantee),
    guaranteeRank: nstr(r.guarantee_rank),
    earlyCancellation: nstr(r.early_cancellation),
    metrics: (r.metrics as OpportunityMetrics) ?? {},
    visibility: (r.visibility as VisibilityMap) ?? {},
    publishedAt: nstr(r.published_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export async function listOpportunities(): Promise<Opportunity[]> {
  const { data, error } = await supabase
    .from("investment_opportunities")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToOpportunity);
}

export async function getOpportunityByOperation(operationId: string): Promise<Opportunity | null> {
  const { data, error } = await supabase
    .from("investment_opportunities")
    .select("*")
    .eq("operation_id", operationId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToOpportunity(data as Row) : null;
}

export type OpportunityInput = {
  operationId: string;
  title: string;
  location?: string | null;
  summary?: string | null;
  strategy?: string | null;
  risks?: string | null;
  internalNotes?: string | null;
  targetCapital?: number | null;
  minTicket?: number | null;
  targetTicket?: number | null;
  maxTicket?: number | null;
  offeredYieldPct?: number | null;
  termMonths?: number | null;
  startDate?: string | null;
  returnDate?: string | null;
  investmentModel?: InvestmentModel;
  conditions?: string | null;
  guarantee?: string | null;
  guaranteeRank?: string | null;
  earlyCancellation?: string | null;
  metrics?: OpportunityMetrics;
  visibility?: VisibilityMap;
  status?: OpportunityStatus;
};

function opportunityPayload(input: Partial<OpportunityInput>): Row {
  const p: Row = {};
  const map: [keyof OpportunityInput, string][] = [
    ["title", "title"],
    ["location", "location"],
    ["summary", "summary"],
    ["strategy", "strategy"],
    ["risks", "risks"],
    ["internalNotes", "internal_notes"],
    ["targetCapital", "target_capital"],
    ["minTicket", "min_ticket"],
    ["targetTicket", "target_ticket"],
    ["maxTicket", "max_ticket"],
    ["offeredYieldPct", "offered_yield_pct"],
    ["termMonths", "term_months"],
    ["startDate", "start_date"],
    ["returnDate", "return_date"],
    ["investmentModel", "investment_model"],
    ["conditions", "conditions"],
    ["guarantee", "guarantee"],
    ["guaranteeRank", "guarantee_rank"],
    ["earlyCancellation", "early_cancellation"],
    ["metrics", "metrics"],
    ["visibility", "visibility"],
    ["status", "status"],
  ];
  for (const [from, to] of map) {
    if (input[from] !== undefined) p[to] = input[from];
  }
  return p;
}

/** Crea la oportunidad de una operación, o devuelve la que ya existiera. */
export async function createOpportunity(input: OpportunityInput): Promise<Opportunity> {
  const ownerId = await requireUserId();
  const existing = await getOpportunityByOperation(input.operationId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("investment_opportunities")
    .insert({
      owner_id: ownerId,
      operation_id: input.operationId,
      ...opportunityPayload(input),
    })
    .select("*")
    .single();
  if (error) throw error;

  await logActivity({ opportunityId: str((data as Row).id), kind: "creada" });
  return rowToOpportunity(data as Row);
}

export async function updateOpportunity(
  id: string,
  patch: Partial<OpportunityInput>,
): Promise<void> {
  const payload = opportunityPayload(patch);
  if (Object.keys(payload).length === 0) return;
  const { error } = await supabase.from("investment_opportunities").update(payload).eq("id", id);
  if (error) throw error;
}

export async function publishOpportunity(id: string): Promise<void> {
  const { error } = await supabase
    .from("investment_opportunities")
    .update({ status: "publicada", published_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteOpportunity(id: string): Promise<void> {
  const { error } = await supabase.from("investment_opportunities").delete().eq("id", id);
  if (error) throw error;
}

// ── Invitaciones ──────────────────────────────────────────────────────────────

function rowToInvitation(r: Row): Invitation {
  return {
    id: str(r.id),
    opportunityId: str(r.opportunity_id),
    ownerId: str(r.owner_id),
    contactId: nstr(r.contact_id),
    channel: (r.channel as InvitationChannel) ?? "link",
    token: str(r.token),
    status: (r.status as Invitation["status"]) ?? "pendiente",
    invitedEmail: nstr(r.invited_email),
    invitedPhone: nstr(r.invited_phone),
    investorUserId: nstr(r.investor_user_id),
    visibility: (r.visibility as VisibilityMap) ?? {},
    sentAt: nstr(r.sent_at),
    firstViewedAt: nstr(r.first_viewed_at),
    lastViewedAt: nstr(r.last_viewed_at),
    viewCount: Number(r.view_count ?? 0),
    interest: (r.interest as InterestValue) ?? null,
    interestAt: nstr(r.interest_at),
    interestNote: nstr(r.interest_note),
    expiresAt: nstr(r.expires_at),
    revokedAt: nstr(r.revoked_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

/** Token de invitación: identifica la oportunidad, NO autentica. */
export function newInvitationToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function listInvitations(opportunityId: string): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from("opportunity_invitations")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToInvitation);
}

export async function createInvitation(input: {
  opportunityId: string;
  contact: InvestorContact;
  channel: InvitationChannel;
  visibility?: VisibilityMap;
  expiresAt?: string | null;
}): Promise<Invitation> {
  const ownerId = await requireUserId();
  const { data, error } = await supabase
    .from("opportunity_invitations")
    .insert({
      opportunity_id: input.opportunityId,
      owner_id: ownerId,
      contact_id: input.contact.id,
      channel: input.channel,
      token: newInvitationToken(),
      status: "pendiente",
      invited_email: input.contact.email,
      invited_phone: input.contact.whatsapp ?? input.contact.phone,
      visibility: input.visibility ?? {},
      expires_at: input.expiresAt ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  const invitation = rowToInvitation(data as Row);
  await logActivity({
    opportunityId: input.opportunityId,
    invitationId: invitation.id,
    kind: "compartida",
    detail: { channel: input.channel, contactId: input.contact.id },
  });
  return invitation;
}

/** Marca la invitación como enviada (el promotor ya la ha hecho llegar). */
export async function markInvitationSent(id: string): Promise<void> {
  const { error } = await supabase
    .from("opportunity_invitations")
    .update({ status: "enviada", sent_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await logActivity({ invitationId: id, kind: "enviada" });
}

export async function setInvitationVisibility(id: string, visibility: VisibilityMap): Promise<void> {
  const { error } = await supabase
    .from("opportunity_invitations")
    .update({ visibility })
    .eq("id", id);
  if (error) throw error;
}

export async function revokeInvitation(id: string): Promise<void> {
  const { error } = await supabase
    .from("opportunity_invitations")
    .update({ status: "revocada", revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await logActivity({ invitationId: id, kind: "revocada" });
}

export async function restoreInvitation(id: string): Promise<void> {
  const { error } = await supabase
    .from("opportunity_invitations")
    .update({ status: "enviada", revoked_at: null })
    .eq("id", id);
  if (error) throw error;
}

export async function setInvitationExpiry(id: string, expiresAt: string | null): Promise<void> {
  const { error } = await supabase
    .from("opportunity_invitations")
    .update({ expires_at: expiresAt })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteInvitation(id: string): Promise<void> {
  const { error } = await supabase.from("opportunity_invitations").delete().eq("id", id);
  if (error) throw error;
}

// ── Inversiones reales ────────────────────────────────────────────────────────

function rowToInvestment(r: Row): Investment {
  return {
    id: str(r.id),
    opportunityId: str(r.opportunity_id),
    ownerId: str(r.owner_id),
    contactId: nstr(r.contact_id),
    investorUserId: nstr(r.investor_user_id),
    amount: Number(r.amount ?? 0),
    investedAt: nstr(r.invested_at),
    agreedYieldPct: num(r.agreed_yield_pct),
    termMonths: num(r.term_months),
    expectedReturnDate: nstr(r.expected_return_date),
    guarantee: nstr(r.guarantee),
    conditions: nstr(r.conditions),
    status: (r.status as InvestmentStatus) ?? "comprometida",
    finalYieldPct: num(r.final_yield_pct),
    returnedAmount: num(r.returned_amount),
    returnedAt: nstr(r.returned_at),
    notes: nstr(r.notes),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export async function listInvestments(opportunityId?: string): Promise<Investment[]> {
  let q = supabase.from("investments").select("*").order("created_at", { ascending: false });
  if (opportunityId) q = q.eq("opportunity_id", opportunityId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToInvestment);
}

export type InvestmentInput = {
  opportunityId: string;
  contact: InvestorContact;
  amount: number;
  investedAt?: string | null;
  agreedYieldPct?: number | null;
  termMonths?: number | null;
  expectedReturnDate?: string | null;
  guarantee?: string | null;
  conditions?: string | null;
  status?: InvestmentStatus;
  notes?: string | null;
};

/**
 * Registra una inversión REAL. Es el único paso que convierte a un destinatario en
 * inversor con participación económica (requisito: ver ≠ invertir).
 */
export async function createInvestment(input: InvestmentInput): Promise<Investment> {
  const ownerId = await requireUserId();
  if (!(input.amount > 0)) throw new Error("El capital aportado debe ser mayor que cero.");

  const { data, error } = await supabase
    .from("investments")
    .insert({
      opportunity_id: input.opportunityId,
      owner_id: ownerId,
      contact_id: input.contact.id,
      // Si el contacto ya se identificó alguna vez, la inversión es visible para él
      // desde el primer momento; si no, `claim_invitation()` la enlazará después.
      investor_user_id: input.contact.linkedUserId,
      amount: input.amount,
      invested_at: input.investedAt ?? new Date().toISOString().slice(0, 10),
      agreed_yield_pct: input.agreedYieldPct ?? null,
      term_months: input.termMonths ?? null,
      expected_return_date: input.expectedReturnDate ?? null,
      guarantee: input.guarantee ?? null,
      conditions: input.conditions ?? null,
      status: input.status ?? "comprometida",
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  // El contacto pasa a ser inversor en el CRM.
  await updateContact(input.contact.id, { status: "inversor" });
  await logActivity({
    opportunityId: input.opportunityId,
    investmentId: str((data as Row).id),
    kind: "invertida",
    detail: { amount: input.amount },
  });
  return rowToInvestment(data as Row);
}

export async function updateInvestment(
  id: string,
  patch: Partial<{
    amount: number;
    status: InvestmentStatus;
    agreedYieldPct: number | null;
    termMonths: number | null;
    expectedReturnDate: string | null;
    guarantee: string | null;
    conditions: string | null;
    finalYieldPct: number | null;
    returnedAmount: number | null;
    returnedAt: string | null;
    notes: string | null;
  }>,
): Promise<void> {
  const p: Row = {};
  if (patch.amount !== undefined) p.amount = patch.amount;
  if (patch.status !== undefined) p.status = patch.status;
  if (patch.agreedYieldPct !== undefined) p.agreed_yield_pct = patch.agreedYieldPct;
  if (patch.termMonths !== undefined) p.term_months = patch.termMonths;
  if (patch.expectedReturnDate !== undefined) p.expected_return_date = patch.expectedReturnDate;
  if (patch.guarantee !== undefined) p.guarantee = patch.guarantee;
  if (patch.conditions !== undefined) p.conditions = patch.conditions;
  if (patch.finalYieldPct !== undefined) p.final_yield_pct = patch.finalYieldPct;
  if (patch.returnedAmount !== undefined) p.returned_amount = patch.returnedAmount;
  if (patch.returnedAt !== undefined) p.returned_at = patch.returnedAt;
  if (patch.notes !== undefined) p.notes = patch.notes;
  if (Object.keys(p).length === 0) return;

  const { error } = await supabase.from("investments").update(p).eq("id", id);
  if (error) throw error;
}

/** Liquida una inversión: pasa a histórico conservando el resultado real. */
export async function settleInvestment(
  id: string,
  result: { finalYieldPct?: number | null; returnedAmount?: number | null; returnedAt?: string | null },
): Promise<void> {
  await updateInvestment(id, {
    status: "liquidada",
    finalYieldPct: result.finalYieldPct ?? null,
    returnedAmount: result.returnedAmount ?? null,
    returnedAt: result.returnedAt ?? new Date().toISOString().slice(0, 10),
  });
  await logActivity({ investmentId: id, kind: "liquidada" });
}

// ── Actividad ─────────────────────────────────────────────────────────────────

export async function logActivity(input: {
  opportunityId?: string;
  invitationId?: string;
  investmentId?: string;
  kind: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    const ownerId = await requireUserId();
    await supabase.from("investment_activity").insert({
      owner_id: ownerId,
      opportunity_id: input.opportunityId ?? null,
      invitation_id: input.invitationId ?? null,
      investment_id: input.investmentId ?? null,
      actor_user_id: ownerId,
      kind: input.kind,
      detail: input.detail ?? {},
    });
  } catch {
    // La trazabilidad no debe romper la acción del usuario. Se omite en silencio
    // A PROPÓSITO: es un registro auxiliar, no parte del resultado que se le devuelve.
  }
}

export async function listActivity(opportunityId: string) {
  const { data, error } = await supabase
    .from("investment_activity")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

// ── Lado INVERSOR (solo RPC: nunca lee tablas internas) ───────────────────────

/** Vincula la sesión actual con la invitación del enlace. Devuelve su id. */
export async function claimInvitation(token: string): Promise<string> {
  const { data, error } = await supabase.rpc("claim_invitation", { p_token: token });
  if (error) throw error;
  return data as string;
}

export async function getInvestorSnapshot(invitationId: string): Promise<InvestorSnapshot> {
  const { data, error } = await supabase.rpc("get_investor_snapshot", {
    p_invitation: invitationId,
  });
  if (error) throw error;
  return data as InvestorSnapshot;
}

export async function registerInvitationView(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc("register_invitation_view", { p_invitation: invitationId });
  if (error) throw error;
}

export async function setInvitationInterest(
  invitationId: string,
  interest: InterestValue,
  note?: string,
): Promise<void> {
  const { error } = await supabase.rpc("set_invitation_interest", {
    p_invitation: invitationId,
    p_interest: interest,
    p_note: note ?? null,
  });
  if (error) throw error;
}

/**
 * Datos de contacto del inversor autenticado, tal y como los tiene su promotor.
 *
 * Va por RPC y NO por consulta directa a `investor_contacts`: la RLS filtra filas,
 * no columnas, así que una policy de lectura sobre esa tabla le habría entregado
 * también `notes` — el CRM privado que el promotor lleva sobre él.
 */
export type MyInvestorProfile = {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
};

export async function getMyInvestorProfile(): Promise<MyInvestorProfile[]> {
  const { data, error } = await supabase.rpc("get_my_investor_profile");
  if (error) throw error;
  return (data as MyInvestorProfile[]) ?? [];
}

/** Cabecera de una oportunidad recibida, para pintar la lista sin N llamadas. */
export type InvestorOpportunityCard = {
  invitationId: string;
  opportunityId: string;
  title: string;
  location: string | null;
  summary: string | null;
  status: OpportunityStatus;
  investmentModel: InvestmentModel;
  offeredYieldPct: number | null;
  termMonths: number | null;
  minTicket: number | null;
  targetCapital: number | null;
  interest: InterestValue | null;
  firstViewedAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
};

export async function listMyOpportunities(): Promise<InvestorOpportunityCard[]> {
  const { data, error } = await supabase.rpc("list_my_investor_opportunities");
  if (error) throw error;
  return (data as InvestorOpportunityCard[]) ?? [];
}

/** Inversión del inversor, ya con el nombre del proyecto resuelto por la RPC. */
export type MyInvestment = {
  id: string;
  opportunityId: string;
  invitationId: string | null;
  title: string;
  location: string | null;
  amount: number;
  status: InvestmentStatus;
  investedAt: string | null;
  agreedYieldPct: number | null;
  termMonths: number | null;
  expectedReturnDate: string | null;
  guarantee: string | null;
  conditions: string | null;
  finalYieldPct: number | null;
  returnedAmount: number | null;
  returnedAt: string | null;
  createdAt: string;
};

export async function listMyInvestments(): Promise<MyInvestment[]> {
  const { data, error } = await supabase.rpc("list_my_investments");
  if (error) throw error;
  return ((data as MyInvestment[]) ?? []).map((i) => ({ ...i, amount: Number(i.amount) }));
}

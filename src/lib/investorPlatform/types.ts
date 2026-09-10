// src/lib/investorPlatform/types.ts
// Tipos canónicos de la plataforma de inversores. ÚNICA fuente de verdad de las
// formas que viajan entre WEB, APP y Supabase. Ver docs/INVERSORES.md.
//
// Regla que gobierna todo el módulo:
//   operación  ≠  oportunidad  ≠  invitación  ≠  inversión
// Recibir una invitación NO otorga participación económica.

// ── Roles ─────────────────────────────────────────────────────────────────────

export type UserRole = "promotor" | "inversor";

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  promotor: "Promotor",
  inversor: "Inversor",
};

// ── Estados ───────────────────────────────────────────────────────────────────

export type OpportunityStatus =
  | "borrador"
  | "publicada"
  | "en_captacion"
  | "cubierta"
  | "cerrada"
  | "liquidada";

export const OPPORTUNITY_STATUS_LABEL: Record<OpportunityStatus, string> = {
  borrador: "Borrador",
  publicada: "Publicada",
  en_captacion: "En captación",
  cubierta: "Cubierta",
  cerrada: "Cerrada",
  liquidada: "Liquidada",
};

export type InvitationStatus =
  | "pendiente"
  | "enviada"
  | "vista"
  | "interesado"
  | "descartada"
  | "revocada"
  | "caducada";

export const INVITATION_STATUS_LABEL: Record<InvitationStatus, string> = {
  pendiente: "Pendiente de enviar",
  enviada: "Enviada",
  vista: "Vista",
  interesado: "Interesado",
  descartada: "Descartada",
  revocada: "Revocada",
  caducada: "Caducada",
};

export type InvestmentStatus =
  | "comprometida"
  | "desembolsada"
  | "activa"
  | "liquidada"
  | "cancelada";

export const INVESTMENT_STATUS_LABEL: Record<InvestmentStatus, string> = {
  comprometida: "Comprometida",
  desembolsada: "Desembolsada",
  activa: "Activa",
  liquidada: "Liquidada",
  cancelada: "Cancelada",
};

/** Estados que cuentan como "inversión viva" (aún no liquidada ni cancelada). */
export const LIVE_INVESTMENT_STATUSES: InvestmentStatus[] = [
  "comprometida",
  "desembolsada",
  "activa",
];

export type ContactStatus = "nuevo" | "contactado" | "interesado" | "inversor" | "descartado";

export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  interesado: "Interesado",
  inversor: "Inversor",
  descartado: "Descartado",
};

export type InvitationChannel = "whatsapp" | "email" | "link";
export type InterestValue = "interesado" | "mas_info" | "descartada";
export type InvestmentModel = "prestamo" | "participacion" | "mixto" | "otro";

export const INVESTMENT_MODEL_LABEL: Record<InvestmentModel, string> = {
  prestamo: "Préstamo con interés",
  participacion: "Participación en beneficios",
  mixto: "Mixto",
  otro: "Otro",
};

// ── Visibilidad ───────────────────────────────────────────────────────────────
//
// Las claves son las que lee `public.get_investor_snapshot()` y
// `public.investor_can_read_file()` EN TIEMPO DE LECTURA. Si añades una clave aquí,
// añádela también en la migración: si no, el toggle no tendrá efecto (fue justo el
// defecto D2/D3 del módulo anterior).

export type VisibilityKey =
  | "estrategia"
  | "riesgos"
  | "progreso"
  | "hitos"
  | "media"
  | "ventas"
  | "ventasPrecios"
  | "gastos"
  | "gastosImportes"
  | "facturas"
  | "costesTotales"
  | "ingresos"
  | "pendientePago"
  | "rentabilidadEstimada"
  | "rentabilidadReal"
  | "rentabilidadInversor"
  | "rentabilidadPromotor"
  | "estadoCaptacion";

export type VisibilityMap = Partial<Record<VisibilityKey, boolean>>;

export const VISIBILITY_DEFS: {
  key: VisibilityKey;
  label: string;
  group: string;
  sensitive: boolean;
}[] = [
  { key: "estrategia", label: "Estrategia del proyecto", group: "Proyecto", sensitive: false },
  { key: "riesgos", label: "Riesgos declarados", group: "Proyecto", sensitive: false },
  { key: "progreso", label: "Avance de obra y licencias", group: "Proyecto", sensitive: false },
  { key: "hitos", label: "Hitos y cronograma", group: "Proyecto", sensitive: false },
  { key: "media", label: "Fotos y vídeos", group: "Proyecto", sensitive: false },
  { key: "estadoCaptacion", label: "Estado de captación", group: "Captación", sensitive: false },
  { key: "ventas", label: "Estado de ventas", group: "Ventas", sensitive: false },
  { key: "ventasPrecios", label: "Precios de venta", group: "Ventas", sensitive: true },
  { key: "gastos", label: "Tabla de gastos", group: "Gastos", sensitive: false },
  { key: "gastosImportes", label: "Importes de los gastos", group: "Gastos", sensitive: true },
  { key: "facturas", label: "Facturas asociadas", group: "Gastos", sensitive: true },
  { key: "costesTotales", label: "Costes totales acumulados", group: "Financiero", sensitive: true },
  { key: "ingresos", label: "Ingresos obtenidos", group: "Financiero", sensitive: true },
  { key: "pendientePago", label: "Pendiente de pago y de cobro", group: "Financiero", sensitive: true },
  { key: "rentabilidadEstimada", label: "Rentabilidad estimada", group: "Rentabilidad", sensitive: true },
  { key: "rentabilidadReal", label: "Rentabilidad real", group: "Rentabilidad", sensitive: true },
  { key: "rentabilidadInversor", label: "Rentabilidad del inversor", group: "Rentabilidad", sensitive: true },
  { key: "rentabilidadPromotor", label: "Rentabilidad del promotor", group: "Rentabilidad", sensitive: true },
];

/** Los datos sensibles nacen OCULTOS. El promotor los activa uno a uno. */
export function defaultVisibility(): VisibilityMap {
  const out: VisibilityMap = {};
  for (const def of VISIBILITY_DEFS) out[def.key] = !def.sensitive;
  return out;
}

// ── Modelo canónico de MEDIA (compartido WEB ↔ APP) ───────────────────────────
//
// Sustituye a los dos modelos divergentes anteriores (defecto D10/D11):
//  · archivo subido a Storage privado → { kind: "storage", bucket, path }
//  · enlace externo                   → { kind: "url", url }  (siempre http/https)
// Nunca se guarda una URI local del dispositivo: no es resoluble en otra plataforma.

export type MediaRef =
  | { kind: "storage"; bucket: string; path: string; mime?: string; size?: number }
  | { kind: "url"; url: string };

export function isHttpUrl(value: string | undefined | null): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

/**
 * Normaliza cualquier forma histórica a `MediaRef`. Devuelve `null` cuando el dato
 * no es utilizable (URI local, cadena vacía), en lugar de propagar un enlace roto.
 */
export function toMediaRef(input: {
  bucket?: string | null;
  storagePath?: string | null;
  uri?: string | null;
  mime?: string | null;
  size?: number | null;
}): MediaRef | null {
  if (input.bucket && input.storagePath) {
    return {
      kind: "storage",
      bucket: input.bucket,
      path: input.storagePath,
      mime: input.mime ?? undefined,
      size: input.size ?? undefined,
    };
  }
  if (isHttpUrl(input.uri)) return { kind: "url", url: (input.uri as string).trim() };
  return null;
}

// ── Entidades ─────────────────────────────────────────────────────────────────

export type InvestorContact = {
  id: string;
  ownerId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  notes: string | null;
  status: ContactStatus;
  source: string | null;
  linkedUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Opportunity = {
  id: string;
  ownerId: string;
  operationId: string;
  status: OpportunityStatus;
  title: string;
  location: string | null;
  summary: string | null;
  strategy: string | null;
  risks: string | null;
  /** DATO INTERNO — nunca sale hacia el inversor. */
  internalNotes: string | null;
  targetCapital: number | null;
  minTicket: number | null;
  targetTicket: number | null;
  maxTicket: number | null;
  offeredYieldPct: number | null;
  termMonths: number | null;
  startDate: string | null;
  returnDate: string | null;
  investmentModel: InvestmentModel;
  conditions: string | null;
  guarantee: string | null;
  guaranteeRank: string | null;
  earlyCancellation: string | null;
  metrics: OpportunityMetrics;
  visibility: VisibilityMap;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** KPIs ya calculados. Nunca contiene inputs sensibles, solo resultados. */
export type OpportunityMetrics = {
  costesTotales?: number;
  ingresos?: number;
  pendientePago?: number;
  pendienteCobro?: number;
  rentabilidadEstimada?: number | null;
  rentabilidadReal?: number | null;
  rentabilidadInversor?: number | null;
  rentabilidadPromotor?: number | null;
  progreso?: {
    obraPct: number | null;
    licenciasPct: number | null;
    ventasCerradasPct: number | null;
    tiempoTranscurridoPct: number | null;
    daysRemaining: number | null;
  };
  hitos?: { title: string; status: string }[];
  ventas?: { title: string; status: string; statusLabel: string; price?: number }[];
  ventasSinPrecios?: { title: string; status: string; statusLabel: string }[];
  gastos?: { concept: string; category: string; amount?: number; invoice?: MediaRef }[];
  gastosSinImportes?: { concept: string; category: string }[];
  media?: { type: string; caption?: string; file: MediaRef }[];
  generatedAt?: string;
};

export type Invitation = {
  id: string;
  opportunityId: string;
  ownerId: string;
  contactId: string | null;
  channel: InvitationChannel;
  token: string;
  status: InvitationStatus;
  invitedEmail: string | null;
  invitedPhone: string | null;
  investorUserId: string | null;
  visibility: VisibilityMap;
  sentAt: string | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  interest: InterestValue | null;
  interestAt: string | null;
  interestNote: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Investment = {
  id: string;
  opportunityId: string;
  ownerId: string;
  contactId: string | null;
  investorUserId: string | null;
  amount: number;
  investedAt: string | null;
  agreedYieldPct: number | null;
  termMonths: number | null;
  expectedReturnDate: string | null;
  guarantee: string | null;
  conditions: string | null;
  status: InvestmentStatus;
  finalYieldPct: number | null;
  returnedAmount: number | null;
  returnedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Lo que ve el inversor. Lo construye `public.get_investor_snapshot()`. */
export type InvestorSnapshot = {
  opportunityId: string;
  invitationId: string;
  title: string;
  location: string | null;
  summary: string | null;
  status: OpportunityStatus;
  investmentModel: InvestmentModel;
  targetCapital: number | null;
  minTicket: number | null;
  targetTicket: number | null;
  maxTicket: number | null;
  offeredYieldPct: number | null;
  termMonths: number | null;
  startDate: string | null;
  returnDate: string | null;
  guarantee: string | null;
  guaranteeRank: string | null;
  earlyCancellation: string | null;
  conditions: string | null;
  generatedAt: string;
  // Bloques presentes SOLO si la visibilidad vigente los permite.
  strategy?: string | null;
  risks?: string | null;
  progreso?: OpportunityMetrics["progreso"];
  hitos?: OpportunityMetrics["hitos"];
  media?: OpportunityMetrics["media"];
  ventas?: OpportunityMetrics["ventas"] | OpportunityMetrics["ventasSinPrecios"];
  gastos?: OpportunityMetrics["gastos"] | OpportunityMetrics["gastosSinImportes"];
  costesTotales?: number;
  ingresos?: number;
  pendientePago?: number;
  pendienteCobro?: number;
  rentabilidadEstimada?: number | null;
  rentabilidadReal?: number | null;
  rentabilidadInversor?: number | null;
  rentabilidadPromotor?: number | null;
  captacion?: { comprometido: number; invertido: number; inversores: number };
};

// ── Captación: configuración ≠ resultado ──────────────────────────────────────

export type FundingState = {
  objetivo: number | null;
  comprometido: number;
  invertido: number;
  pendiente: number | null;
  pctFinanciado: number | null;
  inversores: number;
  /** Ticket REAL medio: se calcula sobre inversiones, no sobre la configuración. */
  ticketMedioReal: number | null;
};

/**
 * Estado de captación a partir de inversiones REALES.
 * No mezcla el ticket configurado (min/objetivo) con el ticket resultante.
 */
export function fundingState(
  targetCapital: number | null,
  investments: Pick<Investment, "amount" | "status">[],
): FundingState {
  const live = investments.filter((i) => i.status !== "cancelada");
  const comprometido = live
    .filter((i) => i.status === "comprometida")
    .reduce((s, i) => s + i.amount, 0);
  const invertido = live
    .filter((i) => i.status !== "comprometida")
    .reduce((s, i) => s + i.amount, 0);
  const total = comprometido + invertido;
  const objetivo = targetCapital != null && targetCapital > 0 ? targetCapital : null;

  return {
    objetivo,
    comprometido,
    invertido,
    pendiente: objetivo != null ? Math.max(0, objetivo - total) : null,
    pctFinanciado: objetivo != null ? Math.min(1, total / objetivo) : null,
    inversores: live.length,
    ticketMedioReal: live.length > 0 ? total / live.length : null,
  };
}

// src/lib/opportunities.ts — Tipos del módulo OPORTUNIDADES (paridad con APP).
// Una oportunidad es una operación publicada para que inversores la vean,
// expresen interés y, en el futuro, aporten capital.
// ESTADO: tipos + estructura listos. Persistencia/sync y publicación PENDIENTES.

export type OpportunityStatus = "BORRADOR" | "PUBLICADA" | "EN_FONDEO" | "CERRADA";
export type RiskLevel = "BAJO" | "MEDIO" | "ALTO";

export type Opportunity = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  location?: string;
  operationId?: string;
  status: OpportunityStatus;
  risk: RiskLevel;
  estimatedYield?: number; // ratio anual (0.12 = 12 %)
  termMonths?: number;
  capitalRequired?: number;
  minTicket?: number;
  committedCapital?: number;
  summary?: string;
  docCount?: number;
  interestedCount?: number;
};

export const OPP_STATUS_LABEL: Record<OpportunityStatus, string> = {
  BORRADOR: "Borrador",
  PUBLICADA: "Publicada",
  EN_FONDEO: "En fondeo",
  CERRADA: "Cerrada",
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  BAJO: "Riesgo bajo",
  MEDIO: "Riesgo medio",
  ALTO: "Riesgo alto",
};

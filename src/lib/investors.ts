// src/lib/investors.ts — Tipos INVERSORES / SEGUIMIENTO DE PROYECTOS (paridad APP).
// ESTADO: tipos + estructura listos. Auth de rol inversor, sync y subida de
// documentos PENDIENTES de backend.

export type InvestorStatus = "INVITADO" | "ACTIVO" | "INTERESADO";

export type Investor = {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  email?: string;
  phone?: string;
  status: InvestorStatus;
  committedCapital?: number;
  projectsCount?: number;
};

export type ProjectMilestoneStatus = "PENDIENTE" | "EN_CURSO" | "COMPLETADO" | "DESVIADO";

export type ProjectMilestone = {
  id: string;
  title: string;
  dueDate?: string;
  status: ProjectMilestoneStatus;
  note?: string;
};

export type ProjectUpdate = {
  id: string;
  date: string;
  title: string;
  note?: string;
  attachments?: string[];
};

export type ProjectDoc = {
  id: string;
  name: string;
  uri?: string;
  uploadedBy: "PROMOTOR" | "INVERSOR";
  createdAt: string;
};

export type ProjectTracking = {
  id: string;
  operationId?: string;
  opportunityId?: string;
  investorIds: string[];
  milestones: ProjectMilestone[];
  updates: ProjectUpdate[];
  docs: ProjectDoc[];
};

export const INVESTOR_STATUS_LABEL: Record<InvestorStatus, string> = {
  INVITADO: "Invitado",
  ACTIVO: "Activo",
  INTERESADO: "Interesado",
};

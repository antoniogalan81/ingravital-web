// src/lib/investorPlatform/preview.ts
// Previsualización de lo que verá el inversor, calculada en el cliente del promotor.
//
// ⚠️ ESTO NO ES LA AUTORIDAD. Quien decide de verdad qué sale es
// `public.get_investor_snapshot()` en la base de datos. Esta función replica sus
// reglas para que el promotor pueda ver el resultado sin crear una invitación real.
//
// SI CAMBIAS LAS REGLAS, CÁMBIALAS EN LOS DOS SITIOS: aquí y en la migración
// `20260910_investor_platform.sql` (sección 10). El test
// `supabase/tests/investorPlatform.test.mjs` cubre el lado servidor, que es el que
// protege los datos; este fichero solo afecta a lo que el promotor ve en pantalla.

import type { InvestorSnapshot, Opportunity, VisibilityMap } from "./types";

export function previewSnapshot(
  opportunity: Opportunity,
  visibility: VisibilityMap,
  funding?: { comprometido: number; invertido: number; inversores: number },
): InvestorSnapshot {
  const can = (k: keyof VisibilityMap) => visibility[k] === true;
  const m = opportunity.metrics ?? {};

  // Ficha comercial: siempre visible, es el objeto de la invitación.
  const snap: InvestorSnapshot = {
    opportunityId: opportunity.id,
    invitationId: "preview",
    title: opportunity.title,
    location: opportunity.location,
    summary: opportunity.summary,
    status: opportunity.status,
    investmentModel: opportunity.investmentModel,
    targetCapital: opportunity.targetCapital,
    minTicket: opportunity.minTicket,
    targetTicket: opportunity.targetTicket,
    maxTicket: opportunity.maxTicket,
    offeredYieldPct: opportunity.offeredYieldPct,
    termMonths: opportunity.termMonths,
    startDate: opportunity.startDate,
    returnDate: opportunity.returnDate,
    guarantee: opportunity.guarantee,
    guaranteeRank: opportunity.guaranteeRank,
    earlyCancellation: opportunity.earlyCancellation,
    conditions: opportunity.conditions,
    generatedAt: new Date().toISOString(),
  };

  // `internalNotes` NO se copia nunca. No hay rama que lo incluya, a propósito.

  if (can("estrategia")) snap.strategy = opportunity.strategy;
  if (can("riesgos")) snap.risks = opportunity.risks;
  if (can("progreso")) snap.progreso = m.progreso;
  if (can("hitos")) snap.hitos = m.hitos;
  if (can("media")) snap.media = m.media;
  if (can("ventas")) snap.ventas = can("ventasPrecios") ? m.ventas : m.ventasSinPrecios;
  if (can("gastos")) snap.gastos = can("gastosImportes") ? m.gastos : m.gastosSinImportes;
  if (can("costesTotales")) snap.costesTotales = m.costesTotales;
  if (can("ingresos")) snap.ingresos = m.ingresos;
  if (can("pendientePago")) {
    snap.pendientePago = m.pendientePago;
    snap.pendienteCobro = m.pendienteCobro;
  }
  if (can("rentabilidadEstimada")) snap.rentabilidadEstimada = m.rentabilidadEstimada;
  if (can("rentabilidadReal")) snap.rentabilidadReal = m.rentabilidadReal;
  if (can("rentabilidadInversor")) snap.rentabilidadInversor = m.rentabilidadInversor;
  if (can("rentabilidadPromotor")) snap.rentabilidadPromotor = m.rentabilidadPromotor;
  if (can("estadoCaptacion") && funding) snap.captacion = funding;

  return snap;
}

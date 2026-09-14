// src/lib/investorPlatform/metrics.ts
// Construye los KPIs que se guardan en `investment_opportunities.metrics`.
//
// POR QUÉ EXISTE ESTE PASO: la BD filtra por visibilidad en tiempo de lectura, pero
// no sabe calcular la rentabilidad de una operación (eso vive en `realEstateCalc` y
// `realEstateTrackingCalc`). Así que el cliente del promotor precalcula RESULTADOS
// —nunca inputs sensibles como precio de compra, costes unitarios o financiación— y
// los guarda ya computados. La BD solo decide cuáles de esos resultados enseña.
//
// Consecuencia: aunque el inversor pudiera leer `metrics` entero (no puede: no tiene
// policy sobre la tabla), seguiría sin ver un solo input de la operación.

import type { REOperation, REResults } from "../realEstate";
import { profitability, progressMetrics, salesStats } from "../realEstateTrackingCalc";
import { projectExpenseSummary, projectSalesSummary, salesSummaryForInvestors, withoutExpenseAmounts } from "../projectEconomics";
import { toMediaRef, type MediaRef, type OpportunityMetrics } from "./types";

/**
 * Deriva los KPIs de una operación. Gastos y ventas son los MISMOS resúmenes que ve el
 * promotor en Gestión del proyecto (`projectEconomics`). Se recalcula al guardar la oferta
 * y, sobre todo, cada vez que un inversor abre la oportunidad (`/api/investor/refresh-metrics`),
 * así que un cambio de gastos, ventas, cobros o documentos nunca deja cifras antiguas.
 */
export function buildOpportunityMetrics(
  op: REOperation,
  results: REResults,
  nowISO: string = new Date().toISOString(),
): OpportunityMetrics {
  const sales = salesStats(op);
  const pm = progressMetrics(op, results, nowISO);
  const prof = profitability(op, results);
  const expenseSummary = projectExpenseSummary(op, results);
  const salesSummary = projectSalesSummary(op, results, nowISO);

  // Las variantes "sin precios"/"sin importes" se precalculan aquí para que la BD
  // pueda elegir una u otra sin tener que recortar objetos por su cuenta.
  type PublishedMedia = { type: string; caption?: string; file: MediaRef };
  const media = (op.media ?? []).reduce<PublishedMedia[]>((acc, m) => {
    const file = toMediaRef({
      bucket: m.bucket,
      storagePath: m.storagePath,
      uri: m.uri,
      mime: m.mime,
      size: m.size,
    });
    // Un elemento sin destino resoluble no se publica: mejor ausente que roto.
    if (file) acc.push({ type: m.type, caption: m.caption, file });
    return acc;
  }, []);

  return {
    costesTotales: results.totalInvestment,
    ingresos: sales.collected,
    pendientePago: expenseSummary.remaining ?? 0,
    pendienteCobro: sales.pendingIncome,
    rentabilidadEstimada: results.saleYield,
    rentabilidadReal: prof.realYield,
    rentabilidadInversor: prof.investorYield,
    rentabilidadPromotor: prof.estimatedPromoterBenefit,
    progreso: {
      obraPct: pm.obraPct,
      licenciasPct: pm.licenciasPct,
      ventasCerradasPct: pm.ventasCerradasPct,
      tiempoTranscurridoPct: pm.tiempoTranscurridoPct,
      daysRemaining: pm.daysRemaining,
    },
    hitos: (op.milestones ?? []).map((m) => ({ title: m.title || "Hito", status: m.status })),
    // Mismos resúmenes que Gestión del proyecto. Documentos y compradores nunca se publican.
    ventas: salesSummaryForInvestors(salesSummary, true),
    ventasSinPrecios: salesSummaryForInvestors(salesSummary, false),
    gastos: { ...expenseSummary, categories: expenseSummary.categories.map((c) => ({ ...c, realItems: c.realItems.map(({ documentUrl: _u, documentName: _n, ...r }) => r) })) },
    gastosSinImportes: withoutExpenseAmounts(expenseSummary),
    media,
    generatedAt: nowISO,
  };
}

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
import { RE_EXPENSE_CATEGORY_LABEL, RE_SALE_STATUS_LABEL } from "../realEstateTracking";
import { expenseTotals, profitability, progressMetrics, salesStats } from "../realEstateTrackingCalc";
import { budgetLineReal, effectiveRealExpenses } from "../realFinances";
import { toMediaRef, type MediaRef, type OpportunityMetrics } from "./types";

/**
 * Deriva los KPIs de una operación. Se llama al crear la oportunidad y cada vez que
 * el promotor guarda la operación, de modo que lo que ve el inversor no envejece.
 */
export function buildOpportunityMetrics(
  op: REOperation,
  results: REResults,
  nowISO: string = new Date().toISOString(),
): OpportunityMetrics {
  const exp = expenseTotals(op);
  const sales = salesStats(op);
  const pm = progressMetrics(op, results, nowISO);
  const prof = profitability(op, results);

  const ventas = (op.sales ?? []).map((s) => ({
    title: s.title || "Unidad",
    status: s.status,
    statusLabel: RE_SALE_STATUS_LABEL[s.status],
    price: s.realPrice ?? s.estimatedPrice ?? undefined,
  }));

  const realExpenses = effectiveRealExpenses(op);
  const gastos = (op.expenses ?? []).map((e) => {
    const invoice: MediaRef | null = toMediaRef({
      bucket: e.invoiceBucket,
      storagePath: e.invoiceStoragePath,
      uri: e.invoiceUri,
    });
    return {
      concept: e.concept || RE_EXPENSE_CATEGORY_LABEL[e.category],
      category: RE_EXPENSE_CATEGORY_LABEL[e.category],
      amount: budgetLineReal(realExpenses, e.id) ?? e.estimated ?? undefined,
      ...(invoice ? { invoice } : {}),
    };
  });

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
    pendientePago: exp.pending,
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
    ventas,
    ventasSinPrecios: ventas.map(({ title, status, statusLabel }) => ({ title, status, statusLabel })),
    gastos,
    gastosSinImportes: gastos.map(({ concept, category }) => ({ concept, category })),
    media,
    generatedAt: nowISO,
  };
}

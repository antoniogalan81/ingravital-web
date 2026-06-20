"use client";

// INFORMES (WEB) — versión funcional de export/compartir.
// Selecciona una operación → dossier premium imprimible (ReportDocument) +
// barra de acciones: imprimir/guardar PDF (window.print), copiar resumen y
// compartir (próximo paso, requiere backend). Reutiliza calcResults(). Sin
// Supabase, sin fórmulas nuevas, sin backend.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import AppGate from "@/components/AppGate";
import { calcResults, fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";
import { ReportDocument, reportSummaryText } from "@/src/components/realEstate/ReportDocument";
import { useSync } from "@/src/sync/SyncContext";

function InformesContent() {
  const { realEstateOperations } = useSync();
  const ops = useMemo(() => (realEstateOperations ?? []).filter((o) => !o.isDraft && !o.deleted), [realEstateOperations]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const op = useMemo(() => ops.find((o) => o.id === selectedId) ?? null, [ops, selectedId]);

  // Fecha de generación (solo cuando hay informe abierto; se fija al render).
  const generatedAt = useMemo(
    () => (op ? new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }) : ""),
    [op]
  );

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  const handleCopy = async () => {
    if (!op) return;
    try {
      await navigator.clipboard.writeText(reportSummaryText(op));
      toast.success("Resumen copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar el resumen");
    }
  };

  const handleShare = () => {
    toast.info("Compartir por enlace llegará con el backend de informes (próximo paso).");
  };

  if (ops.length === 0) {
    return (
      <div className="empty-state max-w-xl">
        <span className="empty-state-icon">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6M9 8h2M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
          </svg>
        </span>
        <h2 className="text-xl font-extrabold text-ink tracking-tight">Aún no hay informes</h2>
        <p className="text-sm text-ink-muted mt-2 max-w-md mx-auto leading-relaxed">
          Crea y analiza una operación en Inversiones para generar un dossier profesional con compra, costes,
          financiación, rentabilidad y escenarios, listo para imprimir o guardar en PDF.
        </p>
        <a href="/finanzas" className="btn-primary mt-6">Ir a Inversiones</a>
      </div>
    );
  }

  // ── Selección de operación ──
  if (!op) {
    return (
      <div className="max-w-2xl">
        <p className="text-sm text-ink-muted leading-relaxed mb-4">
          Selecciona una operación para generar un informe profesional con datos de compra, costes, financiación,
          rentabilidad y escenarios, listo para imprimir o guardar como PDF.
        </p>
        <div className="section-header">
          <p className="section-label">Operaciones disponibles</p>
          <span className="text-xs text-ink-subtle font-semibold">{ops.length} {ops.length === 1 ? "operación" : "operaciones"}</span>
        </div>
        <div className="re-card overflow-hidden">
          {ops.map((o, i) => {
            const res = calcResults(o);
            return (
              <button
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                className={`group w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[var(--surface-alt)] transition-colors ${
                  i < ops.length - 1 ? "border-b border-line" : ""
                }`}
              >
                <span className="action-card-icon !w-10 !h-10">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-ink truncate">{o.name || "Sin nombre"}</p>
                  <p className="text-xs text-ink-subtle font-medium truncate">
                    {fmtEUR(res.totalInvestment)} · venta {fmtPct(res.saleYield)}
                  </p>
                </div>
                <svg className="w-4 h-4 text-ink-subtle shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Informe ──
  return (
    <div className="max-w-4xl">
      {/* Barra de acciones (no se imprime) */}
      <div className="no-print flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => setSelectedId(null)} className="text-sm font-semibold text-brand hover:underline mr-1">
          ← Operaciones
        </button>
        <span className="text-ink-subtle">/</span>
        <span className="text-sm font-semibold text-ink truncate mr-auto">{op.name || "Informe"}</span>

        <button onClick={handleCopy} className="btn-secondary !py-1.5">
          Copiar resumen
        </button>
        <button onClick={handleShare} className="btn-secondary !py-1.5">
          Compartir
        </button>
        <button onClick={handlePrint} className="btn-primary !py-1.5">
          Imprimir / guardar PDF
        </button>
      </div>

      <ReportDocument op={op} generatedAt={generatedAt} />
    </div>
  );
}

export default function InformesPage() {
  return (
    <AppGate active="informes" label="Documentación para inversores" title="Informes">
      <InformesContent />
    </AppGate>
  );
}

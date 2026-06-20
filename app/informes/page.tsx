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
      <div className="re-card p-10 text-center max-w-xl">
        <h2 className="text-lg font-extrabold text-ink">No hay operaciones</h2>
        <p className="text-sm text-ink-muted mt-2">Crea y analiza una operación en Inversiones para generar su informe.</p>
        <a href="/finanzas" className="inline-block mt-5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark transition-colors">
          Ir a Inversiones
        </a>
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
        <div className="re-card overflow-hidden">
          {ops.map((o, i) => {
            const res = calcResults(o);
            return (
              <button
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                className={`w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-[var(--surface-alt)] transition-colors ${
                  i < ops.length - 1 ? "border-b border-line" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-ink truncate">{o.name || "Sin nombre"}</p>
                  <p className="text-xs text-ink-subtle font-medium truncate">
                    {fmtEUR(res.totalInvestment)} · venta {fmtPct(res.saleYield)}
                  </p>
                </div>
                <span className="text-ink-subtle">→</span>
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

        <button
          onClick={handleCopy}
          className="rounded-lg border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink-muted hover:text-ink hover:border-[var(--line-strong)] transition-colors"
        >
          Copiar resumen
        </button>
        <button
          onClick={handleShare}
          className="rounded-lg border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink-muted hover:text-ink hover:border-[var(--line-strong)] transition-colors"
        >
          Compartir
        </button>
        <button
          onClick={handlePrint}
          className="rounded-lg bg-brand px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark transition-colors"
        >
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

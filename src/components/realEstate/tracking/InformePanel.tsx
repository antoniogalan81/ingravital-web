"use client";

// Panel INFORME — desde la propia operación (no una ruta genérica). Reutiliza
// ReportDocument (dossier imprimible, ya con secciones de seguimiento) y ofrece:
//   · Imprimir / Guardar PDF  → window.print() aísla #report-print-area (sin dep nueva)
//   · Vista inversor          → previsualización filtrada por permisos (InvestorView)
//   · Compartir resumen       → Web Share API / portapapeles
// Usa los datos reales de ESTA operación. No inventa cifras.

import { toast } from "sonner";
import type { REOperation } from "@/src/lib/realEstate";
import { ReportDocument, reportSummaryText } from "@/src/components/realEstate/ReportDocument";

export function InformePanel({
  op,
  generatedAt,
  onPreviewInvestor,
}: {
  op: REOperation;
  generatedAt: string;
  onPreviewInvestor: () => void;
}) {
  const print = () => {
    if (typeof window !== "undefined") window.print();
  };

  const shareSummary = async () => {
    const text = reportSummaryText(op);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: op.name || "Informe", text });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        toast.success("Resumen copiado al portapapeles");
      } else {
        toast.error("Compartir no está disponible en este navegador");
      }
    } catch {
      // cancelado por el usuario
    }
  };

  return (
    <div className="space-y-4">
      {/* Barra de acciones del informe (no sale en la impresión) */}
      <div className="no-print re-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold text-ink">Informe de la operación</p>
            <p className="text-xs text-ink-subtle mt-0.5">Vista previa lista para imprimir o compartir.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={print}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors"
              style={{ background: "var(--brand)" }}
            >
              Imprimir / Guardar PDF
            </button>
            <button
              type="button"
              onClick={onPreviewInvestor}
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-[var(--surface-alt)] transition-colors"
            >
              Vista inversor
            </button>
            <button
              type="button"
              onClick={shareSummary}
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-[var(--surface-alt)] transition-colors"
            >
              Compartir resumen
            </button>
          </div>
        </div>
        <p className="text-xs text-ink-subtle mt-3">
          Usa los datos reales de esta operación (resumen, avance, gastos, ventas, hitos, rentabilidad,
          desviaciones y próximos pasos). La <b>vista inversor</b> muestra solo lo permitido en Compartir.
          La exportación a PDF se hace con la impresión del navegador (sin dependencias nuevas).
        </p>
      </div>

      <ReportDocument op={op} generatedAt={generatedAt} />
    </div>
  );
}

export default InformePanel;

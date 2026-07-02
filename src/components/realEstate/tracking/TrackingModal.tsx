"use client";

// HUB de SEGUIMIENTO Y GESTIÓN de una operación inmobiliaria (WEB).
// Drawer lateral (mismo patrón que RealEstateModal) con pestañas:
//   Resumen · Gastos · Ventas · Hitos · Rentabilidad · Media · Compartir · Informe.
// No mantiene estado de datos propio: lee `op` (draft vivo del modal padre) y
// persiste cada cambio con `onPersist(patch)` → el padre hace commit (JSON sync).

import { useMemo, useState } from "react";
import { Drawer as Vaul } from "vaul";
import type { REOperation } from "@/src/lib/realEstate";
import { calcResults } from "@/src/lib/realEstateCalc";
import type {
  REExpense,
  REInvestorSplit,
  REMediaItem,
  REMilestone,
  REProgress,
  RESale,
  REShareSettings,
} from "@/src/lib/realEstateTracking";
import { ResumenPanel } from "./ResumenPanel";
import { GastosPanel } from "./GastosPanel";
import { VentasPanel } from "./VentasPanel";
import { HitosPanel } from "./HitosPanel";
import { RentabilidadPanel } from "./RentabilidadPanel";
import { MediaPanel } from "./MediaPanel";
import { SharePanel } from "./SharePanel";
import { InformePanel } from "./InformePanel";
import { InvestorView } from "./InvestorView";

type TabKey = "resumen" | "gastos" | "ventas" | "hitos" | "rentab" | "media" | "compartir" | "informe";

const TABS: { key: TabKey; label: string }[] = [
  { key: "resumen", label: "Resumen" },
  { key: "gastos", label: "Gastos" },
  { key: "ventas", label: "Ventas" },
  { key: "hitos", label: "Hitos" },
  { key: "rentab", label: "Rentabilidad" },
  { key: "media", label: "Media" },
  { key: "compartir", label: "Compartir" },
  { key: "informe", label: "Informe" },
];

export function TrackingModal({
  op,
  onPersist,
  onClose,
}: {
  op: REOperation;
  onPersist: (patch: Partial<REOperation>) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("resumen");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);

  const results = useMemo(() => calcResults(op), [op]);
  const now = useMemo(() => new Date().toISOString(), []);
  const generatedAt = useMemo(() => new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }), []);

  const handleClose = () => {
    setDrawerOpen(false);
    setTimeout(onClose, 400);
  };

  return (
    <Vaul.Root open={drawerOpen} onOpenChange={(o) => { if (!o) handleClose(); }} direction="right">
      <Vaul.Portal>
        <Vaul.Overlay className="fixed inset-0 z-[55] bg-black/40" />
        <Vaul.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-[55] w-full max-w-4xl bg-[var(--surface-alt)] shadow-2xl flex flex-col overflow-hidden outline-none"
        >
          <Vaul.Title className="sr-only">Seguimiento y gestión · {op.name || "Operación"}</Vaul.Title>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-white flex-shrink-0">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-bold text-ink-subtle">Seguimiento y gestión</p>
              <h2 className="text-xl font-extrabold text-ink tracking-tight truncate">{op.name || "Operación"}</h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100"
              title="Cerrar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex overflow-x-auto gap-1.5 px-4 py-2 border-b border-line bg-white flex-shrink-0">
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap border transition-colors flex-shrink-0 ${
                    active
                      ? "border-transparent text-white"
                      : "border-line text-ink-muted hover:text-brand hover:border-brand hover:bg-[var(--brand-soft)]"
                  }`}
                  style={active ? { background: "var(--brand)" } : undefined}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {tab === "resumen" && (
              <ResumenPanel op={op} results={results} now={now} onChangeProgress={(progress: REProgress) => onPersist({ progress })} />
            )}
            {tab === "gastos" && <GastosPanel op={op} onChange={(expenses: REExpense[]) => onPersist({ expenses })} />}
            {tab === "ventas" && <VentasPanel op={op} results={results} onChange={(sales: RESale[]) => onPersist({ sales })} />}
            {tab === "hitos" && <HitosPanel op={op} onChange={(milestones: REMilestone[]) => onPersist({ milestones })} />}
            {tab === "rentab" && <RentabilidadPanel op={op} results={results} onChange={(investorSplit: REInvestorSplit) => onPersist({ investorSplit })} />}
            {tab === "media" && <MediaPanel op={op} onChange={(media: REMediaItem[]) => onPersist({ media })} />}
            {tab === "compartir" && (
              <SharePanel op={op} onChange={(share: REShareSettings) => onPersist({ share })} onPreview={() => setPreviewOpen(true)} />
            )}
            {tab === "informe" && (
              <InformePanel op={op} generatedAt={generatedAt} onPreviewInvestor={() => setPreviewOpen(true)} />
            )}
          </div>
        </Vaul.Content>
      </Vaul.Portal>

      {previewOpen ? <InvestorView op={op} results={results} now={now} onClose={() => setPreviewOpen(false)} /> : null}
    </Vaul.Root>
  );
}

export default TrackingModal;

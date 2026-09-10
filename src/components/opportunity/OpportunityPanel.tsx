"use client";

// Pestaña INVERSORES de una operación: convierte la operación en oportunidad y
// gestiona todo el ciclo — oferta, visibilidad, destinatarios e inversiones reales.
//
// Una operación NO se convierte en oportunidad automáticamente: hace falta que el
// promotor pulse «Preparar para inversores». Antes de eso, la operación es análisis
// interno y nadie de fuera puede verla.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { REOperation, REResults } from "@/src/lib/realEstate";
import {
  createOpportunity,
  getOpportunityByOperation,
  listContacts,
  listInvestments,
  publishOpportunity,
  updateOpportunity,
} from "@/src/lib/investorPlatform/service";
import { buildOpportunityMetrics } from "@/src/lib/investorPlatform/metrics";
import { previewSnapshot } from "@/src/lib/investorPlatform/preview";
import {
  OPPORTUNITY_STATUS_LABEL,
  defaultVisibility,
  fundingState,
  type Investment,
  type InvestorContact,
  type Opportunity,
  type VisibilityMap,
} from "@/src/lib/investorPlatform/types";
import { OfferForm, type OfferDraft } from "./OfferForm";
import { VisibilityPanel } from "./VisibilityPanel";
import { InvitationsPanel } from "./InvitationsPanel";
import { InvestmentsPanel } from "./InvestmentsPanel";
import { OpportunityPresentation } from "@/src/components/investor/OpportunityPresentation";

type Tab = "oferta" | "visibilidad" | "destinatarios" | "inversiones" | "presentacion";

const TABS: { key: Tab; label: string }[] = [
  { key: "oferta", label: "Oferta" },
  { key: "presentacion", label: "Presentación" },
  { key: "visibilidad", label: "Visibilidad" },
  { key: "destinatarios", label: "Destinatarios" },
  { key: "inversiones", label: "Inversiones" },
];

function draftFrom(o: Opportunity): OfferDraft {
  return {
    title: o.title,
    location: o.location,
    summary: o.summary,
    strategy: o.strategy,
    risks: o.risks,
    internalNotes: o.internalNotes,
    targetCapital: o.targetCapital,
    minTicket: o.minTicket,
    targetTicket: o.targetTicket,
    maxTicket: o.maxTicket,
    offeredYieldPct: o.offeredYieldPct,
    termMonths: o.termMonths,
    startDate: o.startDate,
    returnDate: o.returnDate,
    investmentModel: o.investmentModel,
    conditions: o.conditions,
    guarantee: o.guarantee,
    guaranteeRank: o.guaranteeRank,
    earlyCancellation: o.earlyCancellation,
  };
}

export function OpportunityPanel({
  op,
  results,
  onOpenCrm,
}: {
  op: REOperation;
  results: REResults;
  onOpenCrm: () => void;
}) {
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<InvestorContact[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [tab, setTab] = useState<Tab>("oferta");
  const [draft, setDraft] = useState<OfferDraft | null>(null);
  const [visibility, setVisibility] = useState<VisibilityMap>(defaultVisibility());
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Los KPIs se recalculan a partir de la operación actual: lo que ve el inversor
  // no envejece respecto al análisis del promotor.
  const metrics = useMemo(() => buildOpportunityMetrics(op, results), [op, results]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [found, crm] = await Promise.all([getOpportunityByOperation(op.id), listContacts()]);
      setContacts(crm);
      setOpportunity(found);
      if (found) {
        setDraft(draftFrom(found));
        setVisibility(found.visibility);
        setInvestments(await listInvestments(found.id));
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la oportunidad.");
    } finally {
      setLoading(false);
    }
  }, [op.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const prepare = async () => {
    setBusy(true);
    try {
      const created = await createOpportunity({
        operationId: op.id,
        title: op.name || "Operación",
        location: op.address ?? null,
        metrics,
        visibility: defaultVisibility(),
        status: "borrador",
      });
      setOpportunity(created);
      setDraft(draftFrom(created));
      setVisibility(created.visibility);
      toast.success("Operación preparada para inversores");
    } catch (e) {
      toast.error("No se pudo preparar", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!opportunity || !draft) return;
    setBusy(true);
    try {
      await updateOpportunity(opportunity.id, { ...draft, visibility, metrics });
      setDirty(false);
      toast.success("Oferta guardada");
      await load();
    } catch (e) {
      toast.error("No se pudo guardar", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!opportunity) return;
    try {
      await publishOpportunity(opportunity.id);
      toast.success("Oportunidad publicada");
      await load();
    } catch (e) {
      toast.error("No se pudo publicar", { description: e instanceof Error ? e.message : undefined });
    }
  };

  if (loading) return <p className="text-sm text-ink-subtle">Cargando…</p>;

  if (error) {
    return (
      <div className="re-card p-5 space-y-2">
        <p className="text-sm text-[var(--negative)]">{error}</p>
        <p className="text-xs text-ink-subtle">
          Si la migración <code>20260910_investor_platform.sql</code> todavía no está aplicada en
          Supabase, esta pestaña no puede funcionar. Ver <code>docs/INVERSORES.md</code>.
        </p>
      </div>
    );
  }

  // ── Todavía no es una oportunidad ──
  if (!opportunity || !draft) {
    return (
      <div className="re-card p-6 text-center max-w-lg mx-auto space-y-3">
        <p className="text-lg font-extrabold text-ink tracking-tight">Esta operación es solo tuya</p>
        <p className="text-sm text-ink-muted leading-relaxed">
          Analízala con tranquilidad. Cuando decidas financiarla con inversores, prepara la oferta:
          capital, ticket, rentabilidad, plazo y garantías. Nadie verá nada hasta que compartas.
        </p>
        <button type="button" onClick={() => void prepare()} disabled={busy} className="btn-primary">
          {busy ? "Preparando…" : "Preparar para inversores"}
        </button>
      </div>
    );
  }

  const funding = fundingState(opportunity.targetCapital, investments);

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="re-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-ink truncate">{opportunity.title}</p>
            <span className="pill pill-info">{OPPORTUNITY_STATUS_LABEL[opportunity.status]}</span>
          </div>
          <p className="text-xs text-ink-muted mt-0.5">
            {funding.pctFinanciado != null
              ? `${Math.round(funding.pctFinanciado * 100)}% financiado · `
              : ""}
            {funding.inversores} inversor(es)
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {opportunity.status === "borrador" ? (
            <button
              type="button"
              onClick={() => void publish()}
              className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-[var(--surface-alt)]"
            >
              Publicar
            </button>
          ) : null}
          <button type="button" onClick={() => void save()} disabled={busy || !dirty} className="btn-primary disabled:opacity-50">
            {busy ? "Guardando…" : dirty ? "Guardar cambios" : "Guardado"}
          </button>
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-[var(--brand)] text-[var(--brand)]"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "oferta" ? (
        <OfferForm
          draft={draft}
          onChange={(patch) => {
            setDraft((d) => (d ? { ...d, ...patch } : d));
            setDirty(true);
          }}
        />
      ) : null}

      {tab === "visibilidad" ? (
        <VisibilityPanel
          visibility={visibility}
          onChange={(next) => {
            setVisibility(next);
            setDirty(true);
          }}
        />
      ) : null}

      {tab === "destinatarios" ? (
        <InvitationsPanel
          opportunity={{ ...opportunity, visibility }}
          contacts={contacts}
          onOpenCrm={onOpenCrm}
        />
      ) : null}

      {tab === "inversiones" ? (
        <InvestmentsPanel opportunity={opportunity} contacts={contacts} />
      ) : null}

      {tab === "presentacion" ? (
        <div className="space-y-3">
          <p className="text-[11px] text-ink-subtle">
            Esto es exactamente lo que verá un inversor con la visibilidad actual
            {dirty ? " (incluye cambios sin guardar)" : ""}.
          </p>
          <div className="rounded-2xl bg-[var(--surface-alt)] p-3 sm:p-5">
            <OpportunityPresentation
              snapshot={previewSnapshot({ ...opportunity, ...draft, metrics } as Opportunity, visibility, {
                comprometido: funding.comprometido,
                invertido: funding.invertido,
                inversores: funding.inversores,
              })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default OpportunityPanel;

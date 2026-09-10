"use client";

// Inversiones REALES de una oportunidad.
//
// Este es el único punto donde alguien pasa de "ha recibido la oportunidad" a
// "tiene participación económica". Es un acto explícito del promotor: nada de lo
// que haga el inversor (abrir el enlace, marcar interés) crea una inversión.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import {
  createInvestment,
  listInvestments,
  settleInvestment,
  updateInvestment,
} from "@/src/lib/investorPlatform/service";
import {
  INVESTMENT_STATUS_LABEL,
  fundingState,
  type Investment,
  type InvestmentStatus,
  type InvestorContact,
  type Opportunity,
} from "@/src/lib/investorPlatform/types";

const STATUS_PILL: Record<InvestmentStatus, string> = {
  comprometida: "pill-warning",
  desembolsada: "pill-info",
  activa: "pill-positive",
  liquidada: "pill-neutral",
  cancelada: "pill-negative",
};

const inputCls =
  "w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400";

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3.5 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="text-base font-extrabold tabular-nums tracking-tight mt-0.5" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
    </div>
  );
}

export function InvestmentsPanel({
  opportunity,
  contacts,
}: {
  opportunity: Opportunity;
  contacts: InvestorContact[];
}) {
  const [items, setItems] = useState<Investment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const [contactId, setContactId] = useState("");
  const [amount, setAmount] = useState("");
  const [yieldPct, setYieldPct] = useState(String(opportunity.offeredYieldPct ?? ""));
  const [months, setMonths] = useState(String(opportunity.termMonths ?? ""));
  const [guarantee, setGuarantee] = useState(opportunity.guarantee ?? "");

  const load = useCallback(() => {
    listInvestments(opportunity.id)
      .then((rows) => {
        setItems(rows);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar las inversiones."));
  }, [opportunity.id]);

  useEffect(() => load(), [load]);

  const funding = useMemo(
    () => fundingState(opportunity.targetCapital, items ?? []),
    [opportunity.targetCapital, items],
  );

  const submit = async () => {
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) {
      toast.error("Elige el inversor");
      return;
    }
    const value = Number(amount);
    if (!(value > 0)) {
      toast.error("El capital debe ser mayor que cero");
      return;
    }
    setBusy(true);
    try {
      await createInvestment({
        opportunityId: opportunity.id,
        contact,
        amount: value,
        agreedYieldPct: yieldPct ? Number(yieldPct) : null,
        termMonths: months ? Number(months) : null,
        guarantee: guarantee || null,
      });
      toast.success("Inversión registrada", {
        description: contact.linkedUserId
          ? "Ya la ve en «Mis inversiones»."
          : "La verá en cuanto se identifique con su invitación.",
      });
      setAdding(false);
      setContactId("");
      setAmount("");
      load();
    } catch (e) {
      toast.error("No se pudo registrar", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      load();
    } catch (e) {
      toast.error("No se pudo completar", { description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Captación real ── */}
      <section className="re-card p-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Estado de captación</p>
          {funding.pctFinanciado != null ? (
            <span className="text-sm font-extrabold tabular-nums text-ink">
              {Math.round(funding.pctFinanciado * 100)}% financiado
            </span>
          ) : null}
        </div>

        {funding.pctFinanciado != null ? (
          <div className="h-2.5 rounded-full bg-[var(--surface-alt)] overflow-hidden">
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${Math.round(funding.pctFinanciado * 100)}%`, background: "var(--brand)" }}
            />
          </div>
        ) : null}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Stat label="Objetivo" value={funding.objetivo == null ? "—" : fmtEUR(funding.objetivo)} />
          <Stat label="Invertido" value={fmtEUR(funding.invertido)} tone="var(--positive)" />
          <Stat label="Comprometido" value={fmtEUR(funding.comprometido)} tone="var(--warning)" />
          <Stat label="Pendiente" value={funding.pendiente == null ? "—" : fmtEUR(funding.pendiente)} />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Stat label="Inversores" value={String(funding.inversores)} />
          <Stat
            label="Ticket real medio"
            value={funding.ticketMedioReal == null ? "—" : fmtEUR(funding.ticketMedioReal)}
          />
        </div>
        <p className="text-[11px] text-ink-subtle">
          El ticket real medio se calcula sobre inversiones registradas; no es el ticket objetivo de la oferta.
        </p>
      </section>

      {/* ── Registrar inversión ── */}
      {adding ? (
        <section className="re-card p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Registrar inversión real</p>

          <label className="block">
            <span className="block text-xs font-bold text-ink mb-1">Inversor</span>
            <select className={inputCls} value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">Elige un inversor…</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                  {c.email ? ` · ${c.email}` : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block">
              <span className="block text-xs font-bold text-ink mb-1">Capital (€)</span>
              <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-ink mb-1">Rentab. pactada (%)</span>
              <input className={inputCls} inputMode="decimal" value={yieldPct} onChange={(e) => setYieldPct(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-ink mb-1">Plazo (meses)</span>
              <input className={inputCls} inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-ink mb-1">Garantía</span>
              <input className={inputCls} value={guarantee} onChange={(e) => setGuarantee(e.target.value)} />
            </label>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => void submit()} disabled={busy} className="btn-primary">
              {busy ? "Registrando…" : "Registrar inversión"}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-[var(--surface-alt)]"
            >
              Cancelar
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={contacts.length === 0}
          className="btn-primary disabled:opacity-50"
        >
          Registrar inversión real
        </button>
      )}

      {/* ── Lista ── */}
      {error ? (
        <p className="text-sm text-[var(--negative)]">{error}</p>
      ) : items === null ? (
        <p className="text-sm text-ink-subtle">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-subtle">
          Todavía no hay capital aportado. Compartir la oportunidad no crea inversiones.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((v) => {
            const contact = contacts.find((c) => c.id === v.contactId);
            return (
              <div key={v.id} className="re-card p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink truncate">
                      {contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : "Inversor"}
                    </p>
                    <p className="text-[11px] text-ink-subtle">
                      {fmtEUR(v.amount)}
                      {v.agreedYieldPct != null ? ` · ${v.agreedYieldPct}% pactado` : ""}
                      {v.termMonths != null ? ` · ${v.termMonths} meses` : ""}
                      {v.investorUserId ? "" : " · pendiente de que se identifique"}
                    </p>
                  </div>
                  <span className={`pill ${STATUS_PILL[v.status]} shrink-0`}>
                    {INVESTMENT_STATUS_LABEL[v.status]}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
                  {v.status === "comprometida" ? (
                    <button
                      type="button"
                      onClick={() => void act(() => updateInvestment(v.id, { status: "desembolsada" }), "Marcada como desembolsada")}
                      className="font-semibold text-brand hover:underline"
                    >
                      Marcar desembolsada
                    </button>
                  ) : null}
                  {v.status === "desembolsada" ? (
                    <button
                      type="button"
                      onClick={() => void act(() => updateInvestment(v.id, { status: "activa" }), "Inversión activa")}
                      className="font-semibold text-brand hover:underline"
                    >
                      Marcar activa
                    </button>
                  ) : null}
                  {v.status !== "liquidada" && v.status !== "cancelada" ? (
                    <button
                      type="button"
                      onClick={() => {
                        const devuelto = prompt("Importe devuelto al inversor (€):", String(v.amount));
                        if (devuelto === null) return;
                        const rent = prompt("Rentabilidad final (%):", String(v.agreedYieldPct ?? ""));
                        void act(
                          () =>
                            settleInvestment(v.id, {
                              returnedAmount: devuelto ? Number(devuelto) : null,
                              finalYieldPct: rent ? Number(rent) : null,
                            }),
                          "Inversión liquidada",
                        );
                      }}
                      className="font-semibold text-[var(--positive)] hover:underline"
                    >
                      Liquidar
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default InvestmentsPanel;

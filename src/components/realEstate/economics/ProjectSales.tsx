"use client";

// VENTAS de una operación: resumen, próximos hitos y grupos por tipo de unidad (Viviendas,
// Garajes, Trasteros) con cada unidad y su línea temporal TERMINACIÓN → VENTA → COBRO.
// Componente ÚNICO para Gestión del proyecto, el área Inversores y la vista del inversor,
// alimentado por `SalesSummaryView` (src/lib/projectEconomics.ts). Importes a null = ocultos.

import { useState } from "react";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import type { SaleGroupKey, SaleGroupView, SaleUnitView, SalesSummaryView, UpcomingEvent } from "@/src/lib/projectEconomics";

const money = (v: number | null | undefined) => (v == null ? null : fmtEUR(v));
const fmtDate = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" }) : null);

const EVENT_LABEL: Record<UpcomingEvent["kind"], string> = { terminacion: "Terminación", venta: "Venta", cobro: "Cobro" };

const STATUS_TONE: Record<string, string> = {
  VENDIDO: "pill-positive",
  RESERVADO: "pill-info",
  SENALADO: "pill-info",
  APALABRADO: "pill-warning",
  DISPONIBLE: "pill-neutral",
};

export type SalesActions = {
  onEditUnit: (saleId: string) => void;
  onAddUnit: (group: SaleGroupKey) => void;
  onCreateMissing: (group: SaleGroupKey) => void;
};

function Figure({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  if (value == null) return null;
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">{label}</div>
      <div className="text-base sm:text-lg font-extrabold tabular-nums text-ink truncate">{value}</div>
      {sub ? <div className="text-[11px] text-ink-muted">{sub}</div> : null}
    </div>
  );
}

/** Barra de unidades: vendidas · reservadas · disponibles. */
function UnitsBar({ g }: { g: SaleGroupView }) {
  if (g.units <= 0) return null;
  const w = (n: number) => `${(n / g.units) * 100}%`;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--surface-alt)]" role="img" aria-label={`${g.sold} vendidas, ${g.reserved} reservadas, ${g.available} disponibles`}>
      <div style={{ width: w(g.sold), background: "var(--positive)" }} />
      <div style={{ width: w(g.reserved), background: "var(--brand)" }} />
    </div>
  );
}

/** Paso de la línea temporal: previsto arriba, real (si existe) en verde. */
function Step({ title, estimated, real, amount, amountLabel, done }: { title: string; estimated?: string; real?: string | null; amount?: string | null; amountLabel?: string; done: boolean }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: done ? "var(--positive)" : estimated ? "var(--brand)" : "var(--line-strong)" }} aria-hidden="true" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-ink-subtle">{title}</span>
      </div>
      <div className="pl-3.5 text-[11px] leading-snug">
        {real ? <p className="font-semibold tabular-nums" style={{ color: "var(--positive)" }}>{real}</p> : null}
        {estimated ? <p className={`tabular-nums ${real ? "text-ink-subtle" : "text-ink"}`}>{real ? `prev. ${estimated}` : estimated}</p> : !real ? <p className="text-ink-subtle">—</p> : null}
        {amount ? <p className="tabular-nums text-ink-muted">{amountLabel ? `${amountLabel} ` : ""}{amount}</p> : null}
      </div>
    </div>
  );
}

function UnitRow({ u, onEdit }: { u: SaleUnitView; onEdit?: () => void }) {
  const salePrice = u.soldAmount != null ? money(u.soldAmount) : money(u.plannedPrice);
  const collected = u.collection.payments.length ? u.collected : null;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-bold text-ink truncate">{u.title}</span>
          <span className={`pill ${STATUS_TONE[u.status] ?? "pill-neutral"}`}>{u.statusLabel}</span>
          {u.build ? <span className="pill pill-neutral">{u.build === "terminada" ? "Terminada" : "En obra"}</span> : null}
        </div>
        {onEdit ? (
          <button type="button" onClick={onEdit} className="rounded-md px-2 py-1 text-xs font-semibold text-brand hover:bg-[var(--brand-soft)]">
            Editar
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex items-start gap-2">
        <Step title="Terminación" estimated={fmtDate(u.completion.estimated) ?? undefined} real={fmtDate(u.completion.real)} done={!!u.completion.real} />
        <span className="pt-0.5 text-ink-subtle" aria-hidden="true">→</span>
        <Step title="Venta" estimated={fmtDate(u.sale.estimated) ?? undefined} real={fmtDate(u.sale.real)} amount={salePrice} done={!!u.sale.real} />
        <span className="pt-0.5 text-ink-subtle" aria-hidden="true">→</span>
        <Step
          title="Cobro"
          estimated={fmtDate(u.collection.estimated) ?? undefined}
          real={collected != null && u.collection.payments.length ? `cobrado ${fmtEUR(collected)}` : null}
          amount={u.pending != null && u.pending > 0 ? money(u.pending) : u.collection.amountEstimated != null && !u.collection.payments.length ? money(u.collection.amountEstimated) : null}
          amountLabel={u.pending != null && u.pending > 0 ? "pendiente" : undefined}
          done={u.pending === 0 && (u.collected ?? 0) > 0}
        />
      </div>
    </li>
  );
}

export function ProjectSales({ summary, actions }: { summary: SalesSummaryView; actions?: SalesActions }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (!summary.groups.length) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-subtle">Todavía no hay unidades en venta. Se toman de las Unidades de la ficha.</p>
        {actions ? (
          <button type="button" onClick={() => actions.onAddUnit("VIVIENDA")} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-brand hover:bg-[var(--brand-soft)]">
            + Añadir unidad
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-line bg-[var(--surface-alt)] px-3.5 py-3">
        <Figure label="Unidades" value={String(summary.units)} sub={`${summary.finished} terminada${summary.finished === 1 ? "" : "s"} · ${summary.sold} vendida${summary.sold === 1 ? "" : "s"} · ${summary.available} disponible${summary.available === 1 ? "" : "s"}`} />
        <Figure label="Previsto ventas" value={money(summary.planned)} />
        <Figure label="Vendido" value={money(summary.soldAmount)} sub={summary.collected != null ? `cobrado ${fmtEUR(summary.collected)}` : undefined} />
        <Figure label="Pendiente de cobro" value={money(summary.pending)} />
      </div>

      {summary.upcoming.length ? (
        <div className="rounded-xl border border-line bg-white px-3.5 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-subtle mb-1">Próximos hitos</p>
          <ul className="space-y-0.5">
            {summary.upcoming.map((e, i) => (
              <li key={`${e.kind}-${e.title}-${i}`} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-ink-muted">
                  <span className="font-semibold tabular-nums text-ink">{fmtDate(e.date)}</span> · {EVENT_LABEL[e.kind]} · {e.title}
                </span>
                {e.amount != null ? <span className="tabular-nums font-semibold text-ink shrink-0">{fmtEUR(e.amount)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="space-y-2">
        {summary.groups.map((g) => {
          const isOpen = open.has(g.key);
          const panelId = `sales-group-${g.key}`;
          return (
            <li key={g.key} className="rounded-xl border border-line bg-white overflow-hidden">
              <button type="button" onClick={() => toggle(g.key)} aria-expanded={isOpen} aria-controls={panelId} className="w-full px-3.5 py-3 text-left hover:bg-[var(--surface-alt)] transition-colors space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <svg className={`w-3.5 h-3.5 shrink-0 text-ink-subtle transition-transform ${isOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-extrabold text-ink">{g.label}</span>
                  </span>
                  {g.planned != null ? <span className="text-sm font-extrabold tabular-nums text-ink">{fmtEUR(g.planned)}</span> : null}
                </div>
                <p className="text-xs text-ink-muted" style={{ paddingLeft: "1.375rem" }}>
                  {g.units} uds · {g.sold} vendida{g.sold === 1 ? "" : "s"} · {g.reserved} reservada{g.reserved === 1 ? "" : "s"} · {g.available} disponible{g.available === 1 ? "" : "s"}
                  {g.finished ? ` · ${g.finished} terminada${g.finished === 1 ? "" : "s"}` : ""}
                </p>
                <div style={{ paddingLeft: "1.375rem" }} className="space-y-1.5">
                  <UnitsBar g={g} />
                  {g.soldAmount != null && (g.sold > 0 || (g.collected ?? 0) > 0) ? (
                    <p className="text-[11px] tabular-nums text-ink-muted">
                      Vendido {fmtEUR(g.soldAmount)} · Cobrado {fmtEUR(g.collected ?? 0)} · Pendiente {fmtEUR(g.pending ?? 0)}
                    </p>
                  ) : null}
                </div>
              </button>
              {isOpen ? (
                <div id={panelId} className="border-t border-line px-3.5 pb-2" style={{ paddingLeft: "2.25rem" }}>
                  {g.rows.length ? (
                    <ul className="divide-y divide-[var(--line)]">
                      {g.rows.map((u) => (
                        <UnitRow key={u.id} u={u} onEdit={actions ? () => actions.onEditUnit(u.id) : undefined} />
                      ))}
                    </ul>
                  ) : null}
                  {g.unitsWithoutRecord > 0 ? (
                    <p className="py-2 text-xs text-ink-subtle">
                      {g.unitsWithoutRecord} unidad{g.unitsWithoutRecord === 1 ? "" : "es"} prevista{g.unitsWithoutRecord === 1 ? "" : "s"} sin ficha de venta.
                    </p>
                  ) : null}
                  {actions ? (
                    <div className="flex flex-wrap justify-end gap-2 py-2">
                      {g.unitsWithoutRecord > 0 && g.key !== "OTROS" ? (
                        <button type="button" onClick={() => actions.onCreateMissing(g.key)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-[var(--surface-alt)]">
                          Crear {g.unitsWithoutRecord} ficha{g.unitsWithoutRecord === 1 ? "" : "s"}
                        </button>
                      ) : null}
                      <button type="button" onClick={() => actions.onAddUnit(g.key)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand hover:bg-[var(--brand-soft)]">
                        + Añadir unidad
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default ProjectSales;

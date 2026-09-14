"use client";

// GASTOS de una operación: resumen por categorías (previsto · real · desviación) y detalle
// bajo demanda. Componente ÚNICO para Gestión del proyecto, el área Inversores y la vista
// del inversor: todos le pasan el mismo `ExpenseSummaryView` (src/lib/projectEconomics.ts).
// Los importes pueden venir a null (visibilidad del inversor): entonces no se pintan.

import { useState } from "react";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import type { ExpenseCategoryView, ExpenseSummaryView, PlannedConceptView } from "@/src/lib/projectEconomics";
import { driveFileUrl } from "@/src/lib/realFinances";

const money = (v: number | null | undefined) => (v == null ? null : fmtEUR(v));
const fmtDate = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "");
const num = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 2 });

export type ConceptActions = {
  onEdit: (conceptId: string) => void;
  onDelete: (conceptId: string) => void;
};

function Figure({ label, value, tone }: { label: string; value: string | null; tone?: "positive" | "negative" }) {
  if (value == null) return null;
  const color = tone === "negative" ? "var(--negative)" : tone === "positive" ? "var(--positive)" : "var(--ink)";
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">{label}</div>
      <div className="text-base sm:text-lg font-extrabold tabular-nums leading-tight" style={{ color }}>{value}</div>
    </div>
  );
}

/** Barra real / previsto. Sobre lo previsto se pinta en rojo. */
function SpendBar({ planned, real }: { planned: number | null; real: number | null }) {
  if (planned == null || real == null || (planned <= 0 && real <= 0)) return null;
  const over = real > planned;
  const pct = planned > 0 ? Math.min(100, (real / planned) * 100) : 100;
  return (
    <div className="h-1.5 w-full rounded-full bg-[var(--surface-alt)] overflow-hidden" aria-hidden="true">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? "var(--negative)" : "var(--positive)" }} />
    </div>
  );
}

function formula(c: PlannedConceptView): string | null {
  const parts: string[] = [];
  if (c.monthlyAmount != null) parts.push(`${num(c.monthlyAmount)} €/mes × ${c.months ?? 0} ${c.months === 1 ? "mes" : "meses"}`);
  if (c.fixedAmount != null && c.fixedAmount !== 0) parts.push(`${parts.length ? "+ " : ""}fijo ${num(c.fixedAmount)} €`);
  return parts.length ? parts.join(" ") : null;
}

function CategoryDetail({ category, actions }: { category: ExpenseCategoryView; actions?: ConceptActions }) {
  return (
    <div className="space-y-3 pt-2">
      {category.concepts.length ? (
        <ul className="divide-y divide-[var(--line)]">
          {category.concepts.map((c) => {
            const f = formula(c);
            return (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{c.concept}</p>
                  <p className="text-[11px] text-ink-subtle">
                    {f ?? (c.source === "simulador" ? "Calculado desde los costes de la ficha" : "Importe previsto")}
                    {c.real != null && c.planned != null ? ` · real ${fmtEUR(c.real)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {c.planned != null ? <span className="text-sm font-bold tabular-nums text-ink">{fmtEUR(c.planned)}</span> : null}
                  {actions && c.source === "concepto" ? (
                    <>
                      <button type="button" onClick={() => actions.onEdit(c.id)} className="rounded-md px-2 py-1 text-xs font-semibold text-brand hover:bg-[var(--brand-soft)]" aria-label={`Editar ${c.concept}`}>
                        Editar
                      </button>
                      <button type="button" onClick={() => actions.onDelete(c.id)} className="rounded-md px-2 py-1 text-xs font-semibold text-ink-subtle hover:text-[var(--negative)]" aria-label={`Eliminar ${c.concept}`}>
                        Eliminar
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {category.realItems.length ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-subtle mb-1">Gastos reales ({category.realItems.length})</p>
          <ul className="space-y-1">
            {category.realItems.map((r) => {
              const href = r.documentUrl ? driveFileUrl(r.documentUrl) : null;
              return (
                <li key={r.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-ink-muted">
                    <span className="tabular-nums">{fmtDate(r.date)}</span> · {r.concept}
                    {href ? (
                      <>
                        {" "}
                        <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">documento ↗</a>
                      </>
                    ) : null}
                  </span>
                  {r.amount != null ? <span className="tabular-nums font-semibold text-ink shrink-0">{fmtEUR(r.amount)}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ProjectExpenses({
  summary,
  actions,
  onAdd,
  emptyText = "Todavía no hay gastos previstos ni reales.",
}: {
  summary: ExpenseSummaryView;
  /** Solo en Gestión del proyecto: editar y eliminar conceptos del promotor. */
  actions?: ConceptActions;
  onAdd?: () => void;
  emptyText?: string;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const allOpen = summary.categories.length > 0 && open.size === summary.categories.length;
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const deviation = summary.deviation;
  const hasReal = summary.realCount > 0;

  return (
    <div className="space-y-3">
      {summary.planned != null ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-line bg-[var(--surface-alt)] px-3.5 py-3">
          <Figure label="Previsto" value={money(summary.planned)} />
          <Figure label="Real" value={hasReal ? money(summary.real) : "—"} />
          <Figure
            label="Desviación"
            value={!hasReal || deviation == null ? "—" : deviation > 0 ? `+${fmtEUR(deviation)}` : "Dentro de previsión"}
            tone={hasReal && deviation != null ? (deviation > 0 ? "negative" : "positive") : undefined}
          />
          <Figure label="Queda por gastar" value={money(summary.remaining)} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {summary.categories.length ? (
          <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(summary.categories.map((c) => c.key)))} className="text-xs font-semibold text-brand hover:underline" aria-expanded={allOpen}>
            {allOpen ? "Contraer todo" : "Ver todos los gastos"}
          </button>
        ) : (
          <p className="text-xs text-ink-subtle">{emptyText}</p>
        )}
        {onAdd ? (
          <button type="button" onClick={onAdd} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-brand hover:bg-[var(--brand-soft)] transition-colors">
            + Añadir gasto
          </button>
        ) : null}
      </div>

      {summary.categories.length ? (
        <ul className="rounded-xl border border-line bg-white divide-y divide-[var(--line)] overflow-hidden">
          {summary.categories.map((c) => {
            const isOpen = open.has(c.key);
            const panelId = `exp-cat-${c.key}`;
            const over = c.deviation != null && c.real != null && c.real > 0 && c.deviation > 0;
            return (
              <li key={c.key}>
                <button type="button" onClick={() => toggle(c.key)} aria-expanded={isOpen} aria-controls={panelId} className="w-full px-3.5 py-2.5 text-left hover:bg-[var(--surface-alt)] transition-colors">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2 min-w-0">
                      <svg className={`w-3.5 h-3.5 shrink-0 text-ink-subtle transition-transform ${isOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="text-sm font-bold text-ink shrink-0">{c.label}</span>
                      <span className="text-[11px] text-ink-subtle truncate">{c.concepts.length + c.realItems.length > 0 ? `${c.concepts.length} previsto${c.concepts.length === 1 ? "" : "s"}${c.realItems.length ? ` · ${c.realItems.length} real${c.realItems.length === 1 ? "" : "es"}` : ""}` : ""}</span>
                    </span>
                    {c.planned != null ? <span className="text-sm font-extrabold tabular-nums text-ink shrink-0">{fmtEUR(c.planned)}</span> : null}
                  </div>
                  {c.real != null && (c.real > 0 || c.planned === 0) ? (
                    <div className="mt-1.5 space-y-1" style={{ paddingLeft: "1.375rem" }}>
                      <SpendBar planned={c.planned} real={c.real} />
                      <p className="text-[11px] tabular-nums text-ink-muted">
                        Real {fmtEUR(c.real)}
                        {over && c.deviation != null ? (
                          <span style={{ color: "var(--negative)" }}> · +{fmtEUR(c.deviation)} sobre lo previsto</span>
                        ) : c.remaining != null && c.remaining > 0 ? (
                          <span> · quedan {fmtEUR(c.remaining)}</span>
                        ) : null}
                      </p>
                    </div>
                  ) : null}
                </button>
                {isOpen ? (
                  <div id={panelId} className="px-3.5 pb-3" style={{ paddingLeft: "2.25rem" }}>
                    <CategoryDetail category={c} actions={actions} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export default ProjectExpenses;

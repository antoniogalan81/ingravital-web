"use client";

// Configuración de la OFERTA que se presenta a los inversores.
//
// Separa explícitamente lo INTERNO de lo COMPARTIBLE:
//  · `internalNotes` nunca sale del promotor (la BD no lo devuelve jamás).
//  · el resto son campos de la ficha comercial, y su visibilidad se controla aparte.
//
// Los tickets son CONFIGURACIÓN (mínimo/objetivo/máximo). El ticket real medio es un
// RESULTADO y se calcula sobre inversiones: no se mezcla con esto.

import { INVESTMENT_MODEL_LABEL, type InvestmentModel } from "@/src/lib/investorPlatform/types";
import type { OpportunityInput } from "@/src/lib/investorPlatform/service";

export type OfferDraft = Omit<OpportunityInput, "operationId" | "metrics" | "visibility">;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-ink mb-1">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-ink-subtle mt-1">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400";

function NumberInput({
  value,
  onChange,
  placeholder,
  suffix,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <span className="relative block">
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          // Vacío significa "no definido", no cero: un 0 inventado falsearía los cálculos.
          onChange(raw === "" ? null : Number(raw));
        }}
        className={`${inputCls} ${suffix ? "pr-9" : ""} tabular-nums`}
      />
      {suffix ? (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink-subtle">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

export function OfferForm({
  draft,
  onChange,
}: {
  draft: OfferDraft;
  onChange: (patch: Partial<OfferDraft>) => void;
}) {
  const set = <K extends keyof OfferDraft>(key: K, value: OfferDraft[K]) => onChange({ [key]: value } as Partial<OfferDraft>);

  return (
    <div className="space-y-5">
      {/* ── Ficha comercial ── */}
      <section className="re-card p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Ficha del proyecto</p>

        <Field label="Título de la oportunidad">
          <input
            className={inputCls}
            value={draft.title ?? ""}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Edificio 6 viviendas · Centro"
          />
        </Field>

        <Field label="Localización">
          <input
            className={inputCls}
            value={draft.location ?? ""}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Málaga"
          />
        </Field>

        <Field label="Resumen ejecutivo" hint="Dos o tres frases: qué se compra, qué se hace y cómo se sale.">
          <textarea
            rows={3}
            className={inputCls}
            value={draft.summary ?? ""}
            onChange={(e) => set("summary", e.target.value)}
          />
        </Field>

        <Field label="Estrategia">
          <textarea
            rows={3}
            className={inputCls}
            value={draft.strategy ?? ""}
            onChange={(e) => set("strategy", e.target.value)}
          />
        </Field>

        <Field label="Principales riesgos" hint="Declararlos es parte de una oferta seria.">
          <textarea
            rows={3}
            className={inputCls}
            value={draft.risks ?? ""}
            onChange={(e) => set("risks", e.target.value)}
          />
        </Field>
      </section>

      {/* ── Estructura económica ── */}
      <section className="re-card p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Estructura de la oferta</p>

        <Field label="Modelo de inversión">
          <select
            className={inputCls}
            value={draft.investmentModel ?? "prestamo"}
            onChange={(e) => set("investmentModel", e.target.value as InvestmentModel)}
          >
            {(Object.keys(INVESTMENT_MODEL_LABEL) as InvestmentModel[]).map((m) => (
              <option key={m} value={m}>
                {INVESTMENT_MODEL_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Capital a captar">
            <NumberInput value={draft.targetCapital} onChange={(v) => set("targetCapital", v)} suffix="€" />
          </Field>
          <Field label="Rentabilidad ofrecida">
            <NumberInput value={draft.offeredYieldPct} onChange={(v) => set("offeredYieldPct", v)} suffix="%" />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Ticket mínimo">
            <NumberInput value={draft.minTicket} onChange={(v) => set("minTicket", v)} suffix="€" />
          </Field>
          <Field label="Ticket objetivo">
            <NumberInput value={draft.targetTicket} onChange={(v) => set("targetTicket", v)} suffix="€" />
          </Field>
          <Field label="Ticket máximo">
            <NumberInput value={draft.maxTicket} onChange={(v) => set("maxTicket", v)} suffix="€" />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Plazo">
            <NumberInput value={draft.termMonths} onChange={(v) => set("termMonths", v)} suffix="m" />
          </Field>
          <Field label="Inicio previsto">
            <input
              type="date"
              className={inputCls}
              value={draft.startDate ?? ""}
              onChange={(e) => set("startDate", e.target.value || null)}
            />
          </Field>
          <Field label="Devolución prevista">
            <input
              type="date"
              className={inputCls}
              value={draft.returnDate ?? ""}
              onChange={(e) => set("returnDate", e.target.value || null)}
            />
          </Field>
        </div>
      </section>

      {/* ── Garantías y condiciones ── */}
      <section className="re-card p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Garantías y condiciones</p>

        <Field label="Garantía">
          <input
            className={inputCls}
            value={draft.guarantee ?? ""}
            onChange={(e) => set("guarantee", e.target.value)}
            placeholder="Hipoteca sobre el inmueble"
          />
        </Field>
        <Field label="Rango de la garantía" hint="Por ejemplo: primera carga, segunda carga.">
          <input
            className={inputCls}
            value={draft.guaranteeRank ?? ""}
            onChange={(e) => set("guaranteeRank", e.target.value)}
          />
        </Field>
        <Field label="Cancelación anticipada">
          <input
            className={inputCls}
            value={draft.earlyCancellation ?? ""}
            onChange={(e) => set("earlyCancellation", e.target.value)}
          />
        </Field>
        <Field label="Otras condiciones">
          <textarea
            rows={3}
            className={inputCls}
            value={draft.conditions ?? ""}
            onChange={(e) => set("conditions", e.target.value)}
          />
        </Field>
      </section>

      {/* ── Solo para el promotor ── */}
      <section className="re-card p-4 space-y-3 border-l-4" style={{ borderLeftColor: "var(--warning)" }}>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Notas internas</p>
          <p className="text-[11px] text-ink-subtle mt-0.5">
            Solo tú. Este campo <b>nunca</b> se envía al inversor, sea cual sea la visibilidad.
          </p>
        </div>
        <textarea
          rows={3}
          className={inputCls}
          value={draft.internalNotes ?? ""}
          onChange={(e) => set("internalNotes", e.target.value)}
        />
      </section>
    </div>
  );
}

export default OfferForm;

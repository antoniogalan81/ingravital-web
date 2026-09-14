"use client";

// Edición de la PREVISIÓN en Gestión del proyecto:
//  · PlannedCostDialog — concepto de gasto: nombre libre, categoría, €/mes × meses + fijo.
//  · SaleUnitDialog    — ficha de venta de una unidad: estado, precios, fechas previstas y
//                        reales (terminación, venta, cobro) y cobros reales.
// Validan antes de guardar y nunca convierten un campo vacío en 0.

import { useState } from "react";
import { DEFAULT_COST_MONTHS, SALE_GROUP_LABEL, conceptPlannedAmount, withCollectedTotal, withPlannedTotal, type SaleGroupKey } from "@/src/lib/projectEconomics";
import {
  RE_EXPENSE_CATEGORIES,
  RE_SALE_STATUSES,
  RE_SALE_STATUS_LABEL,
  newTrackingId,
  type REExpense,
  type REExpenseCategory,
  type RESale,
  type RESalePayment,
  type RESaleStatus,
} from "@/src/lib/realEstateTracking";
import { parseAmountEs } from "@/src/lib/realFinances";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import { Dialog, FIELD_CLS, Field, PrimaryButton, SecondaryButton } from "../tracking/RealFinanceDialogs";

const numText = (v: number | undefined) => (v == null || !Number.isFinite(v) ? "" : v.toLocaleString("es-ES", { maximumFractionDigits: 2 }));
const parseOptional = (s: string): number | undefined | "invalid" => {
  if (!s.trim()) return undefined;
  const n = parseAmountEs(s);
  return n === undefined || n < 0 ? "invalid" : n;
};

// ── Concepto de gasto previsto ────────────────────────────────────────────────

/** Concepto nuevo: 18 meses por defecto (solo en los nuevos). */
export function makePlannedCost(category: REExpenseCategory = "OTROS"): REExpense {
  const now = new Date().toISOString();
  return { id: newTrackingId("exp"), category, concept: "", months: DEFAULT_COST_MONTHS, status: "PENDIENTE", createdAt: now, updatedAt: now };
}

export function PlannedCostDialog({
  initial,
  isNew,
  onSave,
  onClose,
}: {
  initial: REExpense;
  isNew: boolean;
  onSave: (item: REExpense, addAnother: boolean) => void;
  onClose: () => void;
}) {
  // Un concepto antiguo con solo "estimado" se muestra como pago fijo, sin inventar meses.
  const legacyOnly = initial.monthlyAmount == null && initial.fixedAmount == null && initial.estimated != null;
  const [f, setF] = useState({
    concept: initial.concept ?? "",
    category: initial.category ?? "OTROS",
    monthly: numText(initial.monthlyAmount),
    months: initial.months != null ? String(initial.months) : legacyOnly ? "" : String(DEFAULT_COST_MONTHS),
    fixed: numText(legacyOnly ? initial.estimated : initial.fixedAmount),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));

  const monthly = parseOptional(f.monthly);
  const fixed = parseOptional(f.fixed);
  const months = f.months.trim() ? Number(f.months) : undefined;
  const preview = conceptPlannedAmount({
    monthlyAmount: typeof monthly === "number" ? monthly : undefined,
    months: months != null && Number.isInteger(months) ? months : undefined,
    fixedAmount: typeof fixed === "number" ? fixed : undefined,
  });

  const save = (addAnother: boolean) => {
    const e: Record<string, string> = {};
    if (!f.concept.trim()) e.concept = "Escribe el nombre del gasto.";
    if (monthly === "invalid") e.monthly = "Importe no válido.";
    if (fixed === "invalid") e.fixed = "Importe no válido.";
    if (typeof monthly === "number" && (months == null || !Number.isInteger(months) || months < 1 || months > 600)) e.months = "Indica los meses (1-600).";
    if (monthly === undefined && fixed === undefined) e.monthly = "Indica un precio al mes, un importe fijo o ambos.";
    setErrors(e);
    if (Object.keys(e).length) return;
    const now = new Date().toISOString();
    const { estimated: _legacy, ...rest } = initial;
    const item = withPlannedTotal({
      ...rest,
      concept: f.concept.trim(),
      category: f.category as REExpenseCategory,
      ...(typeof monthly === "number" ? { monthlyAmount: monthly, months } : { monthlyAmount: undefined, months: undefined }),
      ...(typeof fixed === "number" ? { fixedAmount: fixed } : { fixedAmount: undefined }),
      updatedAt: now,
    } as REExpense);
    // Con "Guardar y añadir otro" el padre reabre el diálogo con una copia (id nuevo).
    onSave(item, addAnother);
  };

  return (
    <Dialog
      eyebrow="Gastos previstos"
      title={isNew ? "Añadir gasto" : "Editar gasto"}
      subtitle="Total previsto = precio al mes × meses + pago fijo."
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          {isNew ? <SecondaryButton onClick={() => save(true)}>Guardar y añadir otro</SecondaryButton> : null}
          <PrimaryButton onClick={() => save(false)}>Guardar</PrimaryButton>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Field label="Nombre" required error={errors.concept}>
          <input autoFocus className={FIELD_CLS} value={f.concept} onChange={(e) => set({ concept: e.target.value })} placeholder="Ej. Suministros, Luz, Vigilancia…" />
        </Field>
        <Field label="Categoría">
          <select className={FIELD_CLS} value={f.category} onChange={(e) => set({ category: e.target.value as REExpenseCategory })}>
            {RE_EXPENSE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-3 grid-cols-3">
        <Field label="€/mes" error={errors.monthly}>
          <input className={`${FIELD_CLS} tabular-nums`} inputMode="decimal" value={f.monthly} onChange={(e) => set({ monthly: e.target.value })} placeholder="105" />
        </Field>
        <Field label="Meses" error={errors.months}>
          <input className={`${FIELD_CLS} tabular-nums`} inputMode="numeric" value={f.months} onChange={(e) => set({ months: e.target.value.replace(/[^\d]/g, "") })} placeholder={String(DEFAULT_COST_MONTHS)} />
        </Field>
        <Field label="Fijo (pago único)" error={errors.fixed}>
          <input className={`${FIELD_CLS} tabular-nums`} inputMode="decimal" value={f.fixed} onChange={(e) => set({ fixed: e.target.value })} placeholder="Opcional" />
        </Field>
      </div>
      <p className="text-sm text-ink" aria-live="polite">
        Total previsto: <b className="tabular-nums">{fmtEUR(preview)}</b>
      </p>
    </Dialog>
  );
}

// ── Ficha de venta de una unidad ──────────────────────────────────────────────

export function makeSaleUnit(group: SaleGroupKey): RESale {
  const now = new Date().toISOString();
  return { id: newTrackingId("sale"), title: "", status: "DISPONIBLE", ...(group !== "OTROS" ? { unitType: group } : {}), createdAt: now, updatedAt: now };
}

type PaymentDraft = { id: string; date: string; amount: string };

export function SaleUnitDialog({
  initial,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  initial: RESale;
  isNew: boolean;
  onSave: (item: RESale) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    title: initial.title ?? "",
    unitType: (initial.unitType ?? "") as SaleGroupKey | "",
    status: initial.status,
    estimatedPrice: numText(initial.estimatedPrice),
    realPrice: numText(initial.realPrice),
    buyer: initial.buyer ?? "",
    completionDateEstimated: initial.completionDateEstimated ?? "",
    completionDateReal: initial.completionDateReal ?? "",
    saleDateEstimated: initial.saleDateEstimated ?? "",
    date: initial.date ?? "",
    collectionDateEstimated: initial.collectionDateEstimated ?? "",
    collectionAmountEstimated: numText(initial.collectionAmountEstimated),
  });
  const [payments, setPayments] = useState<PaymentDraft[]>(() => (initial.payments ?? []).map((p) => ({ id: p.id, date: p.date, amount: numText(p.amount) })));
  // Un cobrado antiguo sin detalle se conserva tal cual hasta que se registren cobros.
  const legacyCollected = !initial.payments?.length && initial.collected ? initial.collected : null;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));

  const save = () => {
    const e: Record<string, string> = {};
    if (!f.title.trim()) e.title = "Indica la unidad.";
    const est = parseOptional(f.estimatedPrice);
    const real = parseOptional(f.realPrice);
    const collAmount = parseOptional(f.collectionAmountEstimated);
    if (est === "invalid") e.estimatedPrice = "Importe no válido.";
    if (real === "invalid") e.realPrice = "Importe no válido.";
    if (collAmount === "invalid") e.collectionAmountEstimated = "Importe no válido.";
    const parsedPayments: RESalePayment[] = [];
    payments.forEach((p, i) => {
      if (!p.date && !p.amount.trim()) return;
      const amount = parseOptional(p.amount);
      if (!p.date || typeof amount !== "number") e[`payment${i}`] = "Cada cobro necesita fecha e importe.";
      else parsedPayments.push({ id: p.id, date: p.date, amount });
    });
    if (f.status === "VENDIDO" && !f.date) e.date = "Indica la fecha real de venta.";
    setErrors(e);
    if (Object.keys(e).length) return;

    const item: RESale = withCollectedTotal({
      ...initial,
      title: f.title.trim(),
      status: f.status,
      unitType: f.unitType && f.unitType !== "OTROS" ? f.unitType : undefined,
      estimatedPrice: typeof est === "number" ? est : undefined,
      realPrice: typeof real === "number" ? real : undefined,
      buyer: f.buyer.trim() || undefined,
      completionDateEstimated: f.completionDateEstimated || undefined,
      completionDateReal: f.completionDateReal || undefined,
      saleDateEstimated: f.saleDateEstimated || undefined,
      date: f.date || undefined,
      collectionDateEstimated: f.collectionDateEstimated || undefined,
      collectionAmountEstimated: typeof collAmount === "number" ? collAmount : undefined,
      payments: parsedPayments.length ? parsedPayments : undefined,
      // Si se quitaron todos los cobros detallados, no queda un total antiguo colgando.
      ...(!parsedPayments.length && initial.payments?.length ? { collected: undefined } : {}),
      updatedAt: new Date().toISOString(),
    });
    onSave(item);
  };

  const date = (key: keyof typeof f, label: string) => (
    <Field label={label} error={errors[key]}>
      <input type="date" className={FIELD_CLS} value={f[key] as string} onChange={(e) => set({ [key]: e.target.value } as Partial<typeof f>)} />
    </Field>
  );

  return (
    <Dialog
      eyebrow="Ventas"
      title={isNew ? "Añadir unidad" : "Editar unidad"}
      subtitle="Previsto y real de la unidad: terminación, venta y cobro."
      onClose={onClose}
      footer={
        <>
          {onDelete ? (
            <button type="button" onClick={onDelete} className="mr-auto rounded-lg px-3 py-2 text-sm font-semibold text-ink-subtle hover:text-[var(--negative)]">
              Eliminar
            </button>
          ) : null}
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={save}>Guardar</PrimaryButton>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem]">
        <Field label="Unidad" required error={errors.title}>
          <input autoFocus className={FIELD_CLS} value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ej. Vivienda 1ºA" />
        </Field>
        <Field label="Tipo">
          <select className={FIELD_CLS} value={f.unitType} onChange={(e) => set({ unitType: e.target.value as SaleGroupKey | "" })}>
            <option value="">Según la unidad</option>
            {(["VIVIENDA", "GARAJE", "TRASTERO"] as const).map((k) => (
              <option key={k} value={k}>{SALE_GROUP_LABEL[k]}</option>
            ))}
          </select>
        </Field>
        <Field label="Estado">
          <select className={FIELD_CLS} value={f.status} onChange={(e) => set({ status: e.target.value as RESaleStatus })}>
            {RE_SALE_STATUSES.map((s) => (
              <option key={s} value={s}>{RE_SALE_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="rounded-xl border border-line p-3 space-y-3">
        <legend className="px-1 text-[10px] font-bold uppercase tracking-wide text-ink-subtle">Previsto</legend>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
          {date("completionDateEstimated", "Terminación")}
          {date("saleDateEstimated", "Venta")}
          {date("collectionDateEstimated", "Cobro")}
          <Field label="Precio previsto" error={errors.estimatedPrice} hint="Vacío: el del simulador">
            <input className={`${FIELD_CLS} tabular-nums`} inputMode="decimal" value={f.estimatedPrice} onChange={(e) => set({ estimatedPrice: e.target.value })} />
          </Field>
          <Field label="Cobro previsto" error={errors.collectionAmountEstimated} hint="Vacío: el precio">
            <input className={`${FIELD_CLS} tabular-nums`} inputMode="decimal" value={f.collectionAmountEstimated} onChange={(e) => set({ collectionAmountEstimated: e.target.value })} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-line p-3 space-y-3">
        <legend className="px-1 text-[10px] font-bold uppercase tracking-wide text-ink-subtle">Real</legend>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
          {date("completionDateReal", "Terminación")}
          {date("date", "Venta")}
          <Field label="Precio de venta" error={errors.realPrice}>
            <input className={`${FIELD_CLS} tabular-nums`} inputMode="decimal" value={f.realPrice} onChange={(e) => set({ realPrice: e.target.value })} />
          </Field>
        </div>
        <Field label="Comprador">
          <input className={FIELD_CLS} value={f.buyer} onChange={(e) => set({ buyer: e.target.value })} />
        </Field>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-subtle">Cobros</p>
          {legacyCollected != null && !payments.length ? (
            <p className="text-[11px] text-ink-muted">Cobrado registrado sin detalle: {fmtEUR(legacyCollected)}. Al añadir cobros, el total pasa a ser su suma.</p>
          ) : null}
          {payments.map((p, i) => (
            <div key={p.id} className="flex items-start gap-2">
              <input type="date" aria-label={`Fecha del cobro ${i + 1}`} className={FIELD_CLS} value={p.date} onChange={(e) => setPayments((ps) => ps.map((x) => (x.id === p.id ? { ...x, date: e.target.value } : x)))} />
              <input aria-label={`Importe del cobro ${i + 1}`} className={`${FIELD_CLS} tabular-nums`} inputMode="decimal" value={p.amount} placeholder="Importe" onChange={(e) => setPayments((ps) => ps.map((x) => (x.id === p.id ? { ...x, amount: e.target.value } : x)))} />
              <button type="button" onClick={() => setPayments((ps) => ps.filter((x) => x.id !== p.id))} className="rounded-lg px-2 py-2 text-xs font-semibold text-ink-subtle hover:text-[var(--negative)]" aria-label={`Quitar cobro ${i + 1}`}>
                Quitar
              </button>
            </div>
          ))}
          {Object.entries(errors).filter(([k]) => k.startsWith("payment")).slice(0, 1).map(([k, v]) => (
            <p key={k} className="text-[11px] text-[var(--negative)]">{v}</p>
          ))}
          <button type="button" onClick={() => setPayments((ps) => [...ps, { id: newTrackingId("pay"), date: "", amount: "" }])} className="text-xs font-semibold text-brand hover:underline">
            + Añadir cobro
          </button>
        </div>
      </fieldset>
    </Dialog>
  );
}

"use client";

// Edición de la PREVISIÓN en Gestión del proyecto:
//  · PlannedCostDialog — concepto de gasto: nombre libre, categoría, €/mes × meses + fijo.
// (La ficha de cada unidad es `UnitEditorDialog`.)
// Validan antes de guardar y nunca convierten un campo vacío en 0.

import { useState } from "react";
import { DEFAULT_COST_MONTHS, conceptPlannedAmount, withPlannedTotal } from "@/src/lib/projectEconomics";
import { RE_EXPENSE_CATEGORIES, newTrackingId, type REExpense, type REExpenseCategory } from "@/src/lib/realEstateTracking";
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
      eyebrow="Costes previstos"
      title={isNew ? "Añadir coste previsto" : "Editar coste previsto"}
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

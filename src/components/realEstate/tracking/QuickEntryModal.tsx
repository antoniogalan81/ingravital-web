"use client";

// Entrada rápida de GASTO / VENTA / HITO. Formulario compacto con TODOS los campos
// del modelo, autofoco, "Guardar" y "Guardar y añadir otro", y validación real.
// NO duplica el modelo: usa las mismas fábricas (makeExpense/makeSale/makeMilestone)
// y escribe en los MISMOS arrays de la operación mediante los callbacks onSave*.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RE_EXPENSE_CATEGORIES,
  RE_EXPENSE_STATUS_LABEL,
  RE_SALE_STATUS_LABEL,
  RE_SALE_STATUSES,
  RE_MILESTONE_STATUS_LABEL,
  RE_MILESTONE_STATUSES,
  makeExpense,
  makeSale,
  makeMilestone,
  type REExpense,
  type REExpenseCategory,
  type REExpenseStatus,
  type RESale,
  type RESaleStatus,
  type REMilestone,
  type REMilestoneStatus,
} from "@/src/lib/realEstateTracking";

export type QuickKind = "gasto" | "venta" | "hito";

const TITLES: Record<QuickKind, { title: string; subtitle: string; requiredLabel: string }> = {
  gasto: { title: "Gasto rápido", subtitle: "Registra un gasto sin abrir la tabla completa.", requiredLabel: "Indica el concepto del gasto." },
  venta: { title: "Venta rápida", subtitle: "Añade una unidad o activo y su estado comercial.", requiredLabel: "Indica la unidad o activo." },
  hito: { title: "Hito rápido", subtitle: "Planifica un hito y sus fechas.", requiredLabel: "Indica el nombre del hito." },
};

function makeByKind(kind: QuickKind): REExpense | RESale | REMilestone {
  if (kind === "gasto") return makeExpense();
  if (kind === "venta") return makeSale();
  return makeMilestone();
}

/** Parseo numérico tolerante: vacío → undefined, no numérico → undefined. */
function toNum(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export function QuickEntryModal({
  kind,
  onSaveExpense,
  onSaveSale,
  onSaveMilestone,
  onClose,
}: {
  kind: QuickKind;
  onSaveExpense: (e: REExpense) => void;
  onSaveSale: (s: RESale) => void;
  onSaveMilestone: (m: REMilestone) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<REExpense | RESale | REMilestone>(() => makeByKind(kind));
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const meta = TITLES[kind];

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // El campo obligatorio es el "nombre" de la fila (concept / title / title).
  const requiredValue = kind === "gasto" ? (draft as REExpense).concept : (draft as RESale | REMilestone).title;

  const commit = useCallback(
    (addAnother: boolean) => {
      if (!requiredValue || !requiredValue.trim()) {
        setError(meta.requiredLabel);
        firstFieldRef.current?.focus();
        return;
      }
      const stamped = { ...draft, updatedAt: new Date().toISOString() };
      if (kind === "gasto") onSaveExpense(stamped as REExpense);
      else if (kind === "venta") onSaveSale(stamped as RESale);
      else onSaveMilestone(stamped as REMilestone);

      if (addAnother) {
        setDraft(makeByKind(kind));
        setError(null);
        setSavedCount((c) => c + 1);
        firstFieldRef.current?.focus();
      } else {
        onClose();
      }
    },
    [draft, kind, meta.requiredLabel, onClose, onSaveExpense, onSaveMilestone, onSaveSale, requiredValue],
  );

  const patch = (p: Partial<REExpense> | Partial<RESale> | Partial<REMilestone>) => {
    setDraft((d) => ({ ...d, ...p }) as REExpense | RESale | REMilestone);
    if (error) setError(null);
  };

  // Enter en un input de una línea → Guardar (salvo textarea).
  const onFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      commit(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-full bg-white shadow-2xl flex flex-col overflow-hidden sm:mt-16 sm:rounded-2xl in-reveal">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 flex-shrink-0">
          <div>
            <h2 className="text-base font-extrabold text-ink tracking-tight">{meta.title}</h2>
            <p className="text-xs text-ink-subtle mt-0.5">{meta.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <form className="overflow-y-auto px-5 py-4 space-y-3" onKeyDown={onFormKeyDown} onSubmit={(e) => e.preventDefault()}>
          {kind === "gasto" ? <GastoFields draft={draft as REExpense} patch={patch} firstRef={firstFieldRef} error={error} /> : null}
          {kind === "venta" ? <VentaFields draft={draft as RESale} patch={patch} firstRef={firstFieldRef} error={error} /> : null}
          {kind === "hito" ? <HitoFields draft={draft as REMilestone} patch={patch} firstRef={firstFieldRef} error={error} /> : null}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5 flex-shrink-0 bg-[var(--surface-alt)]">
          <span className="text-xs text-ink-subtle">
            {savedCount > 0 ? `${savedCount} guardado(s) en esta sesión` : "Enter para guardar"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => commit(true)}
              className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-ink hover:bg-white transition-colors"
            >
              Guardar y añadir otro
            </button>
            <button
              type="button"
              onClick={() => commit(false)}
              className="rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition-colors"
              style={{ background: "var(--brand)" }}
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Campos por tipo ──────────────────────────────────────────────────────────

function GastoFields({ draft, patch, firstRef, error }: FieldsProps<REExpense>) {
  return (
    <>
      <Text label="Concepto" required value={draft.concept} onChange={(v) => patch({ concept: v })} inputRef={firstRef} error={error} placeholder="Ej. Licencia de obra" />
      <div className="grid grid-cols-2 gap-3">
        <Select<REExpenseCategory>
          label="Categoría"
          value={draft.category}
          options={RE_EXPENSE_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
          onChange={(v) => patch({ category: v })}
        />
        <Select<REExpenseStatus>
          label="Estado"
          value={draft.status}
          options={(Object.keys(RE_EXPENSE_STATUS_LABEL) as REExpenseStatus[]).map((k) => ({ value: k, label: RE_EXPENSE_STATUS_LABEL[k] }))}
          onChange={(v) => patch({ status: v })}
        />
      </div>
      <Text label="Proveedor" value={draft.provider} onChange={(v) => patch({ provider: v || undefined })} placeholder="—" />
      <div className="grid grid-cols-3 gap-3">
        <Num label="Estimado (€)" value={draft.estimated} onChange={(v) => patch({ estimated: v })} />
        <Num label="Real (€)" value={draft.real} onChange={(v) => patch({ real: v })} />
        <Num label="Pagado (€)" value={draft.paid} onChange={(v) => patch({ paid: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <DateField label="Fecha" value={draft.date} onChange={(v) => patch({ date: v })} />
        <Text label="Factura (enlace/nombre)" value={draft.invoiceName ?? draft.invoiceUri} onChange={(v) => patch({ invoiceName: v || undefined, invoiceUri: /^https?:\/\//i.test(v) ? v : draft.invoiceUri })} placeholder="—" />
      </div>
      <Area label="Notas" value={draft.notes} onChange={(v) => patch({ notes: v || undefined })} />
    </>
  );
}

function VentaFields({ draft, patch, firstRef, error }: FieldsProps<RESale>) {
  return (
    <>
      <Text label="Unidad / activo" required value={draft.title} onChange={(v) => patch({ title: v })} inputRef={firstRef} error={error} placeholder="Ej. Vivienda 1ºA" />
      <div className="grid grid-cols-2 gap-3">
        <Select<RESaleStatus>
          label="Estado"
          value={draft.status}
          options={RE_SALE_STATUSES.map((s) => ({ value: s, label: RE_SALE_STATUS_LABEL[s] }))}
          onChange={(v) => patch({ status: v })}
        />
        <Text label="Comprador" value={draft.buyer} onChange={(v) => patch({ buyer: v || undefined })} placeholder="—" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Num label="Precio est. (€)" value={draft.estimatedPrice} onChange={(v) => patch({ estimatedPrice: v })} />
        <Num label="Precio real (€)" value={draft.realPrice} onChange={(v) => patch({ realPrice: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Num label="Señal (€)" value={draft.deposit} onChange={(v) => patch({ deposit: v })} />
        <Num label="Cobrado (€)" value={draft.collected} onChange={(v) => patch({ collected: v })} />
      </div>
      <DateField label="Fecha" value={draft.date} onChange={(v) => patch({ date: v })} />
      <Area label="Notas" value={draft.notes} onChange={(v) => patch({ notes: v || undefined })} />
    </>
  );
}

function HitoFields({ draft, patch, firstRef, error }: FieldsProps<REMilestone>) {
  return (
    <>
      <Text label="Hito" required value={draft.title} onChange={(v) => patch({ title: v })} inputRef={firstRef} error={error} placeholder="Ej. Inicio de obra" />
      <div className="grid grid-cols-2 gap-3">
        <Select<REMilestoneStatus>
          label="Estado"
          value={draft.status}
          options={RE_MILESTONE_STATUSES.map((s) => ({ value: s, label: RE_MILESTONE_STATUS_LABEL[s] }))}
          onChange={(v) => patch({ status: v })}
        />
        <Num label="Pago pendiente (€)" value={draft.amountPending} onChange={(v) => patch({ amountPending: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <DateField label="Fecha prevista" value={draft.dueDate} onChange={(v) => patch({ dueDate: v })} />
        <DateField label="Fecha real" value={draft.realDate} onChange={(v) => patch({ realDate: v })} />
      </div>
      <Area label="Nota" value={draft.note} onChange={(v) => patch({ note: v || undefined })} />
    </>
  );
}

type FieldsProps<T> = {
  draft: T;
  patch: (p: Partial<REExpense> | Partial<RESale> | Partial<REMilestone>) => void;
  firstRef: React.RefObject<HTMLInputElement | null>;
  error: string | null;
};

// ── Inputs de formulario (presentacionales) ──────────────────────────────────

const FIELD_CLS =
  "w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400";

function Label({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-ink-subtle">
        {label}{required ? <span className="text-[var(--negative)]"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

function Text({
  label, value, onChange, placeholder, required, inputRef, error,
}: {
  label: string; value?: string; onChange: (v: string) => void; placeholder?: string; required?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>; error?: string | null;
}) {
  return (
    <Label label={label} required={required}>
      <input
        ref={inputRef}
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={FIELD_CLS}
        style={required && error ? { borderColor: "var(--negative)" } : undefined}
      />
      {required && error ? <span className="text-[11px] text-[var(--negative)]">{error}</span> : null}
    </Label>
  );
}

function Num({ label, value, onChange }: { label: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <Label label={label}>
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        onChange={(e) => onChange(toNum(e.target.value))}
        className={`${FIELD_CLS} tabular-nums`}
      />
    </Label>
  );
}

function DateField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <Label label={label}>
      <input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} className={FIELD_CLS} />
    </Label>
  );
}

function Select<T extends string>({
  label, value, options, onChange,
}: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <Label label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className={`${FIELD_CLS} cursor-pointer`}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Label>
  );
}

function Area({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <Label label={label}>
      <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={2} className={`${FIELD_CLS} resize-none`} />
    </Label>
  );
}

export default QuickEntryModal;

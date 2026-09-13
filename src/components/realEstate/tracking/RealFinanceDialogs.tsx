"use client";

// Formularios de FINANZAS REALES: gasto real y préstamo real (alta y edición).
// Lo mínimo a la vista; lo opcional se despliega. Validan antes de guardar y nunca
// convierten un campo vacío en 0.

import { useEffect, useRef, useState } from "react";
import {
  RE_EXPENSE_CATEGORIES,
  RE_EXPENSE_CATEGORY_LABEL,
  RE_LOAN_PERIODICITY_LABEL,
  RE_LOAN_RATE_TYPE_LABEL,
  RE_LOAN_STATUS_LABEL,
  type REExpense,
  type REExpenseCategory,
  type RELoanPeriodicity,
  type RELoanRateType,
  type RELoanStatus,
  type RERealExpense,
  type RERealLoan,
} from "@/src/lib/realEstateTracking";
import { driveFileUrl, parseAmountEs } from "@/src/lib/realFinances";

const FIELD_CLS =
  "w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400";

const numText = (v: number | undefined) =>
  v == null || !Number.isFinite(v) ? "" : v.toLocaleString("es-ES", { maximumFractionDigits: 2 });

// ── Carcasa común ─────────────────────────────────────────────────────────────

function Dialog({
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center" role="dialog" aria-modal="true" aria-labelledby="rf-dialog-title">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-full bg-white shadow-2xl flex flex-col overflow-hidden sm:mt-16 sm:rounded-2xl in-reveal">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 flex-shrink-0">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-ink-subtle">Finanzas reales</p>
            <h2 id="rf-dialog-title" className="text-base font-extrabold text-ink tracking-tight">{title}</h2>
            <p className="text-xs text-ink-subtle mt-0.5">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form className="overflow-y-auto px-5 py-4 space-y-3" onSubmit={(e) => e.preventDefault()}>
          {children}
        </form>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5 flex-shrink-0 bg-[var(--surface-alt)]">{footer}</div>
      </div>
    </div>
  );
}

function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: React.ReactNode; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-xs font-semibold text-ink-subtle">
        {label}
        {required ? <span className="text-[var(--negative)]"> *</span> : null}
      </span>
      {children}
      {error ? <span className="text-[11px] text-[var(--negative)]">{error}</span> : hint ? <span className="text-[11px] text-ink-subtle">{hint}</span> : null}
    </label>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition-colors" style={{ background: "var(--brand)" }}>
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-ink hover:bg-white transition-colors">
      {children}
    </button>
  );
}

function Disclosure({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className="text-xs font-semibold text-brand hover:underline">
      {open ? "− " : "+ "}
      {label}
    </button>
  );
}

// ── Gasto real ────────────────────────────────────────────────────────────────

type ExpenseForm = {
  concept: string;
  amount: string;
  date: string;
  category: REExpenseCategory | "";
  budgetLineId: string;
  documentName: string;
  documentUrl: string;
  notes: string;
};

const expenseForm = (e: RERealExpense): ExpenseForm => ({
  concept: e.concept,
  amount: e.amount ? numText(e.amount) : "",
  date: e.date,
  category: e.category ?? "",
  budgetLineId: e.budgetLineId ?? "",
  documentName: e.documentName ?? "",
  documentUrl: e.documentUrl ?? "",
  notes: e.notes ?? "",
});

export function RealExpenseDialog({
  initial,
  isNew,
  folderUrl,
  budgetLines = [],
  onSave,
  onClose,
}: {
  initial: RERealExpense;
  isNew: boolean;
  folderUrl?: string;
  /** Partidas de Económico a las que se puede imputar el gasto (alimentan su columna Real). */
  budgetLines?: REExpense[];
  onSave: (e: RERealExpense, addAnother: boolean) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<ExpenseForm>(() => expenseForm(initial));
  const [errors, setErrors] = useState<Partial<Record<keyof ExpenseForm, string>>>({});
  const [showNotes, setShowNotes] = useState(!!initial.notes);
  const conceptRef = useRef<HTMLInputElement>(null);

  useEffect(() => conceptRef.current?.focus(), []);

  const set = (patch: Partial<ExpenseForm>) => {
    setF((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(patch) as (keyof ExpenseForm)[]) delete next[k];
      return next;
    });
  };

  const submit = (addAnother: boolean) => {
    const amount = parseAmountEs(f.amount);
    const url = f.documentUrl.trim() ? driveFileUrl(f.documentUrl) : undefined;
    const errs: typeof errors = {};
    if (!f.concept.trim()) errs.concept = "Indica el concepto.";
    if (amount == null || amount <= 0) errs.amount = "Indica un importe mayor que 0.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) errs.date = "Indica la fecha.";
    if (url === null) errs.documentUrl = "No parece un enlace a un archivo de Google Drive.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    const saved: RERealExpense = {
      id: initial.id,
      createdAt: initial.createdAt,
      updatedAt: new Date().toISOString(),
      concept: f.concept.trim(),
      amount: amount as number,
      date: f.date,
      ...(f.category ? { category: f.category } : {}),
      ...(f.budgetLineId ? { budgetLineId: f.budgetLineId } : {}),
      ...(f.documentName.trim() ? { documentName: f.documentName.trim() } : {}),
      ...(url ? { documentUrl: url } : {}),
      ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
    };
    // Con "añadir otro", el panel remonta el diálogo con un gasto nuevo (misma fecha).
    onSave(saved, addAnother);
  };

  return (
    <Dialog
      title={isNew ? "Registrar gasto real" : "Editar gasto real"}
      subtitle="Dinero realmente gastado en la operación. La factura es opcional."
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          {isNew ? <SecondaryButton onClick={() => submit(true)}>Guardar y añadir otro</SecondaryButton> : null}
          <PrimaryButton onClick={() => submit(false)}>Guardar</PrimaryButton>
        </>
      }
    >
      <Field label="Concepto" required error={errors.concept}>
        <input ref={conceptRef} className={FIELD_CLS} value={f.concept} onChange={(e) => set({ concept: e.target.value })} placeholder="Ej. Fontanería vivienda 2" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Importe (€)" required error={errors.amount}>
          <input className={`${FIELD_CLS} tabular-nums`} inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="4.850" />
        </Field>
        <Field label="Fecha" required error={errors.date}>
          <input type="date" className={FIELD_CLS} value={f.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
      </div>
      <Field label="Categoría">
        <select className={`${FIELD_CLS} cursor-pointer`} value={f.category} onChange={(e) => set({ category: e.target.value as REExpenseCategory | "" })}>
          <option value="">Sin categoría</option>
          {RE_EXPENSE_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </Field>
      {budgetLines.length > 0 || f.budgetLineId ? (
        <Field label="Partida de Económico" hint="Su columna Real suma los gastos reales vinculados a cada partida.">
          <select className={`${FIELD_CLS} cursor-pointer`} value={f.budgetLineId} onChange={(e) => set({ budgetLineId: e.target.value })}>
            <option value="">Sin partida</option>
            {budgetLines.map((l) => (
              <option key={l.id} value={l.id}>{l.concept?.trim() || RE_EXPENSE_CATEGORY_LABEL[l.category]}</option>
            ))}
            {f.budgetLineId && !budgetLines.some((l) => l.id === f.budgetLineId) ? <option value={f.budgetLineId}>Partida eliminada</option> : null}
          </select>
        </Field>
      ) : null}

      <fieldset className="rounded-xl border border-line p-3 space-y-3">
        <legend className="px-1 text-xs font-bold text-ink">Factura o documento <span className="font-normal text-ink-subtle">(opcional)</span></legend>
        <Field label="Nombre del documento">
          <input className={FIELD_CLS} value={f.documentName} onChange={(e) => set({ documentName: e.target.value })} placeholder="Factura Fontanería junio.pdf" />
        </Field>
        <Field
          label="Enlace al archivo en Google Drive"
          error={errors.documentUrl}
          hint={
            <>
              En Drive: botón derecho sobre el archivo → Compartir → Copiar enlace.
              {folderUrl ? (
                <>
                  {" "}
                  <a href={folderUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">Abrir carpeta de facturas ↗</a>
                </>
              ) : null}
            </>
          }
        >
          <input className={FIELD_CLS} inputMode="url" value={f.documentUrl} onChange={(e) => set({ documentUrl: e.target.value })} placeholder="https://drive.google.com/file/d/…" />
        </Field>
      </fieldset>

      {showNotes ? (
        <Field label="Observaciones">
          <textarea className={`${FIELD_CLS} resize-none`} rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      ) : (
        <Disclosure open={false} onToggle={() => setShowNotes(true)} label="Añadir observaciones" />
      )}
    </Dialog>
  );
}

// ── Préstamo real ─────────────────────────────────────────────────────────────

type LoanForm = {
  name: string;
  principal: string;
  interestRate: string;
  installment: string;
  periodicity: RELoanPeriodicity;
  rateType: RELoanRateType | "";
  startDate: string;
  termMonths: string;
  outstanding: string;
  status: RELoanStatus;
  notes: string;
};

const loanForm = (l: RERealLoan): LoanForm => ({
  name: l.name,
  principal: l.principal ? numText(l.principal) : "",
  interestRate: numText(l.interestRate),
  installment: numText(l.installment),
  periodicity: l.periodicity ?? "MENSUAL",
  rateType: l.rateType ?? "",
  startDate: l.startDate ?? "",
  termMonths: l.termMonths != null ? String(l.termMonths) : "",
  outstanding: numText(l.outstanding),
  status: l.status,
  notes: l.notes ?? "",
});

export function RealLoanDialog({
  initial,
  isNew,
  onSave,
  onClose,
}: {
  initial: RERealLoan;
  isNew: boolean;
  onSave: (l: RERealLoan) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<LoanForm>(() => loanForm(initial));
  const [errors, setErrors] = useState<Partial<Record<keyof LoanForm, string>>>({});
  const [more, setMore] = useState(
    !isNew && !!(initial.rateType || initial.startDate || initial.termMonths != null || initial.outstanding != null || initial.notes || initial.status !== "ACTIVO"),
  );
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => nameRef.current?.focus(), []);

  const set = (patch: Partial<LoanForm>) => {
    setF((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(patch) as (keyof LoanForm)[]) delete next[k];
      return next;
    });
  };

  const submit = () => {
    const errs: typeof errors = {};
    // Opcional: vacío → undefined; escrito pero ilegible → error (no se descarta en silencio).
    const opt = (key: keyof LoanForm, raw: string, ok: (n: number) => boolean, msg: string) => {
      if (!raw.trim()) return undefined;
      const n = parseAmountEs(raw);
      if (n == null || !ok(n)) {
        errs[key] = msg;
        return undefined;
      }
      return n;
    };
    const principal = parseAmountEs(f.principal);
    if (!f.name.trim()) errs.name = "Indica la entidad o el concepto.";
    if (principal == null || principal <= 0) errs.principal = "Indica un capital mayor que 0.";
    const interestRate = opt("interestRate", f.interestRate, (n) => n >= 0 && n <= 100, "Entre 0 y 100.");
    const installment = opt("installment", f.installment, (n) => n > 0, "Mayor que 0.");
    const termMonths = opt("termMonths", f.termMonths, (n) => Number.isInteger(n) && n > 0, "Número entero de meses.");
    const outstanding = opt("outstanding", f.outstanding, (n) => n >= 0, "No puede ser negativo.");
    if (f.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(f.startDate)) errs.startDate = "Fecha no válida.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      if (errs.termMonths || errs.outstanding || errs.startDate) setMore(true);
      return;
    }
    onSave({
      id: initial.id,
      createdAt: initial.createdAt,
      updatedAt: new Date().toISOString(),
      name: f.name.trim(),
      principal: principal as number,
      status: f.status,
      ...(interestRate != null ? { interestRate } : {}),
      ...(installment != null ? { installment, periodicity: f.periodicity } : {}),
      ...(f.rateType ? { rateType: f.rateType } : {}),
      ...(f.startDate ? { startDate: f.startDate } : {}),
      ...(termMonths != null ? { termMonths } : {}),
      ...(outstanding != null ? { outstanding } : {}),
      ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
    });
  };

  return (
    <Dialog
      title={isNew ? "Añadir préstamo o financiación" : "Editar préstamo"}
      subtitle="Financiación realmente contratada para esta operación."
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={submit}>Guardar</PrimaryButton>
        </>
      }
    >
      <Field label="Entidad o concepto" required error={errors.name}>
        <input ref={nameRef} className={FIELD_CLS} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej. Préstamo promotor Banco X" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Capital inicial (€)" required error={errors.principal}>
          <input className={`${FIELD_CLS} tabular-nums`} inputMode="decimal" value={f.principal} onChange={(e) => set({ principal: e.target.value })} placeholder="200.000" />
        </Field>
        <Field label="Tipo de interés (%)" error={errors.interestRate}>
          <input className={`${FIELD_CLS} tabular-nums`} inputMode="decimal" value={f.interestRate} onChange={(e) => set({ interestRate: e.target.value })} placeholder="3,5" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cuota (€)" error={errors.installment}>
          <input className={`${FIELD_CLS} tabular-nums`} inputMode="decimal" value={f.installment} onChange={(e) => set({ installment: e.target.value })} />
        </Field>
        <Field label="Periodicidad de la cuota">
          <select className={`${FIELD_CLS} cursor-pointer`} value={f.periodicity} onChange={(e) => set({ periodicity: e.target.value as RELoanPeriodicity })}>
            {(Object.keys(RE_LOAN_PERIODICITY_LABEL) as RELoanPeriodicity[]).map((k) => (
              <option key={k} value={k}>{RE_LOAN_PERIODICITY_LABEL[k]}</option>
            ))}
          </select>
        </Field>
      </div>

      <Disclosure open={more} onToggle={() => setMore((m) => !m)} label="Más detalles (tipo, plazo, capital pendiente, estado)" />
      {more ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select className={`${FIELD_CLS} cursor-pointer`} value={f.rateType} onChange={(e) => set({ rateType: e.target.value as RELoanRateType | "" })}>
                <option value="">—</option>
                {(Object.keys(RE_LOAN_RATE_TYPE_LABEL) as RELoanRateType[]).map((k) => (
                  <option key={k} value={k}>{RE_LOAN_RATE_TYPE_LABEL[k]}</option>
                ))}
              </select>
            </Field>
            <Field label="Estado">
              <select className={`${FIELD_CLS} cursor-pointer`} value={f.status} onChange={(e) => set({ status: e.target.value as RELoanStatus })}>
                {(Object.keys(RE_LOAN_STATUS_LABEL) as RELoanStatus[]).map((k) => (
                  <option key={k} value={k}>{RE_LOAN_STATUS_LABEL[k]}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha de inicio" error={errors.startDate}>
              <input type="date" className={FIELD_CLS} value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
            </Field>
            <Field label="Plazo (meses)" error={errors.termMonths}>
              <input className={`${FIELD_CLS} tabular-nums`} inputMode="numeric" value={f.termMonths} onChange={(e) => set({ termMonths: e.target.value })} placeholder="240" />
            </Field>
          </div>
          <Field label="Capital pendiente (€)" error={errors.outstanding} hint="El que figure en tu último recibo o extracto. Invergravital no lo calcula.">
            <input className={`${FIELD_CLS} tabular-nums`} inputMode="decimal" value={f.outstanding} onChange={(e) => set({ outstanding: e.target.value })} />
          </Field>
          <Field label="Observaciones">
            <textarea className={`${FIELD_CLS} resize-none`} rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
      ) : null}
    </Dialog>
  );
}

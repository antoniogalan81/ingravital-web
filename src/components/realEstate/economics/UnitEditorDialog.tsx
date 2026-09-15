"use client";

// FICHA DE UNIDAD (igual que la APP): la MISMA para una unidad o para varias seleccionadas.
// Nombre (solo en una) · Estado · Previsión (terminación, venta) · Valores (precio de venta,
// renta mensual) · Señal (importe, fecha) · Cierre (Vendido: precio y fecha de venta; Alquilado:
// renta y fecha de alquiler). Solo se aplica lo que se toca; con valores distintos se muestra
// «Valores diferentes». La validación y el parche salen de `buildUnitPatch` (compartido con la APP).
// `closing`: versión reducida que aparece al elegir Vendido o Alquilado en la tabla.

import { useMemo, useState, type ReactNode } from "react";
import { RE_SALE_STATUS_LABEL, RE_SALE_STATUSES, type RESaleStatus } from "@/src/lib/realEstateTracking";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import { buildUnitPatch, commonUnitValue, parseEsAmount, type UnitDraft, type UnitField, type UnitPatch, type UnitRow } from "@/src/lib/unitEditing";
import { CalendarOverlay, DateInput } from "@/src/components/ui/InlineEdit";
import { Dialog, FIELD_CLS, PrimaryButton, SecondaryButton } from "../tracking/RealFinanceDialogs";

/** Desde cuántas unidades se confirma antes de aplicar. */
const CONFIRM_FROM = 10;
const DIFFERENT = "Valores diferentes";
const FIELDS: UnitField[] = ["title", "status", "completionDateEstimated", "saleDateEstimated", "price", "rent", "deposit", "depositDate", "saleDate", "rentDate"];
const AMOUNTS: UnitField[] = ["price", "rent", "deposit"];
const LABEL: Record<UnitField, string> = {
  title: "Nombre",
  status: "Estado",
  completionDateEstimated: "Terminación prevista",
  saleDateEstimated: "Venta prevista",
  price: "Precio de venta",
  rent: "Renta mensual",
  deposit: "Importe de la señal",
  depositDate: "Fecha de la señal",
  saleDate: "Fecha de venta",
  rentDate: "Fecha de alquiler",
};
const amountText = (v: unknown) => (typeof v === "number" ? String(v).replace(".", ",") : "");

function Row({ head, error, hint, children }: { head: ReactNode; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="text-xs font-semibold text-ink-subtle">{head}</div>
      {children}
      {error ? <span className="text-[11px] font-semibold text-[var(--negative)]">{error}</span> : hint ? <span className="text-[11px] text-ink-subtle">{hint}</span> : null}
    </div>
  );
}

export function UnitEditorDialog({ rows, presetStatus, closing = false, onClose, onApply, onRemove }: { rows: UnitRow[]; presetStatus?: RESaleStatus; closing?: boolean; onClose: () => void; onApply: (patch: UnitPatch) => void; onRemove?: () => void }) {
  const many = rows.length > 1;
  const common = useMemo(() => Object.fromEntries(FIELDS.map((f) => [f, commonUnitValue(rows, f)])) as Record<UnitField, ReturnType<typeof commonUnitValue>>, [rows]);
  const initial = (f: UnitField): string | null => {
    const c = common[f];
    if (f === "title") return many ? "" : rows[0].title;
    if (c.mixed) return AMOUNTS.includes(f) ? "" : null;
    return AMOUNTS.includes(f) ? amountText(c.value) : (c.value as string | null);
  };
  const [draft, setDraft] = useState<UnitDraft>(() => (presetStatus ? { status: presetStatus } : {}));
  const [errors, setErrors] = useState<Partial<Record<UnitField, string>>>({});
  const [confirming, setConfirming] = useState(false);
  const [askDepositDate, setAskDepositDate] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  const shown = (f: UnitField) => (f in draft ? draft[f] ?? null : initial(f));
  // Lo tocado de verdad: lo que difiere de lo que ya se veía.
  const touched = Object.fromEntries(Object.entries(draft).filter(([f, v]) => (v ?? "") !== (initial(f as UnitField) ?? ""))) as UnitDraft;
  const changed = Object.keys(touched) as UnitField[];
  const set = (f: UnitField, v: string | null) => {
    setDraft((d) => ({ ...d, [f]: v }));
    setErrors((e) => ({ ...e, [f]: undefined }));
    setConfirming(false);
  };
  const reset = (f: UnitField) => setDraft(({ [f]: _drop, ...rest }) => rest);
  const status = shown("status") as RESaleStatus | null;

  const apply = () => {
    const form = buildUnitPatch(rows, touched);
    if (!form.ok) return setErrors(form.errors);
    if (!Object.keys(form.patch).length) return onClose();
    if (rows.length >= CONFIRM_FROM && !confirming) return setConfirming(true);
    onApply(form.patch);
  };

  const head = (f: UnitField) => (
    <span className="flex items-center justify-between gap-2">
      <span className={f in touched ? "text-brand" : undefined}>{LABEL[f]}{many && f in touched ? " · se aplicará" : ""}</span>
      {many && f in touched ? <button type="button" onClick={() => reset(f)} className="text-[11px] font-semibold text-ink-subtle underline">No cambiar</button> : null}
    </span>
  );
  const amount = (f: "price" | "rent" | "deposit", hint?: string) => (
    <Row head={head(f)} error={errors[f]} hint={hint}>
      <input
        className={`${FIELD_CLS} tabular-nums ${common[f].mixed ? "placeholder:text-amber-600" : ""}`}
        inputMode="decimal"
        aria-label={LABEL[f]}
        value={shown(f) ?? ""}
        placeholder={common[f].mixed ? DIFFERENT : "—"}
        onChange={(e) => set(f, e.target.value)}
        onBlur={(e) => {
          // Importe de señal sin fecha: se pide la fecha (si se cierra sin elegir, el importe queda y no cuenta como cobrado).
          const parsed = parseEsAmount(e.target.value);
          if (f === "deposit" && "deposit" in touched && parsed.ok && parsed.value != null && !shown("depositDate") && !common.depositDate.mixed) {
            setTarget(e.currentTarget.closest('[role="dialog"]') as HTMLElement | null);
            setAskDepositDate(true);
          }
        }}
      />
    </Row>
  );
  const date = (f: "completionDateEstimated" | "saleDateEstimated" | "depositDate" | "saleDate" | "rentDate") => (
    <Row head={head(f)} error={errors[f]}>
      <DateInput label={LABEL[f]} className={FIELD_CLS} value={shown(f)} placeholder={common[f].mixed && !(f in draft) ? DIFFERENT : "Sin fecha"} onChange={(iso) => set(f, iso)} />
    </Row>
  );
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-line bg-white text-ink hover:bg-[var(--surface-alt)]"}`;
  const sold = status === "VENDIDO";
  const rented = status === "ALQUILADO";
  const names = rows.map((r) => r.title).join(", ");
  const title = closing ? `${status ? RE_SALE_STATUS_LABEL[status] : ""} · ${many ? `${rows.length} unidades` : rows[0].title}` : many ? `${rows.length} unidades` : rows[0].title;

  return (
    <Dialog
      eyebrow={closing ? "Cierre" : many ? "Editar seleccionadas" : "Unidad"}
      title={title}
      subtitle={closing ? (sold ? "Indica el precio y la fecha de venta." : "Indica la renta mensual y la fecha de alquiler.") : many ? "Solo se aplican los campos que cambies; el resto queda como está en cada unidad." : "Precio y renta vacíos usan la base del Proyecto."}
      onClose={onClose}
      footer={
        <>
          {confirming ? <span className="mr-auto text-xs font-semibold text-amber-700">{`Vas a cambiar ${changed.length === 1 ? "1 campo" : `${changed.length} campos`} en ${rows.length} unidades.`}</span> : null}
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={apply}>{confirming ? `Confirmar: aplicar a ${rows.length} unidades` : many ? `Aplicar a ${rows.length} unidades` : closing ? `Marcar como ${status ? RE_SALE_STATUS_LABEL[status].toLowerCase() : ""}` : "Guardar"}</PrimaryButton>
        </>
      }
    >
      {many ? <p className="text-xs text-ink-subtle line-clamp-2">{names}</p> : null}
      {!closing ? (
        <>
          {many ? (
            <p className="text-[11px] text-ink-subtle">El nombre se cambia en cada unidad, no en varias a la vez.</p>
          ) : (
            <Row head={head("title")} error={errors.title}>
              <input className={FIELD_CLS} aria-label="Nombre" value={shown("title") ?? ""} onChange={(e) => set("title", e.target.value)} />
            </Row>
          )}
          <Row head={head("status")} error={errors.status}>
            <div className="flex flex-wrap gap-1.5">
              {status == null ? <span className="self-center text-xs font-semibold text-amber-600">{DIFFERENT}</span> : null}
              {RE_SALE_STATUSES.map((st) => (
                <button key={st} type="button" aria-pressed={status === st} onClick={() => set("status", st)} className={chip(status === st)}>{RE_SALE_STATUS_LABEL[st]}</button>
              ))}
            </div>
          </Row>
          <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
            <legend className="px-1 text-[10px] font-bold uppercase tracking-wide text-brand">Previsión</legend>
            {date("completionDateEstimated")}
            {date("saleDateEstimated")}
          </fieldset>
          {/* Precio o renta pasan a la sección de cierre cuando la unidad está vendida o alquilada (un solo campo). */}
          <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
            <legend className="px-1 text-[10px] font-bold uppercase tracking-wide text-ink-subtle">Valores</legend>
            {!sold ? amount("price", !many && !rows[0].priceOwn && rows[0].basePrice != null ? `Base del Proyecto: ${fmtEUR(rows[0].basePrice)}` : undefined) : null}
            {!rented ? amount("rent", !many && !rows[0].rentOwn && rows[0].baseRent != null ? `Base del Proyecto: ${fmtEUR(rows[0].baseRent)}/mes` : undefined) : null}
          </fieldset>
          <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
            <legend className="px-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--positive)" }}>Señal</legend>
            {amount("deposit", "Cuenta como cobrada cuando tiene fecha.")}
            {date("depositDate")}
          </fieldset>
        </>
      ) : null}
      {sold || rented ? (
        <fieldset className="grid gap-3 rounded-xl border-2 border-[var(--positive)] p-3 sm:grid-cols-2">
          <legend className="px-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--positive)" }}>{sold ? "Venta" : "Alquiler"}</legend>
          {sold ? amount("price") : amount("rent")}
          {sold ? date("saleDate") : date("rentDate")}
        </fieldset>
      ) : null}
      {!closing && !many && onRemove && rows[0].saleId ? (
        <button type="button" onClick={onRemove} className="text-xs font-semibold text-[var(--negative)] hover:underline">Quitar los datos propios de esta unidad</button>
      ) : null}
      {askDepositDate ? (
        <CalendarOverlay
          target={target ?? (typeof document !== "undefined" ? document.body : null)}
          onClose={() => setAskDepositDate(false)}
          onPick={(iso) => {
            if (iso) set("depositDate", iso);
            setAskDepositDate(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

export default UnitEditorDialog;

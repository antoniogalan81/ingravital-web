"use client";

// EDITAR SELECCIONADAS (igual que la APP): cambia a la vez solo los campos que el usuario toque.
// Con valores distintos se muestra «Valores diferentes» (no se elige ninguno) y, sin tocarlo, ese
// campo no cambia. Precio y renta son valores propios de las unidades, no la base de la tipología.
// Con muchas unidades pide una confirmación ligera antes de aplicar.

import { useMemo, useState, type ReactNode } from "react";
import { RE_SALE_STATUS_LABEL, RE_SALE_STATUSES, type RESaleStatus } from "@/src/lib/realEstateTracking";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import { commonUnitValue, parseEsAmount, type UnitField, type UnitPatch, type UnitRow } from "@/src/lib/unitEditing";
import { DateInput } from "@/src/components/ui/InlineEdit";
import { Dialog, FIELD_CLS, PrimaryButton, SecondaryButton } from "../tracking/RealFinanceDialogs";

/** Desde cuántas unidades se confirma antes de aplicar. */
const CONFIRM_FROM = 10;
const DIFFERENT = "Valores diferentes";
const LABEL: Record<UnitField, string> = {
  status: "Estado",
  completionDateEstimated: "Terminación prevista",
  saleDateEstimated: "Venta prevista",
  deposit: "Importe de la señal",
  depositDate: "Fecha de la señal",
  price: "Precio de venta",
  saleDate: "Fecha de venta",
  buyer: "Comprador",
  forRent: "Destinada al alquiler",
  rent: "Renta mensual",
};
type TextField = "deposit" | "price" | "rent" | "buyer";
const amountText = (v: unknown) => (typeof v === "number" ? String(v).replace(".", ",") : "");

function Row({ head, error, hint, children }: { head: ReactNode; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="text-xs font-semibold text-ink-subtle">{head}</div>
      {children}
      {error ? <span className="text-[11px] text-[var(--negative)]">{error}</span> : hint ? <span className="text-[11px] text-ink-subtle">{hint}</span> : null}
    </div>
  );
}

export function UnitsBulkDialog({ rows, onClose, onApply }: { rows: UnitRow[]; onClose: () => void; onApply: (patch: UnitPatch) => void }) {
  const common = useMemo(() => Object.fromEntries((Object.keys(LABEL) as UnitField[]).map((f) => [f, commonUnitValue(rows, f)])) as Record<UnitField, ReturnType<typeof commonUnitValue>>, [rows]);
  const [patch, setPatch] = useState<UnitPatch>({});
  const [texts, setTexts] = useState<Partial<Record<TextField, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<UnitField, string>>>({});
  const [confirming, setConfirming] = useState(false);

  const initialText = (f: TextField) => (common[f].mixed ? "" : f === "buyer" ? String(common[f].value ?? "") : amountText(common[f].value));
  const touch = (f: UnitField, v: UnitPatch[UnitField]) => {
    setPatch((p) => ({ ...p, [f]: v }));
    setConfirming(false);
  };
  const untouch = (f: UnitField) => {
    setPatch(({ [f]: _drop, ...rest }) => rest);
    setTexts(({ [f as TextField]: _drop, ...rest }) => rest);
    setErrors((e) => ({ ...e, [f]: undefined }));
  };
  const pending: UnitPatch = { ...patch, ...Object.fromEntries(Object.entries(texts).filter(([k, t]) => t != null && t.trim() !== initialText(k as TextField).trim())) };
  const changed = Object.keys(pending);

  const apply = () => {
    const out: UnitPatch = { ...patch };
    const errs: Partial<Record<UnitField, string>> = {};
    for (const f of ["deposit", "price", "rent"] as const) {
      const t = texts[f];
      if (t == null || t.trim() === initialText(f).trim()) continue;
      const parsed = parseEsAmount(t);
      if (parsed.ok) out[f] = parsed.value;
      else errs[f] = "Importe no válido.";
    }
    if (texts.buyer != null && texts.buyer.trim() !== initialText("buyer").trim()) out.buyer = texts.buyer.trim() || null;
    setErrors(errs);
    if (Object.keys(errs).length || !Object.keys(out).length) return;
    if (rows.length >= CONFIRM_FROM && !confirming) return setConfirming(true);
    onApply(out);
  };

  const label = (f: UnitField) => (
    <span className="flex items-center justify-between gap-2">
      <span className={f in pending ? "text-brand" : undefined}>{LABEL[f]}{f in pending ? " · se aplicará" : ""}</span>
      {f in pending ? (
        <button type="button" onClick={() => untouch(f)} className="text-[11px] font-semibold text-ink-subtle underline">No cambiar</button>
      ) : null}
    </span>
  );
  const text = (f: TextField, inputMode: "decimal" | "text") => (
    <Row head={label(f)} error={errors[f]} hint={!common[f].mixed && f !== "buyer" && typeof common[f].value === "number" ? `Ahora: ${fmtEUR(common[f].value as number)}` : undefined}>
      <input className={`${FIELD_CLS} ${inputMode === "decimal" ? "tabular-nums" : ""} ${common[f].mixed ? "placeholder:text-amber-600" : ""}`} inputMode={inputMode} aria-label={LABEL[f]} value={texts[f] ?? initialText(f)} placeholder={common[f].mixed ? DIFFERENT : "—"} onChange={(e) => setTexts((t) => ({ ...t, [f]: e.target.value }))} />
    </Row>
  );
  const date = (f: "completionDateEstimated" | "saleDateEstimated" | "depositDate" | "saleDate") => (
    <Row head={label(f)}>
      <DateInput label={LABEL[f]} className={FIELD_CLS} value={f in patch ? (patch[f] as string | null) : (common[f].value as string | null)} placeholder={common[f].mixed && !(f in patch) ? DIFFERENT : "Sin fecha"} onChange={(iso) => touch(f, iso)} />
    </Row>
  );
  const statusValue = "status" in patch ? patch.status : common.status.mixed ? null : common.status.value;
  const rentValue = "forRent" in patch ? patch.forRent : common.forRent.mixed ? null : common.forRent.value === true;
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-line bg-white text-ink hover:bg-[var(--surface-alt)]"}`;

  return (
    <Dialog
      eyebrow="Editar seleccionadas"
      title={rows.length === 1 ? "1 unidad" : `${rows.length} unidades`}
      subtitle="Solo se aplican los campos que cambies. Precio y renta son valores propios de estas unidades; la base de la tipología se cambia en Proyecto."
      onClose={onClose}
      footer={
        <>
          {confirming ? <span className="mr-auto text-xs font-semibold text-amber-700">{`Vas a cambiar ${changed.length === 1 ? "1 campo" : `${changed.length} campos`} en ${rows.length} unidades.`}</span> : null}
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={apply}>{!changed.length ? "Cambia algún campo" : confirming ? `Confirmar: aplicar a ${rows.length} unidades` : `Aplicar a ${rows.length === 1 ? "1 unidad" : `${rows.length} unidades`}`}</PrimaryButton>
        </>
      }
    >
      <p className="text-xs text-ink-subtle line-clamp-2">{rows.map((r) => r.title).join(", ")}</p>
      <Row head={label("status")}>
        <div className="flex flex-wrap gap-1.5">
          {statusValue == null ? <span className="self-center text-xs font-semibold text-amber-600">{DIFFERENT}</span> : null}
          {RE_SALE_STATUSES.map((st) => (
            <button key={st} type="button" aria-pressed={statusValue === st} onClick={() => touch("status", st as RESaleStatus)} className={chip(statusValue === st)}>{RE_SALE_STATUS_LABEL[st]}</button>
          ))}
        </div>
      </Row>
      <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
        <legend className="px-1 text-[10px] font-bold uppercase tracking-wide text-brand">Previsión</legend>
        {date("completionDateEstimated")}
        {date("saleDateEstimated")}
      </fieldset>
      <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
        <legend className="px-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--positive)" }}>Señal y venta real</legend>
        {text("deposit", "decimal")}
        {date("depositDate")}
        {text("price", "decimal")}
        {date("saleDate")}
        <div className="sm:col-span-2">{text("buyer", "text")}</div>
      </fieldset>
      <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
        <legend className="px-1 text-[10px] font-bold uppercase tracking-wide text-ink-subtle">Alquiler</legend>
        <Row head={label("forRent")}>
          <div className="flex flex-wrap gap-1.5">
            {rentValue == null ? <span className="self-center text-xs font-semibold text-amber-600">{DIFFERENT}</span> : null}
            <button type="button" aria-pressed={rentValue === true} onClick={() => touch("forRent", true)} className={chip(rentValue === true)}>Sí, alquiler</button>
            <button type="button" aria-pressed={rentValue === false} onClick={() => touch("forRent", false)} className={chip(rentValue === false)}>No, venta</button>
          </div>
        </Row>
        {text("rent", "decimal")}
      </fieldset>
    </Dialog>
  );
}

export default UnitsBulkDialog;

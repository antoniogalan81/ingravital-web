"use client";

// Celdas de EDICIÓN DIRECTA: se ven como un valor limpio y, al hacer clic, se convierten en su
// editor (texto, importe, fecha con calendario, interruptor o lista). Se guarda con Enter o al
// salir del campo; Escape cancela. Un valor vacío borra el dato.
// Los editores abiertos llevan `data-inline-edit`: el contenedor (p. ej. la ficha) no debe
// cerrarse con ese Escape (ver `isInlineEditing`).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import { addMonths, calendarMonth, formatEsDate, localTodayISO, monthOf, parseEsAmount, parseEsDate, WEEKDAYS } from "@/src/lib/unitEditing";

const VALUE_CLS =
  "block w-full min-h-8 rounded-md px-1.5 py-1 text-left text-xs tabular-nums hover:bg-[var(--brand-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] disabled:cursor-default disabled:hover:bg-transparent";
const INPUT_CLS = "w-full min-h-8 rounded-md border border-[var(--brand)] bg-white px-1.5 py-1 text-xs tabular-nums text-ink outline-none";

type TextLikeProps = {
  label: string;
  /** Texto del valor en reposo. */
  display: ReactNode;
  /** Texto con el que empieza la edición. */
  initial: string;
  /** Devuelve false si el texto no es válido (el campo sigue abierto y marcado). */
  onCommit: (text: string) => boolean | void;
  inputMode?: "text" | "decimal";
  align?: "left" | "right";
  readOnly?: boolean;
  placeholder?: string;
};

function InlineTextLike({ label, display, initial, onCommit, inputMode = "text", align = "left", readOnly, placeholder }: TextLikeProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const cancelled = useRef(false);

  const start = () => {
    if (readOnly) return;
    cancelled.current = false;
    setText(initial);
    setInvalid(false);
    setEditing(true);
  };
  const finish = () => {
    if (cancelled.current) return setEditing(false);
    if (text.trim() === initial.trim()) return setEditing(false);
    if (onCommit(text) === false) return setInvalid(true);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button type="button" onClick={start} disabled={readOnly} aria-label={readOnly ? undefined : `Editar ${label}`} title={readOnly ? undefined : label} className={`${VALUE_CLS} ${align === "right" ? "text-right" : ""}`}>
        {display}
      </button>
    );
  }
  return (
    <input
      autoFocus
      data-inline-edit=""
      aria-label={label}
      aria-invalid={invalid || undefined}
      inputMode={inputMode}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        setInvalid(false);
      }}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => (invalid ? setEditing(false) : finish())}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish();
        if (e.key === "Escape") {
          cancelled.current = true;
          setEditing(false);
        }
      }}
      className={`${INPUT_CLS} ${align === "right" ? "text-right" : ""} ${invalid ? "!border-[var(--negative)]" : ""}`}
    />
  );
}

/** ¿Hay una celda en edición o un calendario abierto? (Escape debe cancelar eso, no cerrar la ficha). */
export const isInlineEditing = () =>
  typeof document !== "undefined" && (document.activeElement?.hasAttribute("data-inline-edit") || !!document.querySelector("div[data-inline-edit]"));

const Empty = () => <span className="text-ink-subtle">—</span>;

export function InlineText({ label, value, onChange, readOnly, placeholder }: { label: string; value?: string; onChange: (v: string | null) => void; readOnly?: boolean; placeholder?: string }) {
  return (
    <InlineTextLike
      label={label}
      readOnly={readOnly}
      placeholder={placeholder}
      display={value ? <span className="block truncate text-ink">{value}</span> : <Empty />}
      initial={value ?? ""}
      onCommit={(t) => onChange(t.trim() || null)}
    />
  );
}

/** Importe. `base` se muestra atenuado cuando la unidad no tiene valor propio. */
export function InlineAmount({ label, value, own = true, onChange, readOnly, suffix = "" }: { label: string; value: number | null; own?: boolean; onChange: (v: number | null) => void; readOnly?: boolean; suffix?: string }) {
  const shown = value == null ? <Empty /> : <span className={own ? "font-semibold text-ink" : "text-ink-subtle"} title={own ? undefined : "Base del Proyecto"}>{fmtEUR(value)}{suffix}</span>;
  return (
    <InlineTextLike
      label={label}
      readOnly={readOnly}
      align="right"
      inputMode="decimal"
      display={shown}
      initial={own && value != null ? String(value).replace(".", ",") : ""}
      placeholder={value != null && !own ? `Base ${fmtEUR(value)}` : undefined}
      onCommit={(t) => {
        const parsed = parseEsAmount(t);
        if (!parsed.ok) return false;
        onChange(parsed.value);
      }}
    />
  );
}

export function InlineToggle({ label, value, onChange, readOnly }: { label: string; value: boolean; onChange: (v: boolean) => void; readOnly?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      disabled={readOnly}
      onClick={() => onChange(!value)}
      className={`inline-flex min-h-8 min-w-12 items-center justify-center rounded-full px-2.5 text-[11px] font-bold transition-colors disabled:cursor-default ${value ? "bg-[var(--positive)] text-white" : "border border-line bg-white text-ink-subtle hover:bg-[var(--surface-alt)]"}`}
    >
      {value ? "ON" : "OFF"}
    </button>
  );
}

export function InlineSelect<T extends string>({ label, value, options, onChange, readOnly }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; readOnly?: boolean }) {
  if (readOnly) return <span className="block px-1.5 py-1 text-xs text-ink">{options.find((o) => o.value === value)?.label ?? value}</span>;
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className="w-full min-h-8 cursor-pointer rounded-md bg-transparent px-1 py-1 text-xs text-ink hover:bg-[var(--brand-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]">
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** Calendario de un mes (lunes a domingo). Abre en el mes de la fecha o en el actual. */
export function CalendarCard({ value, onPick, onClear, onClose }: { value?: string; onPick: (iso: string) => void; onClear: () => void; onClose: () => void }) {
  const [ym, setYm] = useState(() => monthOf(value));
  const { label, weeks } = calendarMonth(ym.year, ym.month);
  const today = localTodayISO();
  return (
    <div role="dialog" aria-label="Calendario" className="w-72 rounded-xl border border-line bg-white p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => setYm((m) => addMonths(m, -1))} className="h-8 w-8 rounded-md text-ink hover:bg-[var(--surface-alt)]" aria-label="Mes anterior">‹</button>
        <span className="text-sm font-bold capitalize text-ink" aria-live="polite">{label}</span>
        <button type="button" onClick={() => setYm((m) => addMonths(m, 1))} className="h-8 w-8 rounded-md text-ink hover:bg-[var(--surface-alt)]" aria-label="Mes siguiente">›</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1 text-[10px] font-bold text-ink-subtle">{d}</span>
        ))}
        {weeks.flat().map((iso, i) =>
          iso ? (
            <button
              key={iso}
              type="button"
              onClick={() => onPick(iso)}
              aria-label={formatEsDate(iso)}
              aria-pressed={iso === value}
              className={`h-8 rounded-md text-xs tabular-nums ${iso === value ? "bg-[var(--brand)] font-bold text-white" : iso === today ? "font-bold text-brand ring-1 ring-[var(--brand)]" : "text-ink hover:bg-[var(--brand-soft)]"}`}
            >
              {Number(iso.slice(8))}
            </button>
          ) : (
            <span key={`e${i}`} />
          ),
        )}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
        <button type="button" onClick={onClear} className="rounded-md px-2 py-1 text-xs font-semibold text-ink-subtle hover:text-[var(--negative)]">Borrar</button>
        <div className="flex gap-1">
          <button type="button" onClick={() => onPick(today)} className="rounded-md px-2 py-1 text-xs font-semibold text-brand hover:bg-[var(--brand-soft)]">Hoy</button>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs font-semibold text-ink hover:bg-[var(--surface-alt)]">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Fecha: clic en el valor para escribirla (DD/MM/AAAA) o en el icono para elegirla en el
 * calendario. El calendario se abre en `overlayRoot` (dentro de la ficha) o en el documento.
 */
export function InlineDate({ label, value, onChange, readOnly, overlayRoot }: { label: string; value?: string; onChange: (iso: string | null) => void; readOnly?: boolean; overlayRoot?: HTMLElement | null }) {
  const [calendar, setCalendar] = useState(false);
  useEffect(() => {
    if (!calendar) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCalendar(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [calendar]);
  const pick = (iso: string | null) => {
    setCalendar(false);
    if (iso !== (value ?? null)) onChange(iso);
  };
  const target = overlayRoot ?? (typeof document !== "undefined" ? document.body : null);
  return (
    <div className="flex items-center gap-0.5">
      <div className="min-w-0 flex-1">
        <InlineTextLike
          label={label}
          readOnly={readOnly}
          display={value ? <span className="text-ink">{formatEsDate(value)}</span> : <Empty />}
          initial={formatEsDate(value)}
          placeholder="DD/MM/AAAA"
          onCommit={(t) => {
            const parsed = parseEsDate(t);
            if (!parsed.ok) return false;
            onChange(parsed.iso);
          }}
        />
      </div>
      {readOnly ? null : (
        <button type="button" onClick={() => setCalendar(true)} aria-label={`Calendario: ${label}`} className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-ink-subtle hover:bg-[var(--brand-soft)] hover:text-brand">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
      )}
      {calendar && target
        ? createPortal(
            <div data-inline-edit="" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/20 p-4" onMouseDown={(e) => e.target === e.currentTarget && setCalendar(false)}>
              <CalendarCard value={value} onPick={pick} onClear={() => pick(null)} onClose={() => setCalendar(false)} />
            </div>,
            target,
          )
        : null}
    </div>
  );
}

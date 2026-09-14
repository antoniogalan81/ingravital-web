"use client";

// Celdas de EDICIÓN DIRECTA: se ven como un valor limpio y, al hacer clic, se convierten en su
// editor (texto, importe, fecha con calendario, interruptor o lista). Se guarda con Enter o al
// salir del campo; Escape cancela. Un valor vacío borra el dato.
// Los editores abiertos llevan `data-inline-edit`: el contenedor (p. ej. la ficha) no debe
// cerrarse con ese Escape (ver `isInlineEditing`).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import { addMonths, calendarMonth, formatEsDate, localTodayISO, monthOf, MONTHS, parseEsAmount, parseEsDate, WEEKDAYS, yearPage, yearPageStart } from "@/src/lib/unitEditing";

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

/**
 * CALENDARIO ÚNICO (mismo comportamiento que la APP). Cabecera ‹ Mes Año ›: las flechas cambian
 * de mes; el mes abre la lista de meses y el año una página de 12 años (‹ › saltan 12). Abre en
 * el mes de la fecha o en el actual. Días, «Hoy», «Borrar» y «Cerrar». Solo texto ISO.
 */
export function CalendarCard({ value, onPick, onClear, onClose, allowClear = true }: { value?: string; onPick: (iso: string) => void; onClear: () => void; onClose: () => void; allowClear?: boolean }) {
  const [ym, setYm] = useState(() => monthOf(value));
  const [mode, setMode] = useState<"days" | "months" | "years">("days");
  const [yearStart, setYearStart] = useState(() => yearPageStart(monthOf(value).year));
  const { weeks } = calendarMonth(ym.year, ym.month);
  const today = localTodayISO();
  const step = (delta: number) => {
    if (mode === "years") setYearStart((y) => y + delta * 12);
    else if (mode === "months") setYm((m) => ({ ...m, year: m.year + delta }));
    else setYm((m) => addMonths(m, delta));
  };
  const nav = "h-8 w-8 rounded-md text-ink hover:bg-[var(--surface-alt)]";
  const chip = (on: boolean) => `rounded-md px-2 py-1 text-sm font-bold capitalize ${on ? "bg-[var(--brand-soft)] text-brand" : "text-ink hover:bg-[var(--surface-alt)]"}`;
  const cell = (on: boolean) => `h-10 rounded-md text-xs tabular-nums ${on ? "bg-[var(--brand)] font-bold text-white" : "text-ink hover:bg-[var(--brand-soft)]"}`;
  return (
    <div role="dialog" aria-label="Calendario" className="w-72 rounded-xl border border-line bg-white p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => step(-1)} className={nav} aria-label={mode === "years" ? "Años anteriores" : mode === "months" ? "Año anterior" : "Mes anterior"}>‹</button>
        <span className="flex items-center gap-1" aria-live="polite">
          <button type="button" onClick={() => setMode(mode === "months" ? "days" : "months")} aria-label={`Elegir mes: ${MONTHS[ym.month]}`} className={chip(mode === "months")}>{MONTHS[ym.month]}</button>
          <button
            type="button"
            onClick={() => {
              setYearStart(yearPageStart(ym.year));
              setMode(mode === "years" ? "days" : "years");
            }}
            aria-label={`Elegir año: ${ym.year}`}
            className={chip(mode === "years")}
          >
            {ym.year} ▾
          </button>
        </span>
        <button type="button" onClick={() => step(1)} className={nav} aria-label={mode === "years" ? "Años siguientes" : mode === "months" ? "Año siguiente" : "Mes siguiente"}>›</button>
      </div>
      {mode === "years" ? (
        <div className="grid grid-cols-3 gap-1">
          {yearPage(yearStart).map((y) => (
            <button key={y} type="button" aria-label={`Año ${y}`} aria-pressed={y === ym.year} onClick={() => { setYm((m) => ({ ...m, year: y })); setMode("days"); }} className={cell(y === ym.year)}>{y}</button>
          ))}
        </div>
      ) : mode === "months" ? (
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((name, i) => (
            <button key={name} type="button" aria-label={`Mes ${name}`} aria-pressed={i === ym.month} onClick={() => { setYm((m) => ({ ...m, month: i })); setMode("days"); }} className={`${cell(i === ym.month)} capitalize`}>{name.slice(0, 3)}</button>
          ))}
        </div>
      ) : (
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
      )}
      <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
        {allowClear ? <button type="button" onClick={onClear} className="rounded-md px-2 py-1 text-xs font-semibold text-ink-subtle hover:text-[var(--negative)]">Borrar</button> : <span />}
        <div className="flex gap-1">
          <button type="button" onClick={() => onPick(today)} className="rounded-md px-2 py-1 text-xs font-semibold text-brand hover:bg-[var(--brand-soft)]">Hoy</button>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs font-semibold text-ink hover:bg-[var(--surface-alt)]">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

/** Capa con el calendario, dentro de `target` (la ventana donde está el campo) para no quedar bloqueada. */
export function CalendarOverlay({ target, value, onPick, onClose, allowClear = true }: { target: HTMLElement | null; value?: string; onPick: (iso: string | null) => void; onClose: () => void; allowClear?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  if (!target) return null;
  return createPortal(
    <div data-inline-edit="" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/20 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <CalendarCard value={value} allowClear={allowClear} onPick={onPick} onClear={() => onPick(null)} onClose={onClose} />
    </div>,
    target,
  );
}

/** Ventana (diálogo o panel) que contiene un elemento; si no hay, el documento. */
const overlayTargetOf = (el: HTMLElement | null): HTMLElement | null =>
  (el?.closest('[role="dialog"], [data-vaul-drawer]') as HTMLElement | null) ?? (typeof document !== "undefined" ? document.body : null);

/** Campo de fecha (formularios y tablas): muestra DD/MM/AAAA y abre el calendario único. */
export function DateInput({ value, onChange, label, className, placeholder = "DD/MM/AAAA", allowClear = true }: { value?: string | null; onChange: (iso: string | null) => void; label: string; className?: string; placeholder?: string; allowClear?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const shown = formatEsDate(value);
  return (
    <>
      <button ref={ref} type="button" aria-label={`${label}: ${shown || "sin fecha"}`} onClick={() => setTarget(overlayTargetOf(ref.current))} className={`flex items-center gap-1.5 text-left tabular-nums ${className ?? ""}`}>
        <svg className="h-3.5 w-3.5 shrink-0 text-ink-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className={shown ? "text-ink" : "text-ink-subtle"}>{shown || placeholder}</span>
      </button>
      {target ? (
        <CalendarOverlay
          target={target}
          value={value ?? undefined}
          allowClear={allowClear}
          onClose={() => setTarget(null)}
          onPick={(iso) => {
            setTarget(null);
            if (iso !== (value ?? null)) onChange(iso);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Fecha: clic en el valor para escribirla (DD/MM/AAAA) o en el icono para elegirla en el
 * calendario. El calendario se abre en `overlayRoot` (dentro de la ficha) o en el documento.
 */
export function InlineDate({ label, value, onChange, readOnly, overlayRoot }: { label: string; value?: string; onChange: (iso: string | null) => void; readOnly?: boolean; overlayRoot?: HTMLElement | null }) {
  const [calendar, setCalendar] = useState(false);
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
      {calendar ? <CalendarOverlay target={target} value={value} onPick={pick} onClose={() => setCalendar(false)} /> : null}
    </div>
  );
}

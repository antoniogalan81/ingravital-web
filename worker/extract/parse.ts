// worker/extract/parse.ts — Lectura determinista de importes, fechas y NIF/CIF en texto
// español. Sin IA: lo que aquí se reconoce es verificable.

import { parseAmountEs } from "../../src/lib/realFinances.ts";

/** Importes escritos a la española o con punto decimal: 1.234,56 · 1234,56 · 1234.56 · 1.234 € */
const AMOUNT_TOKEN = /(?<![\d.,])-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?(?![\d,])|(?<![\d.,])-?\d+,\d{1,2}(?![\d,])|(?<![\d.,])-?\d+\.\d{2}(?![\d.,])/g;

export function normalizeText(text: string): string {
  return (text ?? "")
    .normalize("NFC")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export function toAmount(token: string): number | undefined {
  const n = parseAmountEs(token);
  return n === undefined ? undefined : round2(n);
}

/** Todos los importes con decimales o miles del texto (para verificar valores propuestos). */
export function amountsIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(AMOUNT_TOKEN)) {
    const v = toAmount(m[0]);
    if (v !== undefined) out.push(v);
  }
  return out;
}

export const sameAmount = (a: number | undefined, b: number | undefined, tolerance = 0.011): boolean =>
  a !== undefined && b !== undefined && Math.abs(a - b) <= tolerance;

/**
 * Importe que sigue a una etiqueta, en la misma línea o en la siguiente.
 * `label` es un fragmento de regex sin anclas. Devuelve el ÚLTIMO importe de la línea
 * (en tablas "Base 21% Cuota" el valor útil suele ir al final).
 */
export function amountAfter(text: string, label: string, pick: "first" | "last" = "last"): number | undefined {
  const re = new RegExp(`(?:${label})[^\\n\\d-]{0,40}([^\\n]*)(?:\\n([^\\n]*))?`, "gi");
  let found: number | undefined;
  for (const m of text.matchAll(re)) {
    for (const chunk of [m[1], m[2]]) {
      const values = amountsIn(chunk ?? "");
      if (values.length) {
        found = pick === "first" ? values[0] : values[values.length - 1];
        break;
      }
    }
    if (found !== undefined) return found;
  }
  return undefined;
}

// ── Fechas ────────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function isoDate(y: number, m: number, d: number): string | undefined {
  if (y < 100) y += 2000;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const DATE_PATTERNS: { re: RegExp; build: (m: RegExpMatchArray) => string | undefined }[] = [
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, build: (m) => isoDate(+m[1], +m[2], +m[3]) },
  { re: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g, build: (m) => isoDate(+m[3], +m[2], +m[1]) },
  {
    re: /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+|del\s+)?(\d{4})\b/gi,
    build: (m) => isoDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1]),
  },
];

/** Fechas válidas del texto, en orden de aparición. */
export function datesIn(text: string): string[] {
  const found: { index: number; iso: string }[] = [];
  for (const { re, build } of DATE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const iso = build(m);
      if (iso) found.push({ index: m.index ?? 0, iso });
    }
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.iso);
}

export function dateAfter(text: string, label: string): string | undefined {
  const re = new RegExp(`(?:${label})[^\\n]{0,30}?([^\\n]*)(?:\\n([^\\n]*))?`, "gi");
  for (const m of text.matchAll(re)) {
    const d = datesIn(m[1] ?? "")[0] ?? datesIn(m[2] ?? "")[0];
    if (d) return d;
  }
  return undefined;
}

// ── NIF / CIF / NIE ───────────────────────────────────────────────────────────

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/** Valida la letra/dígito de control de un NIF, NIE o CIF español ya normalizado. */
export function isValidSpanishTaxId(id: string): boolean {
  const v = id.toUpperCase();
  if (/^\d{8}[A-Z]$/.test(v)) return DNI_LETTERS[Number(v.slice(0, 8)) % 23] === v[8];
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) {
    const num = Number(String("XYZ".indexOf(v[0])) + v.slice(1, 8));
    return DNI_LETTERS[num % 23] === v[8];
  }
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) {
    const digits = v.slice(1, 8);
    let even = 0;
    let odd = 0;
    for (let i = 0; i < 7; i++) {
      const d = Number(digits[i]);
      if (i % 2 === 1) even += d;
      else {
        const x = d * 2;
        odd += Math.floor(x / 10) + (x % 10);
      }
    }
    const control = (10 - ((even + odd) % 10)) % 10;
    const letter = "JABCDEFGHI"[control];
    const c = v[8];
    if ("PQRSNW".includes(v[0])) return c === letter;
    if ("ABEH".includes(v[0])) return c === String(control);
    return c === String(control) || c === letter;
  }
  return false;
}

const TAX_ID_TOKEN = /\b(?:ES[\s-]?)?([ABCDEFGHJKLMNPQRSUVWXYZ0-9][\s.-]?\d{2}[\s.]?\d{3}[\s.]?\d{2}[\s.-]?[0-9A-Z])\b/g;

export type TaxIdHit = { id: string; index: number; valid: boolean };

// Confusiones típicas del OCR en la letra final de un DNI (Z→7/2, S→5, B→8).
const OCR_LETTER: Record<string, string[]> = { "7": ["Z"], "2": ["Z"], "5": ["S"], "8": ["B"] };

function repairDni(id: string): string {
  if (!/^\d{9}$/.test(id)) return id;
  const expected = DNI_LETTERS[Number(id.slice(0, 8)) % 23];
  return OCR_LETTER[id[8]]?.includes(expected) ? id.slice(0, 8) + expected : id;
}

/** NIF/CIF/NIE que aparecen en el texto, normalizados y con su validez de control. */
export function taxIdsIn(text: string): TaxIdHit[] {
  const out: TaxIdHit[] = [];
  const seen = new Set<string>();
  for (const m of text.toUpperCase().matchAll(TAX_ID_TOKEN)) {
    const id = repairDni(m[1].replace(/[\s.-]/g, ""));
    if (!/^(?:\d{8}[A-Z]|[XYZ]\d{7}[A-Z]|[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J])$/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, index: m.index ?? 0, valid: isValidSpanishTaxId(id) });
  }
  return out;
}

// ── Convención de nombre de archivo ───────────────────────────────────────────
// "2026-06-12 · Minuta 1 honorarios arquitecto (factura 14-2026) · Ignacio Ortiz · 2.491,00 €.pdf"

export type FileNameHints = {
  date?: string;
  concept?: string;
  reference?: string;
  supplier?: string;
  amount?: number;
};

export function fileNameHints(fileName: string): FileNameHints {
  const base = (fileName ?? "").replace(/\.[A-Za-z0-9]{2,5}$/, "");
  const parts = base.split(/\s+[·|]\s+|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  const hints: FileNameHints = {};
  const rest: string[] = [];
  for (const part of parts) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(part) ? datesIn(part)[0] : undefined;
    if (date && !hints.date) {
      hints.date = date;
      continue;
    }
    const amountMatch = part.match(/^(-?[\d.]+(?:,\d{1,2})?)\s*€$/);
    if (amountMatch && hints.amount === undefined) {
      hints.amount = toAmount(amountMatch[1]);
      continue;
    }
    rest.push(part);
  }
  // Solo se interpreta como convención si el nombre trae fecha o importe, o varias partes.
  if (rest[0] && (hints.date || hints.amount !== undefined || rest.length > 1)) {
    const ref = rest[0].match(/\(([^)]+)\)\s*$/);
    hints.concept = rest[0].replace(/\s*\([^)]*\)\s*$/, "").trim() || undefined;
    if (ref) hints.reference = ref[1].trim();
  }
  if (rest.length > 1 && (hints.date || hints.amount !== undefined)) hints.supplier = rest[rest.length - 1];
  return hints;
}

export const foldForMatch = (s: string): string =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ºª]+/g, " ")
    .trim();

// src/lib/unitEditing.ts — Edición directa de UNIDADES (Proyecto › Unidades y Seguimiento › Ventas).
// IDÉNTICO a APP/src/utils/unitEditing.ts desde "Cuerpo compartido" (lo comprueba un test).
//
// Cada unidad es UNA ficha de `sales` (o, si aún no tiene ficha, una fila virtual de su línea
// del Proyecto que se convierte en ficha al editar un dato). Nada se copia: el precio y la renta
// que se ven son los efectivos de `calcResults` (propios o base de su línea) y al editar solo se
// escribe el campo tocado. Sin React, sin red.

import type { REOperation, REResults, UnitType } from "./realEstate";
import type { RESale, RESaleStatus } from "./realEstateTracking";
import { activeSalesByGroup, SALE_GROUP_LABEL, UNIT_SINGULAR, UNIT_TYPES, type SaleGroupKey } from "./projectEconomics";

// ── Cuerpo compartido ──────────────────────────────────────────────────────────

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const pad = (v: number) => String(v).padStart(2, "0");

// ── Fechas (siempre texto ISO yyyy-mm-dd; nunca objetos Date con zona horaria) ──

/** "2027-02-15" → "15/02/2027"; vacío si no hay fecha. */
export function formatEsDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

const validIso = (y: number, m: number, d: number): string | null => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/** Texto escrito a mano → ISO. Acepta 15/02/2027, 15-2-27, 2027-02-15. Vacío = borrar (iso null). */
export function parseEsDate(text: string): { ok: true; iso: string | null } | { ok: false } {
  const t = text.trim();
  if (!t) return { ok: true, iso: null };
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const es = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  const parsed = iso ? validIso(+iso[1], +iso[2], +iso[3]) : es ? validIso(es[3].length === 2 ? 2000 + +es[3] : +es[3], +es[2], +es[1]) : null;
  return parsed ? { ok: true, iso: parsed } : { ok: false };
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export type YearMonth = { year: number; month: number };

/** Mes en el que abre el calendario: el de la fecha guardada o, si no hay, el actual (hora local). */
export function monthOf(iso: string | null | undefined, now: Date = new Date()): YearMonth {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? "");
  return m ? { year: +m[1], month: +m[2] - 1 } : { year: now.getFullYear(), month: now.getMonth() };
}

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** Hoy en hora local como ISO (el día que ve el usuario, no el de UTC). */
export function localTodayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Cuadrícula de un mes: semanas de lunes a domingo con la fecha ISO de cada día (null fuera del mes). */
export function calendarMonth(year: number, month: number): { label: string; weeks: (string | null)[][] } {
  const first = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { label: `${MONTHS[month]} ${year}`, weeks };
}

// ── Importes ─────────────────────────────────────────────────────────────────

/** "186.000", "1.234,56 €", "950" → número. Vacío = borrar (null). */
export function parseEsAmount(text: string): { ok: true; value: number | null } | { ok: false } {
  let t = text.replace(/€/g, "").replace(/\s/g, "");
  if (!t) return { ok: true, value: null };
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  return /^-?\d+(\.\d+)?$/.test(t) ? { ok: true, value: Number(t) } : { ok: false };
}

// ── Filas de unidades ────────────────────────────────────────────────────────

export type UnitRow = {
  key: string;
  /** Ficha de venta; null en una unidad del Proyecto que aún no tiene ficha (fila virtual). */
  saleId: string | null;
  virtual: boolean;
  group: SaleGroupKey;
  groupLabel: string;
  title: string;
  status: RESaleStatus;
  /** Precio efectivo (propio o base de su línea) y si es propio. */
  price: number | null;
  priceOwn: boolean;
  basePrice: number | null;
  rent: number | null;
  rentOwn: boolean;
  baseRent: number | null;
  // Previsión
  completionDateEstimated?: string;
  depositDateEstimated?: string;
  saleDateEstimated?: string;
  // Realidad
  depositDate?: string;
  deposit: number | null;
  saleDate?: string;
  buyer?: string;
  forRent: boolean;
};

const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, "es", { numeric: true });

/** Todas las unidades: fichas activas y unidades del Proyecto sin ficha. Solo lee. */
export function projectUnitRows(op: Pick<REOperation, "sales" | "units">, res: REResults): UnitRow[] {
  const groups = activeSalesByGroup(op);
  const out: UnitRow[] = [];
  for (const group of [...UNIT_TYPES, "OTROS"] as SaleGroupKey[]) {
    const rows: UnitRow[] = groups[group].map((s) => {
      const eff = res.effectiveSales?.[s.id];
      return {
        key: s.id,
        saleId: s.id,
        virtual: false,
        group,
        groupLabel: SALE_GROUP_LABEL[group],
        title: s.title?.trim() || "Unidad sin nombre",
        status: s.status,
        price: eff?.price ?? null,
        priceOwn: isNum(s.realPrice) || isNum(s.estimatedPrice),
        basePrice: eff?.basePrice ?? null,
        rent: eff?.rent ?? null,
        rentOwn: isNum(s.rentMonthly),
        baseRent: eff?.baseRent ?? null,
        completionDateEstimated: s.completionDateEstimated,
        depositDateEstimated: s.depositDateEstimated,
        saleDateEstimated: s.saleDateEstimated,
        depositDate: s.depositDate,
        deposit: isNum(s.deposit) ? s.deposit : null,
        saleDate: s.date,
        buyer: s.buyer,
        forRent: s.forRent === true,
      };
    });
    if (group !== "OTROS") {
      const used = new Set(rows.map((r) => r.title.toLowerCase()));
      let next = 0;
      (res.unrecordedUnits?.[group as UnitType] ?? []).forEach((base, i) => {
        let title = "";
        do title = `${UNIT_SINGULAR[group as UnitType]} ${++next}`;
        while (used.has(title.toLowerCase()));
        used.add(title.toLowerCase());
        rows.push({
          key: `virtual:${group}:${i}`,
          saleId: null,
          virtual: true,
          group,
          groupLabel: SALE_GROUP_LABEL[group],
          title,
          status: "DISPONIBLE",
          price: base.price,
          priceOwn: false,
          basePrice: base.price,
          rent: base.rent,
          rentOwn: false,
          baseRent: base.rent,
          deposit: null,
          forRent: false,
        });
      });
    }
    out.push(...rows.sort(byTitle));
  }
  return out;
}

// ── Edición de un campo ──────────────────────────────────────────────────────

export type UnitField =
  | "status"
  | "price"
  | "rent"
  | "completionDateEstimated"
  | "depositDateEstimated"
  | "saleDateEstimated"
  | "deposit"
  | "depositDate"
  | "saleDate"
  | "buyer"
  | "forRent";

type UnitValue = string | number | boolean | null | undefined;

const empty = (v: UnitValue) => v == null || v === "" || (typeof v === "number" && !Number.isFinite(v));

/** Ficha con un campo cambiado. Un valor vacío BORRA el campo (nunca "" ni 0 inventados). */
export function withUnitField(s: RESale, field: UnitField, value: UnitValue, nowISO: string): RESale {
  const next: Record<string, unknown> = { ...s, updatedAt: nowISO };
  const set = (key: string, v: UnitValue) => {
    if (empty(v) || v === false) delete next[key];
    else next[key] = typeof v === "string" ? v.trim() : v;
  };
  switch (field) {
    case "status":
      if (!empty(value)) next.status = value;
      break;
    case "price":
      // Un solo precio por unidad: el propio sustituye al "precio real" antiguo.
      delete next.realPrice;
      set("estimatedPrice", value);
      break;
    case "rent":
      set("rentMonthly", value);
      break;
    case "saleDate":
      set("date", value);
      if (!empty(value)) next.status = "VENDIDO";
      break;
    case "deposit":
    case "depositDate":
      set(field, value);
      if (!empty(value) && next.status === "DISPONIBLE") next.status = "SENALADO";
      break;
    case "forRent":
      set("forRent", value === true);
      break;
    default:
      set(field, value);
  }
  return next as RESale;
}

/**
 * Aplica la edición de UN campo de una unidad y devuelve la lista completa de fichas (con
 * sus marcas de borrado). Una fila virtual se convierte en ficha solo en este momento.
 */
export function editUnit(op: Pick<REOperation, "sales">, _res: REResults, row: UnitRow, field: UnitField, value: UnitValue, makeId: () => string, nowISO: string): RESale[] {
  const all: RESale[] = Array.isArray(op.sales) ? op.sales : [];
  if (row.saleId) return all.map((s) => (s.id === row.saleId ? withUnitField(s, field, value, nowISO) : s));
  const created: RESale = {
    id: makeId(),
    title: row.title,
    ...(row.group !== "OTROS" ? { unitType: row.group } : {}),
    status: "DISPONIBLE",
    createdAt: nowISO,
    updatedAt: nowISO,
  };
  return [...all, withUnitField(created, field, value, nowISO)];
}

/**
 * Editor completo: varios campos de una misma unidad de una vez (una sola ficha nueva si era
 * virtual). El estado elegido a mano se aplica al final para que mande sobre los automáticos.
 */
export function editUnitFields(op: Pick<REOperation, "sales">, res: REResults, row: UnitRow, patch: Partial<Record<UnitField, UnitValue>>, makeId: () => string, nowISO: string): RESale[] {
  const fields = (Object.keys(patch) as UnitField[]).sort((a, b) => Number(a === "status") - Number(b === "status"));
  if (!fields.length) return Array.isArray(op.sales) ? op.sales : [];
  let sales = editUnit(op, res, row, fields[0], patch[fields[0]], makeId, nowISO);
  const id = row.saleId ?? sales[sales.length - 1].id;
  for (const field of fields.slice(1)) sales = sales.map((s) => (s.id === id ? withUnitField(s, field, patch[field], nowISO) : s));
  return sales;
}

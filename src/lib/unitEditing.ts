// src/lib/unitEditing.ts — Edición de UNIDADES (tabla, ficha individual y edición de varias).
// IDÉNTICO a APP/src/utils/unitEditing.ts desde "Cuerpo compartido" (lo comprueba un test).
//
// Cada unidad es UNA ficha de `sales` (o, si aún no tiene ficha, una fila virtual de su línea
// del Proyecto que se convierte en ficha al editar un dato). Nada se copia: el precio y la renta
// que se ven son los efectivos de `calcResults` (propios o base de su línea) y al editar solo se
// escribe el campo tocado. Sin React, sin red.

import type { REOperation, REResults, UnitType } from "./realEstate";
import type { RESale, RESaleStatus } from "./realEstateTracking";
import { activeSalesByGroup, displaySaleStatus, SALE_GROUP_LABEL, UNIT_SINGULAR, UNIT_TYPES, type SaleGroupKey } from "./projectEconomics";

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

export const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
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

/** Selector de año del calendario: página de 12 años que empieza en `start` (‹ › mueven 12). */
export function yearPage(start: number): number[] {
  return Array.from({ length: 12 }, (_, i) => start + i);
}

/** Primera página de años que contiene `year` (con 5 años antes para ir atrás cómodamente). */
export const yearPageStart = (year: number): number => year - 5;

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

/**
 * Una unidad con SOLO los datos de su ficha: nombre, estado, previsión (terminación y venta),
 * valores (precio de venta y renta mensual, propios o base), señal (importe y fecha) y cierre
 * (fecha de venta o de alquiler). Otros datos antiguos de la ficha se conservan sin mostrarse.
 */
export type UnitRow = {
  key: string;
  /** Ficha de venta; null en una unidad del Proyecto que aún no tiene ficha (fila virtual). */
  saleId: string | null;
  virtual: boolean;
  group: SaleGroupKey;
  groupLabel: string;
  title: string;
  /** Estado tal como se muestra y edita (Reservado/Apalabrado antiguos = En negociación). */
  status: RESaleStatus;
  /** Precio y renta efectivos (propios o base de su línea) y si son propios. */
  price: number | null;
  priceOwn: boolean;
  basePrice: number | null;
  rent: number | null;
  rentOwn: boolean;
  baseRent: number | null;
  // Previsión
  completionDateEstimated?: string;
  saleDateEstimated?: string;
  // Señal real (cuenta como cobrada solo con fecha)
  deposit: number | null;
  depositDate?: string;
  // Cierre real
  saleDate?: string;
  rentDate?: string;
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
        status: displaySaleStatus(s.status),
        price: eff?.price ?? null,
        priceOwn: isNum(s.realPrice) || isNum(s.estimatedPrice),
        basePrice: eff?.basePrice ?? null,
        rent: eff?.rent ?? null,
        rentOwn: isNum(s.rentMonthly),
        baseRent: eff?.baseRent ?? null,
        completionDateEstimated: s.completionDateEstimated,
        saleDateEstimated: s.saleDateEstimated,
        deposit: isNum(s.deposit) ? s.deposit : null,
        depositDate: s.depositDate,
        saleDate: s.date,
        rentDate: s.rentStartDate,
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
        });
      });
    }
    out.push(...rows.sort(byTitle));
  }
  return out;
}

// ── Edición de un campo ──────────────────────────────────────────────────────

/** Los ÚNICOS campos editables de una unidad (ficha individual, tabla y edición de varias). */
export type UnitField = "title" | "status" | "completionDateEstimated" | "saleDateEstimated" | "price" | "rent" | "deposit" | "depositDate" | "saleDate" | "rentDate";

export type UnitValue = string | number | boolean | null | undefined;

const empty = (v: UnitValue) => v == null || v === "" || (typeof v === "number" && !Number.isFinite(v));
const CLOSED: RESaleStatus[] = ["VENDIDO", "ALQUILADO"];

/** Ficha con un campo cambiado. Un valor vacío BORRA el campo (nunca "" ni 0 inventados). */
export function withUnitField(s: RESale, field: UnitField, value: UnitValue, nowISO: string): RESale {
  const next: Record<string, unknown> = { ...s, updatedAt: nowISO };
  const set = (key: string, v: UnitValue) => {
    if (empty(v) || v === false) delete next[key];
    else next[key] = typeof v === "string" ? v.trim() : v;
  };
  switch (field) {
    case "title":
      // El nombre nunca se queda vacío.
      if (!empty(value) && String(value).trim()) next.title = String(value).trim();
      break;
    case "status":
      if (!empty(value)) {
        next.status = value;
        // El destino lo expresa el estado (ALQUILADO): la marca antigua deja de aplicarse.
        delete next.forRent;
      }
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
      break;
    case "rentDate":
      set("rentStartDate", value);
      break;
    case "depositDate":
      set("depositDate", value);
      // La fecha es la prueba de la señal: pasa a Señalado salvo que ya esté vendida o alquilada.
      if (!empty(value) && !CLOSED.includes(next.status as RESaleStatus)) next.status = "SENALADO";
      // Sin fecha ya no hay prueba de la señal: una unidad Señalada vuelve a Disponible (el importe se queda).
      if (empty(value) && next.status === "SENALADO") next.status = "DISPONIBLE";
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
export function editUnit(op: Pick<REOperation, "sales">, res: REResults, row: UnitRow, field: UnitField, value: UnitValue, makeId: () => string, nowISO: string): RESale[] {
  return editUnitFields(op, res, row, { [field]: value }, makeId, nowISO);
}

export type UnitPatch = Partial<Record<UnitField, UnitValue>>;

/**
 * Varios campos de una misma unidad de una vez (una sola ficha nueva si era virtual). El estado
 * elegido se aplica al final para que mande sobre los automáticos. Al cerrar como Vendido o
 * Alquilado, el precio o la renta que heredaba de la base queda fijado como propio.
 */
export function editUnitFields(op: Pick<REOperation, "sales">, _res: REResults, row: UnitRow, patch: UnitPatch, makeId: () => string, nowISO: string): RESale[] {
  const all: RESale[] = Array.isArray(op.sales) ? op.sales : [];
  const fields = (Object.keys(patch) as UnitField[]).sort((a, b) => Number(a === "status") - Number(b === "status"));
  if (!fields.length) return all;
  const apply = (s: RESale): RESale => {
    let next = s;
    for (const field of fields) next = withUnitField(next, field, patch[field], nowISO);
    if (patch.status === "VENDIDO" && !isNum(next.estimatedPrice) && !isNum(next.realPrice) && row.price != null) next = withUnitField(next, "price", row.price, nowISO);
    if (patch.status === "ALQUILADO" && !isNum(next.rentMonthly) && row.rent != null) next = withUnitField(next, "rent", row.rent, nowISO);
    return next;
  };
  if (row.saleId) return all.map((s) => (s.id === row.saleId ? apply(s) : s));
  const created: RESale = {
    id: makeId(),
    title: row.title,
    ...(row.group !== "OTROS" ? { unitType: row.group } : {}),
    status: "DISPONIBLE",
    createdAt: nowISO,
    updatedAt: nowISO,
  };
  return [...all, apply(created)];
}

// ── Ficha de una o varias unidades ────────────────────────────────────────────

/** Valor de un campo tal como se ve en la fila (precio y renta: los efectivos). Sin dato = null. */
export function unitRowValue(row: UnitRow, field: UnitField): string | number | boolean | null {
  const v = row[field];
  return v === undefined || v === "" ? null : v;
}

/**
 * Valor común de un campo en las unidades seleccionadas. Si difieren: `mixed` y SIN valor
 * (no se elige ninguno de ellos; solo lo que escriba el usuario se aplica a todas).
 */
export function commonUnitValue(rows: UnitRow[], field: UnitField): { mixed: boolean; value: string | number | boolean | null } {
  const values = rows.map((r) => unitRowValue(r, field));
  if (!values.length) return { mixed: false, value: null };
  return values.every((v) => v === values[0]) ? { mixed: false, value: values[0] } : { mixed: true, value: null };
}

/**
 * Lo que el usuario ha tocado en la ficha (individual o de varias): texto del nombre y de los
 * importes tal como se escribió, fechas en ISO (null = borrar) y estado. Lo no tocado no está.
 */
export type UnitDraft = Partial<Record<UnitField, string | null>>;

export type UnitFormResult = { ok: true; patch: UnitPatch } | { ok: false; errors: Partial<Record<UnitField, string>> };

const AMOUNT_FIELDS: UnitField[] = ["price", "rent", "deposit"];

/**
 * Convierte lo tocado en la ficha en un parche validado, igual para una unidad o para varias:
 * importes en formato español, el nombre solo en una unidad (nunca el mismo nombre a varias) y,
 * al cerrar, Vendido exige precio y fecha de venta y Alquilado renta y fecha de alquiler en cada
 * unidad afectada (lo que ya tuvieran cuenta).
 */
export function buildUnitPatch(rows: UnitRow[], draft: UnitDraft): UnitFormResult {
  const patch: UnitPatch = {};
  const errors: Partial<Record<UnitField, string>> = {};
  for (const field of Object.keys(draft) as UnitField[]) {
    const raw = draft[field];
    if (raw === undefined) continue;
    if (field === "title") {
      if (rows.length !== 1) continue;
      const title = (raw ?? "").trim();
      if (!title) errors.title = "Escribe un nombre.";
      else if (title !== rows[0].title) patch.title = title;
    } else if (AMOUNT_FIELDS.includes(field)) {
      const parsed = parseEsAmount(raw ?? "");
      if (parsed.ok) patch[field] = parsed.value;
      else errors[field] = "Importe no válido.";
    } else if (field === "status") {
      if (raw) patch.status = raw;
    } else {
      patch[field] = raw;
    }
  }
  const closing = (status: RESaleStatus, amount: "price" | "rent", date: "saleDate" | "rentDate", amountMsg: string, dateMsg: string) => {
    const touched = patch.status === status || amount in patch || date in patch;
    const affected = rows.filter((r) => (patch.status ?? r.status) === status);
    if (!touched || !affected.length) return;
    const lacking = (field: "price" | "rent" | "saleDate" | "rentDate") => affected.filter((r) => empty(field in patch ? patch[field] : r[field])).map((r) => r.title);
    const note = (titles: string[], msg: string) => (rows.length === 1 ? msg : `${msg} Falta en: ${titles.join(", ")}.`);
    const noAmount = lacking(amount);
    const noDate = lacking(date);
    if (noAmount.length && !errors[amount]) errors[amount] = note(noAmount, amountMsg);
    if (noDate.length) errors[date] = note(noDate, dateMsg);
  };
  closing("VENDIDO", "price", "saleDate", "Indica el precio de venta.", "Indica la fecha de venta.");
  closing("ALQUILADO", "rent", "rentDate", "Indica la renta mensual.", "Indica la fecha de alquiler.");
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, patch };
}

/**
 * Edición de varias unidades: aplica SOLO los campos del parche a cada unidad seleccionada y
 * devuelve UNA lista de fichas (una sola actualización de la operación). El resto de campos no se
 * toca; las unidades sin ficha la crean. El nombre no se aplica a varias. El precio y la renta
 * son valores propios, no la base del Proyecto.
 */
export function editUnitsBulk(op: Pick<REOperation, "sales">, res: REResults, rows: UnitRow[], patch: UnitPatch, makeId: () => string, nowISO: string): RESale[] {
  const { title: _title, ...shared } = patch;
  const effective = rows.length === 1 ? patch : shared;
  let sales: RESale[] = Array.isArray(op.sales) ? op.sales : [];
  if (!Object.keys(effective).length) return sales;
  for (const row of rows) sales = editUnitFields({ sales }, res, row, effective, makeId, nowISO);
  return sales;
}

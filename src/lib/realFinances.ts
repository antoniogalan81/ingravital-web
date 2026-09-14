// src/lib/realFinances.ts — FINANZAS REALES de una operación: enlaces de Google Drive
// y agregados puros. Sin React, sin red. IDÉNTICO a APP/src/utils/realFinances.ts (salvo imports).
//
// Drive: el navegador no accede a Drive. Aquí solo se valida que un enlace pegado TIENE
// FORMA de enlace de Drive y se extrae su id. La lectura de documentos la hace el worker del
// PC con invergravital@gmail.com (ver WEB/docs/DOCUMENTOS_DRIVE.md). Nunca cambia permisos.
//
// PRINCIPIO (como realEstateTrackingCalc): lo que no se puede calcular es `null`,
// nunca un 0 inventado.

// Solo imports de tipos: el módulo se prueba con `node --test` sin bundler.
import type { REOperation, REResults } from "./realEstate";
import type { REExpense, RELoanPeriodicity, RERealExpense, RERealLoan } from "./realEstateTracking";

export const RE_LOAN_PERIODS_PER_YEAR: Record<RELoanPeriodicity, number> = {
  MENSUAL: 12,
  TRIMESTRAL: 4,
  SEMESTRAL: 2,
  ANUAL: 1,
};

// ── Google Drive ──────────────────────────────────────────────────────────────

const DRIVE_HOSTS = new Set(["drive.google.com", "docs.google.com"]);
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;

/** `unknown`: el enlace `open?id=` no dice si es carpeta o archivo. */
export type DriveLinkKind = "folder" | "file" | "unknown";

export type ParsedDriveLink = { kind: DriveLinkKind; id: string; url: string };

/**
 * Reconoce los enlaces que da Google Drive al "Copiar enlace":
 *  · carpeta: drive.google.com/drive/folders/<id>  (también /drive/u/0/folders/<id>)
 *  · archivo: drive.google.com/file/d/<id>/…, docs.google.com/<app>/d/<id>/…
 *  · ambos:   drive.google.com/open?id=<id>  (no dice el tipo → se acepta como cualquiera)
 * Devuelve null si no parece un enlace de Drive.
 */
export function parseDriveLink(input: string): ParsedDriveLink | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!DRIVE_HOSTS.has(u.hostname.toLowerCase())) return null;

  const parts = u.pathname.split("/").filter(Boolean);
  const url = `https://${u.hostname.toLowerCase()}${u.pathname}${u.search}`;

  const folderIdx = parts.indexOf("folders");
  if (folderIdx >= 0 && DRIVE_ID.test(parts[folderIdx + 1] ?? "")) {
    return { kind: "folder", id: parts[folderIdx + 1], url };
  }
  const dIdx = parts.indexOf("d");
  if (dIdx >= 1 && DRIVE_ID.test(parts[dIdx + 1] ?? "")) {
    return { kind: "file", id: parts[dIdx + 1], url };
  }
  const openId = u.searchParams.get("id");
  if (parts[0] === "open" && openId && DRIVE_ID.test(openId)) {
    return { kind: "unknown", id: openId, url };
  }
  return null;
}

/** Enlace de carpeta válido → url normalizada; si no, null. */
export function driveFolderUrl(input: string): string | null {
  const p = parseDriveLink(input);
  return p && p.kind !== "file" ? p.url : null;
}

/** Enlace de documento válido (archivo de Drive/Docs) → url normalizada; si no, null. */
export function driveFileUrl(input: string): string | null {
  const p = parseDriveLink(input);
  return p && p.kind !== "folder" ? p.url : null;
}

// ── Importes escritos a mano ──────────────────────────────────────────────────

/**
 * "4.850" → 4850 · "4850,5" → 4850.5 · "1.234.567,89" → 1234567.89 · "4850.50" → 4850.5.
 * Con coma, los puntos son miles. Sin coma, el punto es de miles solo si agrupa de tres
 * en tres; si no, es decimal. Texto no numérico → undefined (nunca 0).
 */
export function parseAmountEs(input: string): number | undefined {
  let s = (input ?? "").replace(/[\s€]/g, "");
  if (!s) return undefined;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// ── Borrado con marca (tombstone) y fusión de sincronización ───────────────────
//
// Un gasto o préstamo real borrado NO desaparece de la lista sincronizable: se queda con
// `deletedAt` (y `updatedAt` = ese instante). Así su borrado viaja a los demás
// dispositivos y gana a las copias antiguas que aún lo tengan activo. La UI, los totales,
// Económico, Resumen, mapa y métricas del inversor solo ven los ACTIVOS.
//
// Regla de conflicto (por id): gana la versión con `updatedAt` más reciente; en empate,
// gana el borrado. Una edición legítima POSTERIOR a un borrado lo revive; una copia
// anterior, nunca. Las marcas se conservan sin caducidad: el volumen es de decenas de
// elementos por operación.
//
// Clientes con código anterior tratan `deletedAt` como un campo desconocido: conservan la
// marca al fusionar y reenviar (no la pierden), aunque mostrarían el elemento hasta
// recargar con la versión nueva.

export type RealFinanceItem = { id: string; updatedAt?: string; deletedAt?: string };

export const isActiveRealFinanceItem = (x: { deletedAt?: string } | null | undefined): boolean => !!x && !x.deletedAt;

function versionOf(x: RealFinanceItem): number {
  const t = Date.parse(x.updatedAt ?? x.deletedAt ?? "");
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

/** Marca un elemento como borrado. La marca siempre es posterior a su última versión. */
export function markRealFinanceDeleted<T extends RealFinanceItem>(item: T, nowISO: string = new Date().toISOString()): T {
  const now = Date.parse(nowISO);
  const stamp = new Date(Math.max(Number.isFinite(now) ? now : Date.now(), versionOf(item) + 1)).toISOString();
  return { ...item, deletedAt: stamp, updatedAt: stamp };
}

/**
 * Fusión por id con tombstones. Orden estable: primero `a`, después los ids nuevos de `b`.
 * Elementos sin id (datos ajenos) se conservan tal cual desde `a`.
 */
export function mergeRealFinanceItems<T extends RealFinanceItem>(a: T[] | undefined, b: T[] | undefined): T[] {
  const winners = new Map<string, T>();
  const order: string[] = [];
  const noId: T[] = [];
  for (const [side, list] of [["a", a], ["b", b]] as const) {
    for (const x of Array.isArray(list) ? list : []) {
      if (!x || typeof x.id !== "string" || !x.id) {
        if (side === "a" && x) noId.push(x);
        continue;
      }
      const current = winners.get(x.id);
      if (!current) {
        winners.set(x.id, x);
        order.push(x.id);
        continue;
      }
      const vx = versionOf(x);
      const vc = versionOf(current);
      if (vx > vc || (vx === vc && !!x.deletedAt && !current.deletedAt)) winners.set(x.id, x);
    }
  }
  return [...order.map((id) => winners.get(id) as T), ...noId];
}

/** Colecciones de la operación que se borran con marca y se fusionan por id. */
export const TOMBSTONED_COLLECTIONS = ["realExpenses", "realLoans", "expenses", "sales"] as const;

type TombstonedCollections = Pick<REOperation, (typeof TOMBSTONED_COLLECTIONS)[number]>;

/**
 * Fusiona gastos reales, préstamos reales, gastos previstos (`expenses`) y fichas de venta
 * (`sales`, con sus cobros) de dos copias de la MISMA operación. Por id gana la versión más
 * reciente; en empate, el borrado. Solo devuelve las claves que existen en alguna de las dos,
 * para no añadir campos a operaciones que no los usan.
 */
export function mergeRealFinancesOf(
  local: Partial<TombstonedCollections> | null | undefined,
  remote: Partial<TombstonedCollections> | null | undefined,
): Partial<TombstonedCollections> {
  const out: Record<string, unknown> = {};
  for (const key of TOMBSTONED_COLLECTIONS) {
    const l = local?.[key] as RealFinanceItem[] | undefined;
    const r = remote?.[key] as RealFinanceItem[] | undefined;
    if (Array.isArray(l) || Array.isArray(r)) out[key] = mergeRealFinanceItems(l, r);
  }
  return out as Partial<TombstonedCollections>;
}

/** Elementos no borrados de una colección con marca de borrado. */
export function activeItems<T extends { deletedAt?: string }>(list: T[] | null | undefined): T[] {
  return (Array.isArray(list) ? list : []).filter(isActiveRealFinanceItem);
}

/** Préstamos reales activos (sin los borrados). */
export function activeRealLoans(op: Pick<REOperation, "realLoans">): RERealLoan[] {
  return (Array.isArray(op?.realLoans) ? op.realLoans : []).filter(isActiveRealFinanceItem);
}

// ── Fuente única del gasto real ───────────────────────────────────────────────
//
// El gasto real vive SOLO en `realExpenses`. La columna "Real" de Económico ya no se
// escribe: es la suma de los gastos reales vinculados a cada partida (`budgetLineId`).
//
// Datos antiguos: una partida puede traer todavía `real` (escrito antes de la
// unificación, o por una versión vieja de la APP). Ese importe se trata como un gasto
// real vinculado con id DETERMINISTA (`rexp_legacy_<partida>`): WEB y APP generan el
// mismo id, así que la fusión por id del sync no lo duplica. Si la partida vuelve a
// traer `real`, ese valor más reciente sustituye al del gasto con ese id.

export const LEGACY_REAL_EXPENSE_PREFIX = "rexp_legacy_";

const hasLegacyReal = (e: REExpense): boolean => e != null && Object.prototype.hasOwnProperty.call(e, "real");

function legacyRealExpense(line: REExpense, previous?: RERealExpense): RERealExpense {
  const date = line.date || (line.createdAt ?? "").slice(0, 10);
  return {
    ...(previous ?? {}),
    id: `${LEGACY_REAL_EXPENSE_PREFIX}${line.id}`,
    concept: previous?.concept || line.concept?.trim() || "Partida sin concepto",
    amount: line.real as number,
    date: previous?.date || date,
    category: previous?.category ?? line.category,
    budgetLineId: line.id,
    createdAt: previous?.createdAt ?? line.createdAt ?? new Date().toISOString(),
    updatedAt: line.updatedAt ?? previous?.updatedAt ?? new Date().toISOString(),
  };
}

/** Todos los gastos reales (con marcas de borrado), incluidos los `real` legados sin convertir. */
function realExpensesWithLegacy(op: Pick<REOperation, "realExpenses" | "expenses">): RERealExpense[] {
  const rows: RERealExpense[] = Array.isArray(op?.realExpenses) ? op.realExpenses : [];
  const lines: REExpense[] = Array.isArray(op?.expenses) ? op.expenses : [];
  const legacy = lines.filter((l) => hasLegacyReal(l) && isNum(l.real) && l.real !== 0);
  if (!legacy.length) return rows;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = [...rows];
  for (const line of legacy) {
    const id = `${LEGACY_REAL_EXPENSE_PREFIX}${line.id}`;
    const previous = byId.get(id);
    if (previous?.deletedAt) continue; // borrado: un `real` antiguo no lo revive
    const next = legacyRealExpense(line, previous);
    const idx = out.findIndex((r) => r.id === id);
    if (idx >= 0) out[idx] = next;
    else out.push(next);
  }
  return out;
}

/** Gastos reales ACTIVOS de la operación, incluidos los importes `real` legados aún sin convertir. */
export function effectiveRealExpenses(op: Pick<REOperation, "realExpenses" | "expenses">): RERealExpense[] {
  return realExpensesWithLegacy(op).filter(isActiveRealFinanceItem);
}

/**
 * Patch que convierte los `real` legados en gastos reales y los retira de las partidas.
 * `null` si no hay nada que convertir (la operación ya está unificada).
 */
export function adoptLegacyRealAmounts(
  op: Pick<REOperation, "realExpenses" | "expenses">,
): Pick<REOperation, "realExpenses" | "expenses"> | null {
  const lines: REExpense[] = Array.isArray(op?.expenses) ? op.expenses : [];
  if (!lines.some(hasLegacyReal)) return null;
  return {
    realExpenses: realExpensesWithLegacy(op),
    expenses: lines.map((l) => {
      if (!hasLegacyReal(l)) return l;
      const { real: _legacy, ...rest } = l;
      return rest;
    }),
  };
}

/** "Real" de una partida de Económico: suma de sus gastos reales; undefined si no tiene. */
export function budgetLineReal(realExpenses: RERealExpense[], lineId: string): number | undefined {
  let total: number | undefined;
  for (const r of realExpenses) {
    if (r.budgetLineId === lineId && isNum(r.amount)) total = (total ?? 0) + r.amount;
  }
  return total;
}

// ── Interruptor de la ficha ───────────────────────────────────────────────────

/**
 * ¿Se muestra "Finanzas reales" en la ficha? Manda el interruptor guardado; si nunca se ha
 * tocado, está activo solo cuando la operación ya tiene datos reales (así no se ocultan).
 * Desactivarlo oculta la sección y la situación real, pero no borra datos.
 */
export function isRealFinancesEnabled(
  op: Pick<REOperation, "realFinancesEnabled" | "realExpenses" | "realLoans" | "invoicesDriveFolder" | "expenses">,
): boolean {
  if (typeof op?.realFinancesEnabled === "boolean") return op.realFinancesEnabled;
  return effectiveRealExpenses(op).length > 0 || activeRealLoans(op).length > 0 || !!op?.invoicesDriveFolder;
}

// ── Agregados ─────────────────────────────────────────────────────────────────

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export type RealExpenseTotals = {
  count: number;
  total: number;
  withoutDocument: number; // gastos sin enlace a documento
  lastDate: string | null;
};

export function realExpenseTotals(op: Pick<REOperation, "realExpenses" | "expenses">): RealExpenseTotals {
  const rows = effectiveRealExpenses(op);
  let total = 0;
  let withoutDocument = 0;
  let lastDate: string | null = null;
  for (const e of rows) {
    if (isNum(e.amount)) total += e.amount;
    if (!e.documentUrl) withoutDocument += 1;
    if (e.date && (lastDate == null || e.date > lastDate)) lastDate = e.date;
  }
  return { count: rows.length, total, withoutDocument, lastDate };
}

export type RealLoanTotals = {
  count: number;
  activeCount: number;
  financed: number; // suma del capital inicial de todos los préstamos
  /** Capital pendiente de los activos; null si algún activo no lo tiene informado. */
  outstanding: number | null;
  /** Cuotas de los activos llevadas a mes; null si ningún activo tiene cuota. */
  monthlyInstallments: number | null;
};

export function realLoanTotals(op: Pick<REOperation, "realLoans">): RealLoanTotals {
  const rows = activeRealLoans(op);
  const active = rows.filter((l) => l.status !== "AMORTIZADO");
  const financed = rows.reduce((s, l) => s + (isNum(l.principal) ? l.principal : 0), 0);
  const outstanding = active.every((l) => isNum(l.outstanding))
    ? active.reduce((s, l) => s + (l.outstanding as number), 0)
    : null;
  const withInstallment = active.filter((l) => isNum(l.installment));
  const monthlyInstallments = withInstallment.length
    ? withInstallment.reduce((s, l) => s + ((l.installment as number) * RE_LOAN_PERIODS_PER_YEAR[l.periodicity ?? "MENSUAL"]) / 12, 0)
    : null;
  return { count: rows.length, activeCount: active.length, financed, outstanding, monthlyInstallments };
}

export type RealVsPlanned = {
  spent: RealExpenseTotals;
  loans: RealLoanTotals;
  /** Gasto real / inversión total prevista (0-∞); null sin previsión o sin gasto. */
  spentOfPlannedPct: number | null;
  hasData: boolean;
};

/** Situación real frente a la previsión del simulador. No mezcla una con otra. */
export function realVsPlanned(op: REOperation, planned: Pick<REResults, "totalInvestment">): RealVsPlanned {
  const spent = realExpenseTotals(op);
  const loans = realLoanTotals(op);
  const spentOfPlannedPct = spent.count > 0 && planned.totalInvestment > 0 ? spent.total / planned.totalInvestment : null;
  return { spent, loans, spentOfPlannedPct, hasData: spent.count > 0 || loans.count > 0 };
}

// src/lib/balance.ts — Módulo BALANCE: tipos + cálculo puro.
// CONTRATO COMPARTIDO: este archivo es IDÉNTICO a APP/models/balance.ts.
// Los tres conceptos (Titular, Cuenta, Préstamo) viajan en la MISMA tabla
// Supabase `balance_items` (envoltorio estándar id/user_id/data/timestamps),
// discriminados por `kind` dentro de `data`. Un solo tipo de entidad de sync en
// ambas plataformas ⇒ una sola política de merge y de borrado.
//
// ponytail: una tabla con discriminador `kind` en vez de tres tablas. El volumen
// es de decenas de filas por usuario; si algún día hicieran falta índices o RLS
// por tipo, se separa en balance_holders / balance_accounts / balance_loans.

export type BalanceKind = "HOLDER" | "ACCOUNT" | "LOAN";

/** Titular: el usuario a título particular o una de sus sociedades. */
export type HolderType = "PARTICULAR" | "SOCIEDAD";

type BalanceBase = {
  id: string;
  order?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /** Tombstone de fila (lo escribe el motor de sync, no la UI). */
  deleted?: boolean;
};

export type BalanceHolder = BalanceBase & {
  kind: "HOLDER";
  name: string;
  type: HolderType;
};

export type BalanceAccount = BalanceBase & {
  kind: "ACCOUNT";
  /** Entidad bancaria — ej. "CaixaBank". */
  bank: string;
  /** Nombre corto de la cuenta — ej. "Operativa". */
  alias: string;
  holderId: string | null;
  /** Saldo en euros. */
  balance: number;
  /** Fecha (YYYY-MM-DD) a la que corresponde el saldo. */
  balanceDate?: string;
};

export type BalanceLoan = BalanceBase & {
  kind: "LOAN";
  alias: string;
  /**
   * @deprecated Entidad prestamista. Retirada de la interfaz: la cuenta de cargo
   * ya identifica al banco, así que pedirla era redundante. Se conserva OPCIONAL
   * en el tipo para no romper los préstamos que la tengan guardada (se lee y se
   * vuelve a escribir tal cual en el sync); no se pide ni se muestra en ninguna
   * pantalla y las altas nuevas no la crean.
   */
  lender?: string;
  holderId: string | null;
  /** Capital pendiente en euros. */
  outstanding: number;
  /** Cuota mensual en euros. */
  installment: number;
  /** Día del mes en que se carga la cuota (1–31). */
  chargeDay?: number;
  /** Cuenta desde la que se carga la cuota. */
  accountId: string | null;
};

export type BalanceItem = BalanceHolder | BalanceAccount | BalanceLoan;

// ── Guardas de tipo ───────────────────────────────────────────────────────────

export const isHolder = (i: BalanceItem): i is BalanceHolder => i.kind === "HOLDER";
export const isAccount = (i: BalanceItem): i is BalanceAccount => i.kind === "ACCOUNT";
export const isLoan = (i: BalanceItem): i is BalanceLoan => i.kind === "LOAN";

// ── REGLA DE NEGOCIO: la cuenta de cargo pertenece al titular del préstamo ───
//
// Es la ÚNICA definición de esa regla en todo el módulo. La consumen tanto la WEB
// (celdas inline) como la APP (hojas de selección), y también la proyección de
// lectura `splitBalance`, para que un estado inválido no pueda ni crearse ni
// mostrarse — venga de la UI, de datos antiguos o de una sincronización.

/** Vínculo titular ↔ cuenta de un préstamo. */
export type LoanLink = { holderId: string | null; accountId: string | null };

const indexAccounts = (accounts: BalanceAccount[]): Map<string, BalanceAccount> =>
  new Map(accounts.map((a) => [a.id, a]));

/**
 * Cuentas que puede usar un préstamo de `holderId`.
 * Sin titular (`null`) devuelve TODAS: elegir primero la cuenta es un flujo válido
 * y es esa elección la que fija el titular (ver `resolveLoanLink`).
 */
export function accountsOfHolder(
  accounts: BalanceAccount[],
  holderId: string | null
): BalanceAccount[] {
  if (holderId === null) return accounts;
  return accounts.filter((a) => a.holderId === holderId);
}

/**
 * Aplica un cambio de titular o de cuenta manteniendo el vínculo coherente:
 *  · cambia la CUENTA  → el titular pasa a ser el de esa cuenta (relación ya conocida);
 *  · cambia el TITULAR → si la cuenta era de otro titular, se suelta.
 * Si el cambio trae ambos campos manda la cuenta, que es el dato más específico.
 * Nunca devuelve un titular A con una cuenta de un titular B.
 */
export function resolveLoanLink(
  current: LoanLink,
  patch: Partial<LoanLink>,
  accounts: BalanceAccount[]
): LoanLink {
  const byId = indexAccounts(accounts);
  const holderId = patch.holderId !== undefined ? patch.holderId : current.holderId;
  const accountId = patch.accountId !== undefined ? patch.accountId : current.accountId;

  if (patch.accountId !== undefined) {
    const acc = accountId ? byId.get(accountId) : undefined;
    // Cuenta elegida (o inexistente/ninguna): la cuenta manda sobre el titular.
    return acc ? { holderId: acc.holderId, accountId: acc.id } : { holderId, accountId: null };
  }

  if (patch.holderId !== undefined) {
    const acc = accountId ? byId.get(accountId) : undefined;
    if (acc && acc.holderId === holderId) return { holderId, accountId: acc.id };
    return { holderId, accountId: null }; // la cuenta ya no encaja con el titular
  }

  return { holderId, accountId };
}

/** ¿El vínculo es válido? (sin cuenta también lo es). */
export function isLoanLinkValid(link: LoanLink, accounts: BalanceAccount[]): boolean {
  if (!link.accountId) return true;
  const acc = indexAccounts(accounts).get(link.accountId);
  return !!acc && acc.holderId === link.holderId;
}

/**
 * Proyección de lectura: devuelve el vínculo ya saneado.
 *  · cuenta borrada            → se suelta la cuenta;
 *  · cuenta de otro titular    → se suelta la cuenta;
 *  · préstamo aún sin titular  → adopta el de la cuenta (coherente con la regla de arriba).
 * No escribe nada: el valor guardado se corrige solo en la siguiente edición.
 */
function sanitizeLink(link: LoanLink, byId: Map<string, BalanceAccount>): LoanLink {
  if (!link.accountId) return link;
  const acc = byId.get(link.accountId);
  if (!acc) return { holderId: link.holderId, accountId: null };
  if (acc.holderId === link.holderId) return link;
  if (link.holderId === null) return { holderId: acc.holderId, accountId: acc.id };
  return { holderId: link.holderId, accountId: null };
}

/** `sanitizeLink` para un préstamo suelto (misma regla, API pública). */
export function sanitizeLoanLink(loan: BalanceLoan, accounts: BalanceAccount[]): BalanceLoan {
  const fixed = sanitizeLink({ holderId: loan.holderId, accountId: loan.accountId }, indexAccounts(accounts));
  return fixed.holderId === loan.holderId && fixed.accountId === loan.accountId
    ? loan
    : { ...loan, ...fixed };
}

const byOrder = (a: BalanceBase, b: BalanceBase): number =>
  (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || "").localeCompare(b.createdAt || "");

/** Reparte la colección plana en las tres listas del módulo, ya ordenadas. */
export function splitBalance(items: BalanceItem[]): {
  holders: BalanceHolder[];
  accounts: BalanceAccount[];
  loans: BalanceLoan[];
} {
  const list = Array.isArray(items) ? items.filter((i) => i && !i.deleted) : [];
  const accounts = list.filter(isAccount).sort(byOrder);
  const byId = indexAccounts(accounts);

  // Los préstamos se devuelven con el vínculo titular↔cuenta ya saneado: ninguna
  // pantalla puede pintar una combinación inválida aunque llegue de datos antiguos
  // o de una cuenta que otro dispositivo acaba de borrar o reasignar.
  const loans = list.filter(isLoan).sort(byOrder).map((l) => {
    const fixed = sanitizeLink({ holderId: l.holderId, accountId: l.accountId }, byId);
    return fixed.holderId === l.holderId && fixed.accountId === l.accountId ? l : { ...l, ...fixed };
  });

  return { holders: list.filter(isHolder).sort(byOrder), accounts, loans };
}

// ── Factorías ─────────────────────────────────────────────────────────────────

const stamp = (nowISO: string) => ({ createdAt: nowISO, updatedAt: nowISO });

export function newHolder(id: string, nowISO: string, order = 0): BalanceHolder {
  return { id, kind: "HOLDER", name: "", type: "SOCIEDAD", order, ...stamp(nowISO) };
}

export function newAccount(id: string, nowISO: string, order = 0): BalanceAccount {
  return {
    id,
    kind: "ACCOUNT",
    bank: "",
    alias: "",
    holderId: null,
    balance: 0,
    balanceDate: nowISO.slice(0, 10),
    order,
    ...stamp(nowISO),
  };
}

export function newLoan(id: string, nowISO: string, order = 0): BalanceLoan {
  return {
    id,
    kind: "LOAN",
    alias: "",
    holderId: null,
    outstanding: 0,
    installment: 0,
    chargeDay: 1,
    accountId: null,
    order,
    ...stamp(nowISO),
  };
}

// ── Filtro por titular ────────────────────────────────────────────────────────

/** `holderId === null` significa "Todos" (sin filtrar). */
export function filterByHolder<T extends { holderId: string | null }>(
  rows: T[],
  holderId: string | null
): T[] {
  if (holderId === null) return rows;
  return rows.filter((r) => r.holderId === holderId);
}

// ── Resumen financiero ────────────────────────────────────────────────────────

export type BalanceSummary = {
  /** Suma de saldos de las cuentas visibles. */
  available: number;
  /** Suma de capital pendiente de los préstamos visibles. */
  debt: number;
  /** Suma de cuotas mensuales de los préstamos visibles. */
  monthlyInstalments: number;
  /** Posición neta = disponible − deuda. */
  net: number;
};

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export function summarize(accounts: BalanceAccount[], loans: BalanceLoan[]): BalanceSummary {
  const available = sum(accounts.map((a) => num(a.balance)));
  const debt = sum(loans.map((l) => num(l.outstanding)));
  const monthlyInstalments = sum(loans.map((l) => num(l.installment)));
  return { available, debt, monthlyInstalments, net: available - debt };
}

// ── Próximos cargos ───────────────────────────────────────────────────────────

/** Nº de días del mes (year, monthIndex 0–11). */
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

const iso = (year: number, monthIndex: number, day: number): string =>
  `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/**
 * Próxima fecha (YYYY-MM-DD) en que se carga una cuota de día `chargeDay`,
 * contando desde `fromISO` (incluido). El día se recorta al último del mes:
 * un cargo el 31 se cobra el 28/29/30 en los meses que no tienen 31.
 */
export function nextChargeDate(chargeDay: number, fromISO: string): string | null {
  const day = Math.trunc(chargeDay);
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  const [y, m, d] = fromISO.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;

  const thisMonth = Math.min(day, daysInMonth(y, m - 1));
  if (thisMonth >= d) return iso(y, m - 1, thisMonth);

  // m es 1-based, así que `m` ya es el índice 0-based del mes SIGUIENTE.
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 0 : m;
  return iso(nextY, nextM, Math.min(day, daysInMonth(nextY, nextM)));
}

/** Días naturales entre dos fechas YYYY-MM-DD (b − a). */
export function daysBetween(aISO: string, bISO: string): number {
  const a = Date.parse(`${aISO.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${bISO.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export type UpcomingCharge = {
  loanId: string;
  alias: string;
  /** Titular del préstamo, para que la vista lo resuelva a nombre. */
  holderId: string | null;
  amount: number;
  dateISO: string;
  daysAway: number;
  /** Etiqueta de la cuenta de cargo, o null si no hay cuenta asociada. */
  accountLabel: string | null;
};

/** Etiqueta legible de una cuenta: "CaixaBank · Operativa". */
export function accountLabel(a: BalanceAccount | undefined | null): string | null {
  if (!a) return null;
  const parts = [a.bank?.trim(), a.alias?.trim()].filter(Boolean);
  return parts.length ? parts.join(" · ") : "(cuenta sin nombre)";
}

/**
 * Siguiente cargo de cada préstamo con día de cargo, ordenado por fecha.
 * Los préstamos sin `chargeDay` no generan cargo previsible y se omiten.
 */
export function upcomingCharges(
  loans: BalanceLoan[],
  accounts: BalanceAccount[],
  todayISODate: string
): UpcomingCharge[] {
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const out: UpcomingCharge[] = [];

  for (const loan of loans) {
    if (loan.chargeDay == null) continue;
    const dateISO = nextChargeDate(loan.chargeDay, todayISODate);
    if (!dateISO) continue;
    out.push({
      loanId: loan.id,
      alias: loan.alias || "(sin alias)",
      holderId: loan.holderId,
      amount: num(loan.installment),
      dateISO,
      daysAway: daysBetween(todayISODate.slice(0, 10), dateISO),
      accountLabel: accountLabel(loan.accountId ? accById.get(loan.accountId) : null),
    });
  }

  return out.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.alias.localeCompare(b.alias));
}

/** Fecha local de hoy en formato YYYY-MM-DD (sin desfase UTC). */
export function todayISO(now: Date = new Date()): string {
  return iso(now.getFullYear(), now.getMonth(), now.getDate());
}

"use client";

// src/components/balance/BalanceSection.tsx — Módulo BALANCE (WEB).
//
// Resumen financiero + titulares + cuentas + préstamos + próximos cargos, con
// EDICIÓN INLINE desde la propia celda: cada campo se corrige escribiendo encima
// y los totales se recalculan en el mismo render (son derivados, no estado).
//
// Los datos NO se leen ni escriben contra Supabase desde aquí: todo pasa por
// SyncContext (`balanceItems`), el mismo motor que usa la APP sobre la tabla
// `balance_items`. Alta/edición/borrado marcan dirty y suben con debounce.

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useSync } from "@/src/sync";
import { StatTile } from "@/src/components/ui/StatTile";
import {
  DataTable,
  DateCellInput,
  NumberCellInput,
  SelectCellInput,
  TextCellInput,
  type DataTableColumn,
} from "@/src/components/ui/DataTable";
import { fmtEUR } from "@/src/lib/realEstateCalc";
import {
  accountLabel,
  accountsOfHolder,
  filterByHolder,
  newAccount,
  newHolder,
  newLoan,
  resolveLoanLink,
  splitBalance,
  summarize,
  todayISO,
  upcomingCharges,
  type BalanceAccount,
  type BalanceHolder,
  type BalanceItem,
  type BalanceLoan,
  type HolderType,
} from "@/src/lib/balance";

const HIDE_KEY = "balance_hideAmounts";
const MASK = "••••";

const HOLDER_TYPES: { value: HolderType; label: string }[] = [
  { value: "PARTICULAR", label: "Particular" },
  { value: "SOCIEDAD", label: "Sociedad" },
];

/** Formatea un importe respetando el interruptor de privacidad. */
const money = (v: number, hidden: boolean): string => (hidden ? MASK : fmtEUR(v));

const fmtDate = (isoDate: string): string => {
  const [y, m, d] = isoDate.split("-");
  return y && m && d ? `${d}/${m}/${y}` : isoDate;
};

export function BalanceSection() {
  const { balanceItems, setBalanceItem, deleteBalanceItem } = useSync();

  // Filtro por titular: null = "Todos".
  const [holderFilter, setHolderFilter] = useState<string | null>(null);
  // Privacidad: preferencia recordada en ESTE navegador. Inicializador perezoso —
  // AppGate no monta esta sección hasta que hay sesión (siempre en cliente), así
  // que no hay divergencia de hidratación. Si el almacenamiento está bloqueado
  // (modo privado), los importes se quedan visibles.
  const [hideAmounts, setHideAmounts] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(HIDE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggleHide = useCallback(() => {
    setHideAmounts((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(HIDE_KEY, next ? "1" : "0");
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const { holders, accounts, loans } = useMemo(
    () => splitBalance(balanceItems as BalanceItem[]),
    [balanceItems]
  );

  // Si el titular filtrado deja de existir (lo borró este u otro dispositivo),
  // el filtro se DERIVA a "Todos" en el propio render — nada de efectos que
  // corrijan estado después de pintar una vista vacía apuntando a un id fantasma.
  const activeHolder = useMemo(
    () => (holderFilter && holders.some((h) => h.id === holderFilter) ? holderFilter : null),
    [holderFilter, holders]
  );

  const visibleAccounts = useMemo(
    () => filterByHolder(accounts, activeHolder),
    [accounts, activeHolder]
  );
  const visibleLoans = useMemo(() => filterByHolder(loans, activeHolder), [loans, activeHolder]);
  const summary = useMemo(
    () => summarize(visibleAccounts, visibleLoans),
    [visibleAccounts, visibleLoans]
  );
  const charges = useMemo(
    () => upcomingCharges(visibleLoans, accounts, todayISO()),
    [visibleLoans, accounts]
  );

  // ── Mutaciones ──────────────────────────────────────────────────────────────

  const patch = useCallback(
    <T extends BalanceItem>(row: T, changes: Partial<T>) => {
      setBalanceItem({ ...row, ...changes } as BalanceItem);
    },
    [setBalanceItem]
  );

  // Titular y cuenta de un préstamo NUNCA se escriben sueltos: pasan por la regla
  // compartida `resolveLoanLink`, única definición de "la cuenta de cargo pertenece
  // al titular del préstamo" (src/lib/balance.ts). La APP usa exactamente la misma.
  const patchLoanLink = useCallback(
    (row: BalanceLoan, change: { holderId?: string | null; accountId?: string | null }) => {
      const link = resolveLoanLink({ holderId: row.holderId, accountId: row.accountId }, change, accounts);
      setBalanceItem({ ...row, ...link });
    },
    [accounts, setBalanceItem]
  );

  const removeRow = useCallback(
    (id: string, label: string) => {
      if (!window.confirm(`¿Eliminar ${label}? Se borrará también en la app.`)) return;
      deleteBalanceItem(id);
    },
    [deleteBalanceItem]
  );

  const nextOrder = (rows: { order?: number }[]) =>
    rows.reduce((max, r) => Math.max(max, r.order ?? 0), 0) + 1;

  const addHolder = useCallback(() => {
    const item = newHolder(crypto.randomUUID(), new Date().toISOString(), nextOrder(holders));
    setBalanceItem(item);
  }, [holders, setBalanceItem]);

  const addAccount = useCallback(() => {
    const item = newAccount(crypto.randomUUID(), new Date().toISOString(), nextOrder(accounts));
    // Con un titular filtrado, la nueva fila nace ya asignada a ese titular.
    setBalanceItem({ ...item, holderId: activeHolder });
  }, [accounts, activeHolder, setBalanceItem]);

  const addLoan = useCallback(() => {
    const item = newLoan(crypto.randomUUID(), new Date().toISOString(), nextOrder(loans));
    setBalanceItem({ ...item, holderId: activeHolder });
  }, [loans, activeHolder, setBalanceItem]);

  // ── Opciones de selectores ──────────────────────────────────────────────────

  const holderOptions = useMemo(
    () => [
      { value: "", label: "— Sin titular —" },
      ...holders.map((h) => ({ value: h.id, label: h.name || "(sin nombre)" })),
    ],
    [holders]
  );

  const holderName = useCallback(
    (id: string | null) => holders.find((h) => h.id === id)?.name || "Sin titular",
    [holders]
  );

  /**
   * Cuentas ofrecibles a un préstamo de `holderId`, con su saldo a la vista para
   * distinguirlas de un vistazo. Sin titular se ofrecen todas: elegir primero la
   * cuenta es un flujo válido y es esa elección la que fija el titular.
   * El saldo respeta el interruptor de privacidad.
   */
  const accountOptionsFor = useCallback(
    (holderId: string | null) => [
      { value: "", label: "— Sin cuenta —" },
      ...accountsOfHolder(accounts, holderId).map((a) => ({
        value: a.id,
        label: `${accountLabel(a)} · ${money(a.balance, hideAmounts)}`,
      })),
    ],
    [accounts, hideAmounts]
  );

  // ── Columnas ────────────────────────────────────────────────────────────────

  const holderColumns: DataTableColumn<BalanceHolder>[] = [
    {
      key: "name",
      header: "Nombre",
      cell: (row) => (
        <TextCellInput
          value={row.name}
          placeholder="Particular / Ventana al Futuro…"
          onChange={(v) => patch(row, { name: v })}
        />
      ),
    },
    {
      key: "type",
      header: "Tipo",
      width: "11rem",
      cell: (row) => (
        <SelectCellInput
          value={row.type}
          options={HOLDER_TYPES}
          onChange={(v) => patch(row, { type: v })}
        />
      ),
    },
    {
      key: "counts",
      header: "Cuentas / Préstamos",
      width: "12rem",
      align: "right",
      cell: (row) => (
        <span className="px-1.5 text-sm tabular-nums text-ink-subtle">
          {accounts.filter((a) => a.holderId === row.id).length} /{" "}
          {loans.filter((l) => l.holderId === row.id).length}
        </span>
      ),
    },
  ];

  const accountColumns: DataTableColumn<BalanceAccount>[] = [
    {
      key: "bank",
      header: "Banco",
      width: "12rem",
      cell: (row) => (
        <TextCellInput
          value={row.bank}
          placeholder="CaixaBank"
          onChange={(v) => patch(row, { bank: v })}
        />
      ),
    },
    {
      key: "alias",
      header: "Alias",
      cell: (row) => (
        <TextCellInput
          value={row.alias}
          placeholder="Operativa"
          onChange={(v) => patch(row, { alias: v })}
        />
      ),
    },
    {
      key: "holder",
      header: "Titular",
      width: "13rem",
      cell: (row) => (
        <SelectCellInput
          value={row.holderId ?? ""}
          options={holderOptions}
          onChange={(v) => patch(row, { holderId: v || null })}
        />
      ),
    },
    {
      key: "balance",
      header: "Saldo",
      width: "10rem",
      align: "right",
      cell: (row) =>
        hideAmounts ? (
          <span className="block px-1.5 text-right text-sm tabular-nums text-ink-subtle">{MASK}</span>
        ) : (
          <NumberCellInput value={row.balance} onChange={(v) => patch(row, { balance: v ?? 0 })} />
        ),
    },
    {
      key: "balanceDate",
      header: "Actualizado",
      width: "9.5rem",
      cell: (row) => (
        <DateCellInput
          value={row.balanceDate}
          onChange={(v) => patch(row, { balanceDate: v })}
        />
      ),
    },
  ];

  const loanColumns: DataTableColumn<BalanceLoan>[] = [
    {
      key: "alias",
      header: "Alias",
      cell: (row) => (
        <TextCellInput
          value={row.alias}
          placeholder="Hipoteca nave"
          onChange={(v) => patch(row, { alias: v })}
        />
      ),
    },
    {
      key: "holder",
      header: "Titular",
      width: "13rem",
      cell: (row) => (
        <SelectCellInput
          value={row.holderId ?? ""}
          options={holderOptions}
          onChange={(v) => patchLoanLink(row, { holderId: v || null })}
        />
      ),
    },
    {
      key: "outstanding",
      header: "Capital pendiente",
      width: "10rem",
      align: "right",
      cell: (row) =>
        hideAmounts ? (
          <span className="block px-1.5 text-right text-sm tabular-nums text-ink-subtle">{MASK}</span>
        ) : (
          <NumberCellInput
            value={row.outstanding}
            onChange={(v) => patch(row, { outstanding: v ?? 0 })}
          />
        ),
    },
    {
      key: "installment",
      header: "Cuota",
      width: "8.5rem",
      align: "right",
      cell: (row) =>
        hideAmounts ? (
          <span className="block px-1.5 text-right text-sm tabular-nums text-ink-subtle">{MASK}</span>
        ) : (
          <NumberCellInput
            value={row.installment}
            onChange={(v) => patch(row, { installment: v ?? 0 })}
          />
        ),
    },
    {
      key: "chargeDay",
      header: "Día de cargo",
      width: "7.5rem",
      align: "right",
      cell: (row) => (
        <NumberCellInput
          value={row.chargeDay}
          placeholder="1–31"
          onChange={(v) => patch(row, { chargeDay: clampDay(v) })}
        />
      ),
    },
    {
      key: "account",
      header: "Cuenta asociada",
      width: "19rem",
      cell: (row) => (
        <SelectCellInput
          value={row.accountId ?? ""}
          options={accountOptionsFor(row.holderId)}
          onChange={(v) => patchLoanLink(row, { accountId: v || null })}
        />
      ),
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-7">
      {/* Filtro por titular + privacidad */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            label="Todos"
            active={activeHolder === null}
            onClick={() => setHolderFilter(null)}
          />
          {holders.map((h) => (
            <FilterChip
              key={h.id}
              label={h.name || "(sin nombre)"}
              active={activeHolder === h.id}
              onClick={() => setHolderFilter(h.id)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={toggleHide}
          aria-pressed={hideAmounts}
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-[var(--surface-alt)]"
        >
          {hideAmounts ? "Mostrar importes" : "Ocultar importes"}
        </button>
      </div>

      {/* Resumen financiero */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Dinero disponible"
          value={money(summary.available, hideAmounts)}
          tone="positive"
          hint={`${visibleAccounts.length} cuenta(s)`}
        />
        <StatTile
          label="Deuda pendiente"
          value={money(summary.debt, hideAmounts)}
          tone="negative"
          hint={`${visibleLoans.length} préstamo(s)`}
        />
        <StatTile
          label="Cuotas mensuales"
          value={money(summary.monthlyInstalments, hideAmounts)}
          hint="Suma de cuotas"
        />
        <StatTile
          label="Posición neta"
          value={money(summary.net, hideAmounts)}
          tone={summary.net >= 0 ? "positive" : "negative"}
          hint="Disponible − deuda"
        />
      </div>

      {/* Titulares */}
      <Block
        title="Titulares"
        desc="Tú a título particular y cada sociedad. Determinan el filtro y los totales."
      >
        <DataTable
          columns={holderColumns}
          rows={holders}
          getRowId={(r) => r.id}
          onAddRow={addHolder}
          addLabel="Añadir titular"
          onDeleteRow={(r) => removeRow(r.id, `el titular «${r.name || "sin nombre"}»`)}
          emptyText="Sin titulares. Añade «Particular» y tus sociedades."
        />
      </Block>

      {/* Cuentas */}
      <Block title="Cuentas" desc="Edita cualquier dato escribiendo directamente en la celda.">
        <DataTable
          columns={accountColumns}
          rows={visibleAccounts}
          getRowId={(r) => r.id}
          onAddRow={addAccount}
          addLabel="Añadir cuenta"
          onDeleteRow={(r) => removeRow(r.id, `la cuenta «${r.alias || r.bank || "sin nombre"}»`)}
          emptyText="Sin cuentas para este filtro."
          footer={
            <tr className="border-t border-line bg-[var(--surface-alt)]">
              <td className="px-2.5 py-2 text-xs font-bold uppercase tracking-wide text-ink-subtle" colSpan={3}>
                Total disponible
              </td>
              <td className="px-2.5 py-2 text-right text-sm font-extrabold tabular-nums text-ink">
                {money(summary.available, hideAmounts)}
              </td>
              <td colSpan={2} />
            </tr>
          }
        />
      </Block>

      {/* Préstamos */}
      <Block title="Préstamos" desc="Capital pendiente, cuota, día de cargo y cuenta de cobro.">
        <DataTable
          columns={loanColumns}
          rows={visibleLoans}
          getRowId={(r) => r.id}
          onAddRow={addLoan}
          addLabel="Añadir préstamo"
          onDeleteRow={(r) => removeRow(r.id, `el préstamo «${r.alias || "sin nombre"}»`)}
          emptyText="Sin préstamos para este filtro."
          footer={
            <tr className="border-t border-line bg-[var(--surface-alt)]">
              <td className="px-2.5 py-2 text-xs font-bold uppercase tracking-wide text-ink-subtle" colSpan={2}>
                Totales
              </td>
              <td className="px-2.5 py-2 text-right text-sm font-extrabold tabular-nums text-ink">
                {money(summary.debt, hideAmounts)}
              </td>
              <td className="px-2.5 py-2 text-right text-sm font-extrabold tabular-nums text-ink">
                {money(summary.monthlyInstalments, hideAmounts)}
              </td>
              <td colSpan={3} />
            </tr>
          }
        />
      </Block>

      {/* Próximos cargos */}
      <Block
        title="Próximos cargos"
        desc="Siguiente cuota de cada préstamo según su día de cargo."
      >
        {charges.length === 0 ? (
          <p className="rounded-xl border border-line px-3 py-6 text-center text-sm text-ink-subtle">
            Ningún préstamo con día de cargo definido.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-line">
            {charges.map((c) => (
              <li key={c.loanId} className="flex items-center gap-3 px-3 py-2.5">
                <div className="w-16 shrink-0 text-center">
                  <p className="text-sm font-extrabold tabular-nums text-ink">{fmtDate(c.dateISO)}</p>
                  <p className="text-[11px] text-ink-subtle">
                    {c.daysAway === 0 ? "hoy" : `en ${c.daysAway} d`}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{c.alias}</p>
                  <p className="truncate text-[11px] text-ink-subtle">
                    {[holderName(c.holderId), c.accountLabel ?? "sin cuenta asociada"]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-extrabold tabular-nums text-ink">
                  {money(c.amount, hideAmounts)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}

/** Recorta el día de cargo al rango válido; `undefined` = sin cargo previsible. */
function clampDay(v: number | undefined): number | undefined {
  if (v == null || !Number.isFinite(v)) return undefined;
  return Math.min(31, Math.max(1, Math.trunc(v)));
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${
        active
          ? "border-transparent text-white"
          : "border-line text-ink-muted hover:bg-[var(--surface-alt)]"
      }`}
      style={active ? { background: "var(--brand)" } : undefined}
    >
      {label}
    </button>
  );
}

function Block({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h2 className="text-base font-extrabold tracking-tight text-ink">{title}</h2>
        {desc ? <p className="text-xs text-ink-subtle">{desc}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default BalanceSection;

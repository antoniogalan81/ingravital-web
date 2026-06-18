import { supabase } from "@/src/lib/supabaseClient";
import { normalizeBankAccountForDbWeb, normalizeForecastSourceForDbWeb } from "./normalize";
import {
  generateId,
  type BankAccountFull,
  type ForecastLineFull,
  type ForecastMonths,
  type ForecastMonthState,
  type FinanceMovement,
} from "./financeData";

// ==================== BANK ACCOUNTS ====================

export async function fetchBankAccountsFull(): Promise<{ data: BankAccountFull[]; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { data: [], error: "No autenticado" };
  }
  const userId = session.user.id;

  const { data, error } = await supabase
    .from("bank_accounts")
    .select("id, data, deleted_at, client_updated_at, server_updated_at")
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (error) {
    console.warn("bank_accounts fetch error:", error.message);
    return { data: [], error: null };
  }

  const accounts: BankAccountFull[] = (data || []).map((row: { id: string; data: Record<string, unknown> }) => ({
    id: row.id,
    name: (row.data?.name as string) || (row.data?.title as string) || row.id,
    type: row.data?.type as "PERSONAL" | "SOCIEDAD" | undefined,
    balance: typeof row.data?.balance === "number" ? row.data.balance : 0,
    order: typeof row.data?.order === "number" ? row.data.order : 0,
    createdAt: row.data?.createdAt as string | undefined,
    updatedAt: row.data?.updatedAt as string | undefined,
  }));

  accounts.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

  return { data: accounts, error: null };
}

export async function updateBankAccountBalance(id: string, newBalance: number, existingAccount?: BankAccountFull): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { error: "No autenticado" };
  }
  const userId = session.user.id;

  const now = new Date().toISOString();

  let normalized: Record<string, unknown>;
  if (existingAccount) {
    normalized = normalizeBankAccountForDbWeb({ ...existingAccount, balance: newBalance });
  } else {
    const { data: current, error: fetchError } = await supabase
      .from("bank_accounts")
      .select("data")
      .eq("id", id)
      .eq("user_id", userId)
      .single();
    if (fetchError || !current) {
      return { error: fetchError?.message || "Cuenta no encontrada" };
    }
    const existingData = current.data as Record<string, unknown>;
    normalized = normalizeBankAccountForDbWeb({ ...(existingData as Record<string, unknown>), id, balance: newBalance, createdAt: existingData.createdAt as string | undefined });
  }

  const { error } = await supabase
    .from("bank_accounts")
    .update({
      data: normalized,
      client_updated_at: now,
      deleted_at: null,
    })
    .eq("id", id)
    .eq("user_id", userId);

  return { error: error?.message || null };
}

export async function updateBankAccountName(id: string, newName: string, existingAccount?: BankAccountFull): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { error: "No autenticado" };
  }
  const userId = session.user.id;

  const now = new Date().toISOString();

  let normalized: Record<string, unknown>;
  if (existingAccount) {
    normalized = normalizeBankAccountForDbWeb({ ...existingAccount, name: newName });
  } else {
    const { data: current, error: fetchError } = await supabase
      .from("bank_accounts")
      .select("data")
      .eq("id", id)
      .eq("user_id", userId)
      .single();
    if (fetchError || !current) {
      return { error: fetchError?.message || "Cuenta no encontrada" };
    }
    const existingData = current.data as Record<string, unknown>;
    normalized = normalizeBankAccountForDbWeb({ ...(existingData as Record<string, unknown>), id, name: newName, createdAt: existingData.createdAt as string | undefined });
  }

  const { error } = await supabase
    .from("bank_accounts")
    .update({
      data: normalized,
      client_updated_at: now,
      deleted_at: null,
    })
    .eq("id", id)
    .eq("user_id", userId);

  return { error: error?.message || null };
}

export async function deleteBankAccount(accountId: string): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { error: "No autenticado" };
  }
  const userId = session.user.id;

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("bank_accounts")
    .update({ deleted_at: now, client_updated_at: now })
    .eq("id", accountId)
    .eq("user_id", userId);

  if (error) {
    console.warn("deleteBankAccount error:", error.message);
    return { error: error.message };
  }

  return { error: null };
}

export async function persistBankAccountsOrder(accounts: BankAccountFull[]): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { error: "No autenticado" };
  }
  const userId = session.user.id;

  const now = new Date().toISOString();

  for (const acc of accounts) {
    if (acc.order === undefined) continue;

    const normalized = normalizeBankAccountForDbWeb({ ...acc });

    const { error } = await supabase
      .from("bank_accounts")
      .update({
        data: normalized,
        client_updated_at: now,
      })
      .eq("id", acc.id)
      .eq("user_id", userId);

    if (error) {
      console.warn("persistBankAccountsOrder error:", error.message);
      return { error: error.message };
    }
  }

  return { error: null };
}

// ==================== FORECAST LINES ====================

export async function fetchForecastLinesFull(): Promise<{ data: ForecastLineFull[]; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { data: [], error: "No autenticado" };
  }
  const userId = session.user.id;

  const { data, error } = await supabase
    .from("income_forecast_lines")
    .select("id, data")
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (error) {
    console.warn("income_forecast_lines fetch error:", error.message);
    return { data: [], error: null };
  }

  const lines: ForecastLineFull[] = (data || []).map((row: { id: string; data: Record<string, unknown> }) => ({
    id: row.id,
    name: (row.data?.name as string) || (row.data?.title as string) || row.id,
    type: ((row.data?.type as string) === "GASTO" ? "GASTO" : "INGRESO") as "INGRESO" | "GASTO",
    parentId: (row.data?.parentId as string) || null,
    months: (row.data?.months as ForecastMonths) || undefined,
    enabledTypes: (row.data?.enabledTypes as { INGRESO?: boolean; GASTO?: boolean }) || undefined,
    order: typeof row.data?.order === "number" ? row.data.order : undefined,
    createdAt: (row.data?.createdAt as string) || undefined,
  }));

  lines.sort((a, b) => {
    if (a.parentId === null && b.parentId !== null) return -1;
    if (a.parentId !== null && b.parentId === null) return 1;
    return (a.order ?? Infinity) - (b.order ?? Infinity);
  });

  return { data: lines, error: null };
}

export async function upsertForecastLine(line: ForecastLineFull): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { error: "No autenticado" };
  }
  const userId = session.user.id;

  const now = new Date().toISOString();
  const dataPayload = normalizeForecastSourceForDbWeb({
    ...line,
    updatedAt: now,
  } as any);

  const { error } = await supabase.from("income_forecast_lines").upsert(
    {
      id: line.id,
      user_id: userId,
      data: dataPayload,
      client_updated_at: now,
      deleted_at: null,
    },
    { onConflict: "id" }
  );

  if (error) {
    console.warn("upsertForecastLine error:", error.message);
    return { error: error.message };
  }

  return { error: null };
}

export async function deleteForecastLine(lineId: string): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { error: "No autenticado" };
  }
  const userId = session.user.id;

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("income_forecast_lines")
    .update({ deleted_at: now, client_updated_at: now })
    .eq("id", lineId)
    .eq("user_id", userId);

  if (error) {
    console.warn("deleteForecastLine error:", error.message);
    return { error: error.message };
  }

  return { error: null };
}

export async function persistForecastLinesOrder(
  updates: Array<{ id: string; order: number }>,
  existingLines?: ForecastLineFull[]
): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { error: "No autenticado" };
  }
  const userId = session.user.id;

  const now = new Date().toISOString();

  for (const upd of updates) {
    const existing = existingLines?.find(l => l.id === upd.id);
    let normalized: Record<string, unknown>;

    if (existing) {
      normalized = normalizeForecastSourceForDbWeb({
        ...existing,
        id: upd.id,
        order: upd.order,
      } as any);
    } else {
      const { data: current, error: fetchError } = await supabase
        .from("income_forecast_lines")
        .select("data")
        .eq("id", upd.id)
        .eq("user_id", userId)
        .single();
      if (fetchError || !current) continue;
      const existingData = current.data as Record<string, unknown>;
      normalized = normalizeForecastSourceForDbWeb({
        ...(existingData as Record<string, unknown>),
        id: upd.id,
        order: upd.order,
        createdAt: existingData.createdAt as string | undefined,
      } as any);
    }

    const { error } = await supabase
      .from("income_forecast_lines")
      .update({
        data: normalized,
        client_updated_at: now,
      })
      .eq("id", upd.id)
      .eq("user_id", userId);

    if (error) {
      console.warn("persistForecastLinesOrder error:", error.message);
      return { error: error.message };
    }
  }

  return { error: null };
}

export async function updateForecastMonthPrev(
  id: string,
  monthId: string,
  type: "INGRESO" | "GASTO",
  newPrev: number,
  existingLine?: ForecastLineFull
): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { error: "No autenticado" };
  }
  const userId = session.user.id;

  const now = new Date().toISOString();
  let baseData: Record<string, unknown>;
  let existingMonths: ForecastMonths;

  if (existingLine) {
    existingMonths = existingLine.months || {};
    baseData = existingLine as unknown as Record<string, unknown>;
  } else {
    const { data: current, error: fetchError } = await supabase
      .from("income_forecast_lines")
      .select("data")
      .eq("id", id)
      .eq("user_id", userId)
      .single();
    if (fetchError || !current) {
      return { error: fetchError?.message || "Previsión no encontrada" };
    }
    const existingData = current.data as Record<string, unknown>;
    existingMonths = (existingData.months as ForecastMonths) || {};
    baseData = { ...existingData, id, createdAt: existingData.createdAt };
  }

  const existingMonth = existingMonths[monthId] || {};
  const nextMonth: ForecastMonthState = {
    ...existingMonth,
    [type]: {
      ...(existingMonth[type] || {}),
      expected: newPrev,
    },
  };

  const updatedMonths: ForecastMonths = {
    ...existingMonths,
    [monthId]: nextMonth,
  };

  const normalized = normalizeForecastSourceForDbWeb({
    ...baseData,
    id,
    months: updatedMonths,
  } as any);

  const { error } = await supabase
    .from("income_forecast_lines")
    .update({
      data: normalized,
      client_updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userId);

  return { error: error?.message || null };
}

export async function updateForecastMonthBase(
  id: string,
  monthId: string,
  type: "INGRESO" | "GASTO",
  newBase: number,
  existingLine?: ForecastLineFull
): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { error: "No autenticado" };
  }
  const userId = session.user.id;

  const now = new Date().toISOString();
  let baseData: Record<string, unknown>;
  let existingMonths: ForecastMonths;

  if (existingLine) {
    existingMonths = existingLine.months || {};
    baseData = existingLine as unknown as Record<string, unknown>;
  } else {
    const { data: current, error: fetchError } = await supabase
      .from("income_forecast_lines")
      .select("data")
      .eq("id", id)
      .eq("user_id", userId)
      .single();
    if (fetchError || !current) {
      return { error: fetchError?.message || "Previsión no encontrada" };
    }
    const existingData = current.data as Record<string, unknown>;
    existingMonths = (existingData.months as ForecastMonths) || {};
    baseData = { ...existingData, id, createdAt: existingData.createdAt };
  }

  const existingMonth = existingMonths[monthId] || {};
  const nextMonth: ForecastMonthState = {
    ...existingMonth,
    [type]: {
      ...(existingMonth[type] || {}),
      base: newBase,
    },
  };

  const updatedMonths: ForecastMonths = {
    ...existingMonths,
    [monthId]: nextMonth,
  };

  const normalized = normalizeForecastSourceForDbWeb({
    ...baseData,
    id,
    months: updatedMonths,
  } as any);

  const { error } = await supabase
    .from("income_forecast_lines")
    .update({
      data: normalized,
      client_updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userId);

  return { error: error?.message || null };
}

// ==================== MOVEMENTS ====================

export async function fetchMovements(): Promise<{ data: FinanceMovement[]; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { data: [], error: "No autenticado" };
  }
  const userId = session.user.id;

  const { data, error } = await supabase
    .from("finance_movements")
    .select("id, data, client_updated_at, deleted_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("client_updated_at", { ascending: false })
    .limit(200);

  if (error) {
    return { data: [], error: null };
  }

  const movements: FinanceMovement[] = (data || [])
    .filter((row: { data: Record<string, unknown> }) => row.data?.type === "INGRESO" || row.data?.type === "GASTO")
    .map((row: { id: string; data: Record<string, unknown> }) => {
      const d = row.data as Record<string, any>;
      const amount =
        typeof d.amount === "number"
          ? d.amount
          : typeof d.amountEUR === "number"
          ? d.amountEUR
          : typeof d.extra?.amountEUR === "number"
          ? d.extra.amountEUR
          : 0;
      const forecastId = d.forecastId ?? d.linkedPredictionId ?? d.predictionId ?? undefined;
      const dateRaw = d.date ?? d.day ?? d.createdAt ?? "";
      const date = typeof dateRaw === "string" && dateRaw.length >= 10 ? dateRaw.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const concept = d.concept ?? d.title ?? "Sin concepto";
      const type = typeof d.type === "string" ? d.type.toUpperCase() : d.type;

      return {
        id: row.id,
        date,
        concept,
        amount,
        type: type as "INGRESO" | "GASTO",
        accountId: (d.accountId as string) || null,
        forecastId: forecastId ? String(forecastId) : undefined,
        note: (d.description as string) || (d.note as string) || null,
        tags: Array.isArray(d.tags) ? d.tags : [],
        label: (d.label as string) || null,
        frequency: (d.frequency === "SEMANAL" || d.frequency === "MENSUAL") ? d.frequency : "PUNTUAL",
        linkedPredictionId: forecastId ? String(forecastId) : null,
      };
    });

  return { data: movements, error: null };
}

export async function upsertMovement(movement: FinanceMovement): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: "No autenticado" };
  const userId = session.user.id;

  const now = new Date().toISOString();
  const dataPayload: Record<string, unknown> = {
    id: movement.id,
    date: movement.date,
    concept: movement.concept,
    amount: movement.amount,
    type: movement.type,
    accountId: movement.accountId || null,
    linkedPredictionId: movement.linkedPredictionId || null,
    tags: movement.tags || [],
    label: movement.label || null,
    description: movement.note || null,
    frequency: movement.frequency || "PUNTUAL",
    updatedAt: now,
  };

  const { error } = await supabase.from("finance_movements").upsert(
    {
      id: movement.id,
      user_id: userId,
      data: dataPayload,
      client_updated_at: now,
      deleted_at: null,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.warn("upsertMovement error:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function softDeleteMovement(movementId: string): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: "No autenticado" };
  const userId = session.user.id;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("finance_movements")
    .update({ deleted_at: now, client_updated_at: now })
    .eq("id", movementId)
    .eq("user_id", userId);

  if (error) {
    console.warn("softDeleteMovement error:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ==================== ATOMIC BALANCE DELTA ====================

/**
 * Aplica un delta atómico al balance de una cuenta bancaria mediante RPC.
 * Evita el race condition de read-modify-write desde cliente.
 * delta > 0 → suma; delta < 0 → resta.
 * Devuelve el nuevo balance si el UPDATE afectó alguna fila, null si la cuenta
 * no existe o pertenece a otro usuario.
 */
export async function applyAccountBalanceDelta(
  accountId: string,
  delta: number,
): Promise<{ newBalance: number | null; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { newBalance: null, error: "No autenticado" };

  const { data, error } = await supabase.rpc("apply_account_balance_delta", {
    p_account_id: accountId,
    p_user_id: session.user.id,
    p_delta: delta,
  });

  if (error) {
    console.warn("applyAccountBalanceDelta error:", error.message);
    return { newBalance: null, error: error.message };
  }

  // data es el JSONB completo del campo 'data' de bank_accounts
  const newBalance = data != null && typeof data.balance === "number" ? data.balance : null;
  return { newBalance, error: null };
}

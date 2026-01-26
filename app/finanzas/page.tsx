"use client";

import { useEffect, useState, useCallback, useRef, Fragment, useMemo } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { EditForecastAnualModal } from "@/src/components/finance/modals/EditForecastAnualModal";
import { BankAccountModal } from "@/src/components/finance/modals/BankAccountModal";
import {
  formatNumberES,
  formatEUR,
  parseEURInput,
  getCurrentMonthId,
  getMonthLabel,
  addMonths,
  formatDateShort,
  generateId,
  generateLocalId,
  getMonthExpected,
  getMonthBase,
  FIN_COLORS,
  getFinanceChipClass,
  type BankAccountFull,
  type ForecastLineFull,
  type ForecastMonths,
  type ForecastMonthState,
  type FinanceMovement,
} from "@/src/lib/finance/financeData";
import { normalizeBankAccountForDbWeb, normalizeForecastSourceForDbWeb } from "@/src/lib/finance/normalize";

// ==================== DATA FETCHING ====================

async function fetchBankAccountsFull(): Promise<{ data: BankAccountFull[]; error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { data: [], error: "No autenticado" };
  }

  const { data, error } = await supabase
    .from("bank_accounts")
    .select("id, data, deleted_at, client_updated_at, server_updated_at")
    .eq("user_id", userData.user.id)
    .is("deleted_at", null);

  if (error) {
    console.warn("bank_accounts fetch error:", error.message);
    return { data: [], error: null };
  }

  const accounts: BankAccountFull[] = (data || []).map((row: { id: string; data: Record<string, unknown> }) => {
    const type = row.data?.type as "PERSONAL" | "SOCIEDAD" | undefined;
    if (process.env.NODE_ENV !== "production") {
      console.debug("[bank_accounts] load row.type", row.id, type);
    }
    return {
      id: row.id,
      name: (row.data?.name as string) || (row.data?.title as string) || row.id,
      type,
      balance: typeof row.data?.balance === "number" ? row.data.balance : 0,
      order: typeof row.data?.order === "number" ? row.data.order : 0,
      createdAt: row.data?.createdAt as string | undefined,
      updatedAt: row.data?.updatedAt as string | undefined,
    };
  });

  // Ordenar por order asc (sin order al final)
  accounts.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

  return { data: accounts, error: null };
}

async function fetchForecastLinesFull(): Promise<{ data: ForecastLineFull[]; error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { data: [], error: "No autenticado" };
  }

  const { data, error } = await supabase
    .from("income_forecast_lines")
    .select("id, data")
    .eq("user_id", userData.user.id)
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
  }));

  // Ordenar: roots por order, luego children por order dentro de su parent
  lines.sort((a, b) => {
    // Primero agrupar por parentId (nulls primero)
    if (a.parentId === null && b.parentId !== null) return -1;
    if (a.parentId !== null && b.parentId === null) return 1;
    // Luego por order
    return (a.order ?? Infinity) - (b.order ?? Infinity);
  });

  return { data: lines, error: null };
}

// Upsert forecast line
async function upsertForecastLine(line: ForecastLineFull): Promise<{ error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "No autenticado" };
  }

  const now = new Date().toISOString();
  const dataPayload = normalizeForecastSourceForDbWeb({
    ...line,
    updatedAt: now,
  } as any);

  const { error } = await supabase.from("income_forecast_lines").upsert(
    {
      id: line.id,
      user_id: userData.user.id,
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

// Soft delete forecast line
async function deleteForecastLine(lineId: string): Promise<{ error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "No autenticado" };
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("income_forecast_lines")
    .update({ deleted_at: now, client_updated_at: now })
    .eq("id", lineId)
    .eq("user_id", userData.user.id);

  if (error) {
    console.warn("deleteForecastLine error:", error.message);
    return { error: error.message };
  }

  return { error: null };
}

// Soft delete bank account
async function deleteBankAccount(accountId: string): Promise<{ error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "No autenticado" };
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("bank_accounts")
    .update({ deleted_at: now, client_updated_at: now })
    .eq("id", accountId)
    .eq("user_id", userData.user.id);

  if (error) {
    console.warn("deleteBankAccount error:", error.message);
    return { error: error.message };
  }

  return { error: null };
}

async function fetchMovements(): Promise<{ data: FinanceMovement[]; error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { data: [], error: "No autenticado" };
  }

  const { data, error } = await supabase
    .from("finance_movements")
    .select("id, data, client_updated_at, deleted_at")
    .eq("user_id", userData.user.id)
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
        accountId: d.accountId as string | undefined,
        forecastId: forecastId ? String(forecastId) : undefined,
        note: d.description as string | undefined,
      };
    });

  if (process.env.NODE_ENV !== "production") {
    console.debug("[finance_movements] loaded", movements.length, movements.slice(0, 5));
    const sample = movements.find((m) => m.forecastId);
    console.debug("[finance_movements] example forecastId", sample?.forecastId);
  }

  return { data: movements, error: null };
}

// ==================== UPDATE/CREATE FUNCTIONS ====================

async function updateBankAccountBalance(id: string, newBalance: number): Promise<{ error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "No autenticado" };
  }

  const { data: current, error: fetchError } = await supabase
    .from("bank_accounts")
    .select("data")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .single();

  if (fetchError || !current) {
    return { error: fetchError?.message || "Cuenta no encontrada" };
  }

  const now = new Date().toISOString();
  const existingData = current.data as Record<string, unknown>;

  const normalized = normalizeBankAccountForDbWeb({
    ...(existingData as Record<string, unknown>),
    id,
    balance: newBalance,
    createdAt: existingData.createdAt as string | undefined,
  });

  const { error } = await supabase
    .from("bank_accounts")
    .update({
      data: normalized,
      client_updated_at: now,
      deleted_at: null,
    })
    .eq("id", id)
    .eq("user_id", userData.user.id);

  return { error: error?.message || null };
}

async function updateBankAccountName(id: string, newName: string): Promise<{ error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "No autenticado" };
  }

  const { data: current, error: fetchError } = await supabase
    .from("bank_accounts")
    .select("data")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .single();

  if (fetchError || !current) {
    return { error: fetchError?.message || "Cuenta no encontrada" };
  }

  const now = new Date().toISOString();
  const existingData = current.data as Record<string, unknown>;

  const normalized = normalizeBankAccountForDbWeb({
    ...(existingData as Record<string, unknown>),
    id,
    name: newName,
    createdAt: existingData.createdAt as string | undefined,
  });

  const { error } = await supabase
    .from("bank_accounts")
    .update({
      data: normalized,
      client_updated_at: now,
      deleted_at: null,
    })
    .eq("id", id)
    .eq("user_id", userData.user.id);

  return { error: error?.message || null };
}

// Persist order for bank accounts
async function persistBankAccountsOrder(accounts: BankAccountFull[]): Promise<{ error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "No autenticado" };
  }

  const now = new Date().toISOString();
  const userId = userData.user.id;

  for (const acc of accounts) {
    if (acc.order === undefined) continue;
    
    const { data: current, error: fetchError } = await supabase
      .from("bank_accounts")
      .select("data")
      .eq("id", acc.id)
      .eq("user_id", userId)
      .single();

    if (fetchError || !current) continue;

    const existingData = current.data as Record<string, unknown>;
    const normalized = normalizeBankAccountForDbWeb({
      ...(existingData as Record<string, unknown>),
      id: acc.id,
      order: acc.order,
      createdAt: existingData.createdAt as string | undefined,
    });

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

// Persist order for forecast lines
async function persistForecastLinesOrder(updates: Array<{ id: string; order: number }>): Promise<{ error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "No autenticado" };
  }

  const now = new Date().toISOString();
  const userId = userData.user.id;

  for (const upd of updates) {
    const { data: current, error: fetchError } = await supabase
      .from("income_forecast_lines")
      .select("data")
      .eq("id", upd.id)
      .eq("user_id", userId)
      .single();

    if (fetchError || !current) continue;

    const existingData = current.data as Record<string, unknown>;
    const normalized = normalizeForecastSourceForDbWeb({
      ...(existingData as Record<string, unknown>),
      id: upd.id,
      order: upd.order,
      createdAt: existingData.createdAt as string | undefined,
    } as any);

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

async function updateForecastMonthPrev(
  id: string,
  monthId: string,
  type: "INGRESO" | "GASTO",
  newPrev: number
): Promise<{ error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "No autenticado" };
  }

  const { data: current, error: fetchError } = await supabase
    .from("income_forecast_lines")
    .select("data")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .single();

  if (fetchError || !current) {
    return { error: fetchError?.message || "Previsión no encontrada" };
  }

  const now = new Date().toISOString();
  const existingData = current.data as Record<string, unknown>;
  const existingMonths = (existingData.months as ForecastMonths) || {};
  const existingMonth = existingMonths[monthId] || {};

  // Construir nextMonth con estructura modelo nuevo
  // Preservar el otro tipo si existe
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
    ...(existingData as Record<string, unknown>),
    id,
    months: updatedMonths,
    createdAt: existingData.createdAt as string | undefined,
  } as any);

  const { error } = await supabase
    .from("income_forecast_lines")
    .update({
      data: normalized,
      client_updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userData.user.id);

  return { error: error?.message || null };
}

async function updateForecastMonthBase(
  id: string,
  monthId: string,
  type: "INGRESO" | "GASTO",
  newBase: number
): Promise<{ error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "No autenticado" };
  }

  const { data: current, error: fetchError } = await supabase
    .from("income_forecast_lines")
    .select("data")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .single();

  if (fetchError || !current) {
    return { error: fetchError?.message || "Previsión no encontrada" };
  }

  const now = new Date().toISOString();
  const existingData = current.data as Record<string, unknown>;
  const existingMonths = (existingData.months as ForecastMonths) || {};
  const existingMonth = existingMonths[monthId] || {};

  // Construir nextMonth con estructura modelo nuevo
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
    ...(existingData as Record<string, unknown>),
    id,
    months: updatedMonths,
    createdAt: existingData.createdAt as string | undefined,
  } as any);

  const { error } = await supabase
    .from("income_forecast_lines")
    .update({
      data: normalized,
      client_updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userData.user.id);

  return { error: error?.message || null };
}

// ==================== INLINE EDIT COMPONENT ====================

interface InlineEditProps {
  value: number | undefined;
  onSave: (newValue: number) => Promise<{ error: string | null }>;
  suffix?: string;
  placeholder?: string;
  className?: string;
  compact?: boolean;
}

function InlineEdit({ value, onSave, suffix = "€", placeholder = "0", className = "", compact = false }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = value !== undefined ? formatNumberES(value) : placeholder;

  const startEdit = () => {
    setDraft(value !== undefined ? String(value) : "");
    setEditing(true);
    setError(null);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft("");
    setError(null);
  };

  const commitEdit = async () => {
    const parsed = parseEURInput(draft);
    if (parsed === null && draft.trim() !== "") {
      setError("Número inválido");
      return;
    }
    const finalValue = parsed ?? 0;
    
    setSaving(true);
    setError(null);
    const result = await onSave(finalValue);
    setSaving(false);

    if (result.error) {
      setError(result.error);
    } else {
      setEditing(false);
      setDraft("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  if (editing) {
    return (
      <div className={`inline-flex items-center gap-1 ${className}`}>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className={`${compact ? "w-16 px-1 py-0.5 text-xs" : "w-24 px-2 py-1 text-sm"} border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400`}
          disabled={saving}
        />
        {suffix && suffix.trim() !== "" && (
          <span className={`${compact ? "text-xs" : "text-sm"} text-slate-500`}>{suffix}</span>
        )}
        {saving && <span className="text-[10px] text-slate-400">...</span>}
        {error && <span className="text-[10px] text-red-500">{error}</span>}
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className={`${compact ? "px-1 py-0.5 text-xs" : "px-2 py-1 text-sm"} rounded hover:bg-slate-100 transition-colors whitespace-nowrap ${className}`}
    >
      {displayValue}{suffix && suffix.trim() !== "" ? ` ${suffix}` : ""}
    </button>
  );
}

// ==================== INLINE TEXT EDIT COMPONENT ====================

interface InlineTextEditProps {
  value: string;
  onSave: (newValue: string) => Promise<{ error: string | null }>;
  className?: string;
  compact?: boolean;
}

function InlineTextEdit({ value, onSave, className = "", compact = false }: InlineTextEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft("");
  };

  const commitEdit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      cancelEdit();
      return;
    }
    
    setSaving(true);
    const result = await onSave(trimmed);
    setSaving(false);

    if (!result.error) {
      setEditing(false);
      setDraft("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={handleKeyDown}
        className={`w-full ${compact ? "px-1 py-0.5 text-xs" : "px-1.5 py-0.5 text-sm"} border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400`}
        disabled={saving}
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      className={`whitespace-nowrap hover:bg-slate-100 rounded ${compact ? "px-0.5 py-0" : "px-1 py-0.5"} transition-colors ${className}`}
    >
      {value}
    </button>
  );
}

// ==================== MAIN COMPONENT ====================

export default function FinanzasPage() {
  // Auth
  const [authState, setAuthState] = useState<{ loading: boolean; authenticated: boolean }>({
    loading: true,
    authenticated: false,
  });

  // Data
  const [bankAccounts, setBankAccounts] = useState<BankAccountFull[]>([]);
  const [forecastLines, setForecastLines] = useState<ForecastLineFull[]>([]);
  const [movements, setMovements] = useState<FinanceMovement[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // ==================== DRAG & DROP STATE (Bank Accounts) ====================
  const BANK_DRAG_THRESHOLD = 8;
  const [bankDrag, setBankDrag] = useState<{ id: string; startX: number; startY: number; pointerId: number; isDragActive: boolean } | null>(null);
  const [bankDragPos, setBankDragPos] = useState<{ x: number; y: number } | null>(null);
  const [bankDragGhost, setBankDragGhost] = useState<{ label: string; w: number; h: number; offsetX: number; offsetY: number } | null>(null);
  const [bankDragOverId, setBankDragOverId] = useState<string | null>(null);
  const [bankInsertSide, setBankInsertSide] = useState<"before" | "after" | null>(null);
  const bankCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const suppressBankClickRef = useRef(false);

  // ==================== DRAG & DROP STATE (Forecast Lines) ====================
  const FORECAST_DRAG_THRESHOLD = 8;
  const [forecastDrag, setForecastDrag] = useState<{ id: string; kind: "root" | "child"; parentId: string | null; startX: number; startY: number; pointerId: number; isDragActive: boolean } | null>(null);
  const [forecastDragPos, setForecastDragPos] = useState<{ x: number; y: number } | null>(null);
  const [forecastDragGhost, setForecastDragGhost] = useState<{ label: string; w: number; h: number; offsetX: number; offsetY: number } | null>(null);
  const [forecastDragOverId, setForecastDragOverId] = useState<string | null>(null);
  const [forecastInsertSide, setForecastInsertSide] = useState<"before" | "after" | null>(null);
  const forecastRowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const suppressForecastClickRef = useRef(false);

  // UI State
  const [selectedMonthId, setSelectedMonthId] = useState(getCurrentMonthId());
  const [showAllMovements, setShowAllMovements] = useState(false);

  // Bank Account Modal State (unified create/edit)
  const [isBankAccountModalOpen, setIsBankAccountModalOpen] = useState(false);
  const [bankAccountModalMode, setBankAccountModalMode] = useState<"create" | "edit">("create");
  const [editingBankAccountId, setEditingBankAccountId] = useState<string | null>(null);

  // Forecast Editor Modal State
  const [isForecastEditorOpen, setIsForecastEditorOpen] = useState(false);
  const [forecastEditorYear, setForecastEditorYear] = useState(() => new Date().getFullYear());
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedLeafIds, setSelectedLeafIds] = useState<string[]>([]);
  const [showIncome, setShowIncome] = useState(true);
  const [showExpense, setShowExpense] = useState(true);
  const [showTotal, setShowTotal] = useState(true);
  // Row kind filters: Real/Prev/Dif
  const [showRowReal, setShowRowReal] = useState(true);
  const [showRowPrev, setShowRowPrev] = useState(true);
  const [showRowDiff, setShowRowDiff] = useState(true);

  // Income Source Modal State (crear/editar fuentes)
  interface TypeFormState {
    enabled: boolean;
    base: string;
    expected: string;
  }
  interface ChildDraftState {
    id: string;
    name: string;
    typeForms: { INGRESO: TypeFormState; GASTO: TypeFormState };
  }
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [sourceModalMode, setSourceModalMode] = useState<"create" | "edit">("create");
  const [sourceEditId, setSourceEditId] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState("Nueva fuente");
  const [sourceIsGroup, setSourceIsGroup] = useState(false);
  const [sourceIsChild, setSourceIsChild] = useState(false); // true if editing a child line (has parentId)
  const [sourceOriginalParentId, setSourceOriginalParentId] = useState<string | null>(null); // preserve original parentId
  const [sourceTypeForms, setSourceTypeForms] = useState<{ INGRESO: TypeFormState; GASTO: TypeFormState }>({
    INGRESO: { enabled: true, base: "0", expected: "0" },
    GASTO: { enabled: false, base: "0", expected: "0" },
  });
  const [sourceChildren, setSourceChildren] = useState<ChildDraftState[]>([]);
  const [sourceRemovedChildIds, setSourceRemovedChildIds] = useState<string[]>([]);
  const [sourceSaving, setSourceSaving] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const sourceNameRef = useRef<HTMLInputElement>(null);
  // Initial values for dirty detection
  const [initialSourceName, setInitialSourceName] = useState("");
  const [initialSourceIsGroup, setInitialSourceIsGroup] = useState(false);
  const [initialSourceTypeForms, setInitialSourceTypeForms] = useState<string>("");
  const [initialSourceChildren, setInitialSourceChildren] = useState<string>("");

  // Main table state (Fuentes de Ingreso section)
  const [selectedLeafIdsMain, setSelectedLeafIdsMain] = useState<string[]>([]);
  const [showIncomeMain, setShowIncomeMain] = useState(true);
  const [showExpenseMain, setShowExpenseMain] = useState(true);
  const [showTotalMain, setShowTotalMain] = useState(true);
  // Subcol filters: Real / Prev / Diff
  const [showRealCols, setShowRealCols] = useState(true);
  const [showPrevCols, setShowPrevCols] = useState(true);
  const [showDiffCols, setShowDiffCols] = useState(true);

  // Edit Forecast Anual Modal State (solo open/lineId, el resto está en el componente)
  const [isEditForecastAnualOpen, setIsEditForecastAnualOpen] = useState(false);
  const [editForecastAnualId, setEditForecastAnualId] = useState<string | null>(null);

  // Auth check
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        window.location.href = "/login";
        return;
      }
      setAuthState({ loading: false, authenticated: true });
    })();
  }, []);

  // Load data
  useEffect(() => {
    if (!authState.authenticated) return;

    const loadData = async () => {
      setLoadingData(true);
      const [accountsRes, forecastRes, movementsRes] = await Promise.all([
        fetchBankAccountsFull(),
        fetchForecastLinesFull(),
        fetchMovements(),
      ]);

      setBankAccounts(accountsRes.data);
      setForecastLines(forecastRes.data);
      setMovements(movementsRes.data);
      setLoadingData(false);
    };

    loadData();
  }, [authState.authenticated]);

  if (process.env.NODE_ENV !== "production") {
    console.debug("[RENDER]", { movementsLen: movements.length, selectedMonthId });
  }

  // Escape key to close forecast editor modal
  useEffect(() => {
    if (!isForecastEditorOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsForecastEditorOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isForecastEditorOpen]);

  // ==================== COMPUTED VALUES ====================

  const totalBalance = bankAccounts.reduce((sum, acc) => sum + (acc.balance ?? 0), 0);
  const personalBalance = bankAccounts
    .filter((acc) => acc.type === "PERSONAL" || !acc.type)
    .reduce((sum, acc) => sum + (acc.balance ?? 0), 0);
  const sociedadBalance = bankAccounts
    .filter((acc) => acc.type === "SOCIEDAD")
    .reduce((sum, acc) => sum + (acc.balance ?? 0), 0);

  const leafForecastLines = forecastLines.filter((fl) => {
    const hasChildren = forecastLines.some((other) => other.parentId === fl.id);
    return !hasChildren;
  });

  const realByForecast = movements.reduce((acc, mov) => {
    if (mov.forecastId && mov.date?.startsWith(selectedMonthId)) {
      const sign = mov.type === "INGRESO" ? 1 : -1;
      acc[mov.forecastId] = (acc[mov.forecastId] || 0) + mov.amount * sign;
    }
    return acc;
  }, {} as Record<string, number>);

  // ==================== FORECAST EDITOR COMPUTED ====================

  // Meses abreviados ES
  const MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  // MonthIds del año seleccionado
  const forecastEditorMonthIds = Array.from({ length: 12 }, (_, i) =>
    `${forecastEditorYear}-${String(i + 1).padStart(2, "0")}`
  );

  // Grupos: líneas padre (parentId === null) que tienen al menos un hijo
  const forecastGroups = forecastLines.filter((fl) => {
    const isParent = fl.parentId === null || fl.parentId === undefined;
    const hasChildren = forecastLines.some((other) => other.parentId === fl.id);
    return isParent && hasChildren;
  });

  // Líneas top-level sin hijos (actúan como grupo de 1)
  const singletonLines = forecastLines.filter((fl) => {
    const isParent = fl.parentId === null || fl.parentId === undefined;
    const hasChildren = forecastLines.some((other) => other.parentId === fl.id);
    return isParent && !hasChildren;
  });

  // Todos los chips (grupos + singletons)
  const allChips = [...forecastGroups, ...singletonLines];

  // Si no hay selección, considerar todos seleccionados
  const effectiveSelectedIds = selectedGroupIds.length > 0 ? selectedGroupIds : allChips.map((c) => c.id);

  // Función para obtener hijos de un grupo (o [grupo] si singleton)
  const getGroupChildren = (groupId: string): ForecastLineFull[] => {
    const children = forecastLines.filter((fl) => fl.parentId === groupId);
    if (children.length > 0) return children;
    // Es singleton
    const singleton = forecastLines.find((fl) => fl.id === groupId);
    return singleton ? [singleton] : [];
  };

  // ==================== EXCEL MODAL: SOURCE BLOCKS ====================
  // Construir bloques de fuentes: cada grupo/singleton con sus leafs
  const sourceBlocks = effectiveSelectedIds.map((groupId) => {
    const group = allChips.find((c) => c.id === groupId);
    const items = getGroupChildren(groupId);
    return { id: groupId, title: group?.name || groupId, items };
  });

  // Todos los leafIds de las fuentes seleccionadas
  const allLeafIds = sourceBlocks.flatMap((sb) => sb.items.map((item) => item.id));

  // LeafIds activos (si selectedLeafIds está vacío, todos activos)
  const effectiveLeafIds = selectedLeafIds.length > 0
    ? selectedLeafIds.filter((id) => allLeafIds.includes(id))
    : allLeafIds;

  // Obtener línea por id
  const getLineById = (id: string): ForecastLineFull | undefined =>
    forecastLines.find((fl) => fl.id === id);

  // Función para calcular Real de una línea para un mes
  // Usa getMonthBase para consistencia con la tabla principal (REAL = base)
  const computeReal = (lineId: string, monthId: string, type: "INGRESO" | "GASTO"): number => {
    const line = forecastLines.find((fl) => fl.id === lineId);
    if (!line) return 0;
    return getMonthBase(line, monthId, type);
  };

  // Función para obtener Prev de una línea para un mes y tipo (usa helper global)
  const getPrev = (line: ForecastLineFull, monthId: string, type: "INGRESO" | "GASTO"): number => {
    return getMonthExpected(line, monthId, type);
  };

  // ==================== MAIN TABLE (Fuentes de Ingreso) COMPUTED ====================

  // Bloques de fuentes para la tabla principal (igual lógica que modal pero con selectedMonthId)
  const mainSourceBlocks = allChips.map((chip) => {
    const items = getGroupChildren(chip.id);
    return { id: chip.id, title: chip.name || chip.id, items };
  });

  // Todos los leafIds para la tabla principal
  const allLeafIdsMain = mainSourceBlocks.flatMap((sb) => sb.items.map((item) => item.id));

  // LeafIds activos en tabla principal (si vacío, todos)
  const effectiveLeafIdsMain = selectedLeafIdsMain.length > 0
    ? selectedLeafIdsMain.filter((id) => allLeafIdsMain.includes(id))
    : allLeafIdsMain;

  // Calcular número de subcolumnas visibles por bloque (Real/Prev/Diff)
  // Forzar al menos una subcolumna si todas están desactivadas
  const effectiveShowReal = showRealCols || (!showPrevCols && !showDiffCols);
  const effectiveShowPrev = showPrevCols;
  const effectiveShowDiff = showDiffCols;
  const visibleSubcolsPerBlock = (effectiveShowReal ? 1 : 0) + (effectiveShowPrev ? 1 : 0) + (effectiveShowDiff ? 1 : 0);
  // Número de bloques visibles (Gastos/Ingresos/Total)
  const visibleBlocksMain = (showExpenseMain ? 1 : 0) + (showIncomeMain ? 1 : 0) + (showTotalMain ? 1 : 0);
  // Total de columnas de datos
  const totalDataColsMain = visibleBlocksMain * visibleSubcolsPerBlock;

  // ==================== HANDLERS ====================

  const handleSaveAccountBalance = useCallback(async (accountId: string, newBalance: number) => {
    const result = await updateBankAccountBalance(accountId, newBalance);
    if (!result.error) {
      setBankAccounts((prev) =>
        prev.map((acc) => (acc.id === accountId ? { ...acc, balance: newBalance } : acc))
      );
    }
    return result;
  }, []);

  const handleSaveAccountName = useCallback(async (accountId: string, newName: string) => {
    const result = await updateBankAccountName(accountId, newName);
    if (!result.error) {
      setBankAccounts((prev) =>
        prev.map((acc) => (acc.id === accountId ? { ...acc, name: newName } : acc))
      );
    }
    return result;
  }, []);

  const handleSaveForecastPrev = useCallback(async (forecastId: string, type: "INGRESO" | "GASTO", newPrev: number) => {
    const result = await updateForecastMonthPrev(forecastId, selectedMonthId, type, newPrev);
    if (!result.error) {
      setForecastLines((prev) =>
        prev.map((fl) =>
          fl.id === forecastId
            ? {
                ...fl,
                months: {
                  ...(fl.months || {}),
                  [selectedMonthId]: {
                    ...(fl.months?.[selectedMonthId] || {}),
                    [type]: {
                      ...(fl.months?.[selectedMonthId]?.[type] || {}),
                      expected: newPrev,
                    },
                  },
                },
              }
            : fl
        )
      );
    }
    return result;
  }, [selectedMonthId]);

  const handleSaveForecastReal = useCallback(async (forecastId: string, type: "INGRESO" | "GASTO", newBase: number) => {
    const result = await updateForecastMonthBase(forecastId, selectedMonthId, type, newBase);
    if (!result.error) {
      setForecastLines((prev) =>
        prev.map((fl) =>
          fl.id === forecastId
            ? {
                ...fl,
                months: {
                  ...(fl.months || {}),
                  [selectedMonthId]: {
                    ...(fl.months?.[selectedMonthId] || {}),
                    [type]: {
                      ...(fl.months?.[selectedMonthId]?.[type] || {}),
                      base: newBase,
                    },
                  },
                },
              }
            : fl
        )
      );
    }
    return result;
  }, [selectedMonthId]);

  const openBankAccountModal = useCallback((mode: "create" | "edit", accountId?: string) => {
    setBankAccountModalMode(mode);
    setEditingBankAccountId(accountId || null);
    setIsBankAccountModalOpen(true);
  }, []);

  const closeBankAccountModal = useCallback(() => {
    setIsBankAccountModalOpen(false);
    setEditingBankAccountId(null);
  }, []);

  const getAccountById = useCallback((id: string) => {
    return bankAccounts.find((acc) => acc.id === id);
  }, [bankAccounts]);

  const createBankAccount = useCallback(async (draft: { name: string; type: "PERSONAL" | "SOCIEDAD"; balance: number }): Promise<{ data?: BankAccountFull; error?: string | null }> => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return { error: "No autenticado" };
    }

    const now = new Date().toISOString();
    const newId = generateId();

    const accountData = normalizeBankAccountForDbWeb({
      id: newId,
      name: draft.name,
      type: draft.type,
      balance: draft.balance,
      createdAt: now,
    });

    const { data, error } = await supabase
      .from("bank_accounts")
      .insert({
        id: newId,
        user_id: userData.user.id,
        data: accountData,
        client_updated_at: now,
        deleted_at: null,
      })
      .select("id, data")
      .single();

    if (error) {
      return { error: error.message };
    }

    const row = data as { id: string; data: Record<string, unknown> };
    const newAccount: BankAccountFull = {
      id: row.id,
      name: (row.data?.name as string) || draft.name,
      type: (row.data?.type as "PERSONAL" | "SOCIEDAD") || draft.type,
      balance: typeof row.data?.balance === "number" ? row.data.balance : draft.balance,
    };

    return { data: newAccount, error: null };
  }, []);

  const updateBankAccount = useCallback(async (id: string, patch: { name: string; type: "PERSONAL" | "SOCIEDAD"; balance: number }): Promise<{ error?: string | null }> => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return { error: "No autenticado" };
    }

    const { data: current, error: fetchError } = await supabase
      .from("bank_accounts")
      .select("data")
      .eq("id", id)
      .eq("user_id", userData.user.id)
      .single();

    if (fetchError || !current) {
      return { error: fetchError?.message || "Cuenta no encontrada" };
    }

    const now = new Date().toISOString();
    const existingData = current.data as Record<string, unknown>;

    const nextData = normalizeBankAccountForDbWeb({
      ...(existingData as Record<string, unknown>),
      id,
      name: patch.name,
      type: patch.type,
      balance: patch.balance,
      createdAt: existingData.createdAt as string | undefined,
    });
    if (process.env.NODE_ENV !== "production") {
      console.debug("[bank_accounts] update type", id, nextData.type);
    }

    const { error: updateError } = await supabase
      .from("bank_accounts")
      .update({
        data: nextData,
        client_updated_at: now,
        deleted_at: null,
      })
      .eq("id", id)
      .eq("user_id", userData.user.id);

    if (updateError) {
      return { error: updateError.message };
    }

    return { error: null };
  }, []);

  const handleAccountCreated = useCallback((account: BankAccountFull) => {
    setBankAccounts((prev) => [account, ...prev]);
  }, []);

  const handleAccountUpdated = useCallback((account: BankAccountFull) => {
    setBankAccounts((prev) =>
      prev.map((acc) => (acc.id === account.id ? account : acc))
    );
  }, []);

  const handleAccountDeleted = useCallback((accountId: string) => {
    setBankAccounts((prev) => prev.filter((acc) => acc.id !== accountId));
  }, []);

  const handleDeleteAccount = useCallback(async (accountId: string) => {
    const result = await deleteBankAccount(accountId);
    return result;
  }, []);

  // ==================== REORDER HANDLERS ====================

  const handleReorderBankAccounts = useCallback(async (reorderedAccounts: BankAccountFull[]) => {
    const prevAccounts = [...bankAccounts];
    setBankAccounts(reorderedAccounts);
    
    const result = await persistBankAccountsOrder(reorderedAccounts);
    if (result.error) {
      console.warn("Reorder bank accounts failed, reverting:", result.error);
      setBankAccounts(prevAccounts);
    }
  }, [bankAccounts]);

  const handleReorderForecastLines = useCallback(async (updates: Array<{ id: string; order: number }>) => {
    const prevLines = [...forecastLines];
    
    // Actualizar local
    setForecastLines(prev => {
      const next = [...prev];
      for (const upd of updates) {
        const idx = next.findIndex(l => l.id === upd.id);
        if (idx !== -1) {
          next[idx] = { ...next[idx], order: upd.order };
        }
      }
      // Re-ordenar
      next.sort((a, b) => {
        if (a.parentId === null && b.parentId !== null) return -1;
        if (a.parentId !== null && b.parentId === null) return 1;
        return (a.order ?? Infinity) - (b.order ?? Infinity);
      });
      return next;
    });
    
    const result = await persistForecastLinesOrder(updates);
    if (result.error) {
      console.warn("Reorder forecast lines failed, reverting:", result.error);
      setForecastLines(prevLines);
    }
  }, [forecastLines]);

  const prevMonth = () => setSelectedMonthId(addMonths(selectedMonthId, -1));
  const nextMonth = () => setSelectedMonthId(addMonths(selectedMonthId, 1));

  // ==================== SOURCE MODAL HANDLERS ====================

  const openSourceModalCreate = useCallback(() => {
    setSourceModalMode("create");
    setSourceEditId(null);
    setSourceName("Nueva fuente");
    setSourceIsGroup(false);
    setSourceIsChild(false);
    setSourceOriginalParentId(null);
    const defaultTypeForms = {
      INGRESO: { enabled: true, base: "0", expected: "0" },
      GASTO: { enabled: false, base: "0", expected: "0" },
    };
    setSourceTypeForms(defaultTypeForms);
    setSourceChildren([]);
    setSourceRemovedChildIds([]);
    setSourceError(null);
    // Save initial values for dirty detection
    setInitialSourceName("Nueva fuente");
    setInitialSourceIsGroup(false);
    setInitialSourceTypeForms(JSON.stringify(defaultTypeForms));
    setInitialSourceChildren(JSON.stringify([]));
    setIsSourceModalOpen(true);
    setTimeout(() => sourceNameRef.current?.select(), 50);
  }, []);

  const openSourceModalEdit = useCallback((lineId: string) => {
    const line = forecastLines.find((fl) => fl.id === lineId);
    if (!line) return;

    // Check if it's a group (has children)
    const children = forecastLines.filter((fl) => fl.parentId === lineId);
    const isGroup = children.length > 0;

    // Check if it's a child (has parentId) - subfuentes cannot have subcategories
    const isChild = !!line.parentId;

    setSourceModalMode("edit");
    setSourceEditId(lineId);
    setSourceName(line.name || "");
    setSourceIsGroup(isGroup);
    setSourceIsChild(isChild);
    setSourceOriginalParentId(line.parentId || null);

    let typeForms: { INGRESO: TypeFormState; GASTO: TypeFormState };
    let childrenDraft: ChildDraftState[] = [];

    if (isGroup) {
      // Parent: enabledTypes both false, load children
      typeForms = {
        INGRESO: { enabled: false, base: "0", expected: "0" },
        GASTO: { enabled: false, base: "0", expected: "0" },
      };
      childrenDraft = children.map((child) => {
        const monthData = child.months?.[selectedMonthId];
        const ingData = monthData?.INGRESO || {};
        const gasData = monthData?.GASTO || {};
        return {
          id: child.id,
          name: child.name || "",
          typeForms: {
            INGRESO: {
              enabled: child.enabledTypes?.INGRESO ?? true,
              base: String(ingData.base ?? 0),
              expected: String(ingData.expected ?? 0),
            },
            GASTO: {
              enabled: child.enabledTypes?.GASTO ?? false,
              base: String(gasData.base ?? 0),
              expected: String(gasData.expected ?? 0),
            },
          },
        };
      });
      setSourceTypeForms(typeForms);
      setSourceChildren(childrenDraft);
    } else {
      // Leaf line: load its own data
      const monthData = line.months?.[selectedMonthId];
      const ingData = monthData?.INGRESO || {};
      const gasData = monthData?.GASTO || {};
      typeForms = {
        INGRESO: {
          enabled: line.enabledTypes?.INGRESO ?? true,
          base: String(ingData.base ?? 0),
          expected: String(ingData.expected ?? 0),
        },
        GASTO: {
          enabled: line.enabledTypes?.GASTO ?? false,
          base: String(gasData.base ?? 0),
          expected: String(gasData.expected ?? 0),
        },
      };
      setSourceTypeForms(typeForms);
      setSourceChildren([]);
    }

    setSourceRemovedChildIds([]);
    setSourceError(null);
    // Save initial values for dirty detection
    setInitialSourceName(line.name || "");
    setInitialSourceIsGroup(isGroup);
    setInitialSourceTypeForms(JSON.stringify(typeForms));
    setInitialSourceChildren(JSON.stringify(childrenDraft));
    setIsSourceModalOpen(true);
  }, [forecastLines, selectedMonthId]);

  const closeSourceModal = useCallback(() => {
    setIsSourceModalOpen(false);
  }, []);

  // Compute dirty state for source modal
  const sourceIsDirty = useMemo(() => {
    if (sourceName !== initialSourceName) return true;
    if (sourceIsGroup !== initialSourceIsGroup) return true;
    if (JSON.stringify(sourceTypeForms) !== initialSourceTypeForms) return true;
    if (JSON.stringify(sourceChildren) !== initialSourceChildren) return true;
    if (sourceRemovedChildIds.length > 0) return true;
    return false;
  }, [sourceName, sourceIsGroup, sourceTypeForms, sourceChildren, sourceRemovedChildIds, initialSourceName, initialSourceIsGroup, initialSourceTypeForms, initialSourceChildren]);

  const addSourceChild = useCallback(() => {
    const newChild: ChildDraftState = {
      id: generateLocalId(),
      name: `Subcategoría ${sourceChildren.length + 1}`,
      typeForms: {
        INGRESO: { enabled: true, base: "0", expected: "0" },
        GASTO: { enabled: false, base: "0", expected: "0" },
      },
    };
    setSourceChildren((prev) => [...prev, newChild]);
  }, [sourceChildren.length]);

  const removeSourceChild = useCallback((childId: string) => {
    setSourceChildren((prev) => prev.filter((c) => c.id !== childId));
    // If it was an existing child (edit mode), mark for deletion
    if (sourceModalMode === "edit") {
      const existingChild = forecastLines.find((fl) => fl.id === childId);
      if (existingChild) {
        setSourceRemovedChildIds((prev) => [...prev, childId]);
      }
    }
  }, [sourceModalMode, forecastLines]);

  const updateSourceChildName = useCallback((childId: string, name: string) => {
    setSourceChildren((prev) => prev.map((c) => (c.id === childId ? { ...c, name } : c)));
  }, []);

  const updateSourceChildType = useCallback((childId: string, type: "INGRESO" | "GASTO", enabled: boolean) => {
    setSourceChildren((prev) => prev.map((c) => {
      if (c.id !== childId) return c;
      const other = type === "INGRESO" ? "GASTO" : "INGRESO";
      // Don't allow both to be disabled
      if (!enabled && !c.typeForms[other].enabled) return c;
      return {
        ...c,
        typeForms: {
          ...c.typeForms,
          [type]: { ...c.typeForms[type], enabled },
        },
      };
    }));
  }, []);

  const updateSourceChildValue = useCallback((childId: string, type: "INGRESO" | "GASTO", field: "base" | "expected", value: string) => {
    setSourceChildren((prev) => prev.map((c) => {
      if (c.id !== childId) return c;
      return {
        ...c,
        typeForms: {
          ...c.typeForms,
          [type]: { ...c.typeForms[type], [field]: value },
        },
      };
    }));
  }, []);

  const toggleSourceType = useCallback((type: "INGRESO" | "GASTO") => {
    setSourceTypeForms((prev) => {
      const other = type === "INGRESO" ? "GASTO" : "INGRESO";
      const newEnabled = !prev[type].enabled;
      // Don't allow both to be disabled
      if (!newEnabled && !prev[other].enabled) return prev;
      return {
        ...prev,
        [type]: { ...prev[type], enabled: newEnabled },
      };
    });
  }, []);

  const updateSourceTypeValue = useCallback((type: "INGRESO" | "GASTO", field: "base" | "expected", value: string) => {
    setSourceTypeForms((prev) => ({
      ...prev,
      [type]: { ...prev[type], [field]: value },
    }));
  }, []);

  const handleSaveSource = useCallback(async () => {
    setSourceSaving(true);
    setSourceError(null);

    try {
      const trimmedName = sourceName.trim() || "Nueva fuente";

      if (sourceIsGroup) {
        // Group mode: need at least 1 child
        if (sourceChildren.length === 0) {
          setSourceError("Añade al menos una subcategoría");
          setSourceSaving(false);
          return;
        }

        // Validate each child has at least one type enabled
        for (const child of sourceChildren) {
          if (!child.typeForms.INGRESO.enabled && !child.typeForms.GASTO.enabled) {
            setSourceError(`La subcategoría "${child.name || "Sin nombre"}" debe tener al menos un tipo activado`);
            setSourceSaving(false);
            return;
          }
        }

        // Create/update parent (container)
        const parentId = sourceEditId || generateLocalId();
        const parentLine: ForecastLineFull = {
          id: parentId,
          name: trimmedName,
          type: "INGRESO",
          parentId: null,
          enabledTypes: { INGRESO: false, GASTO: false },
          months: {},
        };

        const parentResult = await upsertForecastLine(parentLine);
        if (parentResult.error) {
          setSourceError(parentResult.error);
          setSourceSaving(false);
          return;
        }

        // Create/update children
        for (const child of sourceChildren) {
          const parseNum = (s: string) => parseEURInput(s) ?? 0;
          const childLine: ForecastLineFull = {
            id: child.id,
            name: child.name.trim() || `Subcategoría`,
            type: child.typeForms.INGRESO.enabled ? "INGRESO" : "GASTO",
            parentId: parentId,
            enabledTypes: {
              INGRESO: child.typeForms.INGRESO.enabled,
              GASTO: child.typeForms.GASTO.enabled,
            },
            months: {
              [selectedMonthId]: {
                INGRESO: {
                  base: parseNum(child.typeForms.INGRESO.base),
                  expected: parseNum(child.typeForms.INGRESO.expected),
                },
                GASTO: {
                  base: parseNum(child.typeForms.GASTO.base),
                  expected: parseNum(child.typeForms.GASTO.expected),
                },
              },
            },
          };
          const childResult = await upsertForecastLine(childLine);
          if (childResult.error) {
            setSourceError(childResult.error);
            setSourceSaving(false);
            return;
          }
        }

        // Delete removed children
        for (const removedId of sourceRemovedChildIds) {
          await deleteForecastLine(removedId);
        }

        // If was a non-group before, delete old line's children (shouldn't happen, but safe)
        if (sourceModalMode === "edit" && sourceEditId) {
          const oldChildren = forecastLines.filter((fl) => fl.parentId === sourceEditId && !sourceChildren.some((c) => c.id === fl.id));
          for (const oldChild of oldChildren) {
            await deleteForecastLine(oldChild.id);
          }
        }

        // Update local state
        setForecastLines((prev) => {
          let updated = prev.filter((fl) => fl.id !== parentId && !sourceChildren.some((c) => c.id === fl.id) && !sourceRemovedChildIds.includes(fl.id));
          updated = [...updated, parentLine, ...sourceChildren.map((child) => {
            const parseNum = (s: string) => parseEURInput(s) ?? 0;
            return {
              id: child.id,
              name: child.name.trim() || `Subcategoría`,
              type: (child.typeForms.INGRESO.enabled ? "INGRESO" : "GASTO") as "INGRESO" | "GASTO",
              parentId: parentId,
              enabledTypes: {
                INGRESO: child.typeForms.INGRESO.enabled,
                GASTO: child.typeForms.GASTO.enabled,
              },
              months: {
                [selectedMonthId]: {
                  INGRESO: {
                    base: parseNum(child.typeForms.INGRESO.base),
                    expected: parseNum(child.typeForms.INGRESO.expected),
                  },
                  GASTO: {
                    base: parseNum(child.typeForms.GASTO.base),
                    expected: parseNum(child.typeForms.GASTO.expected),
                  },
                },
              },
            };
          })];
          return updated;
        });

      } else {
        // Single line mode (either a root line or a child/subfuente)
        if (!sourceTypeForms.INGRESO.enabled && !sourceTypeForms.GASTO.enabled) {
          setSourceError("Activa al menos un tipo (Ingreso o Gasto)");
          setSourceSaving(false);
          return;
        }

        // Protection: if editing a child but originalParentId is missing, abort
        if (sourceIsChild && !sourceOriginalParentId) {
          setSourceError("Error interno: subfuente sin padre");
          setSourceSaving(false);
          return;
        }

        const parseNum = (s: string) => parseEURInput(s) ?? 0;
        const lineId = sourceEditId || generateLocalId();

        // CRITICAL: preserve parentId for child lines (subfuentes)
        const finalParentId = sourceIsChild ? sourceOriginalParentId : null;

        const line: ForecastLineFull = {
          id: lineId,
          name: trimmedName,
          type: sourceTypeForms.INGRESO.enabled ? "INGRESO" : "GASTO",
          parentId: finalParentId,
          enabledTypes: {
            INGRESO: sourceTypeForms.INGRESO.enabled,
            GASTO: sourceTypeForms.GASTO.enabled,
          },
          months: {
            [selectedMonthId]: {
              INGRESO: {
                base: parseNum(sourceTypeForms.INGRESO.base),
                expected: parseNum(sourceTypeForms.INGRESO.expected),
              },
              GASTO: {
                base: parseNum(sourceTypeForms.GASTO.base),
                expected: parseNum(sourceTypeForms.GASTO.expected),
              },
            },
          },
        };

        const result = await upsertForecastLine(line);
        if (result.error) {
          setSourceError(result.error);
          setSourceSaving(false);
          return;
        }

        // If was a group before (and not a child), delete old children
        if (sourceModalMode === "edit" && sourceEditId && !sourceIsChild) {
          const oldChildren = forecastLines.filter((fl) => fl.parentId === sourceEditId);
          for (const oldChild of oldChildren) {
            await deleteForecastLine(oldChild.id);
          }
        }

        // Update local state
        setForecastLines((prev) => {
          let updated = prev.filter((fl) => fl.id !== lineId);
          // Remove old children if was group (and not a child)
          if (sourceModalMode === "edit" && sourceEditId && !sourceIsChild) {
            updated = updated.filter((fl) => fl.parentId !== sourceEditId);
          }
          return [...updated, line];
        });
      }

      setIsSourceModalOpen(false);
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSourceSaving(false);
    }
  }, [sourceName, sourceIsGroup, sourceIsChild, sourceOriginalParentId, sourceChildren, sourceTypeForms, sourceEditId, sourceModalMode, selectedMonthId, forecastLines, sourceRemovedChildIds]);

  const handleDeleteSource = useCallback(async () => {
    if (!sourceEditId) return;

    const confirmed = window.confirm("¿Eliminar esta fuente? Esta acción no se puede deshacer.");
    if (!confirmed) return;

    setSourceSaving(true);
    setSourceError(null);

    try {
      // Delete children first (if group)
      const children = forecastLines.filter((fl) => fl.parentId === sourceEditId);
      for (const child of children) {
        await deleteForecastLine(child.id);
      }

      // Delete main line
      const result = await deleteForecastLine(sourceEditId);
      if (result.error) {
        setSourceError(result.error);
        setSourceSaving(false);
        return;
      }

      // Update local state
      setForecastLines((prev) => prev.filter((fl) => fl.id !== sourceEditId && fl.parentId !== sourceEditId));
      setIsSourceModalOpen(false);
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setSourceSaving(false);
    }
  }, [sourceEditId, forecastLines]);

  // Handle request close (backdrop click or ESC): save if dirty, else just close
  const handleRequestCloseSource = useCallback(async () => {
    if (sourceSaving) return;
    if (sourceIsDirty) {
      await handleSaveSource();
    } else {
      closeSourceModal();
    }
  }, [sourceIsDirty, sourceSaving, handleSaveSource, closeSourceModal]);

  // Escape key to close source modal
  useEffect(() => {
    if (!isSourceModalOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleRequestCloseSource();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isSourceModalOpen, handleRequestCloseSource]);

  // ==================== EDIT FORECAST ANUAL MODAL HANDLERS ====================

  const openEditForecastAnual = useCallback((lineId: string) => {
    setEditForecastAnualId(lineId);
    setIsEditForecastAnualOpen(true);
  }, []);

  const closeEditForecastAnual = useCallback(() => {
    setIsEditForecastAnualOpen(false);
    setEditForecastAnualId(null);
  }, []);

  const getChildrenIds = useCallback((lineId: string) => {
    return forecastLines.filter((fl) => fl.parentId === lineId).map((fl) => fl.id);
  }, [forecastLines]);

  const handleSaveForecastAnual = useCallback(async (line: ForecastLineFull) => {
    const result = await upsertForecastLine(line);
    if (!result.error) {
      setForecastLines((prev) => prev.map((fl) => (fl.id === line.id ? line : fl)));
    }
    return result;
  }, []);

  const handleDeleteForecastAnual = useCallback(async (lineId: string) => {
    const result = await deleteForecastLine(lineId);
    if (!result.error) {
      setForecastLines((prev) => prev.filter((fl) => fl.id !== lineId && fl.parentId !== lineId));
    }
    return result;
  }, []);

  // ==================== RENDER ====================

  if (authState.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-400 text-sm">Verificando sesión...</div>
      </div>
    );
  }

  const displayedMovements = showAllMovements ? movements : movements.slice(0, 10);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-3 flex items-center">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 hover:opacity-80">
              <img src="/logo.png" alt="" className="w-6 h-6" />
              <span className="font-semibold text-slate-700 whitespace-nowrap">Ingravital</span>
            </a>
            <span className="text-slate-300">|</span>
            <h1 className="text-lg font-semibold text-slate-700">Finanzas</h1>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto w-full px-3 sm:px-6 pt-6 pb-10 space-y-8">
        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-slate-400">Cargando datos...</div>
          </div>
        ) : (
          <>
{/* KPI (una sola card, centrada, ancho limitado) */}
          <section>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6" style={{ maxWidth: "480px", margin: "0 auto" }}>
              <div className="text-center">
                <div className="text-xs uppercase tracking-wide text-slate-400">Total dinero</div>
                <div className="mt-1 text-4xl font-bold text-slate-900">{formatEUR(totalBalance)}</div>
              </div>

              <div className="mt-5 flex justify-center gap-8">
                <div className="text-center">
                  <div className="text-xs text-slate-400">Personal</div>
                  <div className="mt-0.5 text-lg font-semibold text-slate-800">{formatEUR(personalBalance)}</div>
                </div>

                <div className="text-center">
                  <div className="text-xs text-slate-400">Sociedad</div>
                  <div className="mt-0.5 text-lg font-semibold text-slate-800">{formatEUR(sociedadBalance)}</div>
                </div>
              </div>

              {bankAccounts.length === 0 && (
                <div className="mt-4 text-center text-xs text-slate-400">Sin cuentas configuradas</div>
              )}
            </div>
          </section>

          {/* Cuentas */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-base font-semibold text-slate-800">Cuentas</h2>
              <button
                onClick={() => openBankAccountModal("create")}
                className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                title="Añadir cuenta"
              >
                +
              </button>
            </div>

            {bankAccounts.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
                No hay cuentas bancarias
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-3 relative">
                {bankAccounts.map((account) => {
                  const suffix = account.type === "SOCIEDAD" ? "S." : "P.";
                  const isDragging = bankDrag?.id === account.id && bankDrag.isDragActive;
                  const isDropTarget = bankDragOverId === account.id;
                  return (
                    <div
                      key={account.id}
                      ref={(el) => { if (el) bankCardRefs.current.set(account.id, el); else bankCardRefs.current.delete(account.id); }}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
                        (e.target as HTMLElement).setPointerCapture(e.pointerId);
                        setBankDrag({ id: account.id, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId, isDragActive: false });
                        setBankDragOverId(null);
                        setBankInsertSide(null);
                        suppressBankClickRef.current = false;
                      }}
                      onPointerMove={(e) => {
                        if (!bankDrag || bankDrag.id !== account.id) return;
                        const dx = e.clientX - bankDrag.startX;
                        const dy = e.clientY - bankDrag.startY;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist > BANK_DRAG_THRESHOLD && !bankDrag.isDragActive) {
                          setBankDrag({ ...bankDrag, isDragActive: true });
                          suppressBankClickRef.current = true;
                          const el = bankCardRefs.current.get(account.id);
                          if (el) {
                            const r = el.getBoundingClientRect();
                            setBankDragGhost({ label: `${account.name} ${suffix}`, w: r.width, h: r.height, offsetX: e.clientX - r.left, offsetY: e.clientY - r.top });
                          }
                        }
                        if (bankDrag.isDragActive) {
                          setBankDragPos({ x: e.clientX, y: e.clientY });
                          let foundId: string | null = null;
                          let side: "before" | "after" | null = null;
                          bankCardRefs.current.forEach((el, id) => {
                            if (id === bankDrag.id) return;
                            const rect = el.getBoundingClientRect();
                            if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                              foundId = id;
                              const midX = (rect.left + rect.right) / 2;
                              side = e.clientX < midX ? "before" : "after";
                            }
                          });
                          setBankDragOverId(foundId);
                          setBankInsertSide(side);
                        }
                      }}
                      onPointerUp={(e) => {
                        if (!bankDrag || bankDrag.id !== account.id) return;
                        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                        if (bankDrag.isDragActive && bankDragOverId && bankDragOverId !== bankDrag.id) {
                          const fromIdx = bankAccounts.findIndex(a => a.id === bankDrag.id);
                          let toIdx = bankAccounts.findIndex(a => a.id === bankDragOverId);
                          if (fromIdx !== -1 && toIdx !== -1) {
                            if (bankInsertSide === "after") toIdx += 1;
                            if (fromIdx < toIdx) toIdx -= 1;
                            const newAccounts = [...bankAccounts];
                            const [removed] = newAccounts.splice(fromIdx, 1);
                            newAccounts.splice(toIdx, 0, removed);
                            const reordered = newAccounts.map((a, idx) => ({ ...a, order: idx + 1 }));
                            handleReorderBankAccounts(reordered);
                          }
                        }
                        setBankDrag(null);
                        setBankDragOverId(null);
                        setBankDragPos(null);
                        setBankDragGhost(null);
                        setBankInsertSide(null);
                        setTimeout(() => { suppressBankClickRef.current = false; }, 0);
                      }}
                      onPointerCancel={() => {
                        setBankDrag(null);
                        setBankDragOverId(null);
                        setBankDragPos(null);
                        setBankDragGhost(null);
                        setBankInsertSide(null);
                        suppressBankClickRef.current = false;
                      }}
                      className={`relative bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-2 inline-flex select-none touch-none cursor-grab active:cursor-grabbing ${
                        isDragging ? "opacity-30" : ""
                      } ${
                        isDropTarget ? "ring-2 ring-blue-400" : ""
                      }`}
                    >
                      {isDropTarget && bankInsertSide && (
                        <span
                          className="absolute top-0 bottom-0 w-[3px] bg-blue-500 rounded-full z-10"
                          style={{ [bankInsertSide === "before" ? "left" : "right"]: -6 }}
                        />
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (suppressBankClickRef.current) return;
                            openBankAccountModal("edit", account.id);
                          }}
                          className="text-sm font-normal text-slate-700 whitespace-nowrap hover:text-blue-700"
                        >
                          {`${account.name} ${suffix}`}
                        </button>

                        <div data-no-drag>
                          <InlineEdit
                            value={account.balance}
                            onSave={(newBalance) => handleSaveAccountBalance(account.id, newBalance)}
                            className="text-xl font-bold text-slate-900 whitespace-nowrap"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {/* Ghost flotante para cuentas */}
                {bankDrag?.isDragActive && bankDragPos && bankDragGhost && (
                  <div
                    className="fixed pointer-events-none z-[9999] px-4 py-2 rounded-xl bg-white border border-slate-200 shadow-xl text-sm font-medium text-slate-700"
                    style={{
                      left: bankDragPos.x - bankDragGhost.offsetX,
                      top: bankDragPos.y - bankDragGhost.offsetY,
                      width: bankDragGhost.w,
                      transform: "scale(1.02)",
                      opacity: 0.95,
                    }}
                  >
                    {bankDragGhost.label}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Fuentes de Ingreso - Excel Style Table */}
          <section>
            {/* Header: título + botón +, mes centrado, acciones */}
            <div className="relative flex items-center mb-3">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-slate-700">Fuentes de Ingreso</span>
                <button
                  onClick={openSourceModalCreate}
                  className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 text-lg"
                  title="Añadir fuente"
                >
                  +
                </button>
              </div>

              <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 min-w-[200px] justify-center">
                <button
                  onClick={prevMonth}
                  className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500"
                >
                  ‹
                </button>
                <span className="text-sm font-medium text-slate-700 truncate max-w-[200px] text-center">
                  {getMonthLabel(selectedMonthId)}
                </span>
                <button
                  onClick={nextMonth}
                  className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500"
                >
                  ›
                </button>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setIsForecastEditorOpen(true)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Editar previsiones
                </button>
              </div>
            </div>

            {leafForecastLines.length === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-slate-400">
                No hay previsiones configuradas
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                {/* Filtros */}
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50">
                  {/* Filtro de fuentes por grupos */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-slate-500">Fuentes:</span>
                    {mainSourceBlocks.map((block) => {
                      const blockLeafIds = block.items.map((i) => i.id);
                      const allSelected = blockLeafIds.every((id) =>
                        selectedLeafIdsMain.length === 0 || selectedLeafIdsMain.includes(id)
                      );
                      const someSelected = blockLeafIds.some((id) =>
                        selectedLeafIdsMain.length === 0 || selectedLeafIdsMain.includes(id)
                      );
                      return (
                        <button
                          key={block.id}
                          onClick={() => {
                            if (selectedLeafIdsMain.length === 0) {
                              // Deseleccionar este grupo (quitar sus leafs)
                              setSelectedLeafIdsMain(allLeafIdsMain.filter((id) => !blockLeafIds.includes(id)));
                            } else if (allSelected) {
                              // Quitar todos los leafs del grupo
                              setSelectedLeafIdsMain((prev) => prev.filter((id) => !blockLeafIds.includes(id)));
                            } else {
                              // Añadir todos los leafs del grupo
                              setSelectedLeafIdsMain((prev) => [...new Set([...prev, ...blockLeafIds])]);
                            }
                          }}
                          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                            allSelected
                              ? FIN_COLORS.sourceChipActive
                              : someSelected
                              ? FIN_COLORS.sourceChipActive
                              : FIN_COLORS.sourceChipInactive
                          }`}
                        >
                          {block.title}
                        </button>
                      );
                    })}
                    {selectedLeafIdsMain.length > 0 && (
                      <button
                        onClick={() => setSelectedLeafIdsMain([])}
                        className="px-2 py-0.5 text-xs text-slate-500 hover:text-slate-700"
                      >
                        Mostrar todas
                      </button>
                    )}
                  </div>

                  {/* Filtros: Bloques (Gastos/Ingresos/Total) + Subcolumnas (Real/Prev/Dif) */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">Bloques:</span>
                      <button
                        onClick={() => setShowExpenseMain((v) => !v)}
                        className={getFinanceChipClass({ variant: "GASTO", selected: showExpenseMain })}
                      >
                        Gastos
                      </button>
                      <button
                        onClick={() => setShowIncomeMain((v) => !v)}
                        className={getFinanceChipClass({ variant: "INGRESO", selected: showIncomeMain })}
                      >
                        Ingresos
                      </button>
                      <button
                        onClick={() => setShowTotalMain((v) => !v)}
                        className={getFinanceChipClass({ variant: "TOTAL", selected: showTotalMain })}
                      >
                        Total
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">Columnas:</span>
                      <button
                        onClick={() => setShowRealCols((v) => !v)}
                        className={getFinanceChipClass({ variant: "REAL", selected: showRealCols })}
                      >
                        Real
                      </button>
                      <button
                        onClick={() => setShowPrevCols((v) => !v)}
                        className={getFinanceChipClass({ variant: "PREV", selected: showPrevCols })}
                      >
                        Previsión
                      </button>
                      <button
                        onClick={() => setShowDiffCols((v) => !v)}
                        className={getFinanceChipClass({ variant: "DIF", selected: showDiffCols })}
                      >
                        Diferencia
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tabla Excel - Shrink to fit */}
                <div className="overflow-x-auto">
                  <table className="border-collapse">
                    {/* Header multinivel */}
                    <thead>
                      {/* Nivel 1: GASTOS / INGRESOS / TOTAL */}
                      <tr className="bg-slate-50 h-9">
                        <th
                          className="sticky left-0 z-30 bg-slate-50 min-w-[140px] border-b border-r border-slate-200 text-left"
                          rowSpan={2}
                        >
                          <span className="text-base font-bold text-slate-900 px-3">Fuentes</span>
                        </th>
                        {showExpenseMain && visibleSubcolsPerBlock > 0 && (
                          <th
                            colSpan={visibleSubcolsPerBlock}
                          className="bg-red-50 border-b border-r border-slate-300/60 text-xs font-semibold text-red-600 px-2"
                          >
                            GASTOS
                          </th>
                        )}
                        {showIncomeMain && visibleSubcolsPerBlock > 0 && (
                          <th
                            colSpan={visibleSubcolsPerBlock}
                          className="bg-green-50 border-b border-r border-slate-300/60 text-xs font-semibold text-green-600 px-2"
                          >
                            INGRESOS
                          </th>
                        )}
                        {showTotalMain && visibleSubcolsPerBlock > 0 && (
                          <th
                            colSpan={visibleSubcolsPerBlock}
                          className="bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-900 px-2"
                          >
                            TOTAL
                          </th>
                        )}
                      </tr>
                      {/* Nivel 2: Real / Prev / Dif */}
                      <tr className="bg-slate-50 h-7">
                        {/* GASTOS subcols */}
                        {showExpenseMain && effectiveShowReal && <th className="bg-red-50/50 min-w-[72px] border-b border-r border-slate-100 text-xs font-semibold text-slate-900 px-2">Real</th>}
                        {showExpenseMain && effectiveShowPrev && <th className="bg-red-50/50 min-w-[72px] border-b border-r border-slate-100 text-xs font-semibold text-slate-900 px-2">Prev</th>}
                        {showExpenseMain && effectiveShowDiff && <th className="bg-red-50/50 min-w-[72px] border-b border-r border-slate-300/60 text-xs font-semibold text-slate-900 px-2">Dif</th>}
                        {/* INGRESOS subcols */}
                        {showIncomeMain && effectiveShowReal && <th className="bg-green-50/50 min-w-[72px] border-b border-r border-slate-100 text-xs font-semibold text-slate-900 px-2">Real</th>}
                        {showIncomeMain && effectiveShowPrev && <th className="bg-green-50/50 min-w-[72px] border-b border-r border-slate-100 text-xs font-semibold text-slate-900 px-2">Prev</th>}
                        {showIncomeMain && effectiveShowDiff && <th className="bg-green-50/50 min-w-[72px] border-b border-r border-slate-300/60 text-xs font-semibold text-slate-900 px-2">Dif</th>}
                        {/* TOTAL subcols */}
                        {showTotalMain && effectiveShowReal && <th className="bg-slate-100/50 min-w-[72px] border-b border-r border-slate-100 text-xs font-semibold text-slate-900 px-2">Real</th>}
                        {showTotalMain && effectiveShowPrev && <th className="bg-slate-100/50 min-w-[72px] border-b border-r border-slate-100 text-xs font-semibold text-slate-900 px-2">Prev</th>}
                        {showTotalMain && effectiveShowDiff && <th className="bg-slate-100/50 min-w-[72px] border-b border-r border-slate-300/60 text-xs font-semibold text-slate-900 px-2">Dif</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Filas agrupadas por bloques */}
                      {mainSourceBlocks.map((block) => {
                        // Filtrar items seleccionados
                        const visibleItems = block.items.filter((item) =>
                          effectiveLeafIdsMain.includes(item.id)
                        );
                        if (visibleItems.length === 0) return null;

                        const isBlockDragging = forecastDrag?.id === block.id && forecastDrag.isDragActive;
                        const isBlockDropTarget = forecastDragOverId === block.id;
                        return (
                          <Fragment key={block.id}>
                            {/* Fila título de grupo - draggable para reordenar */}
                            <tr
                              ref={(el) => { if (el) forecastRowRefs.current.set(block.id, el); else forecastRowRefs.current.delete(block.id); }}
                              className={`bg-slate-50/70 select-none ${isBlockDragging ? "opacity-30" : ""}`}
                              onPointerDown={(e) => {
                                if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
                                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                                const rootLine = forecastLines.find(l => l.id === block.id);
                                setForecastDrag({ id: block.id, kind: "root", parentId: null, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId, isDragActive: false });
                                setForecastDragOverId(null);
                                setForecastInsertSide(null);
                                suppressForecastClickRef.current = false;
                              }}
                              onPointerMove={(e) => {
                                if (!forecastDrag || forecastDrag.id !== block.id) return;
                                const dx = e.clientX - forecastDrag.startX;
                                const dy = e.clientY - forecastDrag.startY;
                                const dist = Math.sqrt(dx * dx + dy * dy);
                                if (dist > FORECAST_DRAG_THRESHOLD && !forecastDrag.isDragActive) {
                                  setForecastDrag({ ...forecastDrag, isDragActive: true });
                                  suppressForecastClickRef.current = true;
                                  const el = forecastRowRefs.current.get(block.id);
                                  if (el) {
                                    const r = el.getBoundingClientRect();
                                    setForecastDragGhost({ label: block.title, w: r.width, h: r.height, offsetX: e.clientX - r.left, offsetY: e.clientY - r.top });
                                  }
                                }
                                if (forecastDrag.isDragActive && forecastDrag.kind === "root") {
                                  setForecastDragPos({ x: e.clientX, y: e.clientY });
                                  let foundId: string | null = null;
                                  let side: "before" | "after" | null = null;
                                  // Solo buscar otros root blocks
                                  mainSourceBlocks.forEach((b) => {
                                    if (b.id === forecastDrag.id) return;
                                    const el = forecastRowRefs.current.get(b.id);
                                    if (!el) return;
                                    const rect = el.getBoundingClientRect();
                                    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                                      foundId = b.id;
                                      const midY = (rect.top + rect.bottom) / 2;
                                      side = e.clientY < midY ? "before" : "after";
                                    }
                                  });
                                  setForecastDragOverId(foundId);
                                  setForecastInsertSide(side);
                                }
                              }}
                              onPointerUp={(e) => {
                                if (!forecastDrag || forecastDrag.id !== block.id) return;
                                (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                                if (forecastDrag.isDragActive && forecastDrag.kind === "root" && forecastDragOverId && forecastDragOverId !== forecastDrag.id) {
                                  // Reordenar root items
                                  const rootIds = mainSourceBlocks.map(b => b.id);
                                  const fromIdx = rootIds.indexOf(forecastDrag.id);
                                  let toIdx = rootIds.indexOf(forecastDragOverId);
                                  if (fromIdx !== -1 && toIdx !== -1) {
                                    if (forecastInsertSide === "after") toIdx += 1;
                                    if (fromIdx < toIdx) toIdx -= 1;
                                    const newRootIds = [...rootIds];
                                    const [removed] = newRootIds.splice(fromIdx, 1);
                                    newRootIds.splice(toIdx, 0, removed);
                                    // Crear updates con nuevo order
                                    const updates = newRootIds.map((id, idx) => ({ id, order: idx + 1 }));
                                    handleReorderForecastLines(updates);
                                  }
                                }
                                setForecastDrag(null);
                                setForecastDragOverId(null);
                                setForecastDragPos(null);
                                setForecastDragGhost(null);
                                setForecastInsertSide(null);
                                setTimeout(() => { suppressForecastClickRef.current = false; }, 0);
                              }}
                              onPointerCancel={() => {
                                setForecastDrag(null);
                                setForecastDragOverId(null);
                                setForecastDragPos(null);
                                setForecastDragGhost(null);
                                setForecastInsertSide(null);
                                suppressForecastClickRef.current = false;
                              }}
                            >
                              <td
                                colSpan={1 + totalDataColsMain}
                                className={`sticky left-0 z-20 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-900 border-b border-slate-200 cursor-grab active:cursor-grabbing relative ${
                                  isBlockDropTarget ? "ring-2 ring-blue-400 ring-inset" : ""
                                }`}
                              >
                                {isBlockDropTarget && forecastInsertSide && (
                                  <span
                                    className="absolute left-0 right-0 h-[3px] bg-blue-500 z-10"
                                    style={{ [forecastInsertSide === "before" ? "top" : "bottom"]: -2 }}
                                  />
                                )}
                                <button
                                  onClick={() => {
                                    if (suppressForecastClickRef.current) return;
                                    openSourceModalEdit(block.id);
                                  }}
                                  className="text-left hover:text-blue-600 hover:underline cursor-pointer"
                                >
                                  {block.title}
                                </button>
                              </td>
                            </tr>
                            {/* Filas de fuentes leaf */}
                            {visibleItems.map((leaf) => {
                              // Usar getMonthBase para que coincida con el modal (REAL = base)
                              const realIng = getMonthBase(leaf, selectedMonthId, "INGRESO");
                              const realGas = getMonthBase(leaf, selectedMonthId, "GASTO");
                              const realTot = realIng - realGas;
                              const prevIng = getMonthExpected(leaf, selectedMonthId, "INGRESO");
                              const prevGas = getMonthExpected(leaf, selectedMonthId, "GASTO");
                              const prevTot = prevIng - prevGas;
                              const difIng = realIng - prevIng;
                              const difGas = realGas - prevGas;
                              const difTot = realTot - prevTot;

                              const isLeafDragging = forecastDrag?.id === leaf.id && forecastDrag.isDragActive;
                              const isLeafDropTarget = forecastDragOverId === leaf.id && forecastDrag?.kind === "child";
                              const leafParentId = leaf.parentId || block.id;

                              return (
                                <tr
                                  key={leaf.id}
                                  ref={(el) => { if (el) forecastRowRefs.current.set(leaf.id, el); else forecastRowRefs.current.delete(leaf.id); }}
                                  className={`hover:bg-slate-50/50 border-b border-slate-100 select-none ${isLeafDragging ? "opacity-30" : ""}`}
                                  onPointerDown={(e) => {
                                    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
                                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                                    setForecastDrag({ id: leaf.id, kind: "child", parentId: leafParentId, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId, isDragActive: false });
                                    setForecastDragOverId(null);
                                    setForecastInsertSide(null);
                                    suppressForecastClickRef.current = false;
                                  }}
                                  onPointerMove={(e) => {
                                    if (!forecastDrag || forecastDrag.id !== leaf.id) return;
                                    const dx = e.clientX - forecastDrag.startX;
                                    const dy = e.clientY - forecastDrag.startY;
                                    const dist = Math.sqrt(dx * dx + dy * dy);
                                    if (dist > FORECAST_DRAG_THRESHOLD && !forecastDrag.isDragActive) {
                                      setForecastDrag({ ...forecastDrag, isDragActive: true });
                                      suppressForecastClickRef.current = true;
                                      const el = forecastRowRefs.current.get(leaf.id);
                                      if (el) {
                                        const r = el.getBoundingClientRect();
                                        setForecastDragGhost({ label: leaf.name, w: r.width, h: r.height, offsetX: e.clientX - r.left, offsetY: e.clientY - r.top });
                                      }
                                    }
                                    if (forecastDrag.isDragActive && forecastDrag.kind === "child") {
                                      setForecastDragPos({ x: e.clientX, y: e.clientY });
                                      let foundId: string | null = null;
                                      let side: "before" | "after" | null = null;
                                      // Solo buscar otros children del mismo parentId
                                      visibleItems.forEach((sibling) => {
                                        if (sibling.id === forecastDrag.id) return;
                                        const el = forecastRowRefs.current.get(sibling.id);
                                        if (!el) return;
                                        const rect = el.getBoundingClientRect();
                                        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                                          foundId = sibling.id;
                                          const midY = (rect.top + rect.bottom) / 2;
                                          side = e.clientY < midY ? "before" : "after";
                                        }
                                      });
                                      setForecastDragOverId(foundId);
                                      setForecastInsertSide(side);
                                    }
                                  }}
                                  onPointerUp={(e) => {
                                    if (!forecastDrag || forecastDrag.id !== leaf.id) return;
                                    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                                    if (forecastDrag.isDragActive && forecastDrag.kind === "child" && forecastDragOverId && forecastDragOverId !== forecastDrag.id) {
                                      // Reordenar children dentro del mismo parentId
                                      const childIds = visibleItems.map(i => i.id);
                                      const fromIdx = childIds.indexOf(forecastDrag.id);
                                      let toIdx = childIds.indexOf(forecastDragOverId);
                                      if (fromIdx !== -1 && toIdx !== -1) {
                                        if (forecastInsertSide === "after") toIdx += 1;
                                        if (fromIdx < toIdx) toIdx -= 1;
                                        const newChildIds = [...childIds];
                                        const [removed] = newChildIds.splice(fromIdx, 1);
                                        newChildIds.splice(toIdx, 0, removed);
                                        // Crear updates con nuevo order (solo para children de este bloque)
                                        const updates = newChildIds.map((id, idx) => ({ id, order: idx + 1 }));
                                        handleReorderForecastLines(updates);
                                      }
                                    }
                                    setForecastDrag(null);
                                    setForecastDragOverId(null);
                                    setForecastDragPos(null);
                                    setForecastDragGhost(null);
                                    setForecastInsertSide(null);
                                    setTimeout(() => { suppressForecastClickRef.current = false; }, 0);
                                  }}
                                  onPointerCancel={() => {
                                    setForecastDrag(null);
                                    setForecastDragOverId(null);
                                    setForecastDragPos(null);
                                    setForecastDragGhost(null);
                                    setForecastInsertSide(null);
                                    suppressForecastClickRef.current = false;
                                  }}
                                >
                                  {/* Nombre - clickable para editar fuente/subcategorías */}
                                  <td className={`sticky left-0 z-20 bg-white min-w-[140px] px-3 py-2 text-sm text-slate-700 border-r border-slate-200 whitespace-nowrap cursor-grab active:cursor-grabbing relative ${
                                    isLeafDropTarget ? "ring-2 ring-blue-400 ring-inset" : ""
                                  }`}>
                                    {isLeafDropTarget && forecastInsertSide && (
                                      <span
                                        className="absolute left-0 right-0 h-[3px] bg-blue-500 z-10"
                                        style={{ [forecastInsertSide === "before" ? "top" : "bottom"]: -2 }}
                                      />
                                    )}
                                    <button
                                      onClick={() => {
                                        if (suppressForecastClickRef.current) return;
                                        openSourceModalEdit(leaf.id);
                                      }}
                                      className="text-left hover:text-blue-600 hover:underline cursor-pointer"
                                    >
                                      {leaf.name}
                                    </button>
                                  </td>
                                  {/* GASTOS: Real / Prev / Dif */}
                                  {showExpenseMain && effectiveShowReal && (
                                    <td data-no-drag className="min-w-[72px] px-0 border-r border-slate-100 bg-slate-50/30">
                                      <InlineEdit
                                        value={realGas}
                                        onSave={(newVal) => handleSaveForecastReal(leaf.id, "GASTO", newVal)}
                                        suffix=""
                                        className="w-full h-full px-2 text-sm tabular-nums font-medium text-right text-slate-800"
                                      />
                                    </td>
                                  )}
                                  {showExpenseMain && effectiveShowPrev && (
                                    <td data-no-drag className="min-w-[72px] px-0 border-r border-slate-100 bg-blue-50/20">
                                      <InlineEdit
                                        value={prevGas}
                                        onSave={(newVal) => handleSaveForecastPrev(leaf.id, "GASTO", newVal)}
                                        suffix=""
                                        className="w-full h-full px-2 text-sm tabular-nums font-medium text-right text-slate-800"
                                      />
                                    </td>
                                  )}
                                  {showExpenseMain && effectiveShowDiff && (
                                    <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-semibold text-right text-slate-800 border-r border-slate-200 whitespace-nowrap">
                                      {formatNumberES(difGas)}
                                    </td>
                                  )}
                                  {/* INGRESOS: Real / Prev / Dif */}
                                  {showIncomeMain && effectiveShowReal && (
                                    <td data-no-drag className="min-w-[72px] px-0 border-r border-slate-100 bg-slate-50/30">
                                      <InlineEdit
                                        value={realIng}
                                        onSave={(newVal) => handleSaveForecastReal(leaf.id, "INGRESO", newVal)}
                                        suffix=""
                                        className="w-full h-full px-2 text-sm tabular-nums font-medium text-right text-slate-800"
                                      />
                                    </td>
                                  )}
                                  {showIncomeMain && effectiveShowPrev && (
                                    <td data-no-drag className="min-w-[72px] px-0 border-r border-slate-100 bg-blue-50/20">
                                      <InlineEdit
                                        value={prevIng}
                                        onSave={(newVal) => handleSaveForecastPrev(leaf.id, "INGRESO", newVal)}
                                        suffix=""
                                        className="w-full h-full px-2 text-sm tabular-nums font-medium text-right text-slate-800"
                                      />
                                    </td>
                                  )}
                                  {showIncomeMain && effectiveShowDiff && (
                                    <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-semibold text-right text-slate-800 border-r border-slate-200 whitespace-nowrap">
                                      {formatNumberES(difIng)}
                                    </td>
                                  )}
                                  {/* TOTAL: Real / Prev / Dif */}
                                  {showTotalMain && effectiveShowReal && (
                                    <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-medium text-right text-slate-800 border-r border-slate-100 whitespace-nowrap">
                                      {formatNumberES(realTot)}
                                    </td>
                                  )}
                                  {showTotalMain && effectiveShowPrev && (
                                    <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-medium text-right text-slate-800 border-r border-slate-100 bg-blue-50/20 whitespace-nowrap">
                                      {formatNumberES(prevTot)}
                                    </td>
                                  )}
                                  {showTotalMain && effectiveShowDiff && (
                                    <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-semibold text-right text-slate-800 whitespace-nowrap">
                                      {formatNumberES(difTot)}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </Fragment>
                        );
                      })}

                      {/* Fila TOTAL global */}
                      {(() => {
                        // Calcular totales sumando todos los leafs efectivos (usando getMonthBase para consistencia)
                        let totalRealIng = 0, totalRealGas = 0, totalPrevIng = 0, totalPrevGas = 0;
                        effectiveLeafIdsMain.forEach((leafId) => {
                          const line = forecastLines.find((fl) => fl.id === leafId);
                          if (line) {
                            totalRealIng += getMonthBase(line, selectedMonthId, "INGRESO");
                            totalRealGas += getMonthBase(line, selectedMonthId, "GASTO");
                            totalPrevIng += getMonthExpected(line, selectedMonthId, "INGRESO");
                            totalPrevGas += getMonthExpected(line, selectedMonthId, "GASTO");
                          }
                        });
                        const totalRealTot = totalRealIng - totalRealGas;
                        const totalPrevTot = totalPrevIng - totalPrevGas;
                        const totalDifIng = totalRealIng - totalPrevIng;
                        const totalDifGas = totalRealGas - totalPrevGas;
                        const totalDifTot = totalRealTot - totalPrevTot;

                        return (
                          <tr className="bg-slate-100 border-t-2 border-slate-300">
                            {/* Nombre */}
                            <td className="sticky left-0 z-20 bg-slate-100 min-w-[140px] px-3 py-2 text-sm font-bold text-slate-800 border-r border-slate-200 whitespace-nowrap">
                              TOTAL
                            </td>
                            {/* GASTOS totals */}
                            {showExpenseMain && effectiveShowReal && (
                              <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-bold text-right text-slate-800 border-r border-slate-200 whitespace-nowrap">
                                {formatNumberES(totalRealGas)}
                              </td>
                            )}
                            {showExpenseMain && effectiveShowPrev && (
                              <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-bold text-right text-slate-800 border-r border-slate-200 bg-blue-50/30 whitespace-nowrap">
                                {formatNumberES(totalPrevGas)}
                              </td>
                            )}
                            {showExpenseMain && effectiveShowDiff && (
                              <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-semibold text-right text-slate-800 border-r border-slate-300 whitespace-nowrap">
                                {formatNumberES(totalDifGas)}
                              </td>
                            )}
                            {/* INGRESOS totals */}
                            {showIncomeMain && effectiveShowReal && (
                              <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-bold text-right text-slate-800 border-r border-slate-200 whitespace-nowrap">
                                {formatNumberES(totalRealIng)}
                              </td>
                            )}
                            {showIncomeMain && effectiveShowPrev && (
                              <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-bold text-right text-slate-800 border-r border-slate-200 bg-blue-50/30 whitespace-nowrap">
                                {formatNumberES(totalPrevIng)}
                              </td>
                            )}
                            {showIncomeMain && effectiveShowDiff && (
                              <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-semibold text-right text-slate-800 border-r border-slate-300 whitespace-nowrap">
                                {formatNumberES(totalDifIng)}
                              </td>
                            )}
                            {/* TOTAL totals */}
                            {showTotalMain && effectiveShowReal && (
                              <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-bold text-right text-slate-800 border-r border-slate-200 whitespace-nowrap">
                                {formatNumberES(totalRealTot)}
                              </td>
                            )}
                            {showTotalMain && effectiveShowPrev && (
                              <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-bold text-right text-slate-800 border-r border-slate-200 bg-blue-50/30 whitespace-nowrap">
                                {formatNumberES(totalPrevTot)}
                              </td>
                            )}
                            {showTotalMain && effectiveShowDiff && (
                              <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-semibold text-right text-slate-800 whitespace-nowrap">
                                {formatNumberES(totalDifTot)}
                              </td>
                            )}
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
                {/* Ghost flotante para fuentes */}
                {forecastDrag?.isDragActive && forecastDragPos && forecastDragGhost && (
                  <div
                    className="fixed pointer-events-none z-[9999] px-3 py-1.5 rounded bg-slate-100 border border-slate-300 shadow-xl text-sm font-bold text-slate-900"
                    style={{
                      left: forecastDragPos.x - forecastDragGhost.offsetX,
                      top: forecastDragPos.y - forecastDragGhost.offsetY,
                      minWidth: 120,
                      transform: "scale(1.02)",
                      opacity: 0.95,
                    }}
                  >
                    {forecastDragGhost.label}
                  </div>
                )}
              </div>
            )}
          </section>

            {/* Movimientos */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-slate-700">Movimientos</h2>
                <button className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  + Añadir movimiento
                </button>
              </div>

              {movements.length === 0 ? (
                <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-slate-400">
                  No hay movimientos
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <div className="divide-y divide-slate-100">
                      {displayedMovements.map((mov) => {
                        const account = bankAccounts.find((a) => a.id === mov.accountId);
                        const forecast = forecastLines.find((f) => f.id === mov.forecastId);
                        return (
                          <div key={mov.id} className="px-4 py-3 flex items-center justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-700">{mov.concept}</span>
                                {account && (
                                  <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                                    {account.name}
                                  </span>
                                )}
                                {forecast && (
                                  <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                                    {forecast.name}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 mt-0.5">
                                {formatDateShort(mov.date)}
                              </div>
                            </div>
                            <div
                              className={`font-semibold ${
                                mov.type === "INGRESO" ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {mov.type === "INGRESO" ? "+" : "-"}
                              {formatEUR(mov.amount)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {movements.length > 10 && (
                    <div className="mt-3 text-center">
                      <button
                        onClick={() => setShowAllMovements(!showAllMovements)}
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        {showAllMovements ? "Mostrar menos" : "Mostrar más"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </main>

      {/* Bank Account Modal (unified create/edit) */}
      <BankAccountModal
        open={isBankAccountModalOpen}
        mode={bankAccountModalMode}
        accountId={editingBankAccountId}
        onClose={closeBankAccountModal}
        onCreated={handleAccountCreated}
        onUpdated={handleAccountUpdated}
        onDeleted={handleAccountDeleted}
        createAccount={createBankAccount}
        updateAccount={updateBankAccount}
        deleteAccount={handleDeleteAccount}
        getAccountById={getAccountById}
      />

      {/* Forecast Editor Modal - Excel Style */}
      {isForecastEditorOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-2"
          onClick={() => setIsForecastEditorOpen(false)}
        >
          <div
            className="bg-white w-full max-w-[95vw] max-h-[95vh] rounded-xl border border-slate-200 shadow-lg flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-200 flex-shrink-0">
              {/* Row 1: Year selector + close */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setForecastEditorYear((y) => y - 1)}
                    className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm"
                  >
                    ‹
                  </button>
                  <span className="text-base font-semibold text-slate-800 min-w-[50px] text-center">
                    {forecastEditorYear}
                  </span>
                  <button
                    onClick={() => setForecastEditorYear((y) => y + 1)}
                    className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm"
                  >
                    ›
                  </button>
                </div>
                <button
                  onClick={() => setIsForecastEditorOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                >
                  ×
                </button>
              </div>

              {/* Row 2: Source blocks in single horizontal scrollable row */}
              {sourceBlocks.length > 0 && (
                <div className="overflow-x-auto mb-3">
                  <div className="inline-flex items-center gap-4 whitespace-nowrap pb-1">
                    {sourceBlocks.map((block) => (
                      <div key={block.id} className="inline-flex items-center gap-1.5">
                        <span className="text-sm font-bold text-slate-900">{block.title}:</span>
                        {block.items.map((item) => {
                          const isActive = effectiveLeafIds.includes(item.id);
                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                setSelectedLeafIds((prev) => {
                                  if (prev.length === 0) {
                                    return allLeafIds.filter((id) => id !== item.id);
                                  }
                                  return prev.includes(item.id)
                                    ? prev.filter((id) => id !== item.id)
                                    : [...prev, item.id];
                                });
                              }}
                              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                                isActive ? FIN_COLORS.sourceChipActive : FIN_COLORS.sourceChipInactive
                              }`}
                            >
                              {item.name}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Row 3: Filters - Columnas y Filas */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {/* Columnas: Gasto/Ingreso/Total */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-slate-500">Columnas:</span>
                  <button
                    onClick={() => setShowExpense((v) => !v)}
                        className={getFinanceChipClass({ variant: "GASTO", selected: showExpense })}
                  >
                    Gasto
                  </button>
                  <button
                    onClick={() => setShowIncome((v) => !v)}
                    className={getFinanceChipClass({ variant: "INGRESO", selected: showIncome })}
                  >
                    Ingreso
                  </button>
                  <button
                    onClick={() => setShowTotal((v) => !v)}
                    className={getFinanceChipClass({ variant: "TOTAL", selected: showTotal })}
                  >
                    Total
                  </button>
                </div>
                {/* Filas: Real/Prevision/Diferencia */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-slate-500">Filas:</span>
                  <button
                    onClick={() => setShowRowReal((v) => !v)}
                    className={getFinanceChipClass({ variant: "REAL", selected: showRowReal })}
                  >
                    Real
                  </button>
                  <button
                    onClick={() => setShowRowPrev((v) => !v)}
                    className={getFinanceChipClass({ variant: "PREV", selected: showRowPrev })}
                  >
                    Previsión
                  </button>
                  <button
                    onClick={() => setShowRowDiff((v) => !v)}
                    className={getFinanceChipClass({ variant: "DIF", selected: showRowDiff })}
                  >
                    Diferencia
                  </button>
                </div>
              </div>
            </div>

            {/* Excel Table Content - Single scroll container with sticky columns */}
            <div className="flex-1 overflow-auto">
              {effectiveLeafIds.length === 0 ? (
                <div className="flex-1 h-full flex items-center justify-center text-slate-400 text-sm">
                  Selecciona al menos una fuente
                </div>
              ) : (
                <div className="inline-block min-w-full">
                <table className="border-collapse">
                  {/* THEAD: sticky top for vertical scroll */}
                  <thead className="sticky top-0 z-40">
                    {/* Header row 1: Source names */}
                    <tr className="bg-slate-50 h-10">
                      {/* Fixed: Mes */}
                      <th className="sticky left-0 z-50 bg-slate-50 w-[72px] min-w-[72px] border-b border-r border-slate-200 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" />
                      {/* Fixed: Tipo */}
                      <th className="sticky left-[72px] z-50 bg-slate-50 w-[60px] min-w-[60px] border-b border-r border-slate-200/60 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" />
                      {/* Source headers */}
                      {effectiveLeafIds.map((leafId) => {
                        const line = getLineById(leafId);
                        const colCount = (showExpense ? 1 : 0) + (showIncome ? 1 : 0) + (showTotal ? 1 : 0);
                        return (
                          <th
                            key={leafId}
                            colSpan={colCount}
                            className="bg-slate-50 border-b border-r border-slate-300/70 text-sm font-bold text-slate-900 px-2 whitespace-nowrap"
                          >
                            {line?.name || leafId}
                          </th>
                        );
                      })}
                      {/* TOTAL header - separador fuerte */}
                      <th
                        colSpan={(showExpense ? 1 : 0) + (showIncome ? 1 : 0) + (showTotal ? 1 : 0)}
                        className="bg-slate-100 border-b border-l-2 border-l-slate-300 border-slate-200 text-sm font-bold text-slate-800 px-2 whitespace-nowrap"
                      >
                        TOTAL
                      </th>
                    </tr>
                    {/* Header row 2: Subcol names - colores semánticos */}
                    <tr className="bg-slate-50 h-7">
                      {/* Fixed: Mes label */}
                      <th className="sticky left-0 z-50 bg-slate-50 w-[72px] min-w-[72px] border-b border-r border-slate-200 text-xs font-medium text-slate-500 text-left px-2 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                        Mes
                      </th>
                      {/* Fixed: Tipo label */}
                      <th className="sticky left-[72px] z-50 bg-slate-50 w-[60px] min-w-[60px] border-b border-r border-slate-200/60 text-xs font-medium text-slate-500 text-left px-2 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                        Tipo
                      </th>
                      {/* Source subcols - colores semánticos en labels */}
                      {effectiveLeafIds.map((leafId) => (
                        <Fragment key={leafId}>
                          {showExpense && <th className={`bg-slate-50 min-w-[72px] border-b border-r border-slate-200/40 text-xs font-semibold px-2 whitespace-nowrap ${FIN_COLORS.gasto.label}`}>gast</th>}
                          {showIncome && <th className={`bg-slate-50 min-w-[72px] border-b border-r border-slate-200/40 text-xs font-semibold px-2 whitespace-nowrap ${FIN_COLORS.ingreso.label}`}>ing</th>}
                          {showTotal && <th className={`bg-slate-50 min-w-[72px] border-b border-r border-slate-300/60 text-xs font-semibold px-2 whitespace-nowrap ${FIN_COLORS.total.label}`}>total</th>}
                        </Fragment>
                      ))}
                      {/* TOTAL subcols - colores semánticos en labels */}
                      {showExpense && <th className={`bg-slate-100 min-w-[72px] border-b border-l-2 border-l-slate-300 border-r border-slate-200/40 text-xs font-semibold px-2 whitespace-nowrap ${FIN_COLORS.gasto.label}`}>gast</th>}
                      {showIncome && <th className={`bg-slate-100 min-w-[72px] border-b border-r border-slate-200/40 text-xs font-semibold px-2 whitespace-nowrap ${FIN_COLORS.ingreso.label}`}>ing</th>}
                      {showTotal && <th className={`bg-slate-100 min-w-[72px] border-b border-slate-200 text-xs font-semibold px-2 whitespace-nowrap ${FIN_COLORS.total.label}`}>total</th>}
                    </tr>
                  </thead>
                  {/* TBODY: data rows */}
                  <tbody>
                    {forecastEditorMonthIds.map((monthId, mIdx) => {
                      // Compute TOTAL sums for this month
                      let totalRealGas = 0, totalRealIng = 0, totalPrevGas = 0, totalPrevIng = 0;
                      effectiveLeafIds.forEach((leafId) => {
                        const line = getLineById(leafId);
                        if (line) {
                          totalRealGas += computeReal(leafId, monthId, "GASTO");
                          totalRealIng += computeReal(leafId, monthId, "INGRESO");
                          totalPrevGas += getPrev(line, monthId, "GASTO");
                          totalPrevIng += getPrev(line, monthId, "INGRESO");
                        }
                      });
                      const totalRealTotal = totalRealIng - totalRealGas;
                      const totalPrevTotal = totalPrevIng - totalPrevGas;
                      const totalDifGas = totalRealGas - totalPrevGas;
                      const totalDifIng = totalRealIng - totalPrevIng;
                      const totalDifTotal = totalRealTotal - totalPrevTotal;
                      // Alternating month background
                      const monthBg = mIdx % 2 === 0 ? "" : "bg-slate-50/40";
                      const monthBgColor = mIdx % 2 === 0 ? "#fff" : "#f8fafc";
                      // Calculate visible row count for rowSpan
                      const visibleRowCount = (showRowReal ? 1 : 0) + (showRowPrev ? 1 : 0) + (showRowDiff ? 1 : 0);
                      // Track if we've rendered the month cell
                      let monthCellRendered = false;

                      return (
                        <Fragment key={monthId}>
                          {/* REAL row */}
                          {showRowReal && (
                            <tr className={`h-8 ${monthBg} border-t-2 border-slate-200`}>
                              {/* Fixed: Mes (rowSpan=visibleRowCount) */}
                              {!monthCellRendered && (() => { monthCellRendered = true; return (
                                <td
                                  rowSpan={visibleRowCount}
                                  className="sticky left-0 z-30 w-[72px] min-w-[72px] border-r border-slate-200 text-sm font-semibold text-slate-700 text-center align-middle whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]"
                                  style={{ backgroundColor: monthBgColor }}
                                >
                                  {MONTH_ABBR[mIdx]}
                                </td>
                              ); })()}
                              {/* Fixed: Tipo */}
                              <td
                                className="sticky left-[72px] z-30 w-[60px] min-w-[60px] border-r border-slate-200/60 text-xs font-semibold px-2 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] text-slate-900"
                                style={{ backgroundColor: monthBgColor }}
                              >
                                real
                              </td>
                              {/* Data cells - números neutros */}
                              {effectiveLeafIds.map((leafId) => {
                                const line = getLineById(leafId);
                                const realGas = line ? computeReal(leafId, monthId, "GASTO") : 0;
                                const realIng = line ? computeReal(leafId, monthId, "INGRESO") : 0;
                                const realTotal = realIng - realGas;
                                return (
                                  <Fragment key={leafId}>
                                    {showExpense && <td className="min-w-[72px] px-2 text-sm tabular-nums text-slate-800 text-right border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(realGas)}</td>}
                                    {showIncome && <td className="min-w-[72px] px-2 text-sm tabular-nums text-slate-800 text-right border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(realIng)}</td>}
                                    {showTotal && <td className="min-w-[72px] px-2 text-sm tabular-nums text-slate-800 text-right border-r border-slate-300/60 whitespace-nowrap">{formatNumberES(realTotal)}</td>}
                                  </Fragment>
                                );
                              })}
                              {/* TOTAL real - separador fuerte */}
                              {showExpense && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-slate-800 text-right bg-slate-50 border-l-2 border-l-slate-300 border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(totalRealGas)}</td>}
                              {showIncome && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-slate-800 text-right bg-slate-50 border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(totalRealIng)}</td>}
                              {showTotal && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-slate-800 text-right bg-slate-50 whitespace-nowrap">{formatNumberES(totalRealTotal)}</td>}
                            </tr>
                          )}

                          {/* PREV row (editable) - visualmente igual a real */}
                          {showRowPrev && (
                            <tr className={`h-8 ${monthBg}`}>
                              {/* Fixed: Mes (if first visible row) */}
                              {!monthCellRendered && (() => { monthCellRendered = true; return (
                                <td
                                  rowSpan={visibleRowCount}
                                  className="sticky left-0 z-30 w-[72px] min-w-[72px] border-r border-slate-200 text-sm font-semibold text-slate-700 text-center align-middle whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]"
                                  style={{ backgroundColor: monthBgColor }}
                                >
                                  {MONTH_ABBR[mIdx]}
                                </td>
                              ); })()}
                              {/* Fixed: Tipo */}
                              <td
                                className="sticky left-[72px] z-30 w-[60px] min-w-[60px] border-r border-slate-200/60 text-xs font-semibold px-2 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] text-slate-900"
                                style={{ backgroundColor: monthBgColor }}
                              >
                                prev
                              </td>
                              {/* Data cells - números neutros */}
                              {effectiveLeafIds.map((leafId) => {
                                const line = getLineById(leafId);
                                const prevGas = line ? getPrev(line, monthId, "GASTO") : 0;
                                const prevIng = line ? getPrev(line, monthId, "INGRESO") : 0;
                                const prevTotal = prevIng - prevGas;
                                return (
                                  <Fragment key={leafId}>
                                    {showExpense && (
                                      <td className="min-w-[72px] px-0 border-r border-slate-200/40">
                                        <ForecastPrevCell
                                          lineId={leafId}
                                          monthId={monthId}
                                          type="GASTO"
                                          value={prevGas}
                                          onSave={async (newVal) => {
                                            const result = await updateForecastMonthPrev(leafId, monthId, "GASTO", newVal);
                                            if (!result.error) {
                                              setForecastLines((prev) =>
                                                prev.map((fl) =>
                                                  fl.id === leafId
                                                    ? { ...fl, months: { ...(fl.months || {}), [monthId]: { ...(fl.months?.[monthId] || {}), GASTO: { ...(fl.months?.[monthId]?.GASTO || {}), expected: newVal } } } }
                                                    : fl
                                                )
                                              );
                                            }
                                          }}
                                        />
                                      </td>
                                    )}
                                    {showIncome && (
                                      <td className="min-w-[72px] px-0 border-r border-slate-200/40">
                                        <ForecastPrevCell
                                          lineId={leafId}
                                          monthId={monthId}
                                          type="INGRESO"
                                          value={prevIng}
                                          onSave={async (newVal) => {
                                            const result = await updateForecastMonthPrev(leafId, monthId, "INGRESO", newVal);
                                            if (!result.error) {
                                              setForecastLines((prev) =>
                                                prev.map((fl) =>
                                                  fl.id === leafId
                                                    ? { ...fl, months: { ...(fl.months || {}), [monthId]: { ...(fl.months?.[monthId] || {}), INGRESO: { ...(fl.months?.[monthId]?.INGRESO || {}), expected: newVal } } } }
                                                    : fl
                                                )
                                              );
                                            }
                                          }}
                                        />
                                      </td>
                                    )}
                                    {showTotal && <td className="min-w-[72px] px-2 text-sm tabular-nums text-slate-800 text-right border-r border-slate-300/60 whitespace-nowrap">{formatNumberES(prevTotal)}</td>}
                                  </Fragment>
                                );
                              })}
                              {/* TOTAL prev - separador fuerte */}
                              {showExpense && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-slate-800 text-right bg-slate-50 border-l-2 border-l-slate-300 border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(totalPrevGas)}</td>}
                              {showIncome && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-slate-800 text-right bg-slate-50 border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(totalPrevIng)}</td>}
                              {showTotal && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-slate-800 text-right bg-slate-50 whitespace-nowrap">{formatNumberES(totalPrevTotal)}</td>}
                            </tr>
                          )}

                          {/* DIF row - colores semánticos */}
                          {showRowDiff && (
                            <tr className={`h-8 ${monthBg} border-b border-slate-300`}>
                              {/* Fixed: Mes (if first visible row) */}
                              {!monthCellRendered && (() => { monthCellRendered = true; return (
                                <td
                                  rowSpan={visibleRowCount}
                                  className="sticky left-0 z-30 w-[72px] min-w-[72px] border-r border-slate-200 text-sm font-semibold text-slate-700 text-center align-middle whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]"
                                  style={{ backgroundColor: monthBgColor }}
                                >
                                  {MONTH_ABBR[mIdx]}
                                </td>
                              ); })()}
                              {/* Fixed: Tipo */}
                              <td
                                className="sticky left-[72px] z-30 w-[60px] min-w-[60px] border-r border-slate-200/60 text-xs font-semibold px-2 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] text-slate-900"
                                style={{ backgroundColor: monthBgColor }}
                              >
                                dif
                              </td>
                              {/* Data cells - colores semánticos para diferencia */}
                              {effectiveLeafIds.map((leafId) => {
                                const line = getLineById(leafId);
                                const realGas = line ? computeReal(leafId, monthId, "GASTO") : 0;
                                const realIng = line ? computeReal(leafId, monthId, "INGRESO") : 0;
                                const prevGas = line ? getPrev(line, monthId, "GASTO") : 0;
                                const prevIng = line ? getPrev(line, monthId, "INGRESO") : 0;
                                const difGas = realGas - prevGas;
                                const difIng = realIng - prevIng;
                                const difTotal = (realIng - realGas) - (prevIng - prevGas);
                                return (
                                  <Fragment key={leafId}>
                                    {showExpense && (
                                      <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-right text-slate-800 border-r border-slate-200/40 whitespace-nowrap">
                                        {formatNumberES(difGas)}
                                      </td>
                                    )}
                                    {showIncome && (
                                      <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-right text-slate-800 border-r border-slate-200/40 whitespace-nowrap">
                                        {formatNumberES(difIng)}
                                      </td>
                                    )}
                                    {showTotal && (
                                      <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-right text-slate-800 border-r border-slate-300/60 whitespace-nowrap">
                                        {formatNumberES(difTotal)}
                                      </td>
                                    )}
                                  </Fragment>
                                );
                              })}
                              {/* TOTAL dif - colores semánticos + separador fuerte */}
                              {showExpense && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-right text-slate-800 bg-slate-50 border-l-2 border-l-slate-300 border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(totalDifGas)}</td>}
                              {showIncome && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-right text-slate-800 bg-slate-50 border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(totalDifIng)}</td>}
                              {showTotal && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-right text-slate-800 bg-slate-50 whitespace-nowrap">{formatNumberES(totalDifTotal)}</td>}
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-slate-200 flex justify-end flex-shrink-0">
              <button
                onClick={() => setIsForecastEditorOpen(false)}
                className="px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Income Source Modal - Crear/Editar fuente */}
      {isSourceModalOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={handleRequestCloseSource}
        >
          <div
            className="bg-white w-full max-w-lg rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <button
                onClick={closeSourceModal}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500"
              >
                ×
              </button>
              <span className="text-sm font-semibold text-slate-700">
                {sourceModalMode === "create" ? "Crear fuente" : "Editar fuente"}
              </span>
              <div className="w-8" />
            </div>

            {/* Body - scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Error */}
              {sourceError && (
                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">
                  {sourceError}
                </div>
              )}

              {/* Nombre + toggle subcategorías (toggle solo si NO es hija) */}
              <div className="space-y-2">
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
                    <input
                      ref={sourceNameRef}
                      type="text"
                      value={sourceName}
                      onChange={(e) => setSourceName(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="Nueva fuente"
                    />
                  </div>
                  {/* Toggle subcategorías - solo visible si NO es una subfuente */}
                  {!sourceIsChild && (
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-semibold text-slate-700 mb-1">Subcategorías</span>
                      <button
                        onClick={() => {
                          if (!sourceIsGroup && sourceChildren.length === 0) {
                            // Turning on: add first child
                            setSourceChildren([{
                              id: generateLocalId(),
                              name: "Subcategoría 1",
                              typeForms: {
                                INGRESO: { enabled: sourceTypeForms.INGRESO.enabled, base: sourceTypeForms.INGRESO.base, expected: sourceTypeForms.INGRESO.expected },
                                GASTO: { enabled: sourceTypeForms.GASTO.enabled, base: sourceTypeForms.GASTO.base, expected: sourceTypeForms.GASTO.expected },
                              },
                            }]);
                          }
                          setSourceIsGroup((v) => !v);
                        }}
                        className={`w-12 h-6 rounded-full transition-colors ${sourceIsGroup ? "bg-blue-500" : "bg-slate-300"} relative`}
                      >
                        <span
                          className={`absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${sourceIsGroup ? "translate-x-[22px]" : "translate-x-0"}`}
                        />
                      </button>
                    </div>
                  )}
                </div>
                {/* Descripción - solo si NO es hija */}
                {!sourceIsChild && (
                  <p className="text-xs text-slate-400">
                    {sourceIsGroup ? "Crea varias subcategorías bajo una misma fuente." : "Fuente simple sin subcategorías."}
                  </p>
                )}
              </div>

              {/* Simple mode: Chips tipo + tabla */}
              {!sourceIsGroup && (
                <>
                  {/* Chips tipo */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleSourceType("INGRESO")}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                        sourceTypeForms.INGRESO.enabled
                          ? "bg-green-100 border-green-300 text-green-700"
                          : "bg-white border-slate-200 text-slate-400"
                      }`}
                    >
                      Ingreso
                    </button>
                    <button
                      onClick={() => toggleSourceType("GASTO")}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                        sourceTypeForms.GASTO.enabled
                          ? "bg-red-100 border-red-300 text-red-700"
                          : "bg-white border-slate-200 text-slate-400"
                      }`}
                    >
                      Gasto
                    </button>
                  </div>

                  {/* Tabla importes */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 w-24"></th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-slate-500">REAL</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-slate-500">PREVISTO</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className={`border-t border-slate-100 ${!sourceTypeForms.INGRESO.enabled ? "opacity-40" : ""}`}>
                          <td className="px-3 py-2 text-xs font-medium text-green-600">Ingreso</td>
                          <td className="px-2 py-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={sourceTypeForms.INGRESO.base}
                              onChange={(e) => updateSourceTypeValue("INGRESO", "base", e.target.value)}
                              disabled={!sourceTypeForms.INGRESO.enabled}
                              className="w-full px-2 py-1.5 border border-slate-200 rounded text-center text-sm disabled:bg-slate-50 disabled:text-slate-300"
                              placeholder="0"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={sourceTypeForms.INGRESO.expected}
                              onChange={(e) => updateSourceTypeValue("INGRESO", "expected", e.target.value)}
                              disabled={!sourceTypeForms.INGRESO.enabled}
                              className="w-full px-2 py-1.5 border border-slate-200 rounded text-center text-sm disabled:bg-slate-50 disabled:text-slate-300"
                              placeholder="0"
                            />
                          </td>
                        </tr>
                        <tr className={`border-t border-slate-100 ${!sourceTypeForms.GASTO.enabled ? "opacity-40" : ""}`}>
                          <td className="px-3 py-2 text-xs font-medium text-red-600">Gasto</td>
                          <td className="px-2 py-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={sourceTypeForms.GASTO.base}
                              onChange={(e) => updateSourceTypeValue("GASTO", "base", e.target.value)}
                              disabled={!sourceTypeForms.GASTO.enabled}
                              className="w-full px-2 py-1.5 border border-slate-200 rounded text-center text-sm disabled:bg-slate-50 disabled:text-slate-300"
                              placeholder="0"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={sourceTypeForms.GASTO.expected}
                              onChange={(e) => updateSourceTypeValue("GASTO", "expected", e.target.value)}
                              disabled={!sourceTypeForms.GASTO.enabled}
                              className="w-full px-2 py-1.5 border border-slate-200 rounded text-center text-sm disabled:bg-slate-50 disabled:text-slate-300"
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Group mode: lista de subcategorías */}
              {sourceIsGroup && (
                <div className="space-y-3">
                  {sourceChildren.map((child, idx) => (
                    <div key={child.id} className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50/50">
                      {/* Header subcategoría */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={child.name}
                          onChange={(e) => updateSourceChildName(child.id, e.target.value)}
                          className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                          placeholder={`Subcategoría ${idx + 1}`}
                        />
                        <button
                          onClick={() => removeSourceChild(child.id)}
                          className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                          title="Eliminar subcategoría"
                        >
                          ×
                        </button>
                      </div>

                      {/* Chips tipo subcategoría */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateSourceChildType(child.id, "INGRESO", !child.typeForms.INGRESO.enabled)}
                          className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                            child.typeForms.INGRESO.enabled
                              ? "bg-green-100 border-green-300 text-green-700"
                              : "bg-white border-slate-200 text-slate-400"
                          }`}
                        >
                          Ingreso
                        </button>
                        <button
                          onClick={() => updateSourceChildType(child.id, "GASTO", !child.typeForms.GASTO.enabled)}
                          className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                            child.typeForms.GASTO.enabled
                              ? "bg-red-100 border-red-300 text-red-700"
                              : "bg-white border-slate-200 text-slate-400"
                          }`}
                        >
                          Gasto
                        </button>
                      </div>

                      {/* Mini tabla */}
                      <div className="border border-slate-200 rounded overflow-hidden bg-white">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50">
                              <th className="px-2 py-1 text-left text-xs font-medium text-slate-400 w-16"></th>
                              <th className="px-2 py-1 text-center text-xs font-medium text-slate-400">Real</th>
                              <th className="px-2 py-1 text-center text-xs font-medium text-slate-400">Prev</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className={`border-t border-slate-100 ${!child.typeForms.INGRESO.enabled ? "opacity-40" : ""}`}>
                              <td className="px-2 py-1 text-xs text-green-600">Ing</td>
                              <td className="px-1 py-1">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={child.typeForms.INGRESO.base}
                                  onChange={(e) => updateSourceChildValue(child.id, "INGRESO", "base", e.target.value)}
                                  disabled={!child.typeForms.INGRESO.enabled}
                                  className="w-full px-1 py-1 border border-slate-200 rounded text-center text-xs disabled:bg-slate-50 disabled:text-slate-300"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={child.typeForms.INGRESO.expected}
                                  onChange={(e) => updateSourceChildValue(child.id, "INGRESO", "expected", e.target.value)}
                                  disabled={!child.typeForms.INGRESO.enabled}
                                  className="w-full px-1 py-1 border border-slate-200 rounded text-center text-xs disabled:bg-slate-50 disabled:text-slate-300"
                                  placeholder="0"
                                />
                              </td>
                            </tr>
                            <tr className={`border-t border-slate-100 ${!child.typeForms.GASTO.enabled ? "opacity-40" : ""}`}>
                              <td className="px-2 py-1 text-xs text-red-600">Gas</td>
                              <td className="px-1 py-1">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={child.typeForms.GASTO.base}
                                  onChange={(e) => updateSourceChildValue(child.id, "GASTO", "base", e.target.value)}
                                  disabled={!child.typeForms.GASTO.enabled}
                                  className="w-full px-1 py-1 border border-slate-200 rounded text-center text-xs disabled:bg-slate-50 disabled:text-slate-300"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={child.typeForms.GASTO.expected}
                                  onChange={(e) => updateSourceChildValue(child.id, "GASTO", "expected", e.target.value)}
                                  disabled={!child.typeForms.GASTO.enabled}
                                  className="w-full px-1 py-1 border border-slate-200 rounded text-center text-xs disabled:bg-slate-50 disabled:text-slate-300"
                                  placeholder="0"
                                />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}

                  {/* Botón añadir subcategoría */}
                  <button
                    onClick={addSourceChild}
                    className="w-full py-2.5 border-2 border-dashed border-slate-300 rounded-lg text-sm font-medium text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                  >
                    + Añadir subcategoría
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
              <div className="flex items-center justify-end gap-2">
                {sourceModalMode === "edit" && (
                  <button
                    onClick={handleDeleteSource}
                    disabled={sourceSaving}
                    className="py-2 px-3 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                  >
                    Eliminar fuente
                  </button>
                )}
                <button
                  onClick={closeSourceModal}
                  disabled={sourceSaving}
                  className="py-2 px-3 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveSource}
                  disabled={sourceSaving}
                  className="py-2 px-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {sourceSaving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Forecast Anual Modal */}
      <EditForecastAnualModal
        open={isEditForecastAnualOpen}
        lineId={editForecastAnualId}
        onClose={closeEditForecastAnual}
        getLineById={getLineById}
        onSave={handleSaveForecastAnual}
        onDelete={handleDeleteForecastAnual}
        getChildrenIds={getChildrenIds}
      />
    </div>
  );
}

// ==================== FORECAST PREV CELL COMPONENT ====================

function ForecastPrevCell({
  lineId,
  monthId,
  type,
  value,
  onSave,
}: {
  lineId: string;
  monthId: string;
  type: "INGRESO" | "GASTO";
  value: number;
  onSave: (newVal: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(String(value));
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const handleSave = async () => {
    const parsed = parseEURInput(draft);
    if (parsed !== null && parsed !== value) {
      await onSave(parsed);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="w-full h-8 px-2 text-sm tabular-nums text-right text-slate-800 bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-slate-400"
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      className="w-full h-8 px-2 text-sm tabular-nums font-medium text-right text-slate-800 hover:bg-slate-100 rounded transition-colors"
    >
      {formatNumberES(value)}
    </button>
  );
}

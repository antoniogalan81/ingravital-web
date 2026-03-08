"use client";

import { useEffect, useState, useCallback, useRef, Fragment, useMemo } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { EditForecastAnualModal } from "@/src/components/finance/modals/EditForecastAnualModal";
import { BankAccountModal } from "@/src/components/finance/modals/BankAccountModal";
import { MovementModal } from "@/src/components/finance/modals/MovementModal";
import { SourceModal } from "@/src/components/finance/modals/SourceModal";
import { ForecastEditorModal } from "@/src/components/finance/modals/ForecastEditorModal";
import { InlineEdit } from "@/src/components/finance/InlineEdit";
import {
  formatNumberES,
  formatEUR,
  parseEURInput,
  getCurrentMonthId,
  getMonthLabel,
  addMonths,
  generateId,
  generateLocalId,
  getMonthExpected,
  getMonthBase,
  FIN_COLORS,
  getFinanceChipClass,
  type BankAccountFull,
  type ForecastLineFull,
  type FinanceMovement,
} from "@/src/lib/finance/financeData";
import { normalizeBankAccountForDbWeb } from "@/src/lib/finance/normalize";
import {
  applyMovementToAccounts,
  addDays,
  formatDateLabel,
  todayISO,
  loadFinanceUI,
  saveFinanceUI,
  type FinanceUIState,
} from "@/src/lib/finance/movementUtils";
import {
  fetchBankAccountsFull,
  fetchForecastLinesFull,
  fetchMovements,
  updateBankAccountBalance,
  updateBankAccountName,
  deleteBankAccount,
  persistBankAccountsOrder,
  persistForecastLinesOrder,
  updateForecastMonthPrev,
  updateForecastMonthBase,
  upsertForecastLine,
  deleteForecastLine,
  upsertMovement,
  softDeleteMovement,
} from "@/src/lib/finance/financeApi";

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

  // ==================== MOVEMENTS SECTION STATE ====================
  const [financeUI, setFinanceUI] = useState<FinanceUIState>(() => loadFinanceUI());
  const [selectedMovementsDate, setSelectedMovementsDate] = useState(todayISO());
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<"TOTAL" | string>("TOTAL");
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [editingMovementId, setEditingMovementId] = useState<string | null>(null);

  // Bank Account Modal State
  const [isBankAccountModalOpen, setIsBankAccountModalOpen] = useState(false);
  const [bankAccountModalMode, setBankAccountModalMode] = useState<"create" | "edit">("create");
  const [editingBankAccountId, setEditingBankAccountId] = useState<string | null>(null);

  // Forecast Editor Modal State
  const [isForecastEditorOpen, setIsForecastEditorOpen] = useState(false);

  // Income Source Modal State
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [sourceModalMode, setSourceModalMode] = useState<"create" | "edit">("create");
  const [sourceEditId, setSourceEditId] = useState<string | null>(null);

  // Main table state (Fuentes de Ingreso section)
  const [selectedLeafIdsMain, setSelectedLeafIdsMain] = useState<string[]>([]);
  const [showIncomeMain, setShowIncomeMain] = useState(true);
  const [showExpenseMain, setShowExpenseMain] = useState(true);
  const [showTotalMain, setShowTotalMain] = useState(true);
  const [showRealCols, setShowRealCols] = useState(true);
  const [showPrevCols, setShowPrevCols] = useState(true);
  const [showDiffCols, setShowDiffCols] = useState(true);

  // Edit Forecast Anual Modal State
  const [isEditForecastAnualOpen, setIsEditForecastAnualOpen] = useState(false);
  const [editForecastAnualId, setEditForecastAnualId] = useState<string | null>(null);

  // Auth check
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
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

  // ==================== MAIN TABLE COMPUTED ====================

  const forecastGroups = forecastLines.filter((fl) => {
    const isParent = fl.parentId === null || fl.parentId === undefined;
    const hasChildren = forecastLines.some((other) => other.parentId === fl.id);
    return isParent && hasChildren;
  });

  const singletonLines = forecastLines.filter((fl) => {
    const isParent = fl.parentId === null || fl.parentId === undefined;
    const hasChildren = forecastLines.some((other) => other.parentId === fl.id);
    return isParent && !hasChildren;
  });

  const allChips = [...forecastGroups, ...singletonLines];

  const getGroupChildren = (groupId: string): ForecastLineFull[] => {
    const children = forecastLines.filter((fl) => fl.parentId === groupId);
    if (children.length > 0) return children;
    const singleton = forecastLines.find((fl) => fl.id === groupId);
    return singleton ? [singleton] : [];
  };

  const mainSourceBlocks = allChips.map((chip) => {
    const items = getGroupChildren(chip.id);
    return { id: chip.id, title: chip.name || chip.id, items };
  });

  const allLeafIdsMain = mainSourceBlocks.flatMap((sb) => sb.items.map((item) => item.id));

  const effectiveLeafIdsMain = selectedLeafIdsMain.length > 0
    ? selectedLeafIdsMain.filter((id) => allLeafIdsMain.includes(id))
    : allLeafIdsMain;

  const effectiveShowReal = showRealCols || (!showPrevCols && !showDiffCols);
  const effectiveShowPrev = showPrevCols;
  const effectiveShowDiff = showDiffCols;
  const visibleSubcolsPerBlock = (effectiveShowReal ? 1 : 0) + (effectiveShowPrev ? 1 : 0) + (effectiveShowDiff ? 1 : 0);
  const visibleBlocksMain = (showExpenseMain ? 1 : 0) + (showIncomeMain ? 1 : 0) + (showTotalMain ? 1 : 0);
  const totalDataColsMain = visibleBlocksMain * visibleSubcolsPerBlock;

  // ==================== HANDLERS ====================

  const handleSaveAccountBalance = useCallback(async (accountId: string, newBalance: number) => {
    const existing = bankAccounts.find((acc) => acc.id === accountId);
    const result = await updateBankAccountBalance(accountId, newBalance, existing);
    if (!result.error) {
      setBankAccounts((prev) =>
        prev.map((acc) => (acc.id === accountId ? { ...acc, balance: newBalance } : acc))
      );
    }
    return result;
  }, [bankAccounts]);

  const handleSaveAccountName = useCallback(async (accountId: string, newName: string) => {
    const existing = bankAccounts.find((acc) => acc.id === accountId);
    const result = await updateBankAccountName(accountId, newName, existing);
    if (!result.error) {
      setBankAccounts((prev) =>
        prev.map((acc) => (acc.id === accountId ? { ...acc, name: newName } : acc))
      );
    }
    return result;
  }, [bankAccounts]);

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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return { error: "No autenticado" };
    }
    const userId = session.user.id;

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
        user_id: userId,
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return { error: "No autenticado" };
    }
    const userId = session.user.id;

    const { data: current, error: fetchError } = await supabase
      .from("bank_accounts")
      .select("data")
      .eq("id", id)
      .eq("user_id", userId)
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
    const { error: updateError } = await supabase
      .from("bank_accounts")
      .update({
        data: nextData,
        client_updated_at: now,
        deleted_at: null,
      })
      .eq("id", id)
      .eq("user_id", userId);

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
    
    setForecastLines(prev => {
      const next = [...prev];
      for (const upd of updates) {
        const idx = next.findIndex(l => l.id === upd.id);
        if (idx !== -1) {
          next[idx] = { ...next[idx], order: upd.order };
        }
      }
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

  // ==================== MOVEMENTS SECTION HANDLERS ====================

  useEffect(() => {
    saveFinanceUI(financeUI);
  }, [financeUI]);

  const toggleMovementsExpanded = useCallback(() => {
    setFinanceUI((prev) => ({ ...prev, movementsExpanded: !prev.movementsExpanded }));
  }, []);

  const handleLastUsedAccountIdChange = useCallback((id: string) => {
    setFinanceUI((prev) => ({ ...prev, lastUsedMovementAccountId: id }));
  }, []);

  const openMovementModalCreate = useCallback(() => {
    setEditingMovementId(null);
    setIsMovementModalOpen(true);
  }, []);

  const openMovementModalEdit = useCallback((id: string) => {
    setEditingMovementId(id);
    setIsMovementModalOpen(true);
  }, []);

  const closeMovementModal = useCallback(() => {
    setIsMovementModalOpen(false);
    setEditingMovementId(null);
  }, []);

  const movementsForDay = useMemo(
    () => movements.filter((m) => m.date === selectedMovementsDate),
    [movements, selectedMovementsDate],
  );

  const filteredMovements = useMemo(
    () =>
      selectedAccountFilter === "TOTAL"
        ? movementsForDay
        : movementsForDay.filter((m) => m.accountId === selectedAccountFilter),
    [movementsForDay, selectedAccountFilter],
  );

  const totalForDay = useMemo(
    () =>
      filteredMovements.reduce(
        (sum, m) => sum + (m.type === "GASTO" ? -m.amount : m.amount),
        0,
      ),
    [filteredMovements],
  );

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    bankAccounts.forEach((a) => map.set(a.id, a.name));
    return map;
  }, [bankAccounts]);

  const handlePrevDay = useCallback(() => {
    setSelectedMovementsDate((d) => addDays(d, -1));
  }, []);

  const handleNextDay = useCallback(() => {
    setSelectedMovementsDate((d) => addDays(d, 1));
  }, []);

  const handleSaveMovement = useCallback(
    async (movement: FinanceMovement, isNew: boolean) => {
      if (isNew) {
        setMovements((prev) => [movement, ...prev]);
        setBankAccounts((prev) => applyMovementToAccounts(prev, movement, 1));
      } else {
        const oldMov = movements.find((m) => m.id === movement.id);
        if (oldMov) {
          setBankAccounts((prev) => {
            let next = applyMovementToAccounts(prev, oldMov, -1);
            next = applyMovementToAccounts(next, movement, 1);
            return next;
          });
        }
        setMovements((prev) =>
          prev.map((m) => (m.id === movement.id ? movement : m)),
        );
      }

      const movResult = await upsertMovement(movement);
      if (movResult.error) {
        console.warn("Failed to persist movement:", movResult.error);
      }

      if (movement.accountId) {
        const acc = bankAccounts.find((a) => a.id === movement.accountId);
        if (acc) {
          setTimeout(async () => {
            let bal = acc.balance ?? 0;
            if (isNew) {
              bal += movement.type === "GASTO" ? -movement.amount : movement.amount;
            } else {
              const oldMov = movements.find((m) => m.id === movement.id);
              if (oldMov) {
                bal -= oldMov.type === "GASTO" ? -oldMov.amount : oldMov.amount;
                bal += movement.type === "GASTO" ? -movement.amount : movement.amount;
              }
            }
            await updateBankAccountBalance(movement.accountId!, bal);
          }, 100);
        }
      }
    },
    [movements, bankAccounts],
  );

  const handleDeleteMovement = useCallback(
    async (movementId: string) => {
      const mov = movements.find((m) => m.id === movementId);
      if (!mov) return;

      setBankAccounts((prev) => applyMovementToAccounts(prev, mov, -1));
      setMovements((prev) => prev.filter((m) => m.id !== movementId));

      const result = await softDeleteMovement(movementId);
      if (result.error) {
        console.warn("Failed to delete movement:", result.error);
      }

      if (mov.accountId) {
        const acc = bankAccounts.find((a) => a.id === mov.accountId);
        if (acc) {
          const newBal = (acc.balance ?? 0) - (mov.type === "GASTO" ? -mov.amount : mov.amount);
          await updateBankAccountBalance(mov.accountId, newBal);
        }
      }
    },
    [movements, bankAccounts],
  );

  // ==================== SOURCE MODAL HANDLERS ====================

  const openSourceModalCreate = useCallback(() => {
    setSourceModalMode("create");
    setSourceEditId(null);
    setIsSourceModalOpen(true);
  }, []);

  const openSourceModalEdit = useCallback((lineId: string) => {
    setSourceModalMode("edit");
    setSourceEditId(lineId);
    setIsSourceModalOpen(true);
  }, []);

  const closeSourceModal = useCallback(() => {
    setIsSourceModalOpen(false);
  }, []);

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

  const getLineById = useCallback((id: string) => {
    return forecastLines.find((fl) => fl.id === id);
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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 h-11 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 hover:opacity-80 shrink-0">
              <img src="/logo.png" alt="" className="w-6 h-6" />
              <span className="hidden sm:inline font-semibold text-sm text-slate-800">Ingravital</span>
            </a>
            <span className="hidden sm:inline text-slate-200">|</span>
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              <a
                href="/agenda?view=agenda"
                className="px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors text-slate-500 hover:text-slate-700"
              >
                Agenda
              </a>
              <a
                href="/agenda?view=metas"
                className="px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors text-slate-500 hover:text-slate-700"
              >
                Metas
              </a>
              <span
                className="px-2 sm:px-3 py-1 text-xs font-medium rounded-md bg-white text-slate-900 shadow-sm"
              >
                Finanzas
              </span>
              <a
                href="/donaciones"
                className="hidden md:inline px-3 py-1 text-xs font-medium rounded-md transition-colors text-slate-500 hover:text-slate-700"
              >
                Servicios
              </a>
            </div>
          </div>
          <a href="/account" className="text-xs text-slate-500 hover:text-slate-700">
            Mi cuenta
          </a>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto w-full px-3 sm:px-6 pt-6 pb-10 space-y-8">
        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-slate-400">Cargando datos...</div>
          </div>
        ) : (
          <>
{/* KPI */}
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
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

              <div className="flex items-center gap-2 sm:mx-auto justify-center">
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

              <div className="flex items-center gap-2 sm:ml-auto">
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
                              setSelectedLeafIdsMain(allLeafIdsMain.filter((id) => !blockLeafIds.includes(id)));
                            } else if (allSelected) {
                              setSelectedLeafIdsMain((prev) => prev.filter((id) => !blockLeafIds.includes(id)));
                            } else {
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

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">Bloques:</span>
                      <button onClick={() => setShowExpenseMain((v) => !v)} className={getFinanceChipClass({ variant: "GASTO", selected: showExpenseMain })}>Gastos</button>
                      <button onClick={() => setShowIncomeMain((v) => !v)} className={getFinanceChipClass({ variant: "INGRESO", selected: showIncomeMain })}>Ingresos</button>
                      <button onClick={() => setShowTotalMain((v) => !v)} className={getFinanceChipClass({ variant: "TOTAL", selected: showTotalMain })}>Total</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">Columnas:</span>
                      <button onClick={() => setShowRealCols((v) => !v)} className={getFinanceChipClass({ variant: "REAL", selected: showRealCols })}>Real</button>
                      <button onClick={() => setShowPrevCols((v) => !v)} className={getFinanceChipClass({ variant: "PREV", selected: showPrevCols })}>Previsión</button>
                      <button onClick={() => setShowDiffCols((v) => !v)} className={getFinanceChipClass({ variant: "DIF", selected: showDiffCols })}>Diferencia</button>
                    </div>
                  </div>
                </div>

                {/* Tabla Excel - Shrink to fit */}
                <div className="overflow-x-auto">
                  <table className="border-collapse">
                    <thead>
                      <tr className="bg-slate-50 h-9">
                        <th className="sticky left-0 z-30 bg-slate-50 min-w-[140px] border-b border-r border-slate-200 text-left" rowSpan={2}>
                          <span className="text-base font-bold text-slate-900 px-3">Fuentes</span>
                        </th>
                        {showExpenseMain && visibleSubcolsPerBlock > 0 && (
                          <th colSpan={visibleSubcolsPerBlock} className="bg-red-50 border-b border-r border-slate-300/60 text-xs font-semibold text-red-600 px-2">GASTOS</th>
                        )}
                        {showIncomeMain && visibleSubcolsPerBlock > 0 && (
                          <th colSpan={visibleSubcolsPerBlock} className="bg-green-50 border-b border-r border-slate-300/60 text-xs font-semibold text-green-600 px-2">INGRESOS</th>
                        )}
                        {showTotalMain && visibleSubcolsPerBlock > 0 && (
                          <th colSpan={visibleSubcolsPerBlock} className="bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-900 px-2">TOTAL</th>
                        )}
                      </tr>
                      <tr className="bg-slate-50 h-7">
                        {showExpenseMain && effectiveShowReal && <th className="bg-red-50/50 min-w-[72px] border-b border-r border-slate-100 text-xs font-semibold text-slate-900 px-2">Real</th>}
                        {showExpenseMain && effectiveShowPrev && <th className="bg-red-50/50 min-w-[72px] border-b border-r border-slate-100 text-xs font-semibold text-slate-900 px-2">Prev</th>}
                        {showExpenseMain && effectiveShowDiff && <th className="bg-red-50/50 min-w-[72px] border-b border-r border-slate-300/60 text-xs font-semibold text-slate-900 px-2">Dif</th>}
                        {showIncomeMain && effectiveShowReal && <th className="bg-green-50/50 min-w-[72px] border-b border-r border-slate-100 text-xs font-semibold text-slate-900 px-2">Real</th>}
                        {showIncomeMain && effectiveShowPrev && <th className="bg-green-50/50 min-w-[72px] border-b border-r border-slate-100 text-xs font-semibold text-slate-900 px-2">Prev</th>}
                        {showIncomeMain && effectiveShowDiff && <th className="bg-green-50/50 min-w-[72px] border-b border-r border-slate-300/60 text-xs font-semibold text-slate-900 px-2">Dif</th>}
                        {showTotalMain && effectiveShowReal && <th className="bg-slate-100/50 min-w-[72px] border-b border-r border-slate-100 text-xs font-semibold text-slate-900 px-2">Real</th>}
                        {showTotalMain && effectiveShowPrev && <th className="bg-slate-100/50 min-w-[72px] border-b border-r border-slate-100 text-xs font-semibold text-slate-900 px-2">Prev</th>}
                        {showTotalMain && effectiveShowDiff && <th className="bg-slate-100/50 min-w-[72px] border-b border-r border-slate-300/60 text-xs font-semibold text-slate-900 px-2">Dif</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {mainSourceBlocks.map((block) => {
                        const visibleItems = block.items.filter((item) => effectiveLeafIdsMain.includes(item.id));
                        if (visibleItems.length === 0) return null;

                        const isBlockDragging = forecastDrag?.id === block.id && forecastDrag.isDragActive;
                        const isBlockDropTarget = forecastDragOverId === block.id;
                        return (
                          <Fragment key={block.id}>
                            <tr
                              ref={(el) => { if (el) forecastRowRefs.current.set(block.id, el); else forecastRowRefs.current.delete(block.id); }}
                              className={`bg-slate-50/70 select-none ${isBlockDragging ? "opacity-30" : ""}`}
                              onPointerDown={(e) => {
                                if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
                                (e.target as HTMLElement).setPointerCapture(e.pointerId);
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
                                  const rootIds = mainSourceBlocks.map(b => b.id);
                                  const fromIdx = rootIds.indexOf(forecastDrag.id);
                                  let toIdx = rootIds.indexOf(forecastDragOverId);
                                  if (fromIdx !== -1 && toIdx !== -1) {
                                    if (forecastInsertSide === "after") toIdx += 1;
                                    if (fromIdx < toIdx) toIdx -= 1;
                                    const newRootIds = [...rootIds];
                                    const [removed] = newRootIds.splice(fromIdx, 1);
                                    newRootIds.splice(toIdx, 0, removed);
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
                                  <span className="absolute left-0 right-0 h-[3px] bg-blue-500 z-10" style={{ [forecastInsertSide === "before" ? "top" : "bottom"]: -2 }} />
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
                            {visibleItems.map((leaf) => {
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
                                      const childIds = visibleItems.map(i => i.id);
                                      const fromIdx = childIds.indexOf(forecastDrag.id);
                                      let toIdx = childIds.indexOf(forecastDragOverId);
                                      if (fromIdx !== -1 && toIdx !== -1) {
                                        if (forecastInsertSide === "after") toIdx += 1;
                                        if (fromIdx < toIdx) toIdx -= 1;
                                        const newChildIds = [...childIds];
                                        const [removed] = newChildIds.splice(fromIdx, 1);
                                        newChildIds.splice(toIdx, 0, removed);
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
                                  <td className={`sticky left-0 z-20 bg-white min-w-[140px] px-3 py-2 text-sm text-slate-700 border-r border-slate-200 whitespace-nowrap cursor-grab active:cursor-grabbing relative ${
                                    isLeafDropTarget ? "ring-2 ring-blue-400 ring-inset" : ""
                                  }`}>
                                    {isLeafDropTarget && forecastInsertSide && (
                                      <span className="absolute left-0 right-0 h-[3px] bg-blue-500 z-10" style={{ [forecastInsertSide === "before" ? "top" : "bottom"]: -2 }} />
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
                                  {showExpenseMain && effectiveShowReal && (
                                    <td data-no-drag className="min-w-[72px] px-0 border-r border-slate-100 bg-slate-50/30">
                                      <InlineEdit value={realGas} onSave={(newVal) => handleSaveForecastReal(leaf.id, "GASTO", newVal)} suffix="" className="w-full h-full px-2 text-sm tabular-nums font-medium text-right text-slate-800" />
                                    </td>
                                  )}
                                  {showExpenseMain && effectiveShowPrev && (
                                    <td data-no-drag className="min-w-[72px] px-0 border-r border-slate-100 bg-blue-50/20">
                                      <InlineEdit value={prevGas} onSave={(newVal) => handleSaveForecastPrev(leaf.id, "GASTO", newVal)} suffix="" className="w-full h-full px-2 text-sm tabular-nums font-medium text-right text-slate-800" />
                                    </td>
                                  )}
                                  {showExpenseMain && effectiveShowDiff && (
                                    <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-semibold text-right text-slate-800 border-r border-slate-200 whitespace-nowrap">{formatNumberES(difGas)}</td>
                                  )}
                                  {showIncomeMain && effectiveShowReal && (
                                    <td data-no-drag className="min-w-[72px] px-0 border-r border-slate-100 bg-slate-50/30">
                                      <InlineEdit value={realIng} onSave={(newVal) => handleSaveForecastReal(leaf.id, "INGRESO", newVal)} suffix="" className="w-full h-full px-2 text-sm tabular-nums font-medium text-right text-slate-800" />
                                    </td>
                                  )}
                                  {showIncomeMain && effectiveShowPrev && (
                                    <td data-no-drag className="min-w-[72px] px-0 border-r border-slate-100 bg-blue-50/20">
                                      <InlineEdit value={prevIng} onSave={(newVal) => handleSaveForecastPrev(leaf.id, "INGRESO", newVal)} suffix="" className="w-full h-full px-2 text-sm tabular-nums font-medium text-right text-slate-800" />
                                    </td>
                                  )}
                                  {showIncomeMain && effectiveShowDiff && (
                                    <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-semibold text-right text-slate-800 border-r border-slate-200 whitespace-nowrap">{formatNumberES(difIng)}</td>
                                  )}
                                  {showTotalMain && effectiveShowReal && (
                                    <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-medium text-right text-slate-800 border-r border-slate-100 whitespace-nowrap">{formatNumberES(realTot)}</td>
                                  )}
                                  {showTotalMain && effectiveShowPrev && (
                                    <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-medium text-right text-slate-800 border-r border-slate-100 bg-blue-50/20 whitespace-nowrap">{formatNumberES(prevTot)}</td>
                                  )}
                                  {showTotalMain && effectiveShowDiff && (
                                    <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-semibold text-right text-slate-800 whitespace-nowrap">{formatNumberES(difTot)}</td>
                                  )}
                                </tr>
                              );
                            })}
                          </Fragment>
                        );
                      })}

                      {/* Fila TOTAL global */}
                      {(() => {
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
                            <td className="sticky left-0 z-20 bg-slate-100 min-w-[140px] px-3 py-2 text-sm font-bold text-slate-800 border-r border-slate-200 whitespace-nowrap">TOTAL</td>
                            {showExpenseMain && effectiveShowReal && <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-bold text-right text-slate-800 border-r border-slate-200 whitespace-nowrap">{formatNumberES(totalRealGas)}</td>}
                            {showExpenseMain && effectiveShowPrev && <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-bold text-right text-slate-800 border-r border-slate-200 bg-blue-50/30 whitespace-nowrap">{formatNumberES(totalPrevGas)}</td>}
                            {showExpenseMain && effectiveShowDiff && <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-semibold text-right text-slate-800 border-r border-slate-300 whitespace-nowrap">{formatNumberES(totalDifGas)}</td>}
                            {showIncomeMain && effectiveShowReal && <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-bold text-right text-slate-800 border-r border-slate-200 whitespace-nowrap">{formatNumberES(totalRealIng)}</td>}
                            {showIncomeMain && effectiveShowPrev && <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-bold text-right text-slate-800 border-r border-slate-200 bg-blue-50/30 whitespace-nowrap">{formatNumberES(totalPrevIng)}</td>}
                            {showIncomeMain && effectiveShowDiff && <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-semibold text-right text-slate-800 border-r border-slate-300 whitespace-nowrap">{formatNumberES(totalDifIng)}</td>}
                            {showTotalMain && effectiveShowReal && <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-bold text-right text-slate-800 border-r border-slate-200 whitespace-nowrap">{formatNumberES(totalRealTot)}</td>}
                            {showTotalMain && effectiveShowPrev && <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-bold text-right text-slate-800 border-r border-slate-200 bg-blue-50/30 whitespace-nowrap">{formatNumberES(totalPrevTot)}</td>}
                            {showTotalMain && effectiveShowDiff && <td className="min-w-[72px] px-2 py-2 text-sm tabular-nums font-semibold text-right text-slate-800 whitespace-nowrap">{formatNumberES(totalDifTot)}</td>}
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
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

            {/* ==================== MOVIMIENTOS SECTION ==================== */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <button onClick={toggleMovementsExpanded} className="flex items-center gap-2 group">
                  <span className="text-xs text-slate-400 group-hover:text-slate-600 transition-colors">
                    {financeUI.movementsExpanded ? "▼" : "▶"}
                  </span>
                  <h2 className="text-base font-semibold text-slate-700">Movimientos</h2>
                </button>
                <button type="button" onClick={openMovementModalCreate} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  + Añadir movimiento
                </button>
              </div>

              {financeUI.movementsExpanded && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <button onClick={handlePrevDay} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm">‹</button>
                    <span className="text-sm font-medium text-slate-700">{formatDateLabel(selectedMovementsDate)}</span>
                    <button onClick={handleNextDay} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm">›</button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
                    <button
                      onClick={() => setSelectedAccountFilter("TOTAL")}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors font-medium ${
                        selectedAccountFilter === "TOTAL"
                          ? "bg-slate-900 border-slate-900 text-white"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Total
                    </button>
                    {bankAccounts.map((acc) => (
                      <button
                        key={acc.id}
                        onClick={() => setSelectedAccountFilter(acc.id)}
                        className={`px-3 py-1 text-xs rounded-full border transition-colors font-medium ${
                          selectedAccountFilter === acc.id
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {acc.name}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
                    <span className="text-xs font-medium text-slate-400">Total del día ({filteredMovements.length} mov.)</span>
                    <span className={`text-sm font-bold tabular-nums ${totalForDay >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {totalForDay >= 0 ? "+" : ""}{formatEUR(Math.abs(totalForDay))}
                    </span>
                  </div>

                  {filteredMovements.length === 0 ? (
                    <div className="px-4 py-8 text-center text-slate-400 text-sm">No hay movimientos para este día</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {filteredMovements.map((mov) => {
                        const accName = mov.accountId ? accountMap.get(mov.accountId) || "Sin cuenta" : "Sin cuenta";
                        return (
                          <div
                            key={mov.id}
                            onClick={() => openMovementModalEdit(mov.id)}
                            className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors group"
                          >
                            <div className="min-w-0 flex-1 mr-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-700 truncate">{mov.concept}</span>
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded flex-shrink-0">{accName}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`text-sm font-semibold tabular-nums ${mov.type === "INGRESO" ? "text-green-600" : "text-red-600"}`}>
                                {mov.type === "INGRESO" ? "+" : "-"}{formatEUR(mov.amount)}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (window.confirm("¿Eliminar este movimiento?")) {
                                    handleDeleteMovement(mov.id);
                                  }
                                }}
                                className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                                title="Eliminar"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Modals */}
      <MovementModal
        open={isMovementModalOpen}
        editingId={editingMovementId}
        onClose={closeMovementModal}
        bankAccounts={bankAccounts}
        forecastLines={forecastLines}
        movements={movements}
        onSave={handleSaveMovement}
        onDelete={handleDeleteMovement}
        defaultDate={selectedMovementsDate}
        lastUsedAccountId={financeUI.lastUsedMovementAccountId}
        onLastUsedAccountIdChange={handleLastUsedAccountIdChange}
      />

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

      <ForecastEditorModal
        open={isForecastEditorOpen}
        onClose={() => setIsForecastEditorOpen(false)}
        forecastLines={forecastLines}
        onForecastLinesChange={setForecastLines}
      />

      <SourceModal
        open={isSourceModalOpen}
        mode={sourceModalMode}
        editId={sourceEditId}
        onClose={closeSourceModal}
        forecastLines={forecastLines}
        selectedMonthId={selectedMonthId}
        onForecastLinesChange={setForecastLines}
      />

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

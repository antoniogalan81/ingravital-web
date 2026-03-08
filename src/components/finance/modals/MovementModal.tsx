"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  type FinanceMovement,
  type BankAccountFull,
  type ForecastLineFull,
  parseNumberInput,
  formatEUR,
} from "@/src/lib/finance/financeData";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  loadCustomCategories,
  saveCustomCategories,
  extractNameFromConcept,
  buildConceptAndLabel,
  buildFrequencyText,
  buildFinalNote,
  parseWeeklyFromNote,
  parseMonthlyFromNote,
  extractBaseNote,
  generateMovementLocalId,
  sortAccountsStable,
} from "@/src/lib/finance/movementUtils";

// ==================== TYPES ====================

interface MovementModalProps {
  open: boolean;
  editingId: string | null; // null = create mode
  onClose: () => void;
  // Data
  bankAccounts: BankAccountFull[];
  forecastLines: ForecastLineFull[];
  movements: FinanceMovement[];
  // Callbacks
  onSave: (movement: FinanceMovement, isNew: boolean) => void;
  onDelete: (movementId: string) => void;
  // Settings
  defaultDate: string; // ISO YYYY-MM-DD
  lastUsedAccountId: string | null;
  onLastUsedAccountIdChange: (id: string) => void;
}

const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"] as const;

// ==================== COMPONENT ====================

export function MovementModal({
  open,
  editingId,
  onClose,
  bankAccounts,
  forecastLines,
  movements,
  onSave,
  onDelete,
  defaultDate,
  lastUsedAccountId,
  onLastUsedAccountIdChange,
}: MovementModalProps) {
  // ---- Form state ----
  const [movementDate, setMovementDate] = useState(defaultDate);
  const [movementType, setMovementType] = useState<"GASTO" | "INGRESO">("GASTO");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [movementName, setMovementName] = useState("");
  const [movementNote, setMovementNote] = useState("");
  const [movementAmount, setMovementAmount] = useState("");
  const [frequency, setFrequency] = useState<"PUNTUAL" | "SEMANAL" | "MENSUAL">("PUNTUAL");
  const [weeklyDays, setWeeklyDays] = useState<string[]>([]);
  const [weeklyTime, setWeeklyTime] = useState("");
  const [monthlyDay, setMonthlyDay] = useState(1);
  const [monthlyTime, setMonthlyTime] = useState("");
  const [selectedPrevisionId, setSelectedPrevisionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Custom categories ----
  const [customExpenseCats, setCustomExpenseCats] = useState<string[]>([]);
  const [customIncomeCats, setCustomIncomeCats] = useState<string[]>([]);
  const [newCatInput, setNewCatInput] = useState("");
  const [showNewCatInput, setShowNewCatInput] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  // ---- Sorted accounts (stable order) ----
  const sortedAccounts = useMemo(() => sortAccountsStable(bankAccounts), [bankAccounts]);

  // ---- Initialize ----
  useEffect(() => {
    if (!open) return;

    // Load custom categories
    const cats = loadCustomCategories();
    setCustomExpenseCats(cats.expense);
    setCustomIncomeCats(cats.income);
    setShowNewCatInput(false);
    setNewCatInput("");
    setError(null);
    setSaving(false);

    if (editingId) {
      // EDIT MODE
      const mov = movements.find((m) => m.id === editingId);
      if (!mov) return;

      setMovementDate(mov.date);
      setMovementType(mov.type);
      setSelectedAccountId(mov.accountId || null);
      setMovementAmount(String(mov.amount));
      setSelectedPrevisionId(mov.linkedPredictionId || mov.forecastId || null);

      // Parse name from label or concept
      const name = mov.label || extractNameFromConcept(mov.concept);
      setMovementName(name);
      setSelectedLabel(mov.label || null);

      // Parse note and frequency from note
      const rawNote = mov.note || "";
      const weeklyData = parseWeeklyFromNote(rawNote);
      const monthlyData = parseMonthlyFromNote(rawNote);

      if (weeklyData) {
        setFrequency("SEMANAL");
        setWeeklyDays(weeklyData.days);
        setWeeklyTime(weeklyData.time || "");
        setMovementNote(extractBaseNote(rawNote));
      } else if (monthlyData) {
        setFrequency("MENSUAL");
        setMonthlyDay(monthlyData.day);
        setMonthlyTime(monthlyData.time || "");
        setMovementNote(extractBaseNote(rawNote));
      } else {
        setFrequency(mov.frequency || "PUNTUAL");
        setWeeklyDays([]);
        setWeeklyTime("");
        setMonthlyDay(1);
        setMonthlyTime("");
        setMovementNote(rawNote);
      }
    } else {
      // CREATE MODE
      setMovementDate(defaultDate);
      setMovementType("GASTO");

      // Account: lastUsed if valid, else first
      const validLast = lastUsedAccountId && bankAccounts.find((a) => a.id === lastUsedAccountId);
      setSelectedAccountId(validLast ? lastUsedAccountId : bankAccounts[0]?.id || null);

      setMovementName("");
      setSelectedLabel(null);
      setMovementNote("");
      setMovementAmount("");
      setFrequency("PUNTUAL");
      setWeeklyDays([]);
      setWeeklyTime("");
      setMonthlyDay(1);
      setMonthlyTime("");
      setSelectedPrevisionId(null);
    }

    // Focus name input
    setTimeout(() => nameRef.current?.focus(), 80);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId]);

  // ---- Computed ----
  const parsedAmount = parseNumberInput(movementAmount);
  const isSaveDisabled = !selectedAccountId || parsedAmount <= 0 || saving;

  const defaultCats = movementType === "GASTO" ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES;
  const customCats = movementType === "GASTO" ? customExpenseCats : customIncomeCats;
  const visibleCategories = [...defaultCats, ...customCats];

  const previsionOptions = useMemo(
    () =>
      forecastLines.filter((fl) => {
        if (fl.enabledTypes) {
          return fl.enabledTypes[movementType] === true;
        }
        return fl.type === movementType;
      }),
    [forecastLines, movementType],
  );

  const isEdit = !!editingId;
  const title = isEdit ? "Editar movimiento" : "Nuevo movimiento";

  // ---- Handlers ----
  const handleTypeChange = useCallback((type: "GASTO" | "INGRESO") => {
    setMovementType(type);
    setSelectedPrevisionId(null);
    setSelectedLabel(null);
  }, []);

  const handleCategorySelect = useCallback(
    (cat: string) => {
      if (selectedLabel === cat) {
        setSelectedLabel(null);
      } else {
        setSelectedLabel(cat);
        setMovementName(cat);
      }
    },
    [selectedLabel],
  );

  const handleAddCustomCategory = useCallback(() => {
    const trimmed = newCatInput.trim();
    if (!trimmed) return;

    if (movementType === "GASTO") {
      const updated = [...customExpenseCats, trimmed];
      setCustomExpenseCats(updated);
      saveCustomCategories({ expense: updated, income: customIncomeCats });
    } else {
      const updated = [...customIncomeCats, trimmed];
      setCustomIncomeCats(updated);
      saveCustomCategories({ expense: customExpenseCats, income: updated });
    }

    setSelectedLabel(trimmed);
    setMovementName(trimmed);
    setNewCatInput("");
    setShowNewCatInput(false);
  }, [newCatInput, movementType, customExpenseCats, customIncomeCats]);

  const toggleWeeklyDay = useCallback((day: string) => {
    setWeeklyDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }, []);

  const handleSave = useCallback(async () => {
    if (isSaveDisabled) return;
    setError(null);
    setSaving(true);

    try {
      const { concept, label, tags } = buildConceptAndLabel(
        selectedLabel,
        movementName,
        movementNote.trim(),
      );

      const freqText = buildFrequencyText(frequency, weeklyDays, weeklyTime, monthlyDay, monthlyTime);
      const noteBase = movementNote.trim() || null;
      const finalNote = buildFinalNote(noteBase, freqText);

      const movement: FinanceMovement = {
        id: editingId || generateMovementLocalId(),
        date: movementDate,
        concept,
        amount: Math.abs(parsedAmount),
        type: movementType,
        accountId: selectedAccountId,
        tags,
        label,
        note: finalNote,
        frequency,
        linkedPredictionId: selectedPrevisionId,
        forecastId: selectedPrevisionId || undefined,
      };

      onSave(movement, !editingId);
      if (selectedAccountId) {
        onLastUsedAccountIdChange(selectedAccountId);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [
    isSaveDisabled,
    selectedLabel,
    movementName,
    movementNote,
    frequency,
    weeklyDays,
    weeklyTime,
    monthlyDay,
    monthlyTime,
    editingId,
    movementDate,
    parsedAmount,
    movementType,
    selectedAccountId,
    selectedPrevisionId,
    onSave,
    onLastUsedAccountIdChange,
    onClose,
  ]);

  const handleDelete = useCallback(() => {
    if (!editingId) return;
    if (!window.confirm("¿Eliminar este movimiento?")) return;
    onDelete(editingId);
    onClose();
  }, [editingId, onDelete, onClose]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-lg flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50 rounded-t-xl">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500"
          >
            ✕
          </button>
          <span className="text-sm font-semibold text-slate-700">{title}</span>
          <div className="w-8" />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">
              {error}
            </div>
          )}

          {/* Tipo: GASTO / INGRESO */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Tipo</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleTypeChange("GASTO")}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                  movementType === "GASTO"
                    ? "bg-red-50 border-red-300 text-red-700 font-semibold"
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                Gasto
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange("INGRESO")}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                  movementType === "INGRESO"
                    ? "bg-green-50 border-green-300 text-green-700 font-semibold"
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                Ingreso
              </button>
            </div>
          </div>

          {/* Cuenta */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Cuenta</label>
            {sortedAccounts.length === 0 ? (
              <div className="text-sm text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300 p-3 text-center">
                No hay cuentas bancarias.
                {/* TODO: link to create account route */}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {sortedAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setSelectedAccountId(acc.id)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      selectedAccountId === acc.id
                        ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {acc.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Categorías */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Categoría</label>
            <div className="flex flex-wrap gap-1.5">
              {visibleCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleCategorySelect(cat)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    selectedLabel === cat
                      ? movementType === "GASTO"
                        ? "bg-red-50 border-red-300 text-red-700 font-semibold"
                        : "bg-green-50 border-green-300 text-green-700 font-semibold"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {cat}
                </button>
              ))}
              {/* Add custom category */}
              {showNewCatInput ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newCatInput}
                    onChange={(e) => setNewCatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); handleAddCustomCategory(); }
                      if (e.key === "Escape") { setShowNewCatInput(false); setNewCatInput(""); }
                    }}
                    className="w-24 px-2 py-1 text-xs border border-blue-300 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="Nueva..."
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomCategory}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowNewCatInput(false); setNewCatInput(""); }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewCatInput(true)}
                  className="px-3 py-1.5 text-xs rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  + Nueva
                </button>
              )}
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Nombre</label>
            <input
              ref={nameRef}
              type="text"
              value={movementName}
              onChange={(e) => { setMovementName(e.target.value); if (selectedLabel && e.target.value !== selectedLabel) setSelectedLabel(null); }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
              placeholder="Nombre del movimiento"
            />
          </div>

          {/* Importe */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Importe</label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={movementAmount}
                onChange={(e) => setMovementAmount(e.target.value)}
                className="w-full px-3 py-2 pr-8 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                placeholder="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
            </div>
            {parsedAmount > 0 && (
              <div className="mt-1 text-xs text-slate-400">{formatEUR(Math.round(parsedAmount))}</div>
            )}
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Fecha</label>
            <input
              type="date"
              value={movementDate}
              onChange={(e) => setMovementDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
            />
          </div>

          {/* Frecuencia */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Frecuencia</label>
            <div className="flex gap-1.5">
              {(["PUNTUAL", "SEMANAL", "MENSUAL"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={`flex-1 px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                    frequency === f
                      ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold"
                      : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {f === "PUNTUAL" ? "Puntual" : f === "SEMANAL" ? "Semanal" : "Mensual"}
                </button>
              ))}
            </div>

            {/* Semanal options */}
            {frequency === "SEMANAL" && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-1">
                  {WEEKDAY_LABELS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleWeeklyDay(day)}
                      className={`w-8 h-8 text-xs rounded-full border font-semibold transition-colors ${
                        weeklyDays.includes(day)
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Hora (opcional)</label>
                  <input
                    type="time"
                    value={weeklyTime}
                    onChange={(e) => setWeeklyTime(e.target.value)}
                    className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>
            )}

            {/* Mensual options */}
            {frequency === "MENSUAL" && (
              <div className="mt-3 space-y-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Día del mes (1-31)</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={monthlyDay}
                    onChange={(e) => setMonthlyDay(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                    className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Hora (opcional)</label>
                  <input
                    type="time"
                    value={monthlyTime}
                    onChange={(e) => setMonthlyTime(e.target.value)}
                    className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Previsión enlazada */}
          {previsionOptions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Previsión enlazada
              </label>
              <select
                value={selectedPrevisionId || ""}
                onChange={(e) => setSelectedPrevisionId(e.target.value || null)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-white"
              >
                <option value="">Sin previsión</option>
                {previsionOptions.map((fl) => (
                  <option key={fl.id} value={fl.id}>
                    {fl.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Nota */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Nota</label>
            <textarea
              value={movementNote}
              onChange={(e) => setMovementNote(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 resize-none"
              rows={2}
              placeholder="Nota libre (opcional)"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <div className="flex items-center justify-between">
            <div>
              {isEdit && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  Eliminar
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaveDisabled}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


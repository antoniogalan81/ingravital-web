"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { parseEURInput, type BankAccountFull } from "@/src/lib/finance/financeData";

interface BankAccountModalProps {
  open: boolean;
  mode: "create" | "edit";
  accountId?: string | null;
  onClose: () => void;
  onCreated: (account: BankAccountFull) => void;
  onUpdated: (account: BankAccountFull) => void;
  onDeleted?: (accountId: string) => void;
  createAccount: (draft: { name: string; type: "PERSONAL" | "SOCIEDAD"; balance: number }) => Promise<{ data?: BankAccountFull; error?: string | null }>;
  updateAccount: (id: string, patch: { name: string; type: "PERSONAL" | "SOCIEDAD"; balance: number }) => Promise<{ error?: string | null }>;
  deleteAccount?: (id: string) => Promise<{ error?: string | null }>;
  getAccountById: (id: string) => BankAccountFull | undefined;
}

export function BankAccountModal({
  open,
  mode,
  accountId,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
  createAccount,
  updateAccount,
  deleteAccount,
  getAccountById,
}: BankAccountModalProps) {
  // Draft state
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<"PERSONAL" | "SOCIEDAD">("PERSONAL");
  const [draftBalance, setDraftBalance] = useState("0");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Initial values to detect dirty state
  const [initialName, setInitialName] = useState("");
  const [initialType, setInitialType] = useState<"PERSONAL" | "SOCIEDAD">("PERSONAL");
  const [initialBalance, setInitialBalance] = useState("0");

  // Initialize draft when modal opens
  useEffect(() => {
    if (!open) return;

    if (mode === "create") {
      setDraftName("Nueva cuenta");
      setDraftType("PERSONAL");
      setDraftBalance("0");
      setInitialName("Nueva cuenta");
      setInitialType("PERSONAL");
      setInitialBalance("0");
    } else if (mode === "edit" && accountId) {
      const account = getAccountById(accountId);
      if (account) {
        const name = account.name || "";
        const type = account.type || "PERSONAL";
        const balance = String(account.balance ?? 0);
        setDraftName(name);
        setDraftType(type);
        setDraftBalance(balance);
        setInitialName(name);
        setInitialType(type);
        setInitialBalance(balance);
      }
    }
    setError(null);
    setSaving(false);
    setDeleting(false);

    // Focus input
    setTimeout(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
    }, 50);
  }, [open, mode, accountId, getAccountById]);

  // Compute dirty state
  const isDirty = useMemo(() => {
    return draftName !== initialName || draftType !== initialType || draftBalance !== initialBalance;
  }, [draftName, draftType, draftBalance, initialName, initialType, initialBalance]);

  // Save handler
  const handleSave = useCallback(async (): Promise<boolean> => {
    const trimmedName = draftName.trim();
    if (!trimmedName) {
      setError("El nombre es obligatorio");
      return false;
    }

    const parsedBalance = parseEURInput(draftBalance) ?? 0;

    setSaving(true);
    setError(null);

    try {
      if (mode === "create") {
        const result = await createAccount({
          name: trimmedName,
          type: draftType,
          balance: parsedBalance,
        });

        if (result.error) {
          setError(result.error);
          setSaving(false);
          return false;
        }

        if (result.data) {
          onCreated(result.data);
        }
        onClose();
        return true;
      } else if (mode === "edit" && accountId) {
        const result = await updateAccount(accountId, {
          name: trimmedName,
          type: draftType,
          balance: parsedBalance,
        });

        if (result.error) {
          setError(result.error);
          setSaving(false);
          return false;
        }

        onUpdated({
          id: accountId,
          name: trimmedName,
          type: draftType,
          balance: parsedBalance,
        });
        onClose();
        return true;
      }
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
      return false;
    } finally {
      setSaving(false);
    }
  }, [mode, accountId, draftName, draftType, draftBalance, createAccount, updateAccount, onCreated, onUpdated, onClose]);

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!accountId || !deleteAccount || !onDeleted) return;

    const confirmed = window.confirm("¿Eliminar esta cuenta bancaria? Esta acción no se puede deshacer.");
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    try {
      const result = await deleteAccount(accountId);
      if (result.error) {
        setError(result.error);
        setDeleting(false);
        return;
      }

      onDeleted(accountId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  }, [accountId, deleteAccount, onDeleted, onClose]);

  // Handle request close (backdrop click or ESC): save if dirty, else just close
  const handleRequestClose = useCallback(async () => {
    if (saving || deleting) return;
    if (isDirty) {
      await handleSave();
    } else {
      onClose();
    }
  }, [isDirty, saving, deleting, handleSave, onClose]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleRequestClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, handleRequestClose]);

  if (!open) return null;

  const title = mode === "create" ? "Nueva cuenta bancaria" : "Editar cuenta bancaria";
  const saveButtonText = mode === "create" 
    ? (saving ? "Creando..." : "Crear")
    : (saving ? "Guardando..." : "Guardar");

  const isProcessing = saving || deleting;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={handleRequestClose}
    >
      <div
        className="bg-white w-full max-w-sm rounded-xl border border-slate-200 shadow-lg p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-800 mb-4">{title}</h3>

        <div className="space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
            <input
              ref={nameRef}
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 text-sm"
              placeholder="Nombre de la cuenta"
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDraftType("PERSONAL")}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                  draftType === "PERSONAL"
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Personal
              </button>
              <button
                type="button"
                onClick={() => setDraftType("SOCIEDAD")}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                  draftType === "SOCIEDAD"
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Sociedad
              </button>
            </div>
          </div>

          {/* Balance */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {mode === "create" ? "Balance inicial" : "Balance"}
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={draftBalance}
                onChange={(e) => setDraftBalance(e.target.value)}
                className="w-full px-3 py-2 pr-8 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 text-sm"
                placeholder="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600">{error}</div>
          )}
        </div>

        {/* Footer - botones alineados a la derecha */}
        <div className="flex justify-end gap-2 mt-6">
          {/* Botón Eliminar - solo en modo edit */}
          {mode === "edit" && deleteAccount && onDeleted && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isProcessing}
              className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {deleting ? "Eliminando..." : "Eliminar cuenta"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            disabled={isProcessing}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isProcessing}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saveButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}

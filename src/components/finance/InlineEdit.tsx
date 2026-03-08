"use client";

import { useState, useRef } from "react";
import { formatNumberES, parseEURInput } from "@/src/lib/finance/financeData";

// ==================== INLINE EDIT (numeric) ====================

interface InlineEditProps {
  value: number | undefined;
  onSave: (newValue: number) => Promise<{ error: string | null }>;
  suffix?: string;
  placeholder?: string;
  className?: string;
  compact?: boolean;
}

export function InlineEdit({ value, onSave, suffix = "€", placeholder = "0", className = "", compact = false }: InlineEditProps) {
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

// ==================== INLINE TEXT EDIT ====================

interface InlineTextEditProps {
  value: string;
  onSave: (newValue: string) => Promise<{ error: string | null }>;
  className?: string;
  compact?: boolean;
}

export function InlineTextEdit({ value, onSave, className = "", compact = false }: InlineTextEditProps) {
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

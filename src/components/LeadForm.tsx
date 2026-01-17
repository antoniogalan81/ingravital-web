"use client";

import React, { useMemo, useState } from "react";
import { submitLead } from "@/src/lib/leads";

type Props = {
  placeholder?: string;
  buttonText?: string;
  onSuccess?: (email: string) => void;
};

export default function LeadForm({
  placeholder = "Tu email",
  buttonText = "Enviar",
  onSuccess,
}: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "ok"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const canSubmit = useMemo(() => email.trim().length > 0 && !busy, [email, busy]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setStatus({ kind: "idle" });

    try {
      const res = await submitLead(email);

      if (!res.ok) {
        setStatus({ kind: "error", message: res.error });
        return;
      }

      setStatus({ kind: "ok", message: "Recibido. Gracias." });
      onSuccess?.(email.trim());
      setEmail("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={placeholder}
        autoComplete="email"
        inputMode="email"
        style={{ padding: 10, minWidth: 260 }}
      />
      <button type="submit" disabled={!canSubmit} style={{ padding: "10px 14px" }}>
        {busy ? "Enviando..." : buttonText}
      </button>

      {status.kind === "ok" && <span style={{ marginLeft: 8 }}>{status.message}</span>}
      {status.kind === "error" && (
        <span style={{ marginLeft: 8, whiteSpace: "pre-wrap" }}>{status.message}</span>
      )}
    </form>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

type Mode = "login" | "signup";

export default function AuthForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setMsg(null);
  }, [mode]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);

    try {
      if (!email.trim() || !password) {
        setMsg("Email y contraseña requeridos.");
        return;
      }

      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) {
          setMsg(error.message);
          return;
        }
        setMsg("Cuenta creada. Ya puedes iniciar sesión (o revisa el email si pide confirmación).");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      setMsg("OK");
      // opcional: redirección simple
      window.location.href = "/account";
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 10, maxWidth: 360 }}>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        autoComplete="email"
        inputMode="email"
        style={{ padding: 10 }}
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Contraseña"
        type="password"
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        style={{ padding: 10 }}
      />

      <button type="submit" disabled={busy} style={{ padding: 10 }}>
        {busy ? "..." : mode === "signup" ? "Crear cuenta" : "Entrar"}
      </button>

      {msg && <div style={{ whiteSpace: "pre-wrap" }}>{msg}</div>}
    </form>
  );
}

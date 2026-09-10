"use client";

// src/components/auth/IdentifyForm.tsx
// Identificación SIN contraseña para el inversor: magic link por email u OTP por SMS.
//
// DECISIÓN (requisito: no construir auth casera): se usa `supabase.auth.signInWithOtp`
// en los dos casos. El token de la invitación NO autentica — solo dice qué oportunidad
// se está abriendo. Quien conozca la URL sigue teniendo que demostrar que es la persona
// invitada.
//
// El OTP por SMS depende de que haya un proveedor configurado en el proyecto Supabase.
// Si no lo hay, Supabase devuelve un error explícito y aquí se muestra tal cual, sin
// fingir que se ha enviado nada.

import { useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

type Mode = "email" | "phone";
type Step = "identify" | "sent" | "code";

/** Teléfono a E.164 asumiendo España cuando no se indica prefijo (igual que la BD). */
export function toE164(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withPlus = raw.startsWith("00") ? `+${raw.slice(2)}` : raw;
  const digits = withPlus.replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (withPlus.startsWith("+")) return `+${digits}`;
  if (digits.length === 9) return `+34${digits}`;
  if (digits.length > 9 && digits.startsWith("34")) return `+${digits}`;
  return `+${digits}`;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function IdentifyForm({
  redirectTo,
  defaultEmail,
  defaultPhone,
  title = "Confirma tu identidad",
  subtitle = "Te enviamos un acceso personal. No necesitas crear ninguna contraseña.",
}: {
  /** URL absoluta a la que volver tras pulsar el enlace del email. */
  redirectTo: string;
  defaultEmail?: string | null;
  defaultPhone?: string | null;
  title?: string;
  subtitle?: string;
}) {
  // Si solo conocemos el teléfono del contacto, arrancamos en ese modo.
  const [mode, setMode] = useState<Mode>(defaultEmail || !defaultPhone ? "email" : "phone");
  const [step, setStep] = useState<Step>("identify");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === "email") {
        if (!isValidEmail(email)) {
          setError("Escribe un email válido.");
          return;
        }
        const { error: err } = await supabase.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: { emailRedirectTo: redirectTo },
        });
        if (err) throw err;
        setStep("sent");
      } else {
        const e164 = toE164(phone);
        if (!e164) {
          setError("Escribe un teléfono válido, con prefijo si no es de España.");
          return;
        }
        const { error: err } = await supabase.auth.signInWithOtp({ phone: e164 });
        if (err) throw err;
        setStep("code");
      }
    } catch (e) {
      // Se muestra el error REAL (p. ej. proveedor de SMS no configurado) en lugar
      // de un mensaje genérico que oculte por qué no funciona.
      setError(e instanceof Error ? e.message : "No se pudo enviar el acceso.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      const e164 = toE164(phone);
      if (!e164) {
        setError("Teléfono no válido.");
        return;
      }
      const { error: err } = await supabase.auth.verifyOtp({
        phone: e164,
        token: code.trim(),
        type: "sms",
      });
      if (err) throw err;
      // La sesión queda activa: la página que envuelve este formulario reacciona sola.
      window.location.replace(redirectTo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "El código no es correcto.");
    } finally {
      setBusy(false);
    }
  };

  if (step === "sent") {
    return (
      <div className="re-card p-6 text-center max-w-md mx-auto">
        <p className="text-lg font-extrabold text-ink tracking-tight">Revisa tu correo</p>
        <p className="text-sm text-ink-muted mt-2 leading-relaxed">
          Hemos enviado un enlace de acceso a <b>{email.trim().toLowerCase()}</b>. Ábrelo desde este
          mismo dispositivo. Si no lo ves, mira en la carpeta de spam.
        </p>
        <button
          type="button"
          onClick={() => setStep("identify")}
          className="mt-4 text-sm font-semibold text-brand hover:underline"
        >
          Usar otro método
        </button>
      </div>
    );
  }

  if (step === "code") {
    return (
      <div className="re-card p-6 max-w-md mx-auto space-y-3">
        <p className="text-lg font-extrabold text-ink tracking-tight">Introduce el código</p>
        <p className="text-sm text-ink-muted">
          Enviado por SMS a <b>{toE164(phone)}</b>.
        </p>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          className="w-full rounded-lg border border-line px-3 py-2 text-lg tracking-[0.3em] text-center text-ink focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
        />
        {error ? <p className="text-sm text-[var(--negative)]">{error}</p> : null}
        <button type="button" onClick={verify} disabled={busy || code.trim().length < 4} className="btn-primary w-full">
          {busy ? "Comprobando…" : "Entrar"}
        </button>
        <button
          type="button"
          onClick={() => setStep("identify")}
          className="w-full text-sm font-semibold text-ink-muted hover:text-ink"
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="re-card p-6 max-w-md mx-auto space-y-4">
      <div>
        <p className="text-lg font-extrabold text-ink tracking-tight">{title}</p>
        <p className="text-sm text-ink-muted mt-1 leading-relaxed">{subtitle}</p>
      </div>

      <div className="flex gap-1 rounded-lg bg-[var(--surface-alt)] p-1" role="tablist">
        {(["email", "phone"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              mode === m ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
          >
            {m === "email" ? "Email" : "Teléfono"}
          </button>
        ))}
      </div>

      {mode === "email" ? (
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          className="w-full rounded-lg border border-line px-3 py-2.5 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
        />
      ) : (
        <input
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="612 34 56 78"
          className="w-full rounded-lg border border-line px-3 py-2.5 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
        />
      )}

      {error ? <p className="text-sm text-[var(--negative)]">{error}</p> : null}

      <button type="button" onClick={send} disabled={busy} className="btn-primary w-full">
        {busy ? "Enviando…" : mode === "email" ? "Enviarme el acceso" : "Enviarme un código"}
      </button>

      <p className="text-[11px] text-ink-subtle text-center leading-relaxed">
        El acceso es personal e intransferible. Solo verás las operaciones que te hayan compartido.
      </p>
    </div>
  );
}

export default IdentifyForm;

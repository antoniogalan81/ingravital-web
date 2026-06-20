"use client";

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/src/lib/supabaseClient";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [checking, setChecking] = useState(true);

  // Verificar si estamos en modo recovery (enlace de Supabase)
  useEffect(() => {
    const checkSession = async () => {
      try {
        // Supabase maneja automáticamente el token del hash URL
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error("[Reset] Session error:", error.message);
          setError("Enlace inválido o expirado");
          setChecking(false);
          return;
        }

        if (session) {
          setIsRecoveryMode(true);
        } else {
          setError("Enlace inválido o expirado. Solicita un nuevo enlace.");
        }
      } finally {
        setChecking(false);
      }
    };

    // Escuchar evento PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecoveryMode(true);
        setChecking(false);
        setError(null);
      }
    });

    checkSession();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validaciones
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
    } finally {
      setLoading(false);
    }
  };

  // Loading inicial
  if (checking) {
    return (
      <div className="lp-root flex min-h-screen items-center justify-center">
        <div className="lp-bg" aria-hidden />
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--lp-brand-light)] border-t-transparent" />
      </div>
    );
  }

  // Éxito
  if (success) {
    return (
      <ResetShell>
        <div className="lp-glass p-8 text-center sm:p-9">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(45,212,166,0.14)]">
            <svg className="h-8 w-8 text-[var(--lp-positive)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--lp-text)]">Contraseña actualizada</h1>
          <p className="mt-2 text-sm text-[var(--lp-muted)]">Tu contraseña ha sido cambiada correctamente.</p>
          <div className="mt-7 flex flex-col gap-3">
            <Link href="/account" className="lp-btn lp-btn-primary w-full">Ir a Mi cuenta</Link>
            <Link href="/login" className="lp-btn lp-btn-ghost w-full">Iniciar sesión</Link>
          </div>
        </div>
      </ResetShell>
    );
  }

  // No es recovery mode
  if (!isRecoveryMode) {
    return (
      <ResetShell>
        <div className="lp-glass p-8 text-center sm:p-9">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <svg className="h-8 w-8 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--lp-text)]">Enlace inválido</h1>
          <p className="mt-2 text-sm text-[var(--lp-muted)]">{error || "El enlace ha expirado o no es válido."}</p>
          <Link href="/login" className="lp-btn lp-btn-primary mt-7 w-full">Volver a iniciar sesión</Link>
        </div>
      </ResetShell>
    );
  }

  // Formulario de nueva contraseña
  return (
    <ResetShell>
      <div className="lp-glass p-8 sm:p-9">
        <div className="mb-7 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--lp-text)]">Nueva contraseña</h1>
          <p className="mt-2 text-sm text-[var(--lp-muted)]">Introduce tu nueva contraseña</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="password" className="lp-label">Nueva contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              minLength={8}
              className="lp-input"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="lp-label">Repetir contraseña</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la contraseña"
              required
              minLength={8}
              className="lp-input"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="lp-btn lp-btn-primary w-full disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Guardando...
              </span>
            ) : (
              "Guardar nueva contraseña"
            )}
          </button>
        </form>
      </div>
    </ResetShell>
  );
}

// Shell oscuro coherente con login/signup (sistema lp-*).
function ResetShell({ children }: { children: ReactNode }) {
  return (
    <div className="lp-root flex min-h-screen flex-col">
      <div className="lp-bg" aria-hidden />
      <div className="lp-grid" aria-hidden />
      <div className="lp-content flex min-h-screen flex-col">
        <header className="w-full">
          <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8">
            <Link href="/" className="flex items-center">
              <Image src="/logo-horizontal-dark.svg" alt="Invergravital" width={140} height={36} priority />
            </Link>
            <Link href="/login" className="text-sm font-medium text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-text)]">
              Iniciar sesión
            </Link>
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-[420px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

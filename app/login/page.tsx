"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/src/lib/supabaseClient";
import { authRedirectUrl } from "@/src/lib/siteUrl";
import { useAuth } from "@/src/contexts/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  // Redirect si ya está autenticado
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/finanzas");
    }
  }, [authLoading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!email.trim() || !password) {
        setError("Email y contraseña son requeridos");
        return;
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        // Traducir errores comunes
        if (authError.message.includes("Invalid login credentials")) {
          setError("Email o contraseña incorrectos");
        } else if (authError.message.includes("Email not confirmed")) {
          setError("Por favor, confirma tu email antes de iniciar sesión");
        } else {
          setError(authError.message);
        }
        return;
      }

      // Éxito - redirigir (AuthContext detectará el cambio via onAuthStateChange)
      router.replace("/finanzas");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async () => {
    const targetEmail = forgotEmail.trim().toLowerCase() || email.trim().toLowerCase();

    // Validación básica
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!targetEmail || !emailRegex.test(targetEmail)) {
      setForgotError("Introduce un email válido");
      return;
    }

    setForgotLoading(true);
    setForgotError(null);
    setForgotSuccess(false);

    try {
      const redirectUrl = authRedirectUrl("/auth/reset");
      const { error: resetError } =
      await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: redirectUrl,
      });

      if (resetError) {
        setForgotError(resetError.message);
        return;
      }

      setForgotSuccess(true);
    } finally {
      setForgotLoading(false);
    }
  };

  // --- OAuth Google (WEB) ---
  const handleGoogleSignIn = async () => {
    setError(null);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authRedirectUrl("/auth/callback?next=/panel"),
      },
    });

    if (oauthError) {
      setError(oauthError.message);
    }
  };

  // Mostrar loading mientras verificamos auth
  if (authLoading || user) {
    return (
      <div className="lp-root flex min-h-screen items-center justify-center">
        <div className="lp-bg" aria-hidden />
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-[var(--lp-brand-light)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="lp-root flex min-h-screen flex-col">
      <div className="lp-bg" aria-hidden />
      <div className="lp-grid" aria-hidden />

      <div className="lp-content flex min-h-screen flex-col">
        {/* Header simple */}
        <header className="w-full">
          <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8">
            <Link href="/" className="flex items-center">
              <Image src="/logo-horizontal-dark.svg" alt="Invergravital" width={140} height={36} priority />
            </Link>
            <Link href="/signup" className="text-sm font-medium text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-text)]">
              Crear cuenta
            </Link>
          </div>
        </header>

        {/* Main content */}
        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-[420px]">
            <div className="lp-glass p-8 sm:p-9">
              <div className="mb-7 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-[var(--lp-text)]">Bienvenido de nuevo</h1>
                <p className="mt-2 text-sm text-[var(--lp-muted)]">Entra y sigue analizando operaciones.</p>
                <span className="lp-free mt-4">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--lp-positive)]" />
                  Gratuita · 100% funcional · Sin tarjeta
                </span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="lp-label">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    autoComplete="email"
                    className="lp-input"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="lp-label">Contraseña</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="lp-input"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotOpen(true);
                      setForgotEmail(email);
                      setForgotError(null);
                      setForgotSuccess(false);
                    }}
                    className="text-sm font-medium text-[var(--lp-brand-light)] transition-colors hover:text-white"
                  >
                    He olvidado mi contraseña
                  </button>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3">
                    <p className="text-sm text-red-300">{error}</p>
                  </div>
                )}

                <button type="submit" disabled={loading} className="lp-btn lp-btn-primary w-full disabled:opacity-50">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Entrando...
                    </span>
                  ) : (
                    "Entrar"
                  )}
                </button>
              </form>

              <button type="button" onClick={handleGoogleSignIn} className="lp-btn lp-btn-ghost mt-3 w-full">
                Continuar con Google
              </button>

              <div className="mt-6 border-t border-[var(--lp-line)] pt-5 text-center">
                <p className="text-sm text-[var(--lp-muted)]">
                  ¿No tienes cuenta?{" "}
                  <Link href="/signup" className="font-semibold text-[var(--lp-text)] hover:underline">
                    Crear cuenta
                  </Link>
                </p>
              </div>
            </div>

            <p className="mt-5 text-center text-xs text-[var(--lp-subtle)]">
              Tus datos se tratan de forma segura. Analiza operaciones reales sin barreras de entrada.
            </p>
          </div>
        </main>
      </div>

      {/* Modal: forgot password */}
      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setForgotOpen(false)} />
          <div className="lp-glass relative mx-4 w-full max-w-[420px] p-6">
            {!forgotSuccess ? (
              <>
                <h3 className="mb-1 text-lg font-semibold text-[var(--lp-text)]">Recuperar contraseña</h3>
                <p className="mb-6 text-sm text-[var(--lp-muted)]">Te enviaremos un enlace para crear una nueva contraseña.</p>

                {forgotError && (
                  <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3">
                    <p className="text-sm text-red-300">{forgotError}</p>
                  </div>
                )}

                <div className="mb-6">
                  <label htmlFor="forgotEmail" className="lp-label">Email</label>
                  <input
                    id="forgotEmail"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="lp-input"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setForgotOpen(false)}
                    disabled={forgotLoading}
                    className="lp-btn lp-btn-ghost flex-1 !py-2.5 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleForgotSubmit}
                    disabled={forgotLoading}
                    className="lp-btn lp-btn-primary flex-1 !py-2.5 disabled:opacity-50"
                  >
                    {forgotLoading ? "Enviando..." : "Enviar enlace"}
                  </button>
                </div>
              </>
            ) : (
              <div className="py-4 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(45,212,166,0.14)]">
                  <svg className="h-6 w-6 text-[var(--lp-positive)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-[var(--lp-text)]">Enlace enviado</h3>
                <p className="mb-6 text-sm text-[var(--lp-muted)]">Te hemos enviado un enlace para cambiar la contraseña.</p>
                <button onClick={() => setForgotOpen(false)} className="lp-btn lp-btn-primary w-full">
                  Entendido
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

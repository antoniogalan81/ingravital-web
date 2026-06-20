"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/src/lib/supabaseClient";
import { useAuth } from "@/src/contexts/AuthContext";

export default function SignupPage() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Redirect si ya está autenticado
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/account");
    }
  }, [authLoading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validaciones
      if (!email.trim() || !password) {
        setError("Email y contraseña son requeridos");
        return;
      }

      if (password.length < 6) {
        setError("La contraseña debe tener al menos 6 caracteres");
        return;
      }

      if (password !== confirmPassword) {
        setError("Las contraseñas no coinciden");
        return;
      }

      // Crear cuenta
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        // Traducir errores comunes
        if (authError.message.includes("already registered")) {
          setError("Este email ya está registrado");
        } else {
          setError(authError.message);
        }
        return;
      }

      // Si el usuario fue creado y hay sesión, crear perfil
      if (data.user) {
        // Upsert en profiles para garantizar que existe
        await supabase
          .from("profiles")
          .upsert(
            { 
              id: data.user.id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );

        // Si hay sesión activa, redirigir
        if (data.session) {
          router.replace("/account");
          return;
        }
      }

      // Si requiere confirmación de email
      setSuccess(true);
    } finally {
      setLoading(false);
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
            <Link href="/login" className="text-sm font-medium text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-text)]">
              Iniciar sesión
            </Link>
          </div>
        </header>

        {/* Main content */}
        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-[420px]">
            <div className="lp-glass p-8 sm:p-9">
              {success ? (
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(45,212,166,0.14)]">
                    <svg className="h-8 w-8 text-[var(--lp-positive)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-[var(--lp-text)]">¡Cuenta creada!</h1>
                  <p className="mb-6 mt-2 text-sm text-[var(--lp-muted)]">
                    Revisa tu email para confirmar tu cuenta. Si no lo ves, mira en la carpeta de spam.
                  </p>
                  <Link href="/login" className="lp-btn lp-btn-primary w-full">
                    Ir a iniciar sesión
                  </Link>
                </div>
              ) : (
                <>
                  <div className="mb-7 text-center">
                    <h1 className="text-2xl font-bold tracking-tight text-[var(--lp-text)]">Crea tu cuenta</h1>
                    <p className="mt-2 text-sm text-[var(--lp-muted)]">Acceso gratuito a todas las herramientas, sin tarjeta.</p>
                    <span className="lp-free mt-4">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--lp-positive)]" />
                      Sin tarjeta · Sin comisiones · Sin letra pequeña
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
                        placeholder="Mínimo 6 caracteres"
                        autoComplete="new-password"
                        className="lp-input"
                      />
                    </div>

                    <div>
                      <label htmlFor="confirmPassword" className="lp-label">Confirmar contraseña</label>
                      <input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repite tu contraseña"
                        autoComplete="new-password"
                        className="lp-input"
                      />
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
                          Creando cuenta...
                        </span>
                      ) : (
                        "Crear cuenta"
                      )}
                    </button>
                  </form>

                  <p className="mt-4 text-center text-xs text-[var(--lp-subtle)]">
                    Al crear una cuenta, aceptas nuestros{" "}
                    <Link href="/legal" className="underline hover:text-[var(--lp-text)]">términos y condiciones</Link>
                  </p>

                  <div className="mt-6 border-t border-[var(--lp-line)] pt-5 text-center">
                    <p className="text-sm text-[var(--lp-muted)]">
                      ¿Ya tienes cuenta?{" "}
                      <Link href="/login" className="font-semibold text-[var(--lp-text)] hover:underline">
                        Iniciar sesión
                      </Link>
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

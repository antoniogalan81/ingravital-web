"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/src/lib/supabaseClient";
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
      const redirectUrl = `${window.location.origin}/auth/reset`;
      const { error: resetError } = 
      await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: "https://www.ingravital.com/auth/reset",
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
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
    }
  };

  // Mostrar loading mientras verificamos auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  // No mostrar nada si ya está autenticado (evitar flicker)
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header simple */}
      <header className="w-full border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-[1140px] px-4 sm:px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Invergravital" width={32} height={32} />
            <span className="text-base font-semibold tracking-tight text-slate-900">Invergravital</span>
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">
          {/* Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
            {/* Title */}
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-slate-900">Bienvenido de nuevo</h1>
              <p className="text-sm text-slate-500 mt-2">Inicia sesión en tu cuenta</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  autoComplete="email"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-colors"
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-colors"
                />
              </div>

              {/* Forgot password */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setForgotOpen(true);
                    setForgotEmail(email);
                    setForgotError(null);
                    setForgotSuccess(false);
                  }}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  He olvidado mi contraseña
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Entrando...
                  </span>
                ) : (
                  "Entrar"
                )}
              </button>
            </form>

            {/* OAuth */}
            <div className="mt-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full py-2.5 px-4 rounded-lg border border-slate-200 bg-white text-slate-900 font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-colors"
              >
                Continuar con Google
              </button>
            </div>

            {/* Divider */}
            <div className="mt-6 pt-6 border-t border-slate-100 text-center">
              <p className="text-sm text-slate-500">
                ¿No tienes cuenta?{" "}
                <Link href="/signup" className="font-medium text-slate-900 hover:underline">
                  Crear cuenta
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Modal: forgot password */}
      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setForgotOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-[420px] mx-4 p-6">
            {!forgotSuccess ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">Recuperar contraseña</h3>
                <p className="text-sm text-slate-500 mb-6">Te enviaremos un enlace para crear una nueva contraseña.</p>

                {forgotError && (
                  <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100">
                    <p className="text-sm text-red-600">{forgotError}</p>
                  </div>
                )}

                <div className="mb-6">
                  <label htmlFor="forgotEmail" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Email
                  </label>
                  <input
                    id="forgotEmail"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-colors"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setForgotOpen(false)}
                    disabled={forgotLoading}
                    className="flex-1 py-2.5 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleForgotSubmit}
                    disabled={forgotLoading}
                    className="flex-1 py-2.5 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    {forgotLoading ? "Enviando..." : "Enviar enlace"}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Enlace enviado</h3>
                <p className="text-sm text-slate-500 mb-6">Te hemos enviado un enlace para cambiar la contraseña.</p>
                <button
                  onClick={() => setForgotOpen(false)}
                  className="w-full py-2.5 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
                >
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

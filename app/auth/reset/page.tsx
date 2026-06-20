"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/src/lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Éxito
  if (success) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <header className="w-full border-b border-slate-100 bg-white">
          <div className="mx-auto max-w-[1140px] px-6 py-4">
            <Link href="/" className="flex items-center gap-2.5">
              <Image src="/logo-horizontal.svg" alt="Invergravital" width={128} height={32} priority />
            </Link>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-[400px] text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Contraseña actualizada</h1>
            <p className="text-slate-500 mb-6">Tu contraseña ha sido cambiada correctamente.</p>
            <div className="flex flex-col gap-3">
              <Link
                href="/account"
                className="w-full py-3 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors text-center"
              >
                Ir a Mi cuenta
              </Link>
              <Link
                href="/login"
                className="w-full py-3 px-4 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors text-center"
              >
                Iniciar sesión
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // No es recovery mode
  if (!isRecoveryMode) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <header className="w-full border-b border-slate-100 bg-white">
          <div className="mx-auto max-w-[1140px] px-6 py-4">
            <Link href="/" className="flex items-center gap-2.5">
              <Image src="/logo-horizontal.svg" alt="Invergravital" width={128} height={32} priority />
            </Link>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-[400px] text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Enlace inválido</h1>
            <p className="text-slate-500 mb-6">{error || "El enlace ha expirado o no es válido."}</p>
            <Link
              href="/login"
              className="inline-block w-full py-3 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors text-center"
            >
              Volver a iniciar sesión
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Formulario de nueva contraseña
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="w-full border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-[1140px] px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo-horizontal.svg" alt="Invergravital" width={128} height={32} priority />
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-[400px]">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Nueva contraseña</h1>
            <p className="text-slate-500">Introduce tu nueva contraseña</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Nueva contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                minLength={8}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1.5">
                Repetir contraseña
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la contraseña"
                required
                minLength={8}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
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
      </main>
    </div>
  );
}


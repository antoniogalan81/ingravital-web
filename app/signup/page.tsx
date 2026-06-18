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
            {success ? (
              // Mensaje de éxito
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-slate-900">¡Cuenta creada!</h1>
                <p className="text-sm text-slate-500 mt-2 mb-6">
                  Revisa tu email para confirmar tu cuenta. Si no lo ves, revisa la carpeta de spam.
                </p>
                <Link
                  href="/login"
                  className="inline-block w-full py-2.5 px-4 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors text-center"
                >
                  Ir a iniciar sesión
                </Link>
              </div>
            ) : (
              <>
                {/* Title */}
                <div className="text-center mb-8">
                  <h1 className="text-2xl font-bold text-slate-900">Crear cuenta</h1>
                  <p className="text-sm text-slate-500 mt-2">Empieza a usar Invergravital hoy</p>
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
                      placeholder="Mínimo 6 caracteres"
                      autoComplete="new-password"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-colors"
                    />
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Confirmar contraseña
                    </label>
                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repite tu contraseña"
                      autoComplete="new-password"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-colors"
                    />
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
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Creando cuenta...
                      </span>
                    ) : (
                      "Crear cuenta"
                    )}
                  </button>
                </form>

                {/* Terms */}
                <p className="mt-4 text-xs text-slate-400 text-center">
                  Al crear una cuenta, aceptas nuestros{" "}
                  <Link href="/legal" className="underline hover:text-slate-600">
                    términos y condiciones
                  </Link>
                </p>

                {/* Divider */}
                <div className="mt-6 pt-6 border-t border-slate-100 text-center">
                  <p className="text-sm text-slate-500">
                    ¿Ya tienes cuenta?{" "}
                    <Link href="/login" className="font-medium text-slate-900 hover:underline">
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
  );
}

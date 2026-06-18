"use client";

// Página reducida: tras la limpieza de finanzas personales, esta ruta aloja
// únicamente el módulo de Inversión inmobiliaria (RealEstateSection).
// La infraestructura compartida (SyncContext, auth, src/lib) se conserva intacta.

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { RealEstateSection } from "@/src/components/realEstate/RealEstateSection";

export default function FinanzasPage() {
  const [authState, setAuthState] = useState<{ loading: boolean; authenticated: boolean }>({
    loading: true,
    authenticated: false,
  });

  // Auth check
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        window.location.href = "/login";
        return;
      }
      setAuthState({ loading: false, authenticated: true });
    })();
  }, []);

  if (authState.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-400 text-sm">Verificando sesión...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 h-11 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 hover:opacity-80 shrink-0">
              <img src="/logo.png" alt="" className="w-6 h-6" />
              <span className="hidden sm:inline font-semibold text-sm text-slate-800">Invergravital</span>
            </a>
            <span className="hidden sm:inline text-slate-200">|</span>
            <span className="text-sm font-medium text-slate-900">Inversión inmobiliaria</span>
          </div>
          <a
            href="/account"
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Mi cuenta
          </a>
        </div>
      </header>

      {/* Contenido: módulo de inversión inmobiliaria */}
      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4">
        <RealEstateSection />
      </main>
    </div>
  );
}

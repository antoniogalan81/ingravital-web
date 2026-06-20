"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

// Solo se permite redirigir a rutas INTERNAS de la app. Cualquier valor de `next`
// que no sea una ruta interna (URL externa, protocolo-relativa //host, javascript:,
// rutas con \, etc.) cae a /panel para evitar open-redirect.
const SAFE_NEXT = /^\/(?!\/)[A-Za-z0-9/_-]*$/;
function safeNext(raw: string | null): string {
  if (!raw || !SAFE_NEXT.test(raw)) return "/panel";
  return raw;
}

// Callback OAuth (PKCE). Supabase vuelve con ?code= en la query; el cliente
// (detectSessionInUrl) lo intercambia por la sesión. Aquí solo esperamos a que
// la sesión esté lista y redirigimos limpio a `next` (por defecto /panel).
// Nunca quedan tokens en la URL.
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = safeNext(params.get("next"));
    const oauthError = params.get("error") || params.get("error_description");

    if (oauthError) {
      router.replace("/login?error=oauth");
      return;
    }

    let done = false;
    const finish = (hasSession: boolean) => {
      if (done || !hasSession) return;
      done = true;
      // Limpia cualquier resto (?code=, #...) antes de navegar.
      window.history.replaceState({}, "", "/auth/callback");
      router.replace(next);
    };

    // detectSessionInUrl intercambia el code de forma asíncrona → escuchamos.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      finish(!!session);
    });

    // Fallback: la sesión puede estar lista antes de montar el listener.
    supabase.auth.getSession().then(({ data }) => finish(!!data.session));

    // Si en unos segundos no hay sesión, volver a login sin tokens en la URL.
    const timeout = setTimeout(() => {
      if (!done) router.replace("/login?error=oauth");
    }, 8000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <div className="lp-root flex min-h-screen items-center justify-center">
      <div className="lp-bg" aria-hidden />
      <p className="relative text-sm text-[var(--lp-muted)]">Completando inicio de sesión…</p>
    </div>
  );
}

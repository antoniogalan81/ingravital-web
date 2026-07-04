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

// Callback OAuth (PKCE). Supabase vuelve con ?code= en la query. Aquí:
//  1. Si ya hay sesión (detectSessionInUrl pudo intercambiar el code al iniciar
//     el cliente), redirigimos a `next`.
//  2. Si no, intercambiamos el code explícitamente con exchangeCodeForSession.
//  3. Ante error real, volvemos a /login sin dejar ?code= en la URL.
// Nunca dejamos al usuario en la landing con ?code=.
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = safeNext(params.get("next"));
    const code = params.get("code");
    const oauthError = params.get("error") || params.get("error_description");

    if (oauthError) {
      router.replace("/login?error=oauth");
      return;
    }

    let done = false;
    const finishOk = () => {
      if (done) return;
      done = true;
      // Limpia cualquier resto (?code=, #...) antes de navegar.
      window.history.replaceState({}, "", "/auth/callback");
      router.replace(next);
    };
    const finishError = () => {
      if (done) return;
      done = true;
      router.replace("/login?error=oauth");
    };

    // Si la sesión llega por el intercambio async del cliente, lo captamos aquí.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finishOk();
    });

    const run = async () => {
      // 1. ¿Ya hay sesión establecida?
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        finishOk();
        return;
      }

      // 2. Intercambio explícito del code (PKCE).
      if (code) {
        const { data: exchanged, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && exchanged.session) {
          finishOk();
          return;
        }
        // Si el code ya fue consumido por detectSessionInUrl, la sesión llegará
        // por onAuthStateChange (arriba); no marcamos error todavía.
        return;
      }

      // 3. Ni sesión ni code: enlace inválido.
      finishError();
    };

    run();

    // Red de seguridad: si en unos segundos no hay sesión, volver a login limpio.
    const timeout = setTimeout(finishError, 8000);

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

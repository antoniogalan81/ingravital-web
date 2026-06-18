"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const finish = async () => {
      try {
        // PKCE flow: Supabase devuelve ?code= en query string
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else {
          // Implicit flow o token ya en hash: getSession lo procesa
          await supabase.auth.getSession();
        }
      } catch {
        // onAuthStateChange en AuthContext recoge la sesión igualmente
      }
      router.replace("/finanzas");
    };

    finish();
  }, [router]);

  return <p>Completando inicio de sesión…</p>;
}

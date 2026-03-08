"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const finish = async () => {
      // Fuerza a Supabase a hidratar la sesión tras el redirect OAuth
      await supabase.auth.getSession();

      // Redirige dentro de la web
      router.replace("/agenda"); // cambia a "/" o "/dashboard" si prefieres
    };

    finish();
  }, [router]);

  return <p>Completando inicio de sesión…</p>;
}

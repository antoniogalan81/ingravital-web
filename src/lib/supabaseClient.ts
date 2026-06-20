import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// PKCE: el OAuth (Google) vuelve con ?code= en la query (no tokens en el hash).
// detectSessionInUrl sigue activo para que /auth/callback intercambie el code y
// para que el enlace de recuperación de contraseña (PASSWORD_RECOVERY) funcione.
export const supabase = createClient(url, anon, {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/src/lib/types";

interface AuthContextValue {
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Cargar perfil (sin bloquear)
  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, premium_active, premium_until, premium_source, created_at, updated_at")
        .eq("id", userId)
        .single();
      if (data) setProfile(data as Profile);
    } catch {
      // Ignorar errores de perfil - la app funciona sin él
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await loadProfile(user.id);
    }
  }, [user, loadProfile]);

  // Inicialización simple y directa
  useEffect(() => {
    let mounted = true;

    // 1. Obtener sesión actual
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      
      if (session?.user) {
        setUser(session.user);
        // Cargar perfil async (no bloquea)
        loadProfile(session.user.id);
      }
      setLoading(false);
    });

    // 2. Escuchar cambios de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "SIGNED_IN" && session?.user) {
        setUser(session.user);
        setProfile(null);
        // Garantizar que el perfil existe (cubre OAuth signup donde no pasa por /signup)
        supabase
          .from("profiles")
          .upsert({ id: session.user.id }, { onConflict: "id" })
          .then(() => loadProfile(session.user!.id));
        setLoading(false);
      }

      if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    setUser(null);
    setProfile(null);
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ loading, user, profile, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

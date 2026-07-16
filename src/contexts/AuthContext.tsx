"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import {
  isUsableSession,
  readPersistedSession,
  sessionStorageKey,
  AUTH_BOOTSTRAP_TIMEOUT_MS,
} from "@/src/lib/authSession";
import type { Session, User } from "@supabase/supabase-js";
import type { Profile } from "@/src/lib/types";

interface AuthContextValue {
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Origen público de Supabase (inlinado por Next en el bundle). Se usa solo para
// derivar la clave de la sesión persistida en la hidratación síncrona.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Cargar perfil (opcional, no bloquea la sesión).
  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, created_at, updated_at")
        .eq("id", userId)
        .single();
      if (data) setProfile(data as Profile);
    } catch {
      // El perfil es opcional: la app funciona sin él.
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await loadProfile(user.id);
    }
  }, [user, loadProfile]);

  useEffect(() => {
    let mounted = true;

    // Aplica una sesión al estado. Solo tratamos como autenticada una sesión
    // UTILIZABLE (con usuario y token no expirado). Una sesión persistida pero
    // muerta —p. ej. token caducado que no se puede refrescar porque el backend
    // de auth está caído— se trata como "sin sesión", para no atrapar al usuario
    // ni rebotarlo hacia rutas protegidas con credenciales inválidas.
    const applySession = (session: Session | null, opts?: { ensureProfile?: boolean }) => {
      if (!mounted) return;
      if (isUsableSession(session) && session) {
        const nextUser = session.user;
        setUser(nextUser);
        if (opts?.ensureProfile) {
          // Garantiza que el perfil existe (cubre alta por OAuth, que no pasa por /signup).
          supabase
            .from("profiles")
            .upsert({ id: nextUser.id }, { onConflict: "id" })
            .then(() => loadProfile(nextUser.id));
        } else {
          loadProfile(nextUser.id);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
    };

    // "loading" debe terminar SIEMPRE y una sola vez, lo resuelva getSession() o
    // el límite de arranque. onAuthStateChange sigue reconciliando el estado real
    // después, así que el estado final nunca depende de qué gane la carrera.
    let settled = false;
    const settle = () => {
      if (!mounted || settled) return;
      settled = true;
      setLoading(false);
    };

    // 1. Hidratación SÍNCRONA sin red: si hay una sesión persistida utilizable
    //    (token no expirado), reconocemos al usuario de inmediato. Así un usuario
    //    válido no depende de la latencia de red para entrar (evita el parpadeo a
    //    /login en redes lentas). Una sesión EXPIRADA no se hidrata aquí: puede
    //    refrescarse en un backend sano (lo hará onAuthStateChange) o estar muerta
    //    (backend caído), y de eso se encarga el arranque acotado de abajo.
    const persisted =
      typeof window !== "undefined"
        ? readPersistedSession(window.localStorage, sessionStorageKey(supabaseUrl))
        : null;
    if (isUsableSession(persisted)) {
      applySession(persisted);
      settle();
    }

    // 2. Fuente de verdad continua: cambios de sesión (login, logout, refresh).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT") {
        applySession(null);
        settle();
        return;
      }
      // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION → reconciliar.
      applySession(session, { ensureProfile: event === "SIGNED_IN" });
      settle();
    });

    // 3. Lectura inicial por red (reconcilia/refresca la sesión persistida).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted || settled) return;
      applySession(session);
      settle();
    });

    // 4. Frontera de resiliencia de render: si el arranque de auth no responde a
    //    tiempo (backend caído o lento) y no hubo sesión síncrona utilizable,
    //    dejamos de mostrar el spinner y renderizamos igualmente. No decide el
    //    estado de sesión: si la respuesta llega tarde, onAuthStateChange la
    //    corrige.
    const bootstrapTimeout = setTimeout(settle, AUTH_BOOTSTRAP_TIMEOUT_MS);

    return () => {
      mounted = false;
      clearTimeout(bootstrapTimeout);
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

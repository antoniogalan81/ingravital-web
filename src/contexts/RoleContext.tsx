"use client";

// src/contexts/RoleContext.tsx
// Roles del usuario y ÁREA activa (Promotor / Inversor).
//
// Una sola cuenta puede tener ambos roles: el área activa es una preferencia de
// navegación, NO un permiso. Los permisos los impone la RLS en Supabase; cambiar
// de área aquí no da acceso a nada que la base de datos no permita ya.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { getMyRoles, grantMyRole } from "@/src/lib/investorPlatform/service";
import type { UserRole } from "@/src/lib/investorPlatform/types";

export type Area = "promotor" | "inversor";

const AREA_KEY = "invergravital.area";

interface RoleContextValue {
  loading: boolean;
  roles: UserRole[];
  hasPromotor: boolean;
  hasInversor: boolean;
  hasBoth: boolean;
  /** Área activa. Si solo hay un rol, es siempre ese. */
  area: Area;
  setArea: (area: Area) => void;
  addRole: (role: UserRole) => Promise<void>;
  refresh: () => Promise<void>;
  /** true cuando el arranque terminó y el usuario no tiene ningún rol todavía. */
  needsRoleChoice: boolean;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [areaState, setAreaState] = useState<Area>("promotor");

  const refresh = useCallback(async () => {
    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }
    try {
      setRoles(await getMyRoles());
    } catch {
      // Si la migración de roles todavía no está aplicada, la consulta falla. No se
      // bloquea la app: se trata como "sin roles" y el resto sigue funcionando.
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    void refresh();
  }, [authLoading, refresh]);

  // Área recordada por dispositivo (preferencia de UI, no un permiso).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(AREA_KEY);
      if (saved === "promotor" || saved === "inversor") setAreaState(saved);
    } catch {
      // localStorage puede no estar disponible (modo privado): se usa el default.
    }
  }, []);

  const hasPromotor = roles.includes("promotor");
  const hasInversor = roles.includes("inversor");
  const hasBoth = hasPromotor && hasInversor;

  // Con un solo rol el área la determina el rol, no la preferencia guardada.
  const area: Area = hasBoth ? areaState : hasInversor && !hasPromotor ? "inversor" : "promotor";

  const setArea = useCallback((next: Area) => {
    setAreaState(next);
    try {
      window.localStorage.setItem(AREA_KEY, next);
    } catch {
      // Preferencia no persistida: no es un error funcional.
    }
  }, []);

  const addRole = useCallback(
    async (role: UserRole) => {
      await grantMyRole(role);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<RoleContextValue>(
    () => ({
      loading: loading || authLoading,
      roles,
      hasPromotor,
      hasInversor,
      hasBoth,
      area,
      setArea,
      addRole,
      refresh,
      needsRoleChoice: !loading && !authLoading && Boolean(user) && roles.length === 0,
    }),
    [loading, authLoading, roles, hasPromotor, hasInversor, hasBoth, area, setArea, addRole, refresh, user],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRoles(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRoles debe usarse dentro de <RoleProvider>");
  return ctx;
}

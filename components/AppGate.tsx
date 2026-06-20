"use client";

// components/AppGate.tsx
// Envoltorio de las páginas autenticadas de la plataforma de inversión.
// Centraliza: comprobación de sesión + shell premium con navegación de
// 7 secciones + marco de título. Evita duplicar auth en cada página.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/src/lib/supabaseClient";

export type AppSection = "panel" | "inversiones" | "oportunidades" | "informes" | "inversores";

// Secciones reales del núcleo inmobiliario primero; Oportunidades e Inversores
// quedan al final (secundarias / "Próximamente") para no darles protagonismo.
const NAV: { id: AppSection; label: string; href: string }[] = [
  { id: "panel", label: "Panel", href: "/panel" },
  { id: "inversiones", label: "Inversiones", href: "/finanzas" },
  { id: "informes", label: "Informes", href: "/informes" },
  { id: "oportunidades", label: "Oportunidades", href: "/oportunidades" },
  { id: "inversores", label: "Inversores", href: "/inversores" },
];

export default function AppGate({
  active,
  label,
  title,
  subtitle,
  actions,
  children,
}: {
  active?: AppSection;
  label?: string;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [authState, setAuthState] = useState<{ loading: boolean; authenticated: boolean }>({
    loading: true,
    authenticated: false,
  });

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        window.location.href = "/login";
        return;
      }
      setAuthState({ loading: false, authenticated: true });
    })();
  }, []);

  if (authState.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center app-bg">
        <div className="text-ink-subtle text-sm">Verificando sesión…</div>
      </div>
    );
  }
  if (!authState.authenticated) return null;

  return (
    <div className="min-h-screen app-bg">
      {/* Top bar — chrome oscuro premium (coherente con landing) */}
      <header className="app-chrome sticky top-0 z-20 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/panel" className="flex items-center hover:opacity-80 shrink-0">
              <img src="/logo.svg" alt="Invergravital" className="h-7 w-7 md:hidden" />
              <img src="/logo-horizontal-dark.svg" alt="Invergravital" className="hidden md:block h-6 w-auto" />
            </Link>
          </div>

          {/* Nav — desktop */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((item) => {
              const isActive = active === item.id || pathname === item.href;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`app-chrome-link ${isActive ? "is-active" : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Link href="/account" className={`app-chrome-link shrink-0 ${pathname === "/account" ? "is-active" : ""}`}>
            Mi cuenta
          </Link>
        </div>

        {/* Nav — mobile */}
        <nav className="md:hidden flex items-center gap-1.5 overflow-x-auto px-3 pb-2 -mt-0.5">
          {NAV.map((item) => {
            const isActive = active === item.id || pathname === item.href;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`app-chrome-link whitespace-nowrap !text-xs ${isActive ? "is-active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Contenido */}
      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-6">
        {(label || title || subtitle || actions) && (
          <div className="mb-6 in-reveal flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div className="min-w-0">
              {label && <p className="section-label">{label}</p>}
              {title && <h1 className="section-title mt-1">{title}</h1>}
              {subtitle && <p className="text-sm text-ink-muted mt-2 max-w-2xl leading-relaxed">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          </div>
        )}
        <div className="in-reveal in-delay-1">{children}</div>
      </main>
    </div>
  );
}

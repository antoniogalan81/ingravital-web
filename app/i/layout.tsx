"use client";

// Área INVERSOR. Shell propio: el inversor NUNCA ve la navegación del promotor
// (Panel / Inversiones / Balance / Oportunidades…). Optimizado para móvil, porque
// la mayoría llega desde un enlace de WhatsApp.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import { useRoles } from "@/src/contexts/RoleContext";

const NAV = [
  { href: "/i", label: "Oportunidades", exact: true },
  { href: "/i/inversiones", label: "Mis inversiones", exact: false },
  { href: "/i/historico", label: "Histórico", exact: false },
  { href: "/i/perfil", label: "Perfil", exact: false },
];

export default function InversorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading: authLoading, user, signOut } = useAuth();
  const { loading: rolesLoading, hasPromotor, setArea } = useRoles();

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  if (authLoading || rolesLoading) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center">
        <p className="text-sm text-ink-subtle">Cargando…</p>
      </div>
    );
  }
  if (!user) return null;

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <div className="min-h-screen app-bg">
      <header className="app-chrome sticky top-0 z-20 backdrop-blur">
        <div className="max-w-[1100px] mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Link href="/i" className="flex items-center shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Invergravital" className="h-7 w-7 sm:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-horizontal-dark.svg" alt="Invergravital" className="hidden sm:block h-6 w-auto" />
          </Link>

          <nav className="hidden md:flex items-center gap-1" aria-label="Área inversor">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`app-chrome-link${isActive(item.href, item.exact) ? " is-active" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {/* Solo aparece si la cuenta tiene también el rol promotor: una cuenta, dos áreas. */}
            {hasPromotor ? (
              <Link
                href="/panel"
                onClick={() => setArea("promotor")}
                className="app-chrome-link text-xs"
                title="Cambiar al Área Promotor"
              >
                Área Promotor
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void signOut()}
              className="app-chrome-link text-xs"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Navegación móvil */}
        <nav className="md:hidden border-t border-white/10 overflow-x-auto" aria-label="Área inversor">
          <div className="flex gap-1 px-3 py-2 min-w-max">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`app-chrome-link whitespace-nowrap text-xs${
                  isActive(item.href, item.exact) ? " is-active" : ""
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <main className="max-w-[1100px] mx-auto px-3 sm:px-6 py-5 sm:py-8">{children}</main>
    </div>
  );
}

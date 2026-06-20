"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

/* ───────────────────────────────────────────────────────────────────────────
   PublicShell — chrome premium oscuro común a las páginas públicas / marketing
   (`/`, `/servicios`, `/legal`). Aporta: fondo trabajado, header sticky con
   blur, navegación, CTAs, footer y la lógica de reveal-on-scroll + header-stuck.
   Mantiene coherencia visual total con la landing.
   ─────────────────────────────────────────────────────────────────────────── */

const ENTRAR_URL = "/finanzas";
const WHATSAPP_URL = "https://wa.me/34656195880";
const EMAIL = "info@palmaycoco.com";

type Active = "home" | "servicios" | "legal";

const NAV: { label: string; href: string; key: Active | "oportunidades" }[] = [
  { label: "Plataforma", href: "/#plataforma", key: "home" },
  { label: "Colaborar", href: "/servicios", key: "servicios" },
  { label: "Oportunidades", href: "/oportunidades", key: "oportunidades" },
];

export default function PublicShell({
  children,
  active,
  contained = true,
}: {
  children: ReactNode;
  active?: Active;
  /** true: envuelve el contenido en un contenedor centrado con padding.
   *  false: la página gestiona su propio ancho (p. ej. la landing full-bleed). */
  contained?: boolean;
}) {
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const onScroll = () => el.classList.toggle("is-stuck", window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".lp-reveal"));
    if (!("IntersectionObserver" in window) || els.length === 0) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).style.transitionDelay =
              (entry.target.getAttribute("data-delay") ?? "0") + "ms";
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="lp-root">
      <div className="lp-bg" aria-hidden />
      <div className="lp-grid" aria-hidden />
      <div className="lp-noise" aria-hidden />

      <div className="lp-content">
        {/* Header */}
        <header ref={headerRef} className="lp-header">
          <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-4 sm:px-8">
            <Link href="/" className="flex items-center">
              <Image src="/logo-horizontal-dark.svg" alt="Invergravital" width={150} height={38} priority />
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`lp-navlink ${active && item.key === active ? "!text-[var(--lp-text)]" : ""}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-2.5">
              <Link
                href="/login"
                className="hidden text-sm font-medium text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-text)] sm:inline"
              >
                Iniciar sesión
              </Link>
              <Link href={ENTRAR_URL} className="lp-btn lp-btn-primary !px-5 !py-2.5 !text-sm">
                Acceder
              </Link>
            </div>
          </div>
        </header>

        {/* Content */}
        {contained ? (
          <main className="mx-auto max-w-[1180px] px-5 py-12 sm:px-8 sm:py-16">{children}</main>
        ) : (
          <main>{children}</main>
        )}

        {/* Footer */}
        <footer className="border-t border-[var(--lp-line)]">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div className="flex items-center gap-2.5 text-sm text-[var(--lp-subtle)]">
              <Image src="/logo.svg" alt="Invergravital" width={22} height={22} />
              <span>© 2026 Invergravital · Herramienta gratuita, sin costes ocultos</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[var(--lp-muted)]">
              <Link href="/servicios" className="transition-colors hover:text-[var(--lp-text)]">Colaborar</Link>
              <a href={WHATSAPP_URL} className="transition-colors hover:text-[var(--lp-text)]">WhatsApp</a>
              <a href={`mailto:${EMAIL}`} className="transition-colors hover:text-[var(--lp-text)]">{EMAIL}</a>
              <Link href="/legal" className="transition-colors hover:text-[var(--lp-text)]">Legal</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

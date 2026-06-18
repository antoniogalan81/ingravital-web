import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import HeaderAuth from "@/src/components/HeaderAuth";
import CookieBanner from "@/components/CookieBanner";

type Props = {
  children: ReactNode;
  active?: "home" | "servicios" | "legal" | "finanzas";
};

const WHATSAPP_URL = "https://wa.me/34656195880";
const EMAIL = "contacto@ingravital.com";

export default function SiteShell({ children, active }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {/* Header */}
      <header className="w-full border-b border-slate-100">
        <div className="mx-auto max-w-[1140px] px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 shrink-0">
              <Image src="/logo.png" alt="Invergravital" width={36} height={36} priority />
              <span className="text-base font-semibold tracking-tight">Invergravital</span>
            </Link>

            {/* Nav center - hidden on mobile */}
            <nav className="hidden md:flex items-center gap-1.5">
              <Link
                href="/donaciones"
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  active === "servicios"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Servicios
              </Link>
              <Link
                href="/finanzas"
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  active === "finanzas"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Inversiones
              </Link>
            </nav>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              <a
                href={WHATSAPP_URL}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
              >
                Contactar
              </a>
              <HeaderAuth />
            </div>
          </div>

          {/* Mobile nav */}
          <nav className="flex md:hidden items-center gap-1.5 mt-3 overflow-x-auto pb-1 -mx-2 px-2">
            <Link
              href="/donaciones"
              className={`rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                active === "servicios"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 bg-slate-100"
              }`}
            >
              Servicios
            </Link>
            <Link
              href="/finanzas"
              className={`rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                active === "finanzas"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 bg-slate-100"
              }`}
            >
              Inversiones
            </Link>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <div className="mx-auto max-w-[1140px] px-4 sm:px-6 py-8 sm:py-12 md:py-16">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-100">
        <div className="mx-auto max-w-[1140px] px-4 sm:px-6 py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-slate-500">
            <div>© 2026 Invergravital</div>
            <div className="flex flex-wrap items-center gap-4">
              <a className="hover:text-slate-900 transition-colors" href={WHATSAPP_URL}>
                WhatsApp
              </a>
              <a className="hover:text-slate-900 transition-colors" href={`mailto:${EMAIL}`}>
                {EMAIL}
              </a>
              <Link className="hover:text-slate-900 transition-colors" href="/legal">
                Legal
              </Link>
            </div>
          </div>
        </div>
      </footer>
      <CookieBanner />
    </div>
  );
}

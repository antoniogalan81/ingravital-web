import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import HeaderAuth from "@/src/components/HeaderAuth";
import CookieBanner from "@/components/CookieBanner";

type Props = {
  children: ReactNode;
  active?: "home" | "servicios" | "legal" | "finanzas";
};

const WHATSAPP_URL = "https://wa.me/34656195880";
const EMAIL = "info@palmaycoco.com";

export default function SiteShell({ children, active }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--app-bg)] text-slate-900">
      {/* Header — chrome oscuro premium (coherente con AppGate / landing) */}
      <header className="app-chrome">
        <div className="mx-auto max-w-[1140px] px-4 sm:px-6 py-3.5">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center shrink-0">
              <Image src="/logo-horizontal-dark.svg" alt="Invergravital" width={144} height={36} priority />
            </Link>

            {/* Nav center - hidden on mobile */}
            <nav className="hidden md:flex items-center gap-1">
              <Link href="/servicios" className={`app-chrome-link ${active === "servicios" ? "is-active" : ""}`}>
                Colaborar
              </Link>
              <Link href="/panel" className={`app-chrome-link ${active === "finanzas" ? "is-active" : ""}`}>
                Mi inversión
              </Link>
            </nav>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              <a href={WHATSAPP_URL} className="app-chrome-link hidden sm:inline">
                Contactar
              </a>
              <HeaderAuth />
            </div>
          </div>

          {/* Mobile nav */}
          <nav className="flex md:hidden items-center gap-1.5 mt-2.5 overflow-x-auto pb-0.5 -mx-2 px-2">
            <Link href="/servicios" className={`app-chrome-link whitespace-nowrap !text-xs ${active === "servicios" ? "is-active" : ""}`}>
              Colaborar
            </Link>
            <Link href="/panel" className={`app-chrome-link whitespace-nowrap !text-xs ${active === "finanzas" ? "is-active" : ""}`}>
              Mi inversión
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
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-[1140px] px-4 sm:px-6 py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <Image src="/logo.svg" alt="Invergravital" width={22} height={22} />
              <span>© 2026 Invergravital · Gratis, sin costes ocultos</span>
            </div>
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
      <Toaster richColors position="top-center" />
    </div>
  );
}

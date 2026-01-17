import Image from "next/image";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  active?: "home" | "servicios" | "legal" | "agenda";
};

const WHATSAPP_URL = "https://wa.me/34656195880";
const EMAIL = "contacto@ingravital.com";

export default function SiteShell({ children, active }: Props) {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="Ingravital" width={44} height={44} priority />
            <span className="text-lg font-semibold tracking-tight">Ingravital</span>
          </a>

          <nav className="flex items-center gap-3">
            <a
              href="/"
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                active === "home" ? "bg-slate-900 text-white" : "border border-slate-200 hover:bg-slate-50"
              }`}
            >
              App
            </a>

            <a
              href="/agenda"
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                active === "agenda" ? "bg-slate-900 text-white" : "border border-slate-200 hover:bg-slate-50"
              }`}
            >
              Agenda
            </a>

            <a
              href="/servicios"
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                active === "servicios"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 hover:bg-slate-50"
              }`}
            >
              Servicios
            </a>

            <a
              href="/legal"
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                active === "legal" ? "bg-slate-900 text-white" : "border border-slate-200 hover:bg-slate-50"
              }`}
            >
              Legal y privacidad
            </a>

            <a
              href={WHATSAPP_URL}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Contactar
            </a>
          </nav>
        </header>

        <div className="py-10">{children}</div>

        <footer className="border-t border-slate-200 py-8 text-sm text-slate-600">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>© {new Date().getFullYear()} Ingravital</div>
            <div className="flex flex-wrap gap-4">
              <a className="hover:underline" href={WHATSAPP_URL}>
                WhatsApp
              </a>
              <a className="hover:underline" href={`mailto:${EMAIL}`}>
                {EMAIL}
              </a>
              <a className="hover:underline" href="/legal">
                Legal y privacidad
              </a>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "invergravital_cookie_consent";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Se lee en efecto (no en el render inicial) para evitar hydration mismatch:
    // localStorage no existe en SSR.
    const saved = localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!saved) setVisible(true);
  }, []);

  const handleAccept = () => {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
  };

  const handleReject = () => {
    localStorage.setItem(STORAGE_KEY, "rejected");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-sm">
      <div className="mx-auto max-w-[1140px] px-4 sm:px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
          Usamos cookies técnicas y de análisis para mejorar tu experiencia.{" "}
          <Link href="/legal/cookies" className="underline underline-offset-2 hover:text-[var(--ink)] transition-colors">
            Más información
          </Link>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleReject}
            className="rounded-full px-4 py-2 text-sm font-medium text-[var(--ink-muted)] border border-[var(--line)] hover:bg-[var(--surface-alt)] transition-colors"
          >
            Rechazar
          </button>
          <button
            onClick={handleAccept}
            className="rounded-full px-4 py-2 text-sm font-medium text-white bg-[var(--brand)] hover:bg-[var(--brand-dark)] transition-colors"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}

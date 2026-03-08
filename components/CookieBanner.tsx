"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "ingravital_cookie_consent";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
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
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto max-w-[1140px] px-4 sm:px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600 leading-relaxed">
          Usamos cookies técnicas y de análisis para mejorar tu experiencia.{" "}
          <Link href="/legal/cookies" className="underline underline-offset-2 hover:text-slate-900 transition-colors">
            Más información
          </Link>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleReject}
            className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Rechazar
          </button>
          <button
            onClick={handleAccept}
            className="rounded-full px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 transition-colors"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}

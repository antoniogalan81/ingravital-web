"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/src/contexts/AuthContext";

export default function HeaderAuth() {
  const router = useRouter();
  const { loading, user, profile, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Loading: mostrar skeleton para evitar flicker
  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-20 h-9 bg-slate-100 rounded-full animate-pulse" />
      </div>
    );
  }

  // No autenticado: mostrar Login
  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        Login
      </Link>
    );
  }

  // Autenticado: mostrar dropdown con cuenta
  // Nota: first_name está en profile_settings, no en profiles. Usamos email como fallback.
  const displayName = user.email?.split("@")[0] || "Usuario";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        {/* Avatar placeholder */}
        <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-semibold">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <span className="hidden sm:inline max-w-[120px] truncate">{displayName}</span>
        {/* Chevron */}
        <svg className={`w-4 h-4 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-50">
          <div className="px-4 py-2 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-900 truncate">{displayName}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
          <Link
            href="/account"
            className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            onClick={() => setDropdownOpen(false)}
          >
            Mi cuenta
          </Link>
          <button
            onClick={async () => {
              setDropdownOpen(false);
              await signOut();
              router.replace("/");
            }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}


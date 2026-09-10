// src/components/investors/shared.ts
// Piezas compartidas por la UI del CRM de contactos.

import type { ContactStatus } from "@/src/lib/investorPlatform/types";

/** Color del `pill` por estado del contacto (clases de app/globals.css). */
export const STATUS_PILL: Record<ContactStatus, string> = {
  nuevo: "pill-info",
  contactado: "pill-neutral",
  interesado: "pill-warning",
  inversor: "pill-positive",
  descartado: "pill-negative",
};

export const CONTACT_STATUSES: ContactStatus[] = [
  "nuevo",
  "contactado",
  "interesado",
  "inversor",
  "descartado",
];

/**
 * Mensaje REAL del error. Supabase devuelve objetos `PostgrestError` que no son
 * `Error`, así que también se lee su `message` en lugar de tragarse el motivo.
 */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

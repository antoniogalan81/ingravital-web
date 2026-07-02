// src/lib/date.ts — utilidades de formato de fecha (reutilizable)

/**
 * Formatea una fecha ISO como `dd/MM/yyyy` (ej. "02/07/2026").
 * Devuelve "" si la entrada es nula, vacía o no es una fecha válida,
 * para que quien la use pueda omitir el dato en lugar de mostrar algo falso.
 */
export function formatShortDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

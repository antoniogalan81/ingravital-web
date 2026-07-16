import type { Session } from "@supabase/supabase-js";

// Lógica de sesión centralizada y pura (testeable sin navegador).
//
// Contexto del bug que resuelve: si el backend de auth (Supabase) está caído o
// lento y el navegador tiene una sesión persistida cuyo access token ya expiró,
// supabase-js intenta refrescarla en su arranque (`_recoverAndRefresh`) y ese
// refresco reintenta durante ~30 s. Como getSession()/onAuthStateChange esperan
// a ese arranque, la UI que dependía de "loading" se quedaba atrapada en un
// spinner. Peor aún: al terminar, devolvía la sesión EXPIRADA sin refrescar, que
// el código anterior aceptaba como usuario válido y provocaba un rebote a rutas
// protegidas (que a su vez rebotaban a /login).

/**
 * Tiempo máximo (ms) que la UI espera al arranque de auth antes de renderizar de
 * todas formas.
 *
 * IMPORTANTE: este límite NO decide el estado de sesión. La fuente de verdad es
 * siempre `getSession()` + `onAuthStateChange`, que reconcilian el estado en
 * cuanto responden (y `isUsableSession` filtra sesiones muertas). El límite solo
 * evita que un backend de auth lento o caído deje la interfaz colgada en un
 * spinner indefinido: es una frontera de resiliencia de render, no un parche
 * para ocultar una condición de carrera.
 */
export const AUTH_BOOTSTRAP_TIMEOUT_MS = 3000;

/**
 * Una sesión es utilizable si existe, tiene usuario y su access token no ha
 * expirado.
 *
 * Una sesión persistida pero expirada que no se puede refrescar (p. ej. porque
 * el backend de auth está caído) NO es utilizable: en un backend sano supabase-js
 * ya la habría refrescado durante el arranque, así que un `expires_at` en el
 * pasado significa que el refresco falló. En ese caso el usuario debe volver a
 * iniciar sesión, no quedar atrapado arrastrando credenciales muertas.
 */
export function isUsableSession(session: Session | null | undefined): boolean {
  if (!session?.user) return false;
  const expiresAt = session.expires_at; // epoch en segundos
  if (typeof expiresAt !== "number") return true;
  return expiresAt * 1000 > Date.now();
}

/**
 * Clave bajo la que supabase-js persiste la sesión: `sb-<ref>-auth-token`, donde
 * `<ref>` es el subdominio del proyecto. Coincide con el `storageKey` por defecto
 * del cliente creado en supabaseClient.ts.
 */
export function sessionStorageKey(supabaseUrl: string): string {
  try {
    const ref = new URL(supabaseUrl).hostname.split(".")[0];
    return `sb-${ref}-auth-token`;
  } catch {
    // URL mal configurada: devolvemos una clave vacía (getItem("") → null), de
    // modo que la hidratación síncrona simplemente no encuentra sesión.
    return "";
  }
}

/**
 * Lee de forma SÍNCRONA (sin red) la sesión que supabase-js dejó persistida.
 *
 * Sirve para reconocer al instante a un usuario con una sesión válida sin
 * depender de la latencia de red: el arranque de supabase-js (getSession /
 * INITIAL_SESSION) hace una llamada de red incluso para sesiones no expiradas
 * (valida el usuario), y en redes lentas eso podía provocar un parpadeo a
 * /login antes de reconciliar. Aquí evitamos esa dependencia.
 *
 * Degrada con seguridad: ante cualquier formato inesperado devuelve null y el
 * arranque normal por red se encarga. NO es una decisión de autorización —el
 * backend valida el JWT y aplica RLS en cada petición—; solo controla qué UI
 * mostrar mientras la red responde.
 */
export function readPersistedSession(
  storage: Pick<Storage, "getItem"> | null | undefined,
  storageKey: string,
): Session | null {
  try {
    const raw = storage?.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Formato normal: la propia sesión. Toleramos envoltorios legacy por si acaso.
    const candidate = (parsed?.currentSession ?? parsed?.session ?? parsed) as
      | Record<string, unknown>
      | null;
    if (candidate && typeof candidate === "object" && candidate.access_token && candidate.user) {
      return candidate as unknown as Session;
    }
    return null;
  } catch {
    return null;
  }
}

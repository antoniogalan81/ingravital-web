// Resolución del origen público de la app.
//
// Dos necesidades distintas:
//
// 1. authRedirectUrl(): URL de retorno para flujos OAuth/PKCE y recuperación de
//    contraseña. El `code_verifier` de PKCE se guarda en el storage del ORIGEN
//    donde se inició el flujo, así que el callback DEBE volver al MISMO origen o
//    el intercambio del code falla. Por eso, en cliente, usamos siempre
//    `window.location.origin` (el origen real donde el usuario pulsó el botón).
//
// 2. getSiteUrl(): origen canónico para enlaces absolutos (metadata, compartir).
//    Prefiere NEXT_PUBLIC_SITE_URL y cae al dominio de producción con `www`.
//
// El dominio canónico de producción es https://www.invergravital.com
// (el apex invergravital.com y el fallback *.vercel.app redirigen a `www`).

const CANONICAL_SITE_URL = "https://www.invergravital.com";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Origen canónico de la app (para enlaces absolutos, metadata, sharing). */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return stripTrailingSlash(configured);
  return CANONICAL_SITE_URL;
}

/**
 * URL absoluta de retorno para OAuth/PKCE y reset de contraseña.
 *
 * En cliente devuelve `${window.location.origin}${path}` para que el callback
 * caiga en el mismo origen que inició el flujo (requisito de PKCE). En servidor
 * (SSR) cae al origen canónico. Debe existir en la allowlist de "Redirect URLs"
 * de Supabase o Supabase ignorará el valor y redirigirá al "Site URL".
 */
export function authRedirectUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const origin = typeof window !== "undefined" ? window.location.origin : getSiteUrl();
  return `${stripTrailingSlash(origin)}${suffix}`;
}

/* Service Worker — shell offline de Invergravital.
 *
 * SUPERFICIE MÍNIMA Y SEGURA. Solo intercepta GET del MISMO origen y:
 *   · Navegaciones (páginas): network-first + copia en caché para servir el shell sin
 *     red; si no hay red ni copia, sirve /offline. (Online SIEMPRE gana la red → nunca
 *     contenido obsoleto para usuarios conectados.)
 *   · Estáticos hasheados de Next (/_next/static/**): cache-first (son inmutables).
 * NUNCA toca:
 *   · Peticiones cross-origin (Supabase, Google OAuth, etc.).
 *   · /api/** ni /auth/** (dinámicas y de autenticación).
 * El shell no contiene datos de usuario (las páginas se renderizan en cliente y leen la
 * sesión/estado de localStorage), por lo que cachear el HTML del shell no filtra datos.
 *
 * Versionado: sube CACHE_VERSION para invalidar cachés antiguas (se limpian en activate).
 */
const CACHE_VERSION = "v1";
const STATIC_CACHE = `ig-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `ig-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icon.svg", "/apple-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("ig-") && k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // cross-origin (Supabase/OAuth): no tocar
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return; // dinámicas/auth

  // Navegaciones: network-first con copia para offline y fallback a /offline.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(request);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, net.clone());
          return net;
        } catch {
          const cache = await caches.open(RUNTIME_CACHE);
          const cached = await cache.match(request);
          return cached || (await caches.match(OFFLINE_URL)) || Response.error();
        }
      })()
    );
    return;
  }

  // Estáticos inmutables de Next: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const net = await fetch(request);
          if (net && net.ok && net.type === "basic") {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, net.clone());
          }
          return net;
        } catch {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Resto: se deja pasar a la red sin interceptar (superficie mínima).
});

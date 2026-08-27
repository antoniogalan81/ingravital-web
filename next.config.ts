import type { NextConfig } from "next";

// Dominio canónico de producción. El subdominio auto-asignado de Vercel
// (invergravital.vercel.app) debe redirigir aquí para que el flujo de auth
// termine SIEMPRE en el mismo origen.
const CANONICAL_HOST = "www.invergravital.com";
const VERCEL_HOST = "invergravital.vercel.app";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // 1. Canonicalización de dominio: cualquier request al subdominio .vercel.app
      //    se rebota al dominio propio conservando ruta y query (?code= incluido).
      //    Cuando Supabase cae a su "Site URL" de respaldo (vercel.app), esto
      //    devuelve al usuario a www.invergravital.com sin romper el intercambio
      //    PKCE (el code_verifier vive en el origen donde empezó el flujo: www).
      {
        source: "/:path*",
        has: [{ type: "host", value: VERCEL_HOST }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: true,
      },
      // 2. Si un enlace de auth (OAuth/recuperación) llega a la raíz con ?code=,
      //    lo encaminamos al callback dedicado, que hace el intercambio limpio y
      //    redirige a /panel en vez de dejar al usuario en la landing con ?code=.
      {
        source: "/",
        has: [{ type: "query", key: "code" }],
        destination: "/auth/callback",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

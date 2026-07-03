import type { MetadataRoute } from "next";

// Web App Manifest (App Router). Hace la web INSTALABLE (añadir a pantalla de inicio)
// con nombre, iconos y colores propios. Un manifest NO intercepta peticiones ni cachea
// nada: es un artefacto declarativo sin riesgo para producción. El shell offline lo
// aporta el service worker (public/sw.js), desactivado por defecto (ver
// components/ServiceWorkerRegister.tsx).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Invergravital",
    short_name: "Invergravital",
    description: "Análisis y seguimiento de operaciones inmobiliarias.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f14",
    theme_color: "#0b0f14",
    lang: "es",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "maskable" },
    ],
  };
}

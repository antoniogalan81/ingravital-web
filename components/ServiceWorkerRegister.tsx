"use client";

import { useEffect } from "react";

// Registro del service worker de shell offline. DESACTIVADO POR DEFECTO: solo se registra
// si NEXT_PUBLIC_ENABLE_SW === "1" (flag de build). Así el shell offline NO cambia el
// comportamiento de producción hasta que se active de forma explícita tras probarlo en
// dispositivos reales. Cuando el flag está apagado, actúa como KILL-SWITCH: desregistra
// cualquier SW previo (evita dejar un SW “colgado” en navegadores tras desactivarlo).
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const enabled = process.env.NEXT_PUBLIC_ENABLE_SW === "1";

    if (!enabled) {
      // Kill-switch: limpiar registros previos si se desactivó el flag.
      navigator.serviceWorker.getRegistrations?.().then((regs) => {
        for (const reg of regs) reg.unregister().catch(() => {});
      }).catch(() => {});
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        // Estado honesto: no enmascaramos el fallo, lo dejamos en consola para diagnóstico.
        console.warn("[sw] registro fallido:", err);
      });
    };
    // El efecto corre tras la hidratación, cuando el evento `load` puede haberse disparado
    // ya: en ese caso registramos de inmediato; si no, esperamos a `load`.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}

export default ServiceWorkerRegister;

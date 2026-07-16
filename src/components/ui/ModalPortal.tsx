"use client";

import { type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renderiza su contenido en un portal anclado a <body>, fuera del árbol de la app.
 *
 * Es imprescindible para overlays con `position: fixed`. Cualquier ancestro con
 * `transform`, `filter` o `will-change` deja de ser transparente al posicionado
 * fijo y se convierte en el BLOQUE CONTENEDOR de sus descendientes `fixed` (spec
 * CSS Transforms). En esta app, el layout autenticado (AppGate) envuelve el
 * contenido en `.in-reveal`, cuya animación de entrada deja un `transform`
 * persistente (`translateY(0)` por `animation-fill-mode: forwards`). Eso
 * descolocaba los modales `fixed inset-0`: se posicionaban respecto a ese
 * contenedor —no al viewport— quedando desplazados y desbordando por abajo, de
 * modo que el pie y las últimas filas quedaban fuera de pantalla e inaccesibles.
 *
 * Anclando el modal a <body>, `fixed` vuelve a ser relativo al viewport y el
 * scroll/altura funcionan de forma consistente en cualquier viewport.
 *
 * SSR-safe: en el servidor `document` no existe y no renderiza nada.
 *
 * INVARIANTE PARA QUIEN LO USE: monta este componente SOLO tras interacción del
 * usuario (condición de apertura en estado cliente que empieza cerrado, p. ej.
 * `useState(false)`). Así el servidor y el primer render de cliente coinciden
 * (ambos sin modal) y no hay desajuste de hidratación. NO lo renderices de forma
 * incondicional ni con una condición derivada de datos disponibles en SSR.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

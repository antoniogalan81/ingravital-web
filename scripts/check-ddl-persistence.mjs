#!/usr/bin/env node
// scripts/check-ddl-persistence.mjs
//
// Comprueba, desde una sesión INDEPENDIENTE (la API REST de producción), si dos
// funciones creadas a mano en el SQL Editor han quedado realmente confirmadas.
//
// Sirve para un experimento A/B que responde a una sola pregunta: ¿el SQL Editor
// revierte el DDL cuando el lote TERMINA EN UN SELECT?
//
//   A) `diag_persiste_sin_select()`  → creada por un script SIN select final
//   B) `diag_persiste_con_select()`  → creada por un script CON select final
//
// Lectura del resultado:
//   A sí, B no  → confirmado: el select final provoca la reversión.
//   A no, B no  → el editor revierte TODO el DDL; la causa es otra (ajuste de sesión,
//                 modo de solo lectura, permisos del rol del editor).
//   A sí, B sí  → ninguna de las dos se revierte; hay que mirar otra cosa.
//
// No escribe nada: solo llama a las funciones. Reintenta durante un rato porque
// PostgREST tarda unos segundos en recargar su caché de esquema tras un DDL.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = (k) => {
  const m = new RegExp(`^${k}=(.*)$`, "m").exec(readFileSync(join(ROOT, ".env.local"), "utf8"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
};
const URL_ = env("NEXT_PUBLIC_SUPABASE_URL");
const ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

const llamar = async (fn) => {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const t = await r.text();
  // PGRST202 = PostgREST no conoce la función (no existe, o su caché no se ha recargado).
  if (r.status === 404 && t.includes("PGRST202")) return { existe: false, detalle: "no existe" };
  if (r.ok) return { existe: true, detalle: t.replace(/"/g, "") };
  // Cualquier otro error (permisos, etc.) significa que la función SÍ está ahí.
  return { existe: true, detalle: `HTTP ${r.status}` };
};

const FUNCIONES = [
  ["diag_persiste_sin_select", "A — script SIN select final"],
  ["diag_persiste_con_select", "B — script CON select final"],
];

console.log(`\nProyecto: ${URL_.replace(/^https:\/\//, "").split(".")[0]}`);
console.log("Comprobando desde una sesión independiente (API REST)…\n");

const resultados = {};
const LIMITE = Date.now() + 45_000; // margen para que PostgREST recargue su caché

for (const [fn, etiqueta] of FUNCIONES) {
  let r = await llamar(fn);
  while (!r.existe && Date.now() < LIMITE) {
    await new Promise((s) => setTimeout(s, 3000));
    r = await llamar(fn);
  }
  resultados[fn] = r.existe;
  console.log(`  ${r.existe ? "PERSISTE   " : "NO PERSISTE"}  ${etiqueta}  (${fn}: ${r.detalle})`);
}

const a = resultados.diag_persiste_sin_select;
const b = resultados.diag_persiste_con_select;

console.log("\n" + "─".repeat(72));
if (a && !b) {
  console.log("CAUSA IDENTIFICADA: el SQL Editor revierte el lote cuando TERMINA EN SELECT.");
  console.log("Solución: ejecutar las migraciones SIN la consulta de verificación al final,");
  console.log("y lanzar esa verificación aparte, en una consulta nueva.");
} else if (!a && !b) {
  console.log("El editor revierte el DDL en AMBOS casos: la causa NO es el select final.");
  console.log("Siguiente paso: revisar el rol con el que ejecuta el editor y si está en");
  console.log("modo de solo lectura; y probar el mismo DDL por otra vía (psql/CLI).");
} else if (a && b) {
  console.log("Las dos persisten: el DDL no se revierte por sí mismo.");
  console.log("Entonces lo que falló en 20260910c/d es otra cosa — probablemente el lote");
  console.log("no llegó a ejecutarse entero (texto seleccionado, error intermedio).");
} else {
  console.log("Resultado inesperado: persiste la del select final pero no la otra.");
  console.log("Repetir el experimento; puede ser un problema de caché de PostgREST.");
}
console.log("─".repeat(72));
console.log("\nLimpieza cuando termines:");
console.log("  drop function if exists public.diag_persiste_sin_select();");
console.log("  drop function if exists public.diag_persiste_con_select();\n");

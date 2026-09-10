#!/usr/bin/env node
// scripts/verify-investor-schema.mjs
//
// Comprueba contra el proyecto Supabase REAL qué partes de la plataforma de
// inversores están aplicadas. Solo lectura: no crea, modifica ni borra nada.
//
// Existe porque una migración presente en `supabase/migrations/` NO implica que
// esté aplicada en producción: en este proyecto se aplican a mano (ver
// docs/INVERSORES.md §10). Este script es la forma de saberlo sin suponer.
//
// Uso:  node scripts/verify-investor-schema.mjs
// Lee NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY de .env.local.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readEnv() {
  let raw;
  try {
    raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  } catch {
    console.error("No se encuentra .env.local en la raíz del proyecto WEB.");
    process.exit(2);
  }
  const get = (key) => {
    const m = new RegExp(`^${key}=(.*)$`, "m").exec(raw);
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
  };
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  const key = get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    process.exit(2);
  }
  return { url, key };
}

const { url, key } = readEnv();
const headers = { apikey: key, Authorization: `Bearer ${key}` };

/**
 * Distingue "la tabla no existe" de "existe y anon no tiene acceso".
 *  · 404 + PGRST205 → no existe
 *  · 401 / 403      → existe y está protegida (lo correcto)
 *  · 200            → existe y anon puede leerla (revisar)
 */
async function checkTable(name) {
  const res = await fetch(`${url}/rest/v1/${name}?select=*&limit=1`, { headers });
  if (res.status === 404) return { ok: false, state: "NO EXISTE" };
  if (res.status === 200) return { ok: true, state: "EXISTE — ¡anon PUEDE LEERLA! revisar grants" };
  if (res.status === 401 || res.status === 403) return { ok: true, state: "existe y protegida" };
  return { ok: false, state: `respuesta inesperada HTTP ${res.status}` };
}

/**
 * Una función que no existe da 404 PGRST202. Si existe, fallará por falta de
 * sesión o de argumentos — y eso ya demuestra que está creada.
 */
async function checkFunction(name, body = {}) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 404) {
    const text = await res.text();
    if (text.includes("PGRST202")) return { ok: false, state: "NO EXISTE" };
  }
  return { ok: true, state: "existe" };
}

const TABLES = [
  ["profiles", "heredada"],
  ["operaciones_inmobiliarias", "heredada"],
  ["balance_items", "heredada"],
  ["investment_shares", "heredada (origen del backfill)"],
  ["user_roles", "plataforma de inversores"],
  ["investor_contacts", "plataforma de inversores"],
  ["investment_opportunities", "plataforma de inversores"],
  ["opportunity_invitations", "plataforma de inversores"],
  ["investments", "plataforma de inversores"],
  ["investment_activity", "plataforma de inversores"],
];

const FUNCTIONS = [
  // Firma de UN argumento: la de dos permitía enumerar el rol de cuentas ajenas.
  ["has_role", { p_role: "inversor" }],
  ["norm_email", { p: "x@y.com" }],
  ["norm_phone", { p: "600000000" }],
  ["claim_invitation", { p_token: "verificacion-inexistente" }],
  ["get_investor_snapshot", { p_invitation: "00000000-0000-0000-0000-000000000000" }],
  ["register_invitation_view", { p_invitation: "00000000-0000-0000-0000-000000000000" }],
  ["set_invitation_interest", { p_invitation: "00000000-0000-0000-0000-000000000000", p_interest: "interesado" }],
  ["investor_can_read_file", { p_owner: "x", p_operation: "y", p_key: "media" }],
  ["list_my_investor_opportunities", {}],
  ["list_my_investments", {}],
  ["get_my_investor_profile", {}],
];

let missing = 0;

console.log(`\nProyecto: ${url.replace(/^https:\/\//, "").split(".")[0]}\n`);
console.log("TABLAS");
for (const [name, note] of TABLES) {
  const r = await checkTable(name);
  if (!r.ok) missing += 1;
  console.log(`  ${r.ok ? "OK  " : "FALTA"}  ${name.padEnd(28)} ${r.state}   (${note})`);
}

console.log("\nFUNCIONES");
for (const [name, body] of FUNCTIONS) {
  const r = await checkFunction(name, body);
  if (!r.ok) missing += 1;
  console.log(`  ${r.ok ? "OK  " : "FALTA"}  ${name.padEnd(34)} ${r.state}`);
}

console.log(
  missing === 0
    ? "\nTodo aplicado. La plataforma de inversores está operativa en este proyecto.\n"
    : `\n${missing} objeto(s) sin aplicar. Ejecuta supabase/migrations/20260910_investor_platform.sql
en el SQL Editor del Dashboard (ver docs/INVERSORES.md §10) y vuelve a lanzar esto.\n`,
);

process.exit(missing === 0 ? 0 : 1);

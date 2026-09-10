#!/usr/bin/env node
// scripts/diagnose-db-mismatch.mjs
//
// Diagnóstico de una discrepancia concreta: el SQL Editor dice que aplicó una
// migración (devuelve sus comprobaciones en `true`) y, acto seguido, una sonda externa
// contra el mismo proyecto no encuentra los objetos.
//
// Solo hay dos explicaciones posibles, y esto las distingue:
//   A) El SQL Editor está en OTRA base (otro proyecto, o una rama de Supabase).
//   B) Es la misma base y la transacción no llegó a confirmarse.
//
// Cómo se distinguen: este script PLANTA una fila marcada usando la API REST —que
// inequívocamente va a producción— y luego se le pide al SQL Editor que la busque.
// Si el editor NO ve la marca, no es la misma base: caso A. Si la ve, es el caso B.
//
//     node scripts/diagnose-db-mismatch.mjs --yes-production
//
// Deja la marca en su sitio a propósito, para que se pueda buscar. Al terminar imprime
// cómo borrarla.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

if (!process.argv.includes("--yes-production")) {
  console.error("Escribe en la base real. Ejecuta con --yes-production");
  process.exit(2);
}

const env = (k) => {
  const m = new RegExp(`^${k}=(.*)$`, "m").exec(readFileSync(join(ROOT, ".env.local"), "utf8"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
};
const URL_ = env("NEXT_PUBLIC_SUPABASE_URL");
const ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const REF = URL_.replace(/^https:\/\//, "").split(".")[0];

const anonUser = async () => {
  const s = await (
    await fetch(`${URL_}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: "{}",
    })
  ).json();
  return { id: s.user.id, tok: s.access_token };
};

const call = async (u, path, init = {}) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${u.tok}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const t = await r.text();
  let b = null;
  try {
    b = t ? JSON.parse(t) : null;
  } catch {
    b = t;
  }
  return { s: r.status, b };
};

console.log(`\nProyecto al que apunta este script: ${REF}`);
console.log(`Endpoint REST: ${URL_}\n`);

const u = await anonUser();
const MARCA = `DIAGNOSTICO-${Date.now().toString(36).toUpperCase()}`;

// ── 1. Plantar la marca ──
const marca = await call(u, "investor_contacts", {
  method: "POST",
  body: JSON.stringify({
    owner_id: u.id,
    first_name: MARCA,
    email: `${MARCA.toLowerCase()}@diagnostico-invergravital.test`,
    notes: "Fila de diagnóstico creada por scripts/diagnose-db-mismatch.mjs. Se puede borrar.",
  }),
});
if (marca.s !== 201) {
  console.error("No se pudo plantar la marca:", marca.s, JSON.stringify(marca.b).slice(0, 200));
  process.exit(1);
}
console.log("MARCA PLANTADA vía API REST (esto es, inequívocamente, producción):");
console.log(`   first_name = ${MARCA}`);
console.log(`   contacto id = ${marca.b[0].id}`);
console.log(`   usuario     = ${u.id}\n`);

// ── 2. Control: ¿los triggers de la migración `b` SÍ se ejecutan en esta base? ──
const otro = await anonUser();
const opId = crypto.randomUUID();
await call(otro, "operaciones_inmobiliarias", {
  method: "POST",
  body: JSON.stringify({
    id: opId,
    user_id: otro.id,
    data: {},
    client_updated_at: new Date().toISOString(),
  }),
});
const oppOtro = await call(otro, "investment_opportunities", {
  method: "POST",
  body: JSON.stringify({ owner_id: otro.id, operation_id: opId, title: "control" }),
});
const cruzada = await call(u, "opportunity_invitations", {
  method: "POST",
  body: JSON.stringify({
    opportunity_id: oppOtro.b?.[0]?.id,
    owner_id: u.id,
    token: `ctl-${crypto.randomUUID()}`,
    invited_email: "ctl@diagnostico.test",
  }),
});
const bActiva = cruzada.s >= 400;

// ── 3. ¿Están los objetos de c/d? ──
const opPropia = crypto.randomUUID();
await call(u, "operaciones_inmobiliarias", {
  method: "POST",
  body: JSON.stringify({ id: opPropia, user_id: u.id, data: {}, client_updated_at: new Date().toISOString() }),
});
const cActiva = await call(u, "investment_opportunities", {
  method: "POST",
  body: JSON.stringify({ owner_id: u.id, operation_id: opId, title: "sobre operacion ajena" }),
});

console.log("CONTROL — qué migraciones están REALMENTE activas en esta base:");
console.log(`   20260910b (trg_enforce_opportunity_owner) : ${bActiva ? "ACTIVA   (invitación cruzada rechazada)" : "NO ACTIVA"}`);
console.log(`   20260910c/d (trg_enforce_operation_owner) : ${cActiva.s >= 400 ? "ACTIVA" : "NO ACTIVA (oportunidad sobre operación ajena → HTTP " + cActiva.s + ")"}`);
console.log(
  `\n   ⇒ Los triggers SÍ se ejecutan en esta base (lo demuestra b). Lo que falta es\n     exclusivamente lo que crean c y d.\n`,
);

// ── Limpieza de todo MENOS la marca ──
for (const a of [otro]) {
  for (const [t, q] of [
    ["opportunity_invitations", `?owner_id=eq.${a.id}`],
    ["investment_opportunities", `?owner_id=eq.${a.id}`],
    ["operaciones_inmobiliarias", `?user_id=eq.${a.id}`],
    ["user_roles", `?user_id=eq.${a.id}`],
  ]) {
    await call(a, `${t}${q}`, { method: "DELETE" }).catch(() => {});
  }
}
await call(u, `investment_opportunities?owner_id=eq.${u.id}`, { method: "DELETE" }).catch(() => {});
await call(u, `operaciones_inmobiliarias?user_id=eq.${u.id}`, { method: "DELETE" }).catch(() => {});
await call(u, `opportunity_invitations?owner_id=eq.${u.id}`, { method: "DELETE" }).catch(() => {});

console.log("─".repeat(78));
console.log("EJECUTA ESTA ÚNICA CONSULTA EN EL SQL EDITOR Y PÉGAME EL RESULTADO ENTERO:");
console.log("─".repeat(78));
console.log(`
select
  -- ¿Qué base es esta, sin ambigüedad?
  (select system_identifier::text from pg_control_system())            as cluster_id,
  current_database()                                                   as base,
  coalesce(inet_server_addr()::text, 'socket local')                   as servidor,
  current_setting('server_version')                                    as version_pg,

  -- ¿Ve esta base la fila que acabo de crear por la API REST de producción?
  (select count(*) from public.investor_contacts
     where first_name = '${MARCA}')                                    as ve_mi_marca,
  (select count(*) from public.investor_contacts)                      as contactos_totales,

  -- Los cuatro checks, consultados DIRECTAMENTE al catálogo
  (select count(*) from pg_trigger
     where tgname = 'trg_enforce_operation_owner' and not tgisinternal) as trg_operation_owner,
  (select count(*) from pg_trigger
     where tgname = 'trg_enforce_activity_owner'  and not tgisinternal) as trg_activity_owner,
  (select count(*) from pg_proc
     where proname = 'register_invitation_view'
       and prosrc like '%invitation_is_coherent%')                     as rpc_view_ok,
  (select count(*) from pg_proc
     where proname = 'set_invitation_interest'
       and prosrc like '%invitation_is_coherent%')                     as rpc_interest_ok,

  -- Control: lo que SÍ está aplicado y funcionando
  (select count(*) from pg_trigger
     where tgname = 'trg_enforce_opportunity_owner' and not tgisinternal) as trg_de_la_migracion_b,
  (select count(*) from pg_proc where proname = 'invitation_is_coherent') as fn_invitation_is_coherent;
`);
console.log("─".repeat(78));
console.log("CÓMO LEER EL RESULTADO:");
console.log("  ve_mi_marca = 1  → es la MISMA base. La migración se ejecutó y NO se confirmó.");
console.log("  ve_mi_marca = 0  → es OTRA base (otro proyecto o una rama de Supabase).");
console.log("                     Compara `cluster_id` entre esa sesión y la de producción.");
console.log("  trg_de_la_migracion_b = 1 confirma que esa base sí tiene lo aplicado antes.");
console.log("─".repeat(78));
console.log(`\nPara borrar la marca después:`);
console.log(`  delete from public.investor_contacts where first_name = '${MARCA}';`);
console.log(`  delete from auth.users where id = '${u.id}';\n`);

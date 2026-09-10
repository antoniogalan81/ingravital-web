#!/usr/bin/env node
// scripts/adversarial-idor-probe.mjs
//
// Sonda ADVERSARIAL contra el proyecto Supabase real: intenta romper el aislamiento
// entre promotores por todas las vías que se me ocurren, no solo la del IDOR original.
// Complementa a `e2e-investor-flow.mjs`, que recorre el flujo feliz; esto solo ataca.
//
//     node scripts/adversarial-idor-probe.mjs --yes-production
//
// Escribe en la base real (usuarios anónimos + sus propias filas) y limpia al terminar.

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

let fails = 0;
const ok = (cond, label, extra) => {
  console.log(`  ${cond ? "BLOQUEADO" : "¡PASA!   "}  ${label}${extra !== undefined ? `  — ${extra}` : ""}`);
  if (!cond) fails += 1;
};
const sec = (t) => console.log(`\n=== ${t} ===`);

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

const RUN = `adv${Date.now().toString(36)}`;
const victima = await anonUser();
const atacante = await anonUser();
console.log(`\nProyecto: ${URL_.replace(/^https:\/\//, "").split(".")[0]}`);
console.log(`víctima=${victima.id}\natacante=${atacante.id}`);

// ── Montaje: la víctima tiene una oportunidad con todo oculto ──
const opId = crypto.randomUUID();
await call(victima, "operaciones_inmobiliarias", {
  method: "POST",
  body: JSON.stringify({
    id: opId,
    user_id: victima.id,
    data: { name: `victima ${RUN}` },
    client_updated_at: new Date().toISOString(),
  }),
});
const opp = (
  await call(victima, "investment_opportunities", {
    method: "POST",
    body: JSON.stringify({
      owner_id: victima.id,
      operation_id: opId,
      title: `PRIVADA ${RUN}`,
      internal_notes: "SECRETO",
      metrics: { costesTotales: 999000, rentabilidadPromotor: 777777 },
      visibility: {},
    }),
  })
).b[0];

// El atacante monta su propia oportunidad legítima, para intentar repuntarla.
const opAtk = crypto.randomUUID();
await call(atacante, "operaciones_inmobiliarias", {
  method: "POST",
  body: JSON.stringify({
    id: opAtk,
    user_id: atacante.id,
    data: { name: `atacante ${RUN}` },
    client_updated_at: new Date().toISOString(),
  }),
});
const oppAtk = (
  await call(atacante, "investment_opportunities", {
    method: "POST",
    body: JSON.stringify({ owner_id: atacante.id, operation_id: opAtk, title: `propia ${RUN}` }),
  })
).b[0];
const invAtk = (
  await call(atacante, "opportunity_invitations", {
    method: "POST",
    body: JSON.stringify({
      opportunity_id: oppAtk.id,
      owner_id: atacante.id,
      token: `${RUN}-propio`,
      invited_email: `${RUN}@ejemplo-test.com`,
      visibility: { rentabilidadPromotor: true, costesTotales: true },
    }),
  })
).b[0];

sec("1. INSERT directo de invitación sobre oportunidad ajena");
const a1 = await call(atacante, "opportunity_invitations", {
  method: "POST",
  body: JSON.stringify({
    opportunity_id: opp.id,
    owner_id: atacante.id,
    token: `${RUN}-1`,
    invited_email: `${RUN}@ejemplo-test.com`,
    visibility: { rentabilidadPromotor: true },
  }),
});
ok(a1.s >= 400, "insert de invitación cruzada", `HTTP ${a1.s}`);

sec("2. INSERT de inversión sobre oportunidad ajena");
const a2 = await call(atacante, "investments", {
  method: "POST",
  body: JSON.stringify({ opportunity_id: opp.id, owner_id: atacante.id, amount: 1, status: "activa" }),
});
ok(a2.s >= 400, "insert de inversión cruzada", `HTTP ${a2.s}`);

sec("3. REPUNTAR una invitación propia a la oportunidad ajena (UPDATE)");
const a3 = await call(atacante, `opportunity_invitations?id=eq.${invAtk.id}`, {
  method: "PATCH",
  body: JSON.stringify({ opportunity_id: opp.id }),
});
const trasA3 = await call(atacante, `opportunity_invitations?select=opportunity_id&id=eq.${invAtk.id}`);
ok(
  trasA3.b?.[0]?.opportunity_id === oppAtk.id,
  "update de opportunity_id a una ajena",
  `HTTP ${a3.s}, sigue apuntando a ${trasA3.b?.[0]?.opportunity_id === oppAtk.id ? "la suya" : "LA AJENA"}`,
);

sec("4. UPSERT (merge-duplicates) para esquivar la policy de INSERT");
const a4 = await call(atacante, "opportunity_invitations", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify({
    opportunity_id: opp.id,
    owner_id: atacante.id,
    token: `${RUN}-4`,
    invited_email: `${RUN}@ejemplo-test.com`,
  }),
});
ok(a4.s >= 400, "upsert cruzado", `HTTP ${a4.s}`);

sec("5. Cambiar el owner_id de la oportunidad ajena");
const a5 = await call(atacante, `investment_opportunities?id=eq.${opp.id}`, {
  method: "PATCH",
  body: JSON.stringify({ owner_id: atacante.id }),
});
const trasA5 = await call(victima, `investment_opportunities?select=owner_id&id=eq.${opp.id}`);
ok(trasA5.b?.[0]?.owner_id === victima.id, "apropiarse de la oportunidad", `HTTP ${a5.s}`);

sec("6. Leer el snapshot de una invitación ajena por id");
const invVic = (
  await call(victima, "opportunity_invitations", {
    method: "POST",
    body: JSON.stringify({
      opportunity_id: opp.id,
      owner_id: victima.id,
      token: `${RUN}-vic`,
      invited_email: `vic-${RUN}@ejemplo-test.com`,
      visibility: { costesTotales: true },
    }),
  })
).b[0];
const a6 = await call(atacante, "rpc/get_investor_snapshot", {
  method: "POST",
  body: JSON.stringify({ p_invitation: invVic.id }),
});
ok(a6.s >= 400, "snapshot de una invitación que no es suya", `HTTP ${a6.s}`);

sec("7. Reclamar la invitación de otro por su token");
const a7 = await call(atacante, "rpc/claim_invitation", {
  method: "POST",
  body: JSON.stringify({ p_token: `${RUN}-vic` }),
});
ok(a7.s >= 400, "claim del token ajeno", `HTTP ${a7.s}`);

sec("8. Escribir en la carpeta de Storage de la víctima");
const a8 = await fetch(`${URL_}/storage/v1/object/investment-media/${victima.id}/${opId}/media/x.txt`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${atacante.tok}`, "Content-Type": "text/plain" },
  body: "intruso",
});
ok(a8.status >= 400, "subida bajo el prefijo de la víctima", `HTTP ${a8.status}`);

sec("9. Firmar un archivo de la víctima");
await fetch(`${URL_}/storage/v1/object/investment-media/${victima.id}/${opId}/media/priv.txt`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${victima.tok}`, "Content-Type": "text/plain" },
  body: "privado",
});
const a9 = await fetch(`${URL_}/storage/v1/object/sign/investment-media/${victima.id}/${opId}/media/priv.txt`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${atacante.tok}`, "Content-Type": "application/json" },
  body: JSON.stringify({ expiresIn: 60 }),
});
ok(a9.status >= 400, "firmar un archivo ajeno", `HTTP ${a9.status}`);

sec("10. Listar contactos / oportunidades / inversiones de la víctima");
for (const [t, q] of [
  ["investor_contacts", `?select=id&owner_id=eq.${victima.id}`],
  ["investment_opportunities", `?select=id,internal_notes&owner_id=eq.${victima.id}`],
  ["investments", `?select=id&owner_id=eq.${victima.id}`],
  ["opportunity_invitations", `?select=id&owner_id=eq.${victima.id}`],
  ["investment_activity", `?select=id&owner_id=eq.${victima.id}`],
]) {
  const r = await call(atacante, `${t}${q}`);
  ok(Array.isArray(r.b) && r.b.length === 0, `lectura directa de ${t}`, `${Array.isArray(r.b) ? r.b.length : "?"} filas`);
}

sec("11. Conceder(se) un rol a otra cuenta / borrar el rol de otro");
const a11 = await call(atacante, "user_roles", {
  method: "POST",
  body: JSON.stringify({ user_id: victima.id, role: "promotor" }),
});
ok(a11.s >= 400, "insertar rol para otro usuario", `HTTP ${a11.s}`);
await call(victima, "user_roles", { method: "POST", body: JSON.stringify({ user_id: victima.id, role: "promotor" }) });
await call(atacante, `user_roles?user_id=eq.${victima.id}`, { method: "DELETE" });
const rolVic = await call(victima, `user_roles?select=role&user_id=eq.${victima.id}`);
ok(Array.isArray(rolVic.b) && rolVic.b.length === 1, "borrar el rol de otro usuario");

// ── Limpieza ──
sec("LIMPIEZA");
for (const u of [victima, atacante]) {
  for (const [t, q] of [
    ["investments", `?owner_id=eq.${u.id}`],
    ["opportunity_invitations", `?owner_id=eq.${u.id}`],
    ["investment_activity", `?owner_id=eq.${u.id}`],
    ["investment_opportunities", `?owner_id=eq.${u.id}`],
    ["investor_contacts", `?owner_id=eq.${u.id}`],
    ["operaciones_inmobiliarias", `?user_id=eq.${u.id}`],
    ["user_roles", `?user_id=eq.${u.id}`],
  ]) {
    await call(u, `${t}${q}`, { method: "DELETE" }).catch(() => {});
  }
}
for (const p of [`${victima.id}/${opId}/media/priv.txt`]) {
  await fetch(`${URL_}/storage/v1/object/investment-media/${p}`, {
    method: "DELETE",
    headers: { apikey: ANON, Authorization: `Bearer ${victima.tok}` },
  }).catch(() => {});
}
let restos = 0;
for (const u of [victima, atacante]) {
  for (const [t, q] of [
    ["investment_opportunities", `?select=id&owner_id=eq.${u.id}`],
    ["operaciones_inmobiliarias", `?select=id&user_id=eq.${u.id}`],
    ["user_roles", `?select=role&user_id=eq.${u.id}`],
  ]) {
    const r = await call(u, `${t}${q}`);
    if (Array.isArray(r.b)) restos += r.b.length;
  }
}
console.log(`  filas restantes: ${restos}`);
console.log(`  usuarios anónimos creados: 2 → ${victima.id}  ${atacante.id}`);
if (restos > 0) fails += 1;

console.log(fails === 0 ? "\nRESULTADO: TODOS LOS ATAQUES BLOQUEADOS\n" : `\nRESULTADO: ${fails} ATAQUE(S) NO BLOQUEADO(S)\n`);
process.exit(fails === 0 ? 0 : 1);

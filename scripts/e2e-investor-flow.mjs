#!/usr/bin/env node
// scripts/e2e-investor-flow.mjs
//
// Recorrido COMPLETO del flujo de inversores contra un proyecto Supabase REAL,
// usando la API REST de verdad y sesiones de verdad — no PGlite, no mocks.
// Cada paso se ejecuta con el JWT del usuario que corresponde, así que lo que se
// comprueba es la RLS real del servidor, no la lógica del cliente.
//
// ⚠️ ESCRIBE EN LA BASE DE DATOS. Crea usuarios y datos de prueba marcados y los
// BORRA al terminar, incluso si algo falla (bloque `finally`). Por eso exige una
// confirmación explícita:
//
//     node scripts/e2e-investor-flow.mjs --yes-production
//
// Usa SESIONES ANÓNIMAS reales (`/auth/v1/signup` sin cuerpo): dan un JWT auténtico
// con rol `authenticated` y su propio uid, así que la RLS se aplica exactamente igual
// que a un usuario con email. No se usa la clave de servicio porque en este proyecto
// está marcada como sensible en Vercel y no se puede recuperar.
//
// LIMITACIÓN CONOCIDA: un usuario anónimo no lleva email ni teléfono en el JWT, así
// que aquí solo se comprueba la rama NEGATIVA de `claim_invitation` (identidad que no
// coincide => denegado), que es la que protege. La rama positiva (email/teléfono que sí
// coinciden) está cubierta por `supabase/tests/investorPlatform.test.mjs` contra
// Postgres real. Se indica explícitamente en la salida.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

if (!process.argv.includes("--yes-production")) {
  console.error(
    "Este script escribe en la base de datos real.\n" +
      "Ejecuta:  node scripts/e2e-investor-flow.mjs --yes-production",
  );
  process.exit(2);
}

// ── Configuración ────────────────────────────────────────────────────────────

function envFrom(file, key) {
  try {
    const m = new RegExp(`^${key}=(.*)$`, "m").exec(readFileSync(file, "utf8"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}

const LOCAL = join(ROOT, ".env.local");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? envFrom(LOCAL, "NEXT_PUBLIC_SUPABASE_URL");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? envFrom(LOCAL, "NEXT_PUBLIC_SUPABASE_ANON_KEY");

if (!URL_ || !ANON) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(2);
}

// Marca única: todo lo que cree este script la lleva, para poder limpiarlo sin dudas.
const RUN = `e2e${Date.now().toString(36)}`;
const DOMAIN = "invergravital-e2e.invalid";

// ── Utilidades HTTP ──────────────────────────────────────────────────────────

/** Cliente REST actuando como un usuario concreto (su JWT ⇒ su RLS). */
function asUser(token) {
  const headers = {
    apikey: ANON,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  return {
    async from(table, query = "", init = {}) {
      // Las cabeceras se FUSIONAN: un `{ ...init, headers }` descartaba el `Prefer`
      // que pide a PostgREST devolver la fila insertada.
      const res = await fetch(`${URL_}/rest/v1/${table}${query}`, {
        ...init,
        headers: { ...headers, ...(init.headers ?? {}) },
      });
      const text = await res.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      return { status: res.status, body };
    },
    insert(table, data, prefer = "return=representation") {
      return this.from(table, "", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { ...headers, Prefer: prefer },
      });
    },
    patch(table, query, data) {
      return this.from(table, query, { method: "PATCH", body: JSON.stringify(data) });
    },
    rpc(fn, args = {}) {
      return this.from(`rpc/${fn}`, "", { method: "POST", body: JSON.stringify(args) });
    },
    token,
  };
}

let failures = 0;
const ok = (cond, label, extra) => {
  console.log(`  ${cond ? "PASS " : "FALLO"}  ${label}${extra !== undefined ? `  — ${extra}` : ""}`);
  if (!cond) failures += 1;
};
const section = (t) => console.log(`\n=== ${t} ===`);

// ── Alta y baja de usuarios de prueba ────────────────────────────────────────

const created = { users: [], objects: [] };

async function makeUser(tag) {
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const session = await res.json();
  if (!session.access_token) {
    throw new Error(`No se pudo crear la sesion anonima de ${tag}: ${JSON.stringify(session).slice(0, 200)}`);
  }
  const id = session.user?.id;
  created.users.push({ tag, id });
  return { id, tag, client: asUser(session.access_token) };
}

async function cleanup(actors) {
  section("LIMPIEZA");
  // Cada usuario borra SUS filas con su propia sesion: la RLS lo permite porque es el
  // propietario. Las FK en cascada se encargan del resto.
  for (const a of actors.filter(Boolean)) {
    for (const [table, query] of [
      ["investments", `?owner_id=eq.${a.id}`],
      ["opportunity_invitations", `?owner_id=eq.${a.id}`],
      ["investment_activity", `?owner_id=eq.${a.id}`],
      ["investment_opportunities", `?owner_id=eq.${a.id}`],
      ["investor_contacts", `?owner_id=eq.${a.id}`],
      ["operaciones_inmobiliarias", `?user_id=eq.${a.id}`],
      ["user_roles", `?user_id=eq.${a.id}`],
    ]) {
      await a.client.from(table, query, { method: "DELETE" }).catch(() => {});
    }
    for (const path of created.objects) {
      await fetch(`${URL_}/storage/v1/object/${path}`, {
        method: "DELETE",
        headers: { apikey: ANON, Authorization: `Bearer ${a.client.token}` },
      }).catch(() => {});
    }
  }

  let restos = 0;
  for (const a of actors.filter(Boolean)) {
    // Se re-comprueban LAS SIETE tablas que se borran, no solo tres: un DELETE que
    // fallara en silencio dejaria basura en produccion sin que el script lo notara.
    for (const [table, query] of [
      ["investments", `?select=id&owner_id=eq.${a.id}`],
      ["opportunity_invitations", `?select=id&owner_id=eq.${a.id}`],
      ["investment_activity", `?select=id&owner_id=eq.${a.id}`],
      ["investment_opportunities", `?select=id&owner_id=eq.${a.id}`],
      ["investor_contacts", `?select=id&owner_id=eq.${a.id}`],
      ["operaciones_inmobiliarias", `?select=id&user_id=eq.${a.id}`],
      ["user_roles", `?select=role&user_id=eq.${a.id}`],
    ]) {
      const r = await a.client.from(table, query);
      if (Array.isArray(r.body) && r.body.length > 0) restos += r.body.length;
    }
  }
  console.log(`  filas de prueba restantes: ${restos}`);
  console.log(`  usuarios ANONIMOS creados que no se pueden borrar sin clave de servicio: ${created.users.length}`);
  console.log(`    ${created.users.map((u) => `${u.tag}=${u.id}`).join("  ")}`);
  if (restos > 0) failures += 1;
}

// ── Recorrido ────────────────────────────────────────────────────────────────

let promoA, promoB, invA, invB;

async function main() {
  console.log(`\nProyecto: ${URL_.replace(/^https:\/\//, "").split(".")[0]}`);
  console.log(`Marca de esta ejecución: ${RUN}\n`);

  section("0. Alta de actores");
  promoA = await makeUser("promoa");
  promoB = await makeUser("promob");
  invA = await makeUser("inva");
  invB = await makeUser("invb");
  console.log("  4 sesiones anonimas reales creadas");

  section("1. El promotor analiza su operación");
  const operationId = crypto.randomUUID();
  const opRes = await promoA.client.insert("operaciones_inmobiliarias", {
    id: operationId,
    user_id: promoA.id,
    data: { name: `E2E ${RUN}`, address: "Calle de Prueba 1" },
    client_updated_at: new Date().toISOString(),
  });
  ok(opRes.status === 201, "crea la operación", `HTTP ${opRes.status}`);

  section("2. La convierte en oportunidad");
  const oppRes = await promoA.client.insert("investment_opportunities", {
    owner_id: promoA.id,
    operation_id: operationId,
    title: `Edificio E2E ${RUN}`,
    location: "Málaga",
    summary: "Compra, reforma y venta",
    strategy: "Reforma integral",
    risks: "Retraso de licencias",
    internal_notes: "MARGEN_INTERNO_SECRETO",
    target_capital: 400000,
    min_ticket: 25000,
    offered_yield_pct: 12,
    term_months: 18,
    metrics: {
      costesTotales: 350000,
      rentabilidadEstimada: 0.18,
      rentabilidadPromotor: 987654,
    },
    visibility: { estrategia: true, costesTotales: true, media: false, estadoCaptacion: true },
  });
  const opportunity = Array.isArray(oppRes.body) ? oppRes.body[0] : null;
  ok(!!opportunity?.id, "crea la oportunidad", `HTTP ${oppRes.status}`);

  section("3. Da de alta el contacto en su CRM");
  const conRes = await promoA.client.insert("investor_contacts", {
    owner_id: promoA.id,
    first_name: "Inversor",
    last_name: "E2E",
    email: `${RUN}-INVERSOR@${DOMAIN}`.toUpperCase(), // se comprueba que la BD lo normaliza
    phone: "600 111 222",
  });
  const contact = Array.isArray(conRes.body) ? conRes.body[0] : null;
  ok(!!contact?.id, "crea el contacto", `HTTP ${conRes.status}`);
  ok(contact?.email === `${RUN}-inversor@${DOMAIN}`, "la BD normaliza el email", contact?.email);
  ok(contact?.phone === "+34600111222", "la BD normaliza el teléfono a E.164", contact?.phone);

  section("4. Duplicados y contactos inalcanzables");
  const dup = await promoA.client.insert("investor_contacts", {
    owner_id: promoA.id,
    first_name: "Duplicado",
    email: `${RUN}-inversor@${DOMAIN}`,
  });
  ok(dup.status === 409, "rechaza un contacto duplicado por email", `HTTP ${dup.status}`);
  const sinContacto = await promoA.client.insert("investor_contacts", {
    owner_id: promoA.id,
    first_name: "Fantasma",
  });
  ok(sinContacto.status >= 400, "rechaza un contacto sin email ni teléfono", `HTTP ${sinContacto.status}`);

  section("5. Crea la invitación");
  const token = `${RUN}-${crypto.randomUUID().replace(/-/g, "")}`;
  const invRes = await promoA.client.insert("opportunity_invitations", {
    opportunity_id: opportunity.id,
    owner_id: promoA.id,
    contact_id: contact.id,
    channel: "whatsapp",
    token,
    invited_email: `${RUN}-inversor@${DOMAIN}`,
    visibility: { estrategia: true, costesTotales: true, media: false, estadoCaptacion: true },
  });
  const invitation = Array.isArray(invRes.body) ? invRes.body[0] : null;
  ok(!!invitation?.id, "crea la invitación", `HTTP ${invRes.status}`);

  section("6. AISLAMIENTO entre promotores");
  for (const t of ["investor_contacts", "investment_opportunities", "opportunity_invitations"]) {
    const r = await promoB.client.from(t, "?select=id");
    ok(Array.isArray(r.body) && r.body.length === 0, `el promotor B no ve ${t} del promotor A`);
  }
  const opsB = await promoB.client.from("operaciones_inmobiliarias", `?select=id&id=eq.${operationId}`);
  ok(Array.isArray(opsB.body) && opsB.body.length === 0, "el promotor B no ve la operación del A");

  section("7. Reclamar la invitación");
  // Rama NEGATIVA (la que protege): identidad que no coincide => denegado.
  const claimMal = await invB.client.rpc("claim_invitation", { p_token: token });
  ok(claimMal.status >= 400, "una identidad que no coincide NO puede reclamarla", `HTTP ${claimMal.status}`);
  const claimMal2 = await invA.client.rpc("claim_invitation", { p_token: token });
  ok(claimMal2.status >= 400, "tampoco el destinatario sin identidad verificada", `HTTP ${claimMal2.status}`);
  console.log("  (la rama positiva por email/telefono se cubre en supabase/tests contra Postgres real)");

  // El promotor asigna la invitacion a ese usuario; a partir de ahi `claim` la enlaza.
  await promoA.client.patch("opportunity_invitations", `?id=eq.${invitation.id}`, {
    investor_user_id: invA.id,
  });
  const claimBien = await invA.client.rpc("claim_invitation", { p_token: token });
  ok(claimBien.status === 200 && claimBien.body === invitation.id, "el inversor asignado la reclama", `HTTP ${claimBien.status}`);

  const roles = await invA.client.from("user_roles", "?select=role");
  ok(
    Array.isArray(roles.body) && roles.body.some((r) => r.role === "inversor"),
    "al reclamar recibe el rol inversor",
    JSON.stringify(roles.body),
  );

  section("8. PRIVACIDAD del snapshot");
  const snapRes = await invA.client.rpc("get_investor_snapshot", { p_invitation: invitation.id });
  const snap = snapRes.body;
  const raw = JSON.stringify(snap);
  ok(snapRes.status === 200, "el inversor obtiene el snapshot", `HTTP ${snapRes.status}`);
  ok(!raw.includes("MARGEN_INTERNO_SECRETO"), "NO contiene las notas internas");
  ok(!raw.includes("987654"), "NO contiene la rentabilidad del promotor (toggle apagado)");
  ok(snap?.costesTotales === 350000, "SÍ contiene lo autorizado", String(snap?.costesTotales));
  ok(snap?.media === undefined, "NO contiene media (toggle apagado)");
  ok(snap?.strategy === "Reforma integral", "SÍ contiene la estrategia");

  section("9. El inversor NO lee las tablas internas");
  for (const t of ["investment_opportunities", "operaciones_inmobiliarias", "investor_contacts", "investments"]) {
    const r = await invA.client.from(t, "?select=*");
    ok(Array.isArray(r.body) && r.body.length === 0, `${t}: 0 filas para el inversor`);
  }
  const perfil = await invA.client.rpc("get_my_investor_profile");
  ok(Array.isArray(perfil.body) && perfil.body.length === 1, "pero SÍ ve sus datos por RPC");
  ok(
    perfil.body?.[0] && !("notes" in perfil.body[0]) && !("status" in perfil.body[0]),
    "y el perfil no lleva notas ni estado del CRM",
    JSON.stringify(Object.keys(perfil.body?.[0] ?? {})),
  );

  section("10. Trazabilidad de la vista");
  await invA.client.rpc("register_invitation_view", { p_invitation: invitation.id });
  const vista = await promoA.client.from(
    "opportunity_invitations",
    `?select=status,view_count,first_viewed_at&id=eq.${invitation.id}`,
  );
  const v0 = vista.body?.[0];
  ok(v0?.view_count >= 1, "el promotor ve el contador de aperturas", String(v0?.view_count));
  ok(!!v0?.first_viewed_at, "y la fecha de primera apertura");
  ok(v0?.status === "vista", "el estado pasa a 'vista'", v0?.status);

  section("11. Interés ≠ inversión");
  await invA.client.rpc("set_invitation_interest", { p_invitation: invitation.id, p_interest: "interesado", p_note: "Me encaja" });
  const interes = await promoA.client.from("opportunity_invitations", `?select=interest,interest_note&id=eq.${invitation.id}`);
  ok(interes.body?.[0]?.interest === "interesado", "el promotor ve el interés");
  const sinInversion = await invA.client.rpc("list_my_investments");
  ok(Array.isArray(sinInversion.body) && sinInversion.body.length === 0, "expresar interés NO crea inversión");

  section("12. Inversión real");
  const vRes = await promoA.client.insert("investments", {
    opportunity_id: opportunity.id,
    owner_id: promoA.id,
    contact_id: contact.id,
    investor_user_id: invA.id,
    amount: 50000,
    status: "activa",
    agreed_yield_pct: 12,
    notes: "NOTA_INTERNA_DE_LA_INVERSION",
  });
  ok(vRes.status === 201, "el promotor registra la inversión", `HTTP ${vRes.status}`);

  const mias = await invA.client.rpc("list_my_investments");
  ok(Array.isArray(mias.body) && mias.body.length === 1, "el inversor la ve en «Mis inversiones»");
  ok(Number(mias.body?.[0]?.amount) === 50000, "con el importe correcto", String(mias.body?.[0]?.amount));
  ok(
    !JSON.stringify(mias.body).includes("NOTA_INTERNA_DE_LA_INVERSION"),
    "sin las notas internas del promotor",
  );

  const otras = await invB.client.rpc("list_my_investments");
  ok(Array.isArray(otras.body) && otras.body.length === 0, "el inversor B no ve inversiones ajenas");

  section("13. Estado de captación sobre datos reales");
  const snap2 = (await invA.client.rpc("get_investor_snapshot", { p_invitation: invitation.id })).body;
  ok(Number(snap2?.captacion?.invertido) === 50000, "capital invertido calculado", JSON.stringify(snap2?.captacion));

  section("14. La visibilidad surte efecto AL INSTANTE");
  await promoA.client.patch("opportunity_invitations", `?id=eq.${invitation.id}`, {
    visibility: { estrategia: true, costesTotales: false, media: false },
  });
  const snap3 = (await invA.client.rpc("get_investor_snapshot", { p_invitation: invitation.id })).body;
  ok(snap3?.costesTotales === undefined, "apagar el toggle oculta el dato sin republicar nada");

  section("15. Storage: subida del promotor y lectura del inversor");
  const objectPath = `${promoA.id}/${operationId}/media/${RUN}.txt`;
  const up = await fetch(`${URL_}/storage/v1/object/investment-media/${objectPath}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${promoA.client.token}`, "Content-Type": "text/plain" },
    body: `contenido de prueba ${RUN}`,
  });
  ok(up.status === 200, "el promotor sube un archivo a su carpeta", `HTTP ${up.status}`);
  if (up.status === 200) created.objects.push(`investment-media/${objectPath}`);

  const sign = (client) =>
    fetch(`${URL_}/storage/v1/object/sign/investment-media/${objectPath}`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${client.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 60 }),
    }).then((r) => r.status);

  ok((await sign(promoA.client)) === 200, "el propietario firma su archivo");
  ok((await sign(invA.client)) !== 200, "con media:false el inversor NO puede firmarlo");

  await promoA.client.patch("opportunity_invitations", `?id=eq.${invitation.id}`, {
    visibility: { media: true },
  });
  ok((await sign(invA.client)) === 200, "al activar media:true SÍ puede");
  ok((await sign(invB.client)) !== 200, "otro inversor nunca puede");

  await promoA.client.patch("opportunity_invitations", `?id=eq.${invitation.id}`, {
    visibility: { media: false },
  });
  ok((await sign(invA.client)) !== 200, "y al apagarlo lo pierde de inmediato");

  section("16. Revocación y caducidad");
  await promoA.client.patch("opportunity_invitations", `?id=eq.${invitation.id}`, {
    status: "revocada",
    revoked_at: new Date().toISOString(),
  });
  const trasRevocar = await invA.client.rpc("get_investor_snapshot", { p_invitation: invitation.id });
  ok(trasRevocar.status >= 400, "revocada ⇒ sin acceso al snapshot", `HTTP ${trasRevocar.status}`);
  const listaTrasRevocar = await invA.client.rpc("list_my_investor_opportunities");
  ok(
    Array.isArray(listaTrasRevocar.body) && listaTrasRevocar.body.length === 0,
    "y desaparece de su lista de oportunidades",
  );

  await promoA.client.patch("opportunity_invitations", `?id=eq.${invitation.id}`, {
    status: "enviada",
    revoked_at: null,
    expires_at: new Date(Date.now() - 86400000).toISOString(),
  });
  const trasCaducar = await invA.client.rpc("get_investor_snapshot", { p_invitation: invitation.id });
  ok(trasCaducar.status >= 400, "caducada ⇒ sin acceso", `HTTP ${trasCaducar.status}`);

  section("17. Escalada de privilegios");
  const escalada = await invA.client.insert("user_roles", { user_id: promoB.id, role: "promotor" });
  ok(escalada.status >= 400, "un inversor no puede conceder roles a otra cuenta", `HTTP ${escalada.status}`);
  const tocarAjeno = await invA.client.patch(
    "investment_opportunities",
    `?id=eq.${opportunity.id}`,
    { title: "SECUESTRADA" },
  );
  const sigueIgual = await promoA.client.from("investment_opportunities", `?select=title&id=eq.${opportunity.id}`);
  ok(
    sigueIgual.body?.[0]?.title !== "SECUESTRADA",
    "un inversor no puede modificar la oportunidad",
    `HTTP ${tocarAjeno.status}`,
  );
}

try {
  await main();
} catch (e) {
  console.error("\nERROR NO CONTROLADO:", e.message);
  failures += 1;
} finally {
  await cleanup([promoA, promoB, invA, invB]).catch((e) => console.error("  fallo limpiando:", e.message));
}

console.log(failures === 0 ? "\nRESULTADO: TODO CORRECTO\n" : `\nRESULTADO: ${failures} COMPROBACIÓN(ES) FALLIDA(S)\n`);
process.exit(failures === 0 ? 0 : 1);

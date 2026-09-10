// supabase/tests/investorPlatform.test.mjs
//
// Pruebas de PRIVACIDAD y AISLAMIENTO de la plataforma de inversores, ejecutadas
// contra un Postgres REAL (PGlite/WASM) — no mocks. Aplican la migración
// `20260910_investor_platform.sql` sobre un entorno que reproduce lo justo de
// Supabase (esquemas auth/storage, auth.uid()/auth.jwt(), roles anon/authenticated)
// y las tablas que YA existen en producción.
//
// POR QUÉ ASÍ: sin Docker no hay `supabase start`. PGlite permite verificar de
// verdad RLS, policies y funciones SECURITY DEFINER, que es donde vive el riesgo
// de fuga de datos. Un mock no habría detectado el fallo real que sí detectó esto:
// una subconsulta dentro de una policy se evalúa con la RLS del que llama, así que
// el join contra `investment_opportunities` denegaba el acceso legítimo.
//
// Ejecutar:  npm run test:db

import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(HERE, "..", "migrations", "20260910_investor_platform.sql");
const MIGRATION_GUARD = join(HERE, "..", "migrations", "20260910b_investor_platform_owner_guard.sql");
const MIGRATION_HARD  = join(HERE, "..", "migrations", "20260910c_investor_platform_hardening.sql");
const MIGRATION_TRIG  = join(HERE, "..", "migrations", "20260910d_investor_platform_triggers_only.sql");

// PGlite no trae pgcrypto; gen_random_uuid() es núcleo desde PG13 y gen_random_bytes
// solo se usa para generar tokens. Se adapta el ENTORNO de prueba, nunca la migración.
const strip = (sql) =>
  sql.replace(/create\s+extension\s+if\s+not\s+exists\s+pgcrypto\s*;/gi, "-- [test] pgcrypto no disponible en PGlite");

/** Migración base + corrección de seguridad: el esquema tal y como está en producción. */
const migrationSql = () =>
  [MIGRATION, MIGRATION_GUARD, MIGRATION_HARD, MIGRATION_TRIG].map((f) => strip(readFileSync(f, "utf8"))).join(String.fromCharCode(10));

const BOOTSTRAP = `
create schema if not exists auth;
create schema if not exists storage;

create or replace function public.gen_random_bytes(n integer) returns bytea
language sql volatile as $$
  select decode(string_agg(lpad(to_hex((random() * 255)::int), 2, '0'), ''), 'hex')
  from generate_series(1, n);
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant usage on schema storage to anon, authenticated;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text
);
grant select on table auth.users to authenticated;

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;

create table if not exists storage.buckets (id text primary key, name text, public boolean default false);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
create or replace function storage.foldername(p text) returns text[] language sql immutable as $$
  select (string_to_array(p, '/'))[1:greatest(array_length(string_to_array(p, '/'), 1) - 1, 0)];
$$;
grant execute on function storage.foldername(text) to anon, authenticated;

-- Tablas que YA existen en producción (verificado por sonda REST 2026-09-10).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.profiles enable row level security;
grant select on table public.profiles to anon;
grant select, insert, update on table public.profiles to authenticated;

create table if not exists public.operaciones_inmobiliarias (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  client_updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.operaciones_inmobiliarias enable row level security;
grant select, insert, update, delete on public.operaciones_inmobiliarias to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='operaciones_inmobiliarias' and policyname='operaciones_select') then
    create policy "operaciones_select" on public.operaciones_inmobiliarias for select using (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.investment_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null,
  investor_email text,
  investor_user_id uuid references auth.users(id) on delete set null,
  token text unique,
  status text not null default 'active',
  permissions jsonb not null default '{}'::jsonb,
  visibility jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
`;

/** Entorno de prueba: BD limpia + migración aplicada + actores creados. */
async function setup() {
  const db = new PGlite();
  await db.exec(BOOTSTRAP);
  await db.exec(migrationSql());

  const mkUser = async (email, phone = null) =>
    (await db.query(`insert into auth.users (email, phone) values ($1, $2) returning id`, [email, phone]))
      .rows[0].id;

  const actors = {
    promoA: await mkUser("promotor.a@test.com"),
    promoB: await mkUser("promotor.b@test.com"),
    invA: await mkUser("inversor.a@test.com", "+34600000001"),
    invB: await mkUser("inversor.b@test.com", "+34600000002"),
  };

  const operation = (
    await db.query(
      `insert into public.operaciones_inmobiliarias (id, user_id, data, client_updated_at)
       values (gen_random_uuid(), $1, '{"name":"Edificio A"}'::jsonb, now()) returning id`,
      [actors.promoA],
    )
  ).rows[0].id;

  const opportunity = (
    await db.query(
      `insert into public.investment_opportunities
         (owner_id, operation_id, title, internal_notes, target_capital, min_ticket,
          offered_yield_pct, metrics, visibility)
       values ($1, $2, 'Edificio A', 'MARGEN INTERNO 32% NO MOSTRAR', 400000, 25000, 12,
         '{"costesTotales":350000,"rentabilidadEstimada":0.18,"rentabilidadPromotor":99999,"media":[{"bucket":"investment-media"}]}'::jsonb,
         '{"estrategia":true,"costesTotales":true,"media":false}'::jsonb)
       returning id`,
      [actors.promoA, operation],
    )
  ).rows[0].id;

  const contact = (
    await db.query(
      `insert into public.investor_contacts (owner_id, first_name, email, phone)
       values ($1, 'Ana', 'Inversor.A@Test.com', '600 000 001') returning id, email, phone`,
      [actors.promoA],
    )
  ).rows[0];

  const invitation = (
    await db.query(
      `insert into public.opportunity_invitations
         (opportunity_id, owner_id, contact_id, channel, token, invited_email)
       values ($1, $2, $3, 'whatsapp', 'tok-a', 'Inversor.A@Test.com')
       returning id, invited_email`,
      [opportunity, actors.promoA, contact.id],
    )
  ).rows[0];

  /** Ejecuta como un usuario autenticado concreto, con la RLS activa. */
  const asUser = async (uid, claims, fn) => {
    await db.exec("reset role;");
    await db.exec(
      `select set_config('request.jwt.claims', '${JSON.stringify({
        sub: uid,
        role: "authenticated",
        ...claims,
      }).replace(/'/g, "''")}', false);`,
    );
    await db.exec("set role authenticated;");
    try {
      return await fn();
    } finally {
      // Se limpia TAMBIEN la claim: si se queda puesta, `auth.uid()` sigue
      // devolviendo ese usuario en las consultas posteriores de nivel superior y
      // los triggers que dependen de la identidad se comportan como si siguiera
      // habiendo sesion.
      await db.exec("reset role;");
      await db.exec("select set_config('request.jwt.claims', '', false);");
    }
  };
  const asInvestorA = (fn) => asUser(actors.invA, { email: "inversor.a@test.com" }, fn);
  const asInvestorB = (fn) => asUser(actors.invB, { email: "inversor.b@test.com" }, fn);

  return { db, actors, operation, opportunity, contact, invitation, asUser, asInvestorA, asInvestorB };
}

/** Afirma que una consulta falla (acceso denegado o error explícito). */
async function assertDenied(db, sql, params = []) {
  await assert.rejects(
    async () => db.query(sql, params),
    (e) => e instanceof Error,
    `se esperaba denegación y la consulta tuvo éxito: ${sql}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────

test("la migración se aplica y es idempotente", async () => {
  const db = new PGlite();
  await db.exec(BOOTSTRAP);
  await db.exec(migrationSql());
  await db.exec(migrationSql()); // reaplicar no debe fallar

  for (const t of [
    "user_roles",
    "investor_contacts",
    "investment_opportunities",
    "opportunity_invitations",
    "investments",
    "investment_activity",
  ]) {
    const r = await db.query(`select to_regclass('public.${t}') as x`);
    assert.notEqual(r.rows[0].x, null, `falta la tabla ${t}`);
  }

  const rls = await db.query(`
    select c.relname, c.relrowsecurity from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in
      ('user_roles','investor_contacts','investment_opportunities',
       'opportunity_invitations','investments','investment_activity')`);
  assert.equal(rls.rows.length, 6);
  for (const row of rls.rows) {
    assert.equal(row.relrowsecurity, true, `RLS desactivada en ${row.relname}`);
  }
});

test("normaliza email y teléfono a una forma canónica", async () => {
  const { db } = await setup();
  const r = await db.query(`
    select public.norm_email('  Foo.Bar@EXAMPLE.COM ') e1,
           public.norm_email('')                       e2,
           public.norm_phone('612 34 56 78')           p1,
           public.norm_phone('+34 612345678')          p2,
           public.norm_phone('0034612345678')          p3,
           public.norm_phone('612-345-678')            p4`);
  const v = r.rows[0];
  assert.equal(v.e1, "foo.bar@example.com");
  assert.equal(v.e2, null);
  assert.equal(v.p1, "+34612345678");
  assert.equal(v.p2, "+34612345678");
  assert.equal(v.p3, "+34612345678");
  assert.equal(v.p4, v.p1, "los separadores no deben producir teléfonos distintos");
});

test("el CRM deduplica por promotor y exige forma de contacto", async () => {
  const { db, actors } = await setup();

  await assertDenied(
    db,
    `insert into public.investor_contacts (owner_id, first_name, email)
     values ($1, 'Ana duplicada', 'inversor.a@test.com')`,
    [actors.promoA],
  );

  // Otro promotor SÍ puede tener a la misma persona en su propio CRM.
  const other = await db.query(
    `insert into public.investor_contacts (owner_id, first_name, email)
     values ($1, 'Ana', 'inversor.a@test.com') returning id`,
    [actors.promoB],
  );
  assert.equal(other.rows.length, 1);

  await assertDenied(
    db,
    `insert into public.investor_contacts (owner_id, first_name) values ($1, 'Sin contacto')`,
    [actors.promoA],
  );
});

test("un promotor no ve absolutamente nada de otro promotor", async () => {
  const { db, actors, asUser } = await setup();
  await asUser(actors.promoB, { email: "promotor.b@test.com" }, async () => {
    for (const t of ["investor_contacts", "investment_opportunities", "opportunity_invitations"]) {
      const r = await db.query(`select count(*)::int n from public.${t} where owner_id = $1`, [
        actors.promoA,
      ]);
      assert.equal(r.rows[0].n, 0, `el promotor B ha leído ${t} del promotor A`);
    }
  });
});

test("solo el destinatario verificado puede reclamar una invitación", async () => {
  const { db, actors, contact, invitation, asInvestorA, asInvestorB } = await setup();

  await asInvestorB(async () => {
    await assertDenied(db, `select public.claim_invitation('tok-a')`);
  });

  await asInvestorA(async () => {
    const r = await db.query(`select public.claim_invitation('tok-a') as id`);
    assert.equal(r.rows[0].id, invitation.id);
  });

  const linked = await db.query(`select linked_user_id from public.investor_contacts where id = $1`, [
    contact.id,
  ]);
  assert.equal(linked.rows[0].linked_user_id, actors.invA, "el contacto debe vincularse por UUID");

  const role = await db.query(
    `select count(*)::int n from public.user_roles where user_id = $1 and role = 'inversor'`,
    [actors.invA],
  );
  assert.equal(role.rows[0].n, 1, "reclamar debe conceder el rol inversor");
});

test("una invitación ya reclamada no se transfiere a otro usuario", async () => {
  const { db, asInvestorA, asInvestorB } = await setup();
  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);
  });
  await asInvestorB(async () => {
    await assertDenied(db, `select public.claim_invitation('tok-a')`);
  });
});

test("el snapshot nunca expone datos internos del promotor", async () => {
  const { db, invitation, asInvestorA } = await setup();
  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);
    const s = (await db.query(`select public.get_investor_snapshot($1) as s`, [invitation.id])).rows[0].s;
    const raw = JSON.stringify(s);

    assert.ok(!raw.includes("MARGEN INTERNO"), "internal_notes se ha filtrado al inversor");
    assert.ok(!raw.includes("99999"), "rentabilidadPromotor se ha filtrado con el toggle apagado");
    assert.equal(s.costesTotales, 350000, "debe incluir lo que sí está autorizado");
    assert.equal(s.media, undefined, "media está apagada y no debe aparecer");
    assert.equal(s.title, "Edificio A");
  });
});

test("cambiar la visibilidad surte efecto de inmediato, sin republicar", async () => {
  const { db, opportunity, invitation, asInvestorA } = await setup();
  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);
    const before = (await db.query(`select public.get_investor_snapshot($1) as s`, [invitation.id]))
      .rows[0].s;
    assert.equal(before.costesTotales, 350000);
  });

  await db.query(
    `update public.investment_opportunities set visibility = '{"estrategia":true}'::jsonb where id = $1`,
    [opportunity],
  );

  await asInvestorA(async () => {
    const after = (await db.query(`select public.get_investor_snapshot($1) as s`, [invitation.id]))
      .rows[0].s;
    assert.equal(after.costesTotales, undefined, "el dato debe desaparecer sin ninguna republicación");
  });
});

test("un inversor no puede leer el snapshot de otro inversor", async () => {
  const { db, invitation, asInvestorA, asInvestorB } = await setup();
  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);
  });
  await asInvestorB(async () => {
    await assertDenied(db, `select public.get_investor_snapshot($1)`, [invitation.id]);
  });
});

test("revocar y caducar cortan el acceso", async () => {
  const { db, invitation, asInvestorA } = await setup();
  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);
  });

  await db.query(
    `update public.opportunity_invitations set revoked_at = now(), status = 'revocada' where id = $1`,
    [invitation.id],
  );
  await asInvestorA(async () => {
    await assertDenied(db, `select public.get_investor_snapshot($1)`, [invitation.id]);
    const r = await db.query(`select count(*)::int n from public.opportunity_invitations where id = $1`, [
      invitation.id,
    ]);
    assert.equal(r.rows[0].n, 0, "la RLS tampoco debe dejar leer la fila revocada");
  });

  await db.query(
    `update public.opportunity_invitations
        set revoked_at = null, status = 'enviada', expires_at = now() - interval '1 day'
      where id = $1`,
    [invitation.id],
  );
  await asInvestorA(async () => {
    await assertDenied(db, `select public.get_investor_snapshot($1)`, [invitation.id]);
  });
});

test("expresar interés NO crea ninguna inversión", async () => {
  const { db, actors, invitation, asInvestorA } = await setup();
  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);
    await db.query(`select public.set_invitation_interest($1, 'interesado', 'Me encaja')`, [
      invitation.id,
    ]);
    const inv = await db.query(`select count(*)::int n from public.investments where investor_user_id = $1`, [
      actors.invA,
    ]);
    assert.equal(inv.rows[0].n, 0, "el interés no puede generar participación económica");
  });

  const row = await db.query(`select interest, status from public.opportunity_invitations where id = $1`, [
    invitation.id,
  ]);
  assert.equal(row.rows[0].interest, "interesado");
  assert.equal(row.rows[0].status, "interesado");
});

test("una inversión real solo la ve su inversor", async () => {
  const { db, actors, opportunity, contact, asInvestorA, asInvestorB } = await setup();
  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);
  });
  await db.query(
    `insert into public.investments (opportunity_id, owner_id, contact_id, investor_user_id, amount, status)
     values ($1, $2, $3, $4, 50000, 'activa')`,
    [opportunity, actors.promoA, contact.id, actors.invA],
  );

  await asInvestorA(async () => {
    const mias = (await db.query(`select public.list_my_investments() as x`)).rows[0].x;
    assert.equal(mias.length, 1);
    assert.equal(Number(mias[0].amount), 50000);
  });
  await asInvestorB(async () => {
    const suyas = (await db.query(`select public.list_my_investments() as x`)).rows[0].x;
    assert.equal(suyas.length, 0, "el inversor B no puede ver inversiones ajenas");
  });
});

test("el estado de captación se calcula sobre inversiones reales", async () => {
  const { db, actors, opportunity, contact, invitation, asInvestorA } = await setup();
  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);
  });
  await db.query(
    `insert into public.investments (opportunity_id, owner_id, contact_id, investor_user_id, amount, status)
     values ($1, $2, $3, $4, 50000, 'activa')`,
    [opportunity, actors.promoA, contact.id, actors.invA],
  );
  await db.query(
    `update public.investment_opportunities
        set visibility = visibility || '{"estadoCaptacion":true}'::jsonb where id = $1`,
    [opportunity],
  );

  await asInvestorA(async () => {
    const s = (await db.query(`select public.get_investor_snapshot($1) as s`, [invitation.id])).rows[0].s;
    assert.equal(Number(s.captacion.invertido), 50000);
    assert.equal(Number(s.captacion.inversores), 1);
  });
});

test("el inversor no lee ninguna tabla interna", async () => {
  const { db, asInvestorA } = await setup();
  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);

    const opp = await db.query(`select count(*)::int n from public.investment_opportunities`);
    assert.equal(opp.rows[0].n, 0, "investment_opportunities no debe tener policy para el inversor");

    const ops = await db.query(`select count(*)::int n from public.operaciones_inmobiliarias`);
    assert.equal(ops.rows[0].n, 0, "el inversor jamás accede a la operación del promotor");

    const con = await db.query(`select count(*)::int n from public.investor_contacts`);
    assert.equal(con.rows[0].n, 0, "ni siquiera su propia ficha: sus datos van por RPC");
  });
});

test("Storage: la visibilidad manda, en vivo y por inversor", async () => {
  const { db, actors, operation, opportunity, invitation, asInvestorA, asInvestorB } = await setup();
  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);
  });

  await db.exec(
    `insert into storage.buckets (id, name, public)
     values ('investment-media','investment-media',false) on conflict do nothing`,
  );
  await db.query(`insert into storage.objects (bucket_id, name) values ('investment-media', $1)`, [
    `${actors.promoA}/${operation}/media/foto.jpg`,
  ]);

  const countAs = async (who) =>
    who(async () => {
      const r = await db.query(`select count(*)::int n from storage.objects where bucket_id='investment-media'`);
      return r.rows[0].n;
    });

  await db.query(`update public.opportunity_invitations set visibility = '{"media":true}'::jsonb where id = $1`, [invitation.id]);
  assert.equal(await countAs(asInvestorA), 1, "con media:true debe ver el archivo");

  await db.query(`update public.opportunity_invitations set visibility = '{"media":false}'::jsonb where id = $1`, [invitation.id]);
  assert.equal(await countAs(asInvestorA), 0, "al apagar media pierde el archivo de inmediato");

  assert.equal(await countAs(asInvestorB), 0, "otro inversor nunca ve estos archivos");

  // Con inversión viva el acceso sobrevive a la caducidad de la invitación,
  // pero sigue obedeciendo la visibilidad definida para ESE inversor.
  await db.query(
    `insert into public.investments (opportunity_id, owner_id, investor_user_id, amount, status)
     values ($1, $2, $3, 50000, 'activa')`,
    [opportunity, actors.promoA, actors.invA],
  );
  await db.query(
    `update public.opportunity_invitations
        set visibility = '{"media":true}'::jsonb, expires_at = now() - interval '1 day' where id = $1`,
    [invitation.id],
  );
  assert.equal(await countAs(asInvestorA), 1, "el inversor debe poder seguir lo que financia");

  await db.query(`update public.opportunity_invitations set visibility = '{"media":false}'::jsonb where id = $1`, [invitation.id]);
  assert.equal(await countAs(asInvestorA), 0, "el promotor conserva el control aunque haya inversión");
});

test("no hay escalada de privilegios por roles", async () => {
  const { db, actors, asInvestorA } = await setup();
  await asInvestorA(async () => {
    await assertDenied(
      db,
      `insert into public.user_roles (user_id, role) values ($1, 'promotor')`,
      [actors.promoB],
    );
  });
});

test("el backfill migra investment_shares sin destruirla", async () => {
  const { db, actors } = await setup();
  const legacyOp = (
    await db.query(
      `insert into public.operaciones_inmobiliarias (id, user_id, data, client_updated_at)
       values (gen_random_uuid(), $1, '{"name":"Legacy"}'::jsonb, now()) returning id`,
      [actors.promoB],
    )
  ).rows[0].id;

  await db.query(
    `insert into public.investment_shares (owner_id, operation_id, investor_email, token, visibility, payload)
     values ($1, $2, 'legacy@test.com', 'legacy-token', '{"media":true}'::jsonb, '{"name":"Operación Legacy"}'::jsonb)`,
    [actors.promoB, legacyOp],
  );

  await db.exec(migrationSql()); // el backfill vive al final de la migración

  const migrated = await db.query(`
    select o.title, c.email
      from public.opportunity_invitations i
      join public.investment_opportunities o on o.id = i.opportunity_id
      left join public.investor_contacts c on c.id = i.contact_id
     where i.token = 'legacy-token'`);
  assert.equal(migrated.rows.length, 1, "el share heredado debe convertirse en oportunidad + invitación");
  assert.equal(migrated.rows[0].email, "legacy@test.com");

  const kept = await db.query(`select count(*)::int n from public.investment_shares`);
  assert.equal(kept.rows[0].n, 1, "el backfill no puede destruir la tabla de origen");
});

test("las RPC de listado del inversor solo devuelven lo suyo y sin datos internos", async () => {
  const { db, actors, opportunity, contact, asInvestorA, asInvestorB } = await setup();
  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);
  });
  await db.query(
    `insert into public.investments (opportunity_id, owner_id, contact_id, investor_user_id, amount, status)
     values ($1, $2, $3, $4, 50000, 'activa')`,
    [opportunity, actors.promoA, contact.id, actors.invA],
  );

  await asInvestorA(async () => {
    const opps = (await db.query(`select public.list_my_investor_opportunities() as x`)).rows[0].x;
    assert.equal(opps.length, 1);
    assert.equal(opps[0].title, "Edificio A");
    assert.ok(
      !JSON.stringify(opps).includes("MARGEN INTERNO"),
      "el listado no puede filtrar notas internas",
    );

    const mine = (await db.query(`select public.list_my_investments() as x`)).rows[0].x;
    assert.equal(mine.length, 1);
    assert.equal(Number(mine[0].amount), 50000);
    assert.equal(mine[0].title, "Edificio A");
  });

  await asInvestorB(async () => {
    const opps = (await db.query(`select public.list_my_investor_opportunities() as x`)).rows[0].x;
    assert.equal(opps.length, 0, "el inversor B no debe ver oportunidades ajenas");
    const mine = (await db.query(`select public.list_my_investments() as x`)).rows[0].x;
    assert.equal(mine.length, 0, "el inversor B no debe ver inversiones ajenas");
  });
});

test("se puede reclamar la invitación identificándose por TELÉFONO", async () => {
  // Es el caso del flujo de WhatsApp: al contacto solo se le conoce el móvil.
  const { db, actors, opportunity } = await setup();

  const contact = (
    await db.query(
      `insert into public.investor_contacts (owner_id, first_name, phone)
       values ($1, 'Sin email', '600 000 002') returning id`,
      [actors.promoA],
    )
  ).rows[0];

  const invitation = (
    await db.query(
      `insert into public.opportunity_invitations
         (opportunity_id, owner_id, contact_id, channel, token, invited_phone)
       values ($1, $2, $3, 'whatsapp', 'tok-tel', '600000002') returning id, invited_phone`,
      [opportunity, actors.promoA, contact.id],
    )
  ).rows[0];
  assert.equal(invitation.invited_phone, "+34600000002", "el teléfono debe normalizarse a E.164");

  const asUser = async (uid, claims, fn) => {
    await db.exec("reset role;");
    await db.exec(
      `select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid, role: "authenticated", ...claims })}', false);`,
    );
    await db.exec("set role authenticated;");
    try {
      return await fn();
    } finally {
      await db.exec("reset role;");
    }
  };

  // Un teléfono distinto NO sirve, aunque el formato sea válido.
  await asUser(actors.invA, { phone: "+34611111111" }, async () => {
    await assertDenied(db, `select public.claim_invitation('tok-tel')`);
  });

  // El teléfono correcto, aunque el JWT lo traiga en formato nacional.
  await asUser(actors.invB, { phone: "600000002" }, async () => {
    const r = await db.query(`select public.claim_invitation('tok-tel') as id`);
    assert.equal(r.rows[0].id, invitation.id);
  });

  const linked = await db.query(`select linked_user_id from public.investor_contacts where id = $1`, [
    contact.id,
  ]);
  assert.equal(linked.rows[0].linked_user_id, actors.invB, "debe vincularse por teléfono también");
});

test("una inversión registrada ANTES de que el inversor se identifique le llega al reclamar", async () => {
  // Caso real: se acuerda el capital por teléfono y el promotor lo registra ya,
  // cuando el contacto todavía no tiene cuenta. Al identificarse debe encontrarla.
  const { db, actors, opportunity, contact, invitation, asInvestorA } = await setup();

  const created = (
    await db.query(
      `insert into public.investments (opportunity_id, owner_id, contact_id, amount, status)
       values ($1, $2, $3, 75000, 'activa') returning id, investor_user_id`,
      [opportunity, actors.promoA, contact.id],
    )
  ).rows[0];
  assert.equal(created.investor_user_id, null, "aún no hay usuario al que enlazarla");

  await asInvestorA(async () => {
    // El inversor solo lee sus inversiones por RPC (no tiene policy sobre la tabla).
    const before = (await db.query(`select public.list_my_investments() as x`)).rows[0].x;
    assert.equal(before.length, 0, "antes de reclamar no le corresponde ninguna");

    await db.query(`select public.claim_invitation('tok-a')`);

    const after = (await db.query(`select public.list_my_investments() as x`)).rows[0].x;
    assert.equal(after.length, 1, "al reclamar debe heredar la inversión de su contacto");
    assert.equal(Number(after[0].amount), 75000);
  });

  assert.ok(invitation.id, "la invitación existe");
});

test("reclamar no roba las inversiones de un contacto ajeno", async () => {
  const { db, actors, opportunity, asInvestorA } = await setup();

  // Inversión de OTRA persona del CRM, sin usuario enlazado.
  const otro = (
    await db.query(
      `insert into public.investor_contacts (owner_id, first_name, email)
       values ($1, 'Otro', 'otro@test.com') returning id`,
      [actors.promoA],
    )
  ).rows[0];
  await db.query(
    `insert into public.investments (opportunity_id, owner_id, contact_id, amount, status)
     values ($1, $2, $3, 999999, 'activa')`,
    [opportunity, actors.promoA, otro.id],
  );

  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);
    const mias = (await db.query(`select public.list_my_investments() as x`)).rows[0].x;
    assert.equal(mias.length, 0, "solo hereda las inversiones de SU propio contacto");
  });
});

// ── Regresiones encontradas en la revisión adversarial ───────────────────────

test("REGRESIÓN: el inversor NO puede leer las notas internas del CRM ni de la inversión", async () => {
  // La RLS filtra FILAS, no COLUMNAS. Una policy `linked_user_id = auth.uid()` sobre
  // investor_contacts le entregaba también `notes` (el CRM privado del promotor sobre
  // él), `status`, `source` y `owner_id`. Que el frontend pidiera solo unas columnas
  // no protegía nada: bastaba un `select *` contra la API REST.
  const { db, actors, opportunity, contact, asInvestorA } = await setup();

  await db.query(`update public.investor_contacts set notes = $1 where id = $2`, [
    "MOROSO — NO FINANCIAR MÁS",
    contact.id,
  ]);
  await db.query(
    `insert into public.investments (opportunity_id, owner_id, contact_id, amount, status, notes)
     values ($1, $2, $3, 1000, 'activa', 'NOTA INTERNA DE LA INVERSIÓN')`,
    [opportunity, actors.promoA, contact.id],
  );

  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);

    const c = await db.query(`select count(*)::int n from public.investor_contacts`);
    assert.equal(c.rows[0].n, 0, "el inversor no debe poder leer investor_contacts directamente");

    const v = await db.query(`select count(*)::int n from public.investments`);
    assert.equal(v.rows[0].n, 0, "el inversor no debe poder leer investments directamente");

    // Lo que sí debe funcionar: sus datos, por RPC, sin campos internos.
    const perfil = (await db.query(`select public.get_my_investor_profile() as x`)).rows[0].x;
    assert.equal(perfil.length, 1, "debe poder ver sus propios datos de contacto");
    assert.deepEqual(Object.keys(perfil[0]).sort(), ["email", "firstName", "lastName", "phone", "whatsapp"]);
    assert.ok(!JSON.stringify(perfil).includes("MOROSO"), "el perfil no puede llevar las notas del CRM");

    const mine = (await db.query(`select public.list_my_investments() as x`)).rows[0].x;
    assert.equal(mine.length, 1, "debe seguir viendo su inversión");
    assert.ok(
      !JSON.stringify(mine).includes("NOTA INTERNA"),
      "list_my_investments no puede devolver las notas internas",
    );
  });
});

test("REGRESIÓN: una fila heredada sin email no tumba la migración", async () => {
  // `investment_shares.investor_email` es nullable y en producción existen filas así
  // (defecto D7). El backfill las insertaba violando el check `addressable`, y como el
  // insert no tenía manejo de excepción reventaba TODO el bloque: la migración se
  // aplicaba a medias, sin crear ni una tabla.
  const db = new PGlite();
  await db.exec(BOOTSTRAP);

  const promo = (await db.query(`insert into auth.users (email) values ('p@t.com') returning id`)).rows[0].id;
  const op = (
    await db.query(
      `insert into public.operaciones_inmobiliarias (id, user_id, data, client_updated_at)
       values (gen_random_uuid(), $1, '{"name":"Legacy"}'::jsonb, now()) returning id`,
      [promo],
    )
  ).rows[0].id;

  await db.query(
    `insert into public.investment_shares (owner_id, operation_id, investor_email, token, payload)
     values ($1, $2, null, 'huerfano', '{"name":"Sin email"}'::jsonb)`,
    [promo, op],
  );
  await db.query(
    `insert into public.investment_shares (owner_id, operation_id, investor_email, token, payload)
     values ($1, $2, 'valido@test.com', 'bueno', '{"name":"Con email"}'::jsonb)`,
    [promo, op],
  );

  await db.exec(migrationSql()); // no debe lanzar

  const tabla = await db.query(`select to_regclass('public.investor_contacts') as x`);
  assert.notEqual(tabla.rows[0].x, null, "la migración debe completarse");

  const inv = await db.query(`select token from public.opportunity_invitations order by token`);
  assert.deepEqual(
    inv.rows.map((r) => r.token),
    ["bueno"],
    "se migra el acceso utilizable y se ignora el huérfano, sin abortar",
  );

  const quedan = await db.query(`select count(*)::int n from public.investment_shares`);
  assert.equal(quedan.rows[0].n, 2, "las dos filas de origen siguen intactas");
});

test("REGRESIÓN: has_role no permite enumerar el rol de otra cuenta", async () => {
  const { db, actors, asInvestorA } = await setup();
  await db.query(`insert into public.user_roles (user_id, role) values ($1, 'promotor')`, [actors.promoA]);

  await asInvestorA(async () => {
    // La firma de dos argumentos ya no existe: no hay forma de preguntar por otro.
    await assertDenied(db, `select public.has_role($1, 'promotor')`, [actors.promoA]);

    const propio = await db.query(`select public.has_role('inversor') as r`);
    assert.equal(propio.rows[0].r, false, "todavía no ha reclamado ninguna invitación");
    await db.query(`select public.claim_invitation('tok-a')`);
    const despues = await db.query(`select public.has_role('inversor') as r`);
    assert.equal(despues.rows[0].r, true, "tras reclamar, sí tiene el rol inversor");
  });
});

test("REGRESIÓN: nadie puede colgar una invitación de la oportunidad de otro (IDOR)", async () => {
  // El fallo: las policies solo comprobaban `auth.uid() = owner_id`, es decir que la
  // fila DIJERA ser tuya, no que la oportunidad a la que apunta lo fuera. Como el
  // cliente elegía ambos valores, cualquiera podía colgar una invitación propia —con
  // toda la visibilidad activada— de la oportunidad de otro promotor y leerla con
  // `get_investor_snapshot`, que es SECURITY DEFINER y no pasa por la RLS.
  const { db, actors, opportunity, asUser, asInvestorA } = await setup();

  await asUser(actors.promoB, { email: "promotor.b@test.com" }, async () => {
    await assertDenied(
      db,
      `insert into public.opportunity_invitations (opportunity_id, owner_id, token, invited_email)
       values ($1, $2, 'idor-b', 'promotor.b@test.com')`,
      [opportunity, actors.promoB],
    );
    await assertDenied(
      db,
      `insert into public.investments (opportunity_id, owner_id, amount, status)
       values ($1, $2, 1000, 'activa')`,
      [opportunity, actors.promoB],
    );
  });

  // Y un inversor legítimo tampoco puede ampliarse la visibilidad por esta vía.
  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);
    await assertDenied(
      db,
      `insert into public.opportunity_invitations (opportunity_id, owner_id, token, invited_email, visibility)
       values ($1, $2, 'idor-inv', 'inversor.a@test.com', '{"rentabilidadPromotor":true}'::jsonb)`,
      [opportunity, actors.invA],
    );
  });
});

test("REGRESIÓN: repuntar una invitación propia a una oportunidad ajena también se rechaza", async () => {
  const { db, actors, opportunity, asUser } = await setup();

  // El promotor B crea su propia operación y oportunidad, y una invitación legítima.
  const opB = (
    await db.query(
      `insert into public.operaciones_inmobiliarias (id, user_id, data, client_updated_at)
       values (gen_random_uuid(), $1, '{}'::jsonb, now()) returning id`,
      [actors.promoB],
    )
  ).rows[0].id;
  const oppB = (
    await db.query(
      `insert into public.investment_opportunities (owner_id, operation_id, title)
       values ($1, $2, 'Propia de B') returning id`,
      [actors.promoB, opB],
    )
  ).rows[0].id;
  const invB = (
    await db.query(
      `insert into public.opportunity_invitations (opportunity_id, owner_id, token, invited_email)
       values ($1, $2, 'legit-b', 'x@b.com') returning id`,
      [oppB, actors.promoB],
    )
  ).rows[0].id;

  await asUser(actors.promoB, { email: "promotor.b@test.com" }, async () => {
    await assertDenied(
      db,
      `update public.opportunity_invitations set opportunity_id = $1 where id = $2`,
      [opportunity, invB],
    );
  });
});

test("REGRESIÓN: owner_id se deriva del servidor, no se acepta del cliente", async () => {
  const { db, actors, opportunity, asUser } = await setup();

  // El promotor A miente sobre el owner_id: debe guardarse el suyo real igualmente.
  const fila = await asUser(actors.promoA, { email: "promotor.a@test.com" }, async () =>
    (
      await db.query(
        `insert into public.opportunity_invitations (opportunity_id, owner_id, token, invited_email)
         values ($1, $2, 'derivado', 'x@test.com') returning owner_id`,
        [opportunity, actors.promoB],
      )
    ).rows[0],
  );
  assert.equal(fila.owner_id, actors.promoA, "el owner_id enviado por el cliente se ignora");
});

test("REGRESIÓN: un usuario puede renunciar a un rol propio, pero no al de otro", async () => {
  // Sin policy de DELETE un rol era irrevocable: quien recibía `promotor` sin pedirlo
  // no tenía forma de quitárselo.
  const { db, actors, asInvestorA } = await setup();
  await db.query(`insert into public.user_roles (user_id, role) values ($1, 'promotor')`, [actors.promoB]);

  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);
    const antes = await db.query(`select count(*)::int n from public.user_roles`);
    assert.equal(antes.rows[0].n, 1, "tiene su rol de inversor");

    await db.query(`delete from public.user_roles where role = 'inversor'`);
    const despues = await db.query(`select count(*)::int n from public.user_roles`);
    assert.equal(despues.rows[0].n, 0, "puede renunciar al suyo");

    // El de otro usuario ni se ve ni se borra.
    await db.query(`delete from public.user_roles where user_id = $1`, [actors.promoB]);
  });

  const ajeno = await db.query(
    `select count(*)::int n from public.user_roles where user_id = $1`, [actors.promoB]);
  assert.equal(ajeno.rows[0].n, 1, "el rol de otro usuario sigue intacto");
});

test("REGRESIÓN: una invitación forjada YA EXISTENTE no da acceso ni siquiera por RPC", async () => {
  // Simula el estado tras el ataque: la fila se crea saltándose el trigger (como si
  // se hubiera creado antes del parche) y se comprueba que NINGÚN camino la honra.
  const { db, actors, opportunity, asUser } = await setup();

  await db.exec("alter table public.opportunity_invitations disable trigger trg_enforce_opportunity_owner");
  const forjada = (
    await db.query(
      `insert into public.opportunity_invitations
         (opportunity_id, owner_id, token, invited_email, investor_user_id, visibility)
       values ($1, $2, 'forjada', 'promotor.b@test.com', $2,
               '{"estrategia":true,"costesTotales":true,"rentabilidadPromotor":true,"media":true}'::jsonb)
       returning id`,
      [opportunity, actors.promoB],
    )
  ).rows[0].id;
  await db.exec("alter table public.opportunity_invitations enable trigger trg_enforce_opportunity_owner");

  await asUser(actors.promoB, { email: "promotor.b@test.com" }, async () => {
    await assertDenied(db, `select public.get_investor_snapshot($1)`, [forjada]);
    await assertDenied(db, `select public.claim_invitation('forjada')`);

    const lista = (await db.query(`select public.list_my_investor_opportunities() as x`)).rows[0].x;
    assert.equal(lista.length, 0, "no puede aparecer en su listado de oportunidades");
  });

  assert.equal(
    (await db.query(`select public.invitation_is_coherent($1) as c`, [forjada])).rows[0].c,
    false,
    "la fila se reconoce como incoherente",
  );
});

test("REGRESIÓN: la migración NEUTRALIZA las filas forjadas, no las reasigna", async () => {
  // Reasignar el owner_id al promotor víctima convertiría la invitación forjada en una
  // invitación VÁLIDA suya que sigue apuntando al atacante: le consolidaría el acceso.
  const db = new PGlite();
  await db.exec(BOOTSTRAP);
  await db.exec(strip(readFileSync(MIGRATION, "utf8")));

  const victima = (await db.query(`insert into auth.users (email) values ('v@t.com') returning id`)).rows[0].id;
  const atacante = (await db.query(`insert into auth.users (email) values ('a@t.com') returning id`)).rows[0].id;
  const op = (
    await db.query(
      `insert into public.operaciones_inmobiliarias (id, user_id, data, client_updated_at)
       values (gen_random_uuid(), $1, '{}'::jsonb, now()) returning id`, [victima])
  ).rows[0].id;
  const opp = (
    await db.query(
      `insert into public.investment_opportunities (owner_id, operation_id, title)
       values ($1, $2, 'De la victima') returning id`, [victima, op])
  ).rows[0].id;
  // Fila forjada, como la creaba el fallo.
  await db.query(
    `insert into public.opportunity_invitations
       (opportunity_id, owner_id, token, invited_email, investor_user_id, visibility)
     values ($1, $2, 'forj', 'a@t.com', $2, '{"rentabilidadPromotor":true}'::jsonb)`,
    [opp, atacante],
  );

  await db.exec(strip(readFileSync(MIGRATION_GUARD, "utf8")));

  const fila = (
    await db.query(
      `select owner_id, status, investor_user_id, visibility from public.opportunity_invitations where token = 'forj'`)
  ).rows[0];
  assert.equal(fila.owner_id, atacante, "NO se reasigna al propietario legítimo");
  assert.equal(fila.status, "revocada", "queda revocada");
  assert.equal(fila.investor_user_id, null, "y desvinculada del atacante");
  assert.deepEqual(fila.visibility, {}, "sin visibilidad");
});

test("GUARDIA: la migración no puede volver a REASIGNAR filas forjadas", async () => {
  // Barrera explícita contra una regresión concreta y peligrosa: una versión anterior
  // de 20260910b "arreglaba" las filas incoherentes poniéndoles el owner_id del
  // promotor legítimo. Eso convertía la invitación forjada en una invitación VÁLIDA de
  // la víctima que seguía apuntando al atacante en investor_user_id: le consolidaba el
  // acceso. Si alguien revierte a aquello, este test lo detiene.
  const guard = readFileSync(MIGRATION_GUARD, "utf8");

  const reasignaciones = [
    /update\s+public\.opportunity_invitations[\s\S]{0,200}?set\s+owner_id\s*=\s*o\.owner_id/i,
    /update\s+public\.investments[\s\S]{0,200}?set\s+owner_id\s*=\s*o\.owner_id/i,
  ];
  for (const re of reasignaciones) {
    assert.ok(
      !re.test(guard),
      "la migración reasigna owner_id en vez de neutralizar: eso consolida el ataque",
    );
  }

  // Y las tres capas de defensa tienen que seguir presentes.
  assert.match(guard, /create\s+trigger\s+trg_enforce_opportunity_owner/i, "falta la capa de ESCRITURA");
  assert.match(guard, /with check[\s\S]{0,400}investment_opportunities/i, "falta la capa de RLS");
  assert.match(guard, /invitation_is_coherent/, "falta el helper de coherencia");
  assert.match(guard, /i\.owner_id\s*=\s*o\.owner_id|o\.owner_id\s*=\s*i\.owner_id/, "falta la capa de LECTURA");
  assert.match(guard, /status\s*=\s*'revocada'/, "falta la neutralización de filas forjadas");
});

test("ENDURECIMIENTO: no se publica una oportunidad sobre la operación de otro", async () => {
  const { db, actors, asUser } = await setup();
  const opA = (
    await db.query(
      `insert into public.operaciones_inmobiliarias (id, user_id, data, client_updated_at)
       values (gen_random_uuid(), $1, '{}'::jsonb, now()) returning id`, [actors.promoA])
  ).rows[0].id;

  await asUser(actors.promoB, { email: "promotor.b@test.com" }, async () => {
    await assertDenied(
      db,
      `insert into public.investment_opportunities (owner_id, operation_id, title)
       values ($1, $2, 'sobre operación ajena')`,
      [actors.promoB, opA],
    );

    // Una operación que todavía no está sincronizada SÍ se admite: no hay tercero al
    // que perjudicar y exigirla rompería «Preparar para inversores» recién creada.
    const inexistente = (
      await db.query(
        `insert into public.investment_opportunities (owner_id, operation_id, title)
         values ($1, gen_random_uuid(), 'aún sin sincronizar') returning id`, [actors.promoB])
    ).rows;
    assert.equal(inexistente.length, 1, "una operación aún no sincronizada no debe bloquear");
  });
});

test("ENDURECIMIENTO: no se registra actividad sobre entidades ajenas", async () => {
  const { db, actors, opportunity, asUser } = await setup();
  await asUser(actors.promoB, { email: "promotor.b@test.com" }, async () => {
    await assertDenied(
      db,
      `insert into public.investment_activity (owner_id, opportunity_id, kind)
       values ($1, $2, 'vista')`,
      [actors.promoB, opportunity],
    );
  });
});

test("ENDURECIMIENTO: vista e interés comprueban la coherencia, y la traza queda al promotor", async () => {
  const { db, actors, opportunity, invitation, asInvestorA } = await setup();

  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);
    await db.query(`select public.register_invitation_view($1)`, [invitation.id]);
    await db.query(`select public.set_invitation_interest($1, 'interesado', 'me encaja')`, [invitation.id]);
  });

  // La traza pertenece al PROMOTOR, que es quien la necesita, no al inversor.
  const trazas = await db.query(
    `select kind, owner_id, actor_user_id from public.investment_activity
      where opportunity_id = $1 order by created_at`, [opportunity]);
  const vista = trazas.rows.find((r) => r.kind === "vista");
  const interes = trazas.rows.find((r) => r.kind === "interes");
  assert.ok(vista, "queda traza de la vista");
  assert.equal(vista.owner_id, actors.promoA, "la traza es del promotor");
  assert.equal(vista.actor_user_id, actors.invA, "y registra quién la generó");
  assert.ok(interes, "queda traza del interés");
  assert.equal(interes.owner_id, actors.promoA);

  // Sobre una invitación incoherente no hacen nada.
  await db.exec("alter table public.opportunity_invitations disable trigger trg_enforce_opportunity_owner");
  const forjada = (
    await db.query(
      `insert into public.opportunity_invitations
         (opportunity_id, owner_id, token, invited_email, investor_user_id)
       values ($1, $2, 'forj-c', 'promotor.b@test.com', $2) returning id`,
      [opportunity, actors.promoB])
  ).rows[0].id;
  await db.exec("alter table public.opportunity_invitations enable trigger trg_enforce_opportunity_owner");

  await asInvestorA(async () => {
    await db.query(`select public.claim_invitation('tok-a')`);
  });
  const antes = (await db.query(`select view_count from public.opportunity_invitations where id = $1`, [forjada])).rows[0].view_count;
  await db.exec(`select set_config('request.jwt.claims', '{"sub":"${actors.promoB}","role":"authenticated"}', false); set role authenticated;`);
  await db.query(`select public.register_invitation_view($1)`, [forjada]);
  await db.exec("reset role; select set_config('request.jwt.claims', '', false);");
  const despues = (await db.query(`select view_count from public.opportunity_invitations where id = $1`, [forjada])).rows[0].view_count;
  assert.equal(despues, antes, "una invitación incoherente no registra vistas");
});

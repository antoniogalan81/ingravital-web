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

// PGlite no trae pgcrypto; gen_random_uuid() es núcleo desde PG13 y gen_random_bytes
// solo se usa para generar tokens. Se adapta el ENTORNO de prueba, nunca la migración.
const migrationSql = () =>
  readFileSync(MIGRATION, "utf8").replace(
    /create\s+extension\s+if\s+not\s+exists\s+pgcrypto\s*;/gi,
    "-- [test] pgcrypto no disponible en PGlite",
  );

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
      await db.exec("reset role;");
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
    const r = await db.query(`select amount from public.investments`);
    assert.equal(r.rows.length, 1);
    assert.equal(Number(r.rows[0].amount), 50000);
  });
  await asInvestorB(async () => {
    const r = await db.query(`select count(*)::int n from public.investments`);
    assert.equal(r.rows[0].n, 0, "el inversor B no puede ver inversiones ajenas");
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
    assert.equal(con.rows[0].n, 1, "solo debe ver su propia ficha de contacto vinculada");
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

// worker/test/uiEconomicsSeed.ts — Proyecto temporal para revisar Gastos/Ventas (Gestión) y la
// vista del inversor en un navegador real, contra el Supabase real.
//
//   SUPABASE_PUBLISHABLE_KEY=… node --import ./scripts/test-ts-resolve.mjs worker/test/uiEconomicsSeed.ts seed <salida.json>
//   node --import ./scripts/test-ts-resolve.mjs worker/test/uiEconomicsSeed.ts cleanup <salida.json>
//
// Las sesiones se escriben en el archivo de salida (nunca en consola). `cleanup` borra los usuarios.

import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile, readConfig } from "../config.ts";
import type { REOperation } from "../../src/lib/realEstate.ts";
import { calcResults } from "../../src/lib/realEstateCalc.ts";
import { buildOpportunityMetrics } from "../../src/lib/investorPlatform/metrics.ts";

loadEnvFile();
for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]) process.env[k] ??= "no-usado";
const cfg = readConfig();
const admin = createClient(cfg.supabaseUrl, cfg.supabaseSecretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const [mode, out] = process.argv.slice(2);

async function user(tag: string) {
  const email = `econ-ui-${tag}-${randomUUID().slice(0, 8)}@invergravital.com`;
  const password = `${randomUUID()}Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(cfg.supabaseUrl, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, email, client, at: s.session!.access_token, rt: s.session!.refresh_token };
}

async function seed() {
  const A = await user("promotor");
  const I = await user("inversor");
  const opId = randomUUID();
  const now = "2026-09-15T08:00:00.000Z";
  const c = (id: string, category: string, concept: string, extra: Record<string, number>) => ({ id, category, concept, status: "PENDIENTE", createdAt: now, updatedAt: now, ...extra });
  const op = {
    id: opId,
    name: "Residencial Alameda (prueba)",
    address: "Calle Alameda 12, Sevilla",
    purchasePrice: 170200,
    m2Plot: 300,
    costs: { purchaseTaxPct: 7, arquitectoPct: 0, arquitectoTotal: 8500, desviacionesPct: 3, tasas: [], obraViviendaPriceM2: 900, obraGarajePriceM2: 400, obraTrasterosPriceM2: 350 },
    financing: { enabled: false, compra: { pct: 0, interest: 0 }, obra: { pct: 0 } },
    units: [
      { id: "u_viv", type: "VIVIENDA", title: "Viviendas", m2Unit: 90, numUnits: 6, salePriceTotal: 245000 },
      { id: "u_gar", type: "GARAJE", title: "Garajes", m2Unit: 50, m2PerPlaza: 12.5, salePriceTotal: 15000 },
      { id: "u_tra", type: "TRASTERO", title: "Trasteros", m2Total: 30, m2PerUnit: 5, salePriceTotal: 6000 },
    ],
    expenses: [
      c("exp_luz", "SUMINISTROS", "Luz", { monthlyAmount: 70, months: 18, estimated: 1260 }),
      c("exp_agua", "SUMINISTROS", "Agua", { monthlyAmount: 35, months: 18, estimated: 630 }),
      c("exp_alta", "SUMINISTROS", "Alta suministros", { fixedAmount: 300, estimated: 300 }),
      c("exp_vig", "OTROS", "Vigilancia", { monthlyAmount: 150, months: 12, estimated: 1800 }),
    ],
    realExpenses: [
      { id: "rexp_compra", concept: "Compra del local", amount: 170200, date: "2026-02-01", category: "COMPRA", createdAt: now, updatedAt: now },
      { id: "rexp_doc_1UiEndesaXXXXXXX", concept: "Endesa enero", amount: 78.05, date: "2026-01-03", category: "SUMINISTROS", documentName: "Factura Endesa.pdf", documentUrl: "https://drive.google.com/file/d/1UiEndesaXXXXXXX/view", createdAt: now, updatedAt: now },
      { id: "rexp_agua", concept: "Emasesa", amount: 45.3, date: "2026-02-10", category: "SUMINISTROS", budgetLineId: "exp_agua", createdAt: now, updatedAt: now },
      { id: "rexp_arq", concept: "Minuta 1 arquitecto", amount: 2491, date: "2026-06-12", category: "ARQUITECTO", createdAt: now, updatedAt: now },
    ],
    sales: [
      { id: "s1", title: "Vivienda 1A", unitType: "VIVIENDA", status: "VENDIDO", estimatedPrice: 245000, realPrice: 242000, date: "2027-02-03", buyer: "Comprador de prueba", completionDateEstimated: "2027-01-15", completionDateReal: "2027-01-20", saleDateEstimated: "2027-02-01", collectionDateEstimated: "2027-02-15", payments: [{ id: "p1", date: "2026-10-01", amount: 20000 }, { id: "p2", date: "2027-02-03", amount: 80000 }], collected: 100000, createdAt: now, updatedAt: now },
      { id: "s2", title: "Vivienda 1B", unitType: "VIVIENDA", status: "RESERVADO", estimatedPrice: 245000, completionDateEstimated: "2027-01-15", saleDateEstimated: "2027-03-01", collectionDateEstimated: "2027-03-20", createdAt: now, updatedAt: now },
      { id: "s3", title: "Plaza 1", unitType: "GARAJE", status: "DISPONIBLE", completionDateEstimated: "2027-01-15", saleDateEstimated: "2027-04-01", createdAt: now, updatedAt: now },
    ],
    realFinancesEnabled: true,
    createdAt: now,
    updatedAt: now,
  } as unknown as REOperation;
  const { error } = await A.client.from("operaciones_inmobiliarias").insert({ id: opId, user_id: A.id, data: op, client_updated_at: now });
  if (error) throw error;

  const visibility = { gastos: true, gastosImportes: true, ventas: true, ventasPrecios: true, costesTotales: true, ingresos: true, pendientePago: true };
  const { data: opp, error: e1 } = await A.client.from("investment_opportunities").insert({ owner_id: A.id, operation_id: opId, title: "Residencial Alameda", location: "Sevilla", target_capital: 200000, min_ticket: 20000, metrics: {}, visibility, status: "publicada" }).select("id").single();
  if (e1) throw e1;
  const { data: contact, error: e2 } = await A.client.from("investor_contacts").insert({ owner_id: A.id, first_name: "Inversor", email: I.email }).select("id").single();
  if (e2) throw e2;
  const token = `ui-${randomUUID().replace(/-/g, "")}`;
  const { data: inv, error: e3 } = await A.client.from("opportunity_invitations").insert({ opportunity_id: opp.id, owner_id: A.id, contact_id: contact.id, channel: "email", token, invited_email: I.email, visibility }).select("id").single();
  if (e3) throw e3;
  await A.client.from("opportunity_invitations").update({ investor_user_id: I.id }).eq("id", inv.id);
  const claim = await I.client.rpc("claim_invitation", { p_token: token });
  if (claim.error) throw claim.error;
  // Métricas guardadas deliberadamente VACÍAS: la vista del inversor debe recalcularlas al abrir.
  void buildOpportunityMetrics; void calcResults;

  writeFileSync(out, JSON.stringify({ users: [A.id, I.id], opId, invitationId: inv.id, promoter: { at: A.at, rt: A.rt }, investor: { at: I.at, rt: I.rt } }), { mode: 0o600 });
  process.stdout.write("seeded\n");
}

async function cleanup() {
  const { users } = JSON.parse(readFileSync(out, "utf8")) as { users: string[] };
  for (const id of users) {
    const { error } = await admin.auth.admin.deleteUser(id);
    process.stdout.write(error ? `cleanup error ${error.message}\n` : "usuario borrado\n");
  }
  rmSync(out, { force: true });
}

(mode === "seed" ? seed() : cleanup()).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : JSON.stringify(err)}\n`);
  process.exit(1);
});

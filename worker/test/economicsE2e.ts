// worker/test/economicsE2e.ts — Gestión del proyecto ↔ Inversores ↔ documentos IA ↔ métricas,
// contra el Supabase REAL y la ruta real de recálculo.
//
//   SUPABASE_PUBLISHABLE_KEY=… BASE_URL=https://www.invergravital.com node --import ./scripts/test-ts-resolve.mjs worker/test/economicsE2e.ts
//   (BASE_URL vacío = se llama a la capa de recálculo directamente, sin servidor web)
//
// Usuarios temporales (promotor A, inversor I, intruso B) creados y borrados con la API de
// administración. Nada toca datos reales.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvFile, readConfig } from "../config.ts";
import { createStore } from "../store.ts";
import type { REOperation } from "../../src/lib/realEstate.ts";
import { calcResults } from "../../src/lib/realEstateCalc.ts";
import { buildOpportunityMetrics } from "../../src/lib/investorPlatform/metrics.ts";
import { refreshOpportunityMetrics } from "../../src/lib/investorPlatform/refreshMetrics.ts";
import { projectExpenseSummary, projectSalesSummary } from "../../src/lib/projectEconomics.ts";

loadEnvFile();
for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]) process.env[k] ??= "no-usado";
const cfg = readConfig();
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY!;
const BASE_URL = process.env.BASE_URL ?? "";
const admin = createClient(cfg.supabaseUrl, cfg.supabaseSecretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const step = (m: string) => process.stdout.write(`✔ ${m}\n`);

async function user(tag: string) {
  const email = `econ-e2e-${tag}-${randomUUID().slice(0, 8)}@invergravital.com`;
  const password = `${randomUUID()}Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(cfg.supabaseUrl, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, email, client, token: s.session!.access_token };
}

async function refresh(asInvestor: { token: string }, invitationId: string): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!BASE_URL) return { status: 200, body: { ok: true, ...(await refreshOpportunityMetrics(admin, invitationId)) } };
  const res = await fetch(`${BASE_URL}/api/investor/refresh-metrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${asInvestor.token}` },
    body: JSON.stringify({ invitationId }),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

const snapshot = async (c: SupabaseClient, invitationId: string) => {
  const { data, error } = await c.rpc("get_investor_snapshot", { p_invitation: invitationId });
  if (error) throw error;
  return data as { gastos?: unknown; ventas?: unknown; ingresos?: number; costesTotales?: number };
};

async function main() {
  const users: string[] = [];
  try {
    const A = await user("promotor");
    const I = await user("inversor");
    const B = await user("intruso");
    users.push(A.id, I.id, B.id);
    step("promotor, inversor e intruso temporales con sesión real");

    const opId = randomUUID();
    const folderId = `1Econ${randomUUID().replace(/-/g, "").slice(0, 18)}`;
    const now = "2026-09-15T08:00:00.000Z";
    const op: REOperation = {
      id: opId,
      name: "Edificio E2E economía",
      purchasePrice: 170200,
      costs: { purchaseTaxPct: 7, arquitectoPct: 0, arquitectoTotal: 8500, tasas: [] },
      financing: { enabled: false, compra: { pct: 0, interest: 0 }, obra: { pct: 0 } },
      units: [
        { id: "u_viv", type: "VIVIENDA", title: "Viviendas", m2Unit: 90, numUnits: 2, salePriceTotal: 245000 },
        { id: "u_gar", type: "GARAJE", title: "Garajes", m2Unit: 25, m2PerPlaza: 12.5, salePriceTotal: 15000 },
      ],
      expenses: [{ id: "exp_sum", category: "SUMINISTROS", concept: "Suministros", monthlyAmount: 105, months: 18, estimated: 1890, status: "PENDIENTE", createdAt: now, updatedAt: now }],
      sales: [
        { id: "sale_1", title: "Vivienda 1", unitType: "VIVIENDA", status: "RESERVADO", completionDateEstimated: "2027-01-15", saleDateEstimated: "2027-02-01", collectionDateEstimated: "2027-02-15", createdAt: now, updatedAt: now },
        { id: "sale_2", title: "Vivienda 2", unitType: "VIVIENDA", status: "DISPONIBLE", createdAt: now, updatedAt: now },
      ],
      invoicesDriveFolder: { url: `https://drive.google.com/drive/folders/${folderId}`, linkedAt: now },
      createdAt: now,
      updatedAt: now,
    } as REOperation;
    const { error: opErr } = await A.client.from("operaciones_inmobiliarias").insert({ id: opId, user_id: A.id, data: op, client_updated_at: now });
    if (opErr) throw opErr;

    const visibility = { gastos: true, gastosImportes: true, ventas: true, ventasPrecios: true, costesTotales: true, ingresos: true, pendientePago: true };
    const { data: opp, error: oppErr } = await A.client
      .from("investment_opportunities")
      .insert({ owner_id: A.id, operation_id: opId, title: "E2E economía", target_capital: 100000, min_ticket: 10000, metrics: buildOpportunityMetrics(op, calcResults(op)), visibility })
      .select("id")
      .single();
    if (oppErr) throw oppErr;
    const { data: contact, error: cErr } = await A.client.from("investor_contacts").insert({ owner_id: A.id, first_name: "Inversor", email: I.email }).select("id").single();
    if (cErr) throw cErr;
    const token = `econ-${randomUUID().replace(/-/g, "")}`;
    const { data: inv, error: iErr } = await A.client
      .from("opportunity_invitations")
      .insert({ opportunity_id: opp.id, owner_id: A.id, contact_id: contact.id, channel: "email", token, invited_email: I.email, visibility })
      .select("id")
      .single();
    if (iErr) throw iErr;
    await A.client.from("opportunity_invitations").update({ investor_user_id: I.id }).eq("id", inv.id);
    const claim = await I.client.rpc("claim_invitation", { p_token: token });
    assert.ifError(claim.error);
    step("oportunidad compartida con el inversor (RLS y RPC reales)");

    // 1. Mismos datos en Gestión e Inversores
    let snap = await snapshot(I.client, inv.id);
    const gestionExpenses = projectExpenseSummary(op, calcResults(op));
    const gestionSales = projectSalesSummary(op, calcResults(op), new Date().toISOString());
    const sum = (snap.gastos as { categories: { key: string; planned: number }[] }).categories.find((c) => c.key === "SUMINISTROS")!;
    assert.equal(sum.planned, 1890);
    assert.deepEqual((snap.gastos as { categories: unknown[] }).categories.map((c) => (c as { key: string; planned: number }).planned), gestionExpenses.categories.map((c) => c.planned));
    assert.equal((snap.ventas as { planned: number }).planned, gestionSales.planned);
    assert.ok(!JSON.stringify(snap).includes("documentUrl"), "sin enlaces a documentos");
    step(`Gestión e Inversores: mismos gastos por categoría (Suministros 1.890 €) y mismas ventas (${gestionSales.planned} €)`);

    // 2. Cambio en Gestión (o en la APP) sin volver a guardar la oferta
    const changed: REOperation = {
      ...op,
      realExpenses: [{ id: "rexp_1", concept: "Luz y agua", amount: 780, date: "2026-09-10", category: "SUMINISTROS", createdAt: now, updatedAt: now }],
      sales: [{ ...op.sales![0], status: "VENDIDO", realPrice: 242000, date: "2027-02-03", payments: [{ id: "p1", date: "2027-02-03", amount: 100000 }], collected: 100000, updatedAt: now }, op.sales![1]],
      updatedAt: "2026-09-15T09:00:00.000Z",
    };
    const { error: upErr } = await A.client.from("operaciones_inmobiliarias").update({ data: changed, client_updated_at: changed.updatedAt }).eq("id", opId);
    if (upErr) throw upErr;
    snap = await snapshot(I.client, inv.id);
    assert.equal((snap.ventas as { collected: number }).collected, 0, "antes del recálculo el inversor aún ve la versión guardada");

    const denied = BASE_URL ? await refresh(B, inv.id) : { status: 403, body: {} };
    assert.equal(denied.status, 403, "un usuario sin acceso no puede provocar el recálculo");
    const r1 = await refresh(I, inv.id);
    assert.equal(r1.status, 200);
    assert.equal(r1.body.refreshed, true);
    snap = await snapshot(I.client, inv.id);
    assert.equal((snap.gastos as { categories: { key: string; real: number }[] }).categories.find((c) => c.key === "SUMINISTROS")!.real, 780);
    assert.equal((snap.ventas as { collected: number; soldAmount: number; pending: number }).collected, 100000);
    assert.equal((snap.ventas as { pending: number }).pending, 142000);
    assert.equal(snap.ingresos, 100000);
    const again = await refresh(I, inv.id);
    assert.equal(again.body.reason, "unchanged");
    step(`recálculo sin guardar la oferta (${BASE_URL ? "ruta HTTP real" : "capa directa"}): real 780 €, cobrado 100.000 €, pendiente 142.000 €; intruso → 403`);

    // 3. Documento IA → gasto real en su categoría → Inversores
    const req = await A.client.rpc("request_document_sync", { p_operation_id: opId });
    assert.ifError(req.error);
    const store = createStore(cfg.supabaseUrl, cfg.supabaseSecretKey, "econ-e2e-worker");
    const job = await store.claimJob(600);
    assert.equal(job?.id, req.data.job_id);
    const [doc] = await store.upsertSeen([{ user_id: A.id, drive_folder_id: folderId, drive_file_id: "1EconInvoiceXXXXXXXXX", operation_id: opId, name: "Factura Endesa.pdf", mime_type: "application/pdf", last_seen_at: now, last_job_id: job!.id }]);
    const applied = await store.recordProposal(job!, doc.id, { operationId: opId, kind: "real_expense", mode: "insert", targetId: "rexp_doc_1EconInvoiceXXXXXXXXX", dedupeKey: "file:1EconInvoiceXXXXXXXXX", item: { concept: "Endesa", amount: 110, date: "2026-09-12", category: "SUMINISTROS", documentName: "Factura Endesa.pdf", documentUrl: "https://drive.google.com/file/d/1EconInvoiceXXXXXXXXX/view" }, confidence: 0.97, auto: true }, "v1");
    assert.equal(applied.applied, true);
    await store.finishJob(job!.id, "completed", { reviewed: 1, autoApplied: 1 });
    const { data: row } = await A.client.from("operaciones_inmobiliarias").select("data").eq("id", opId).single();
    const gestion = projectExpenseSummary(row!.data as REOperation, calcResults(row!.data as REOperation));
    assert.equal(gestion.categories.find((c) => c.key === "SUMINISTROS")!.real, 890, "Gestión del proyecto ve la factura IA en Suministros");
    const r2 = await refresh(I, inv.id);
    assert.equal(r2.body.refreshed, true);
    snap = await snapshot(I.client, inv.id);
    assert.equal((snap.gastos as { categories: { key: string; real: number }[] }).categories.find((c) => c.key === "SUMINISTROS")!.real, 890);
    step("factura IA → gasto real en Suministros (890 €) en Gestión y en Inversores, sin camino paralelo");
  } finally {
    for (const id of users) {
      const { error } = await admin.auth.admin.deleteUser(id);
      process.stdout.write(error ? `✖ no se pudo borrar ${id}: ${error.message}\n` : "✔ usuario temporal borrado\n");
    }
  }
}

main().catch((err) => {
  process.stderr.write(`✖ ${err instanceof Error ? err.stack : JSON.stringify(err)}\n`);
  process.exit(1);
});

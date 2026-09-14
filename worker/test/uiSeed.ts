// worker/test/uiSeed.ts — Datos para revisar la UI de Documentación contra el Supabase real.
//
//   SUPABASE_PUBLISHABLE_KEY=… node --import ./scripts/test-ts-resolve.mjs worker/test/uiSeed.ts seed <salida.json>
//   node --import ./scripts/test-ts-resolve.mjs worker/test/uiSeed.ts cleanup <salida.json>
//
// Crea un usuario temporal con una operación (+ variante), procesa una carpeta simulada con
// el worker real (auto-aplicados, uno a revisión, uno ilegible) y escribe la sesión en el
// archivo de salida (nunca en consola). `cleanup` borra el usuario (cascada).

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile, readConfig } from "../config.ts";
import { createDriveClient } from "../drive.ts";
import { processJob } from "../pipeline.ts";
import { createStore } from "../store.ts";
import { startMockDrive } from "./mockDrive.ts";

loadEnvFile();
for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]) process.env[k] ??= "ui-no-usado";
const cfg = readConfig();
const admin = createClient(cfg.supabaseUrl, cfg.supabaseSecretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const [mode, out] = process.argv.slice(2);

async function seed() {
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const email = `docsync-ui-${randomUUID().slice(0, 8)}@invergravital.com`;
  const password = `${randomUUID()}Aa1!`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(cfg.supabaseUrl, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;

  const ROOT = `1UiRoot${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const opId = `ui-${randomUUID()}`;
  const data = {
    name: "Edificio de prueba (UI)",
    purchasePrice: 300000,
    units: [{ id: "u1", type: "VIVIENDA", title: "Vivienda 1" }],
    costs: { purchaseTaxPct: 7, arquitectoPct: 0, tasas: [] },
    financing: { enabled: false, compra: { pct: 0, interest: 0 }, obra: { pct: 0 } },
    invoicesDriveFolder: { url: `https://drive.google.com/drive/folders/${ROOT}`, linkedAt: new Date().toISOString() },
    sales: [{ id: "sale_1", title: "Vivienda 1", status: "DISPONIBLE", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" }],
    realExpenses: [{ id: "rexp_manual", concept: "Pago electricista (a mano)", amount: 3025, date: "2026-08-01", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }],
    realFinancesEnabled: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
  const { error: e3 } = await client.from("operaciones_inmobiliarias").insert({ id: opId, user_id: created.user.id, data, client_updated_at: data.updatedAt });
  if (e3) throw e3;

  const fixtures = mkdtempSync(join(tmpdir(), "igv-ui-"));
  execFileSync(cfg.tools.python, [join(import.meta.dirname, "fixtures.py"), fixtures]);
  const fx = (n: string) => readFileSync(join(fixtures, n));
  const drive = await startMockDrive();
  drive.put({ id: ROOT, name: "Obra", mimeType: "application/vnd.google-apps.folder", parent: "", owners: [email] });
  drive.shared.add(ROOT);
  drive.put({ id: "1UiInvoiceDigitalXXXX", name: "Factura fontanería F-2026-141.pdf", mimeType: "application/pdf", parent: ROOT, content: fx("invoice_digital.pdf") });
  drive.put({ id: "1UiInvoiceScannedXXXX", name: "Factura electricidad escaneada.pdf", mimeType: "application/pdf", parent: ROOT, content: fx("invoice_scanned.pdf") });
  drive.put({ id: "1UiIllegibleXXXXXXXXX", name: "Foto borrosa.pdf", mimeType: "application/pdf", parent: ROOT, content: fx("illegible.pdf") });
  drive.put({ id: "1UiLoanXXXXXXXXXXXXXX", name: "Préstamo CaixaBank.pdf", mimeType: "application/pdf", parent: ROOT, content: fx("loan.pdf") });

  const req = await client.rpc("request_document_sync", { p_operation_id: opId });
  if (req.error) throw req.error;
  const store = createStore(cfg.supabaseUrl, cfg.supabaseSecretKey, "ui-seed-worker");
  const job = await store.claimJob(600);
  const driveClient = createDriveClient({ clientId: "c", clientSecret: "s", refreshToken: "good-refresh", apiBase: `${drive.url}/drive/v3`, tokenUrl: `${drive.url}/token` });
  const result = await processJob(job!, { store, drive: driveClient, tools: cfg.tools, assistants: [], log: () => {} });
  await drive.close();
  rmSync(fixtures, { recursive: true, force: true });

  writeFileSync(out, JSON.stringify({ userId: created.user.id, opId, access_token: session.session!.access_token, refresh_token: session.session!.refresh_token }), { mode: 0o600 });
  process.stdout.write(`seeded job=${result.status} ${JSON.stringify(result.summary)}\n`);
}

async function cleanup() {
  const { userId } = JSON.parse(readFileSync(out, "utf8"));
  const { error } = await admin.auth.admin.deleteUser(userId);
  rmSync(out, { force: true });
  process.stdout.write(error ? `cleanup error: ${error.message}\n` : "usuario temporal borrado\n");
}

(mode === "seed" ? seed() : cleanup()).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});

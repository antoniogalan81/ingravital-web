// worker/index.ts — Worker del PC: reclama tareas de Supabase (conexión SALIENTE, sin puertos
// abiertos), las procesa y vuelve a esperar.
//
//   npm run worker            # bucle continuo (una consulta cada WORKER_IDLE_SECONDS en reposo)
//   npm run worker -- --once  # procesa lo pendiente y termina (para el Programador de tareas)
//   npm run worker -- --reprocess   # reprocesa documentos de una versión anterior del extractor

import { readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFile, readConfig } from "./config.ts";
import { createDriveClient } from "./drive.ts";
import { ollamaAssistant } from "./extract/llm.ts";
import { processJob } from "./pipeline.ts";
import { LEASE_SECONDS } from "./policy.ts";
import { createStore } from "./store.ts";

// Solo metadatos operativos: ids, estados y recuentos. Nunca contenido ni nombres de documentos.
const log = (event: string, data: Record<string, unknown> = {}) => process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...data })}\n`);

async function cleanStaleTemp(): Promise<void> {
  const dir = tmpdir();
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (!name.startsWith("invergravital-")) continue;
    const path = join(dir, name);
    const info = await stat(path).catch(() => null);
    if (info && Date.now() - info.mtimeMs > 3_600_000) await rm(path, { recursive: true, force: true });
  }
}

async function main() {
  loadEnvFile();
  const cfg = readConfig();
  const once = process.argv.includes("--once");
  const store = createStore(cfg.supabaseUrl, cfg.supabaseSecretKey, cfg.workerId);
  const drive = createDriveClient(cfg.google);
  const assistants = cfg.ollama ? [ollamaAssistant(cfg.ollama.url, cfg.ollama.model)] : [];
  let stopping = false;
  process.on("SIGINT", () => (stopping = true));
  process.on("SIGTERM", () => (stopping = true));

  await cleanStaleTemp();
  log("worker_started", { workerId: cfg.workerId, once, llm: !!cfg.ollama });

  while (!stopping) {
    let job = null;
    try {
      job = await store.claimJob(LEASE_SECONDS);
    } catch (err) {
      log("claim_error", { error: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    }
    if (job) {
      log("job_claimed", { jobId: job.id, attempt: job.attempts });
      await processJob(job, { store, drive, tools: cfg.tools, assistants, log, reprocess: process.argv.includes("--reprocess") });
      continue;
    }
    if (once) break;
    await new Promise((r) => setTimeout(r, cfg.idleSeconds * 1000));
  }
  log("worker_stopped");
}

main().catch((err) => {
  log("worker_fatal", { error: err instanceof Error ? err.message : "unknown" });
  process.exit(1);
});

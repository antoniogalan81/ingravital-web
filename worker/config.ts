// worker/config.ts — Configuración del worker. Los secretos viven FUERA del repositorio,
// en %LOCALAPPDATA%\Invergravital\worker.env (o la ruta de INVERGRAVITAL_WORKER_ENV).

import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

export const ENV_FILE = process.env.INVERGRAVITAL_WORKER_ENV ?? join(process.env.LOCALAPPDATA ?? join(process.env.HOME ?? ".", ".config"), "Invergravital", "worker.env");

export function loadEnvFile(): void {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}

const required = (name: string): string => {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Falta ${name} en ${ENV_FILE}. Ver docs/DOCUMENTOS_DRIVE.md.`);
  return v;
};

export type WorkerConfig = ReturnType<typeof readConfig>;

export function readConfig() {
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  return {
    supabaseUrl: required("SUPABASE_URL"),
    supabaseSecretKey: required("SUPABASE_WORKER_SECRET_KEY"),
    google: {
      clientId: required("GOOGLE_CLIENT_ID"),
      clientSecret: required("GOOGLE_CLIENT_SECRET"),
      refreshToken: required("GOOGLE_REFRESH_TOKEN"),
    },
    workerId: (process.env.WORKER_ID ?? `pc-${hostname()}`).replace(/[^A-Za-z0-9_.:-]/g, "-").slice(0, 80),
    idleSeconds: Math.max(15, Number(process.env.WORKER_IDLE_SECONDS ?? 60)),
    tools: {
      python: process.env.PYTHON_PATH ?? "python",
      tesseract: process.env.TESSERACT_PATH ?? join(programFiles, "Tesseract-OCR", "tesseract.exe"),
      tessdata: process.env.TESSDATA_DIR ?? join(process.env.LOCALAPPDATA ?? ".", "Invergravital", "tessdata"),
    },
    ollama: process.env.OLLAMA_DISABLED === "1" ? null : { url: process.env.OLLAMA_URL ?? "http://127.0.0.1:11434", model: process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct" },
  };
}

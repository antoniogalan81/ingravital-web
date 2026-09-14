// worker/googleAuth.ts — Autoriza UNA VEZ a invergravital@gmail.com (OAuth 2.0 para
// aplicaciones de escritorio: loopback + PKCE) y guarda el token de refresco en worker.env.
//
//   npm run worker:setup   # pide client ID/secret si faltan, autoriza y registra la tarea de Windows
//   npm run worker:auth    # solo autorizar (sin tocar el Programador de tareas)
//
// Solo pide `drive.readonly` (leer lo que los clientes comparten) y el email para comprobar
// que se ha iniciado sesión con la cuenta correcta. El token nunca se imprime.

import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { ENV_FILE, loadEnvFile } from "./config.ts";

const EXPECTED_ACCOUNT = "invergravital@gmail.com";
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly", "openid", "email"];

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function saveEnvValue(name: string, value: string) {
  mkdirSync(dirname(ENV_FILE), { recursive: true });
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split(/\r?\n/).filter((l) => !l.startsWith(`${name}=`)) : [];
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  writeFileSync(ENV_FILE, `${[...lines, `${name}=${value}`].join("\n")}\n`, { mode: 0o600 });
}

async function main() {
  loadEnvFile();
  let clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    clientId = (await rl.question("ID de cliente OAuth (termina en .apps.googleusercontent.com): ")).trim();
    clientSecret = (await rl.question("Secreto de cliente OAuth: ")).trim();
    rl.close();
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) || !/^[\w-]{10,100}$/.test(clientSecret)) throw new Error("ID o secreto de cliente no válidos.");
    saveEnvValue("GOOGLE_CLIENT_ID", clientId);
    saveEnvValue("GOOGLE_CLIENT_SECRET", clientSecret);
  }

  const verifier = b64url(randomBytes(48));
  const state = b64url(randomBytes(24));
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const redirectUri = `http://127.0.0.1:${port}`;

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    login_hint: EXPECTED_ACCOUNT,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    state,
  })}`;

  const code = await new Promise<string>((resolve, reject) => {
    server.on("request", (req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      if (url.pathname !== "/") return void res.writeHead(404).end();
      const ok = url.searchParams.get("state") === state && url.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(ok ? "<p>Autorización recibida. Puedes cerrar esta pestaña.</p>" : "<p>Autorización cancelada o no válida.</p>");
      if (ok) resolve(url.searchParams.get("code")!);
      else reject(new Error(url.searchParams.get("error") ?? "state_mismatch"));
    });
    process.stdout.write(`Abriendo el navegador. Inicia sesión con ${EXPECTED_ACCOUNT}.\nSi no se abre, visita:\n${authUrl}\n`);
    // Sin shell: el navegador predeterminado recibe la URL como un único argumento.
    spawn("rundll32", ["url.dll,FileProtocolHandler", authUrl], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  }).finally(() => server.close());

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
  });
  if (!tokenRes.ok) throw new Error(`Google rechazó el intercambio del código (${tokenRes.status}).`);
  const tokens = (await tokenRes.json()) as { access_token: string; refresh_token?: string; scope?: string };
  if (!tokens.refresh_token) throw new Error("Google no devolvió token de refresco. Revoca el acceso en myaccount.google.com/permissions y repite.");
  if (!tokens.scope?.includes("drive.readonly")) throw new Error("No se concedió el permiso de lectura de Drive.");

  const me = (await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } })).json()) as { email?: string };
  if ((me.email ?? "").toLowerCase() !== EXPECTED_ACCOUNT) {
    throw new Error(`Se inició sesión con otra cuenta. Repite con ${EXPECTED_ACCOUNT}.`);
  }
  saveEnvValue("GOOGLE_REFRESH_TOKEN", tokens.refresh_token);
  process.stdout.write(`Listo: ${EXPECTED_ACCOUNT} autorizada. Token guardado en ${ENV_FILE}.\n`);
  if (process.argv.includes("--install-task")) {
    const script = join(import.meta.dirname, "install-task.ps1");
    process.stdout.write(execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], { encoding: "utf8" }));
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});

// worker/test/mockDrive.ts — Servidor HTTP que imita lo que usa el worker de Google Drive v3
// (token, metadatos, listado paginado, descarga y exportación). Solo para pruebas.

import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";

export type MockFile = { id: string; name: string; mimeType: string; parent: string; content?: Buffer; modifiedTime?: string; owners?: string[]; sharingUser?: string; trashed?: boolean };

export type MockDrive = {
  url: string;
  files: Map<string, MockFile>;
  /** Carpetas y archivos accesibles para la cuenta (lo "compartido"). */
  shared: Set<string>;
  downloads: string[];
  put(file: MockFile): void;
  close(): Promise<void>;
};

const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");

export async function startMockDrive(pageSize = 2): Promise<MockDrive> {
  const files = new Map<string, MockFile>();
  const shared = new Set<string>();
  const downloads: string[] = [];

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "POST" && url.pathname === "/token") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const form = new URLSearchParams(raw);
        if (form.get("refresh_token") !== "good-refresh") return send(400, { error: "invalid_grant" });
        send(200, { access_token: "access-ok", expires_in: 3600 });
      });
      return;
    }
    if (req.headers.authorization !== "Bearer access-ok") return send(401, { error: "unauthorized" });

    const visible = (f: MockFile | undefined): f is MockFile => {
      if (!f || f.trashed) return false;
      for (let cur: MockFile | undefined = f; cur; cur = files.get(cur.parent)) if (shared.has(cur.id)) return true;
      return false;
    };

    if (url.pathname === "/drive/v3/files") {
      const parent = url.searchParams.get("q")?.match(/^'([^']+)' in parents and trashed = false$/)?.[1];
      if (!parent || !visible(files.get(parent))) return send(404, { error: "notFound" });
      const children = [...files.values()].filter((f) => f.parent === parent && !f.trashed);
      const start = Number(url.searchParams.get("pageToken") ?? 0);
      const page = children.slice(start, start + pageSize);
      return send(200, {
        files: page.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime ?? "2026-09-01T00:00:00.000Z", ...(f.content && !f.mimeType.startsWith("application/vnd.google-apps") ? { md5Checksum: md5(f.content), size: String(f.content.length) } : {}) })),
        ...(start + pageSize < children.length ? { nextPageToken: String(start + pageSize) } : {}),
      });
    }
    const m = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)(\/export)?$/);
    if (m) {
      const f = files.get(m[1]);
      if (!visible(f)) return send(404, { error: "notFound" });
      if (m[2] || url.searchParams.get("alt") === "media") {
        downloads.push(f.id);
        res.writeHead(200, { "Content-Type": "application/octet-stream" });
        return res.end(f.content ?? Buffer.alloc(0));
      }
      return send(200, { id: f.id, name: f.name, mimeType: f.mimeType, trashed: !!f.trashed, owners: (f.owners ?? []).map((e) => ({ emailAddress: e })), ...(f.sharingUser ? { sharingUser: { emailAddress: f.sharingUser } } : {}) });
    }
    send(404, { error: "route" });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    files,
    shared,
    downloads,
    put: (f) => files.set(f.id, f),
    close: () => new Promise((r) => server.close(() => r())),
  };
}

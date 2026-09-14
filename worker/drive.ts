// worker/drive.ts — Google Drive API v3 con la cuenta invergravital@gmail.com (OAuth 2.0,
// alcance drive.readonly). Sin librerías: token de refresco → token de acceso → REST.
//
// Seguridad:
//  · Solo se consultan ids validados; las URLs se construyen aquí, nunca con datos del usuario
//    (sin SSRF).
//  · La descarga corta al superar el límite de tamaño, aunque Drive no informe `size`.
//  · Los atajos (shortcuts) no se siguen: podrían apuntar fuera de la carpeta compartida.

import { createWriteStream } from "node:fs";
import { LIMITS } from "./policy.ts";

const DRIVE_ID = /^[A-Za-z0-9_-]{10,128}$/;
const FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  md5Checksum?: string;
  size?: number;
  path: string; // carpeta relativa, para mostrar
};

export type FolderInfo = { id: string; name: string; ownerEmails: string[]; sharingUserEmail?: string };

export type DriveErrorCode = "not_shared" | "not_folder" | "auth" | "rate_limited" | "too_large" | "too_many_files" | "http";

export class DriveError extends Error {
  code: DriveErrorCode;
  status?: number;
  constructor(code: DriveErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type DriveConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  apiBase?: string; // pruebas
  tokenUrl?: string; // pruebas
};

export type DriveClient = ReturnType<typeof createDriveClient>;

export function createDriveClient(cfg: DriveConfig) {
  const apiBase = cfg.apiBase ?? "https://www.googleapis.com/drive/v3";
  const tokenUrl = cfg.tokenUrl ?? "https://oauth2.googleapis.com/token";
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt > Date.now() + 60_000) return token.value;
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: cfg.refreshToken, grant_type: "refresh_token" }),
    });
    if (!res.ok) throw new DriveError("auth", "La autorización de Google de invergravital@gmail.com no es válida o ha caducado.", res.status);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return token.value;
  }

  async function get(path: string, params: Record<string, string>, attempt = 0): Promise<Response> {
    const url = `${apiBase}${path}?${new URLSearchParams({ supportsAllDrives: "true", ...params })}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return get(path, params, attempt + 1);
    }
    if (res.status === 401 && attempt === 0) {
      await res.body?.cancel();
      token = null;
      return get(path, params, 1);
    }
    return res;
  }

  async function json<T>(path: string, params: Record<string, string>): Promise<T> {
    const res = await get(path, params);
    if (res.status === 404 || res.status === 403) {
      await res.body?.cancel();
      throw new DriveError("not_shared", "La carpeta no existe o no está compartida con invergravital@gmail.com.", res.status);
    }
    if (res.status === 429) throw new DriveError("rate_limited", "Google Drive está limitando las peticiones; se reintentará.", 429);
    if (!res.ok) throw new DriveError("http", `Google Drive respondió ${res.status}.`, res.status);
    return (await res.json()) as T;
  }

  async function folderInfo(folderId: string): Promise<FolderInfo> {
    if (!DRIVE_ID.test(folderId)) throw new DriveError("not_folder", "Identificador de carpeta no válido.");
    const f = await json<{ id: string; name: string; mimeType: string; trashed?: boolean; owners?: { emailAddress?: string }[]; sharingUser?: { emailAddress?: string } }>(
      `/files/${folderId}`,
      { fields: "id,name,mimeType,trashed,owners(emailAddress),sharingUser(emailAddress)" },
    );
    if (f.mimeType !== FOLDER_MIME || f.trashed) throw new DriveError("not_folder", "El enlace no corresponde a una carpeta de Google Drive activa.");
    return {
      id: f.id,
      name: f.name,
      ownerEmails: (f.owners ?? []).map((o) => (o.emailAddress ?? "").toLowerCase()).filter(Boolean),
      ...(f.sharingUser?.emailAddress ? { sharingUserEmail: f.sharingUser.emailAddress.toLowerCase() } : {}),
    };
  }

  /** Archivos de la carpeta y subcarpetas (en anchura), sin papelera ni atajos. */
  async function listFiles(folderId: string): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    const queue: { id: string; path: string; depth: number }[] = [{ id: folderId, path: "", depth: 0 }];
    const visited = new Set<string>();
    while (queue.length) {
      const folder = queue.shift()!;
      if (visited.has(folder.id) || !DRIVE_ID.test(folder.id)) continue;
      visited.add(folder.id);
      let pageToken: string | undefined;
      do {
        const page = await json<{ nextPageToken?: string; files: { id: string; name: string; mimeType: string; modifiedTime?: string; md5Checksum?: string; size?: string }[] }>("/files", {
          q: `'${folder.id}' in parents and trashed = false`,
          fields: "nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,size)",
          pageSize: "1000",
          includeItemsFromAllDrives: "true",
          ...(pageToken ? { pageToken } : {}),
        });
        for (const f of page.files ?? []) {
          if (!DRIVE_ID.test(f.id)) continue;
          if (f.mimeType === FOLDER_MIME) {
            if (folder.depth + 1 <= LIMITS.maxFolderDepth) queue.push({ id: f.id, path: folder.path ? `${folder.path}/${f.name}` : f.name, depth: folder.depth + 1 });
            continue;
          }
          if (f.mimeType === "application/vnd.google-apps.shortcut") continue;
          out.push({
            id: f.id,
            name: f.name.slice(0, 300),
            mimeType: f.mimeType,
            ...(f.modifiedTime ? { modifiedTime: f.modifiedTime } : {}),
            ...(f.md5Checksum ? { md5Checksum: f.md5Checksum } : {}),
            ...(f.size ? { size: Number(f.size) } : {}),
            path: folder.path,
          });
          if (out.length > LIMITS.maxFilesPerFolder) throw new DriveError("too_many_files", `La carpeta tiene más de ${LIMITS.maxFilesPerFolder} archivos.`);
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
    }
    return out;
  }

  /** Descarga (o exporta a PDF un documento de Google) a `dest`, cortando si excede el límite. */
  async function download(file: Pick<DriveFile, "id" | "mimeType">, dest: string): Promise<number> {
    if (!DRIVE_ID.test(file.id)) throw new DriveError("http", "Identificador de archivo no válido.");
    const res = file.mimeType === "application/vnd.google-apps.document"
      ? await get(`/files/${file.id}/export`, { mimeType: "application/pdf" })
      : await get(`/files/${file.id}`, { alt: "media" });
    if (res.status === 404 || res.status === 403) throw new DriveError("not_shared", "El archivo ya no es accesible.", res.status);
    if (!res.ok || !res.body) throw new DriveError("http", `Google Drive respondió ${res.status} al descargar.`, res.status);
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > LIMITS.maxFileBytes) {
      await res.body.cancel();
      throw new DriveError("too_large", "El archivo supera el tamaño máximo.");
    }
    const sink = createWriteStream(dest, { flags: "wx", mode: 0o600 });
    let bytes = 0;
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        bytes += chunk.byteLength;
        if (bytes > LIMITS.maxFileBytes) throw new DriveError("too_large", "El archivo supera el tamaño máximo.");
        if (!sink.write(chunk)) await new Promise<void>((r) => sink.once("drain", () => r()));
      }
    } finally {
      await new Promise<void>((resolve) => sink.end(resolve));
    }
    return bytes;
  }

  return { folderInfo, listFiles, download };
}

/**
 * ¿Puede este usuario de Invergravital usar esa carpeta? Debe pertenecer a su cuenta de
 * Google o habérsela compartido él mismo a invergravital@gmail.com. Sin esto, alguien que
 * conociera el enlace de la carpeta de OTRO cliente podría volcar sus documentos en su
 * propia operación, porque invergravital@gmail.com ve las carpetas de todos los clientes.
 */
export function folderBelongsTo(info: FolderInfo, userEmail: string | null | undefined): boolean {
  const email = (userEmail ?? "").trim().toLowerCase();
  if (!email) return false;
  return info.ownerEmails.includes(email) || info.sharingUserEmail === email;
}

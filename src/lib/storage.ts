// src/lib/storage.ts — Acceso real a Supabase Storage para inversiones.
// Buckets PRIVADOS (ver supabase/migrations/20260702_investment_storage.sql).
// Los errores se propagan (no hay fallback silencioso ni éxito falso).

import { supabase } from "./supabaseClient";

export const BUCKET_MEDIA = "investment-media";
export const BUCKET_DOCS = "investment-documents";

export type UploadedFile = { bucket: string; path: string; mime: string; size: number; name: string };

function extOf(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename);
  return m ? `.${m[1].toLowerCase()}` : "";
}

/** id corto sin dependencias (para el nombre de archivo). */
function shortId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error("No hay sesión activa.");
  return id;
}

/** Ruta de un archivo de media: ownerId/operationId/media/<fileId><ext>. */
export function mediaPath(userId: string, operationId: string, filename: string): string {
  return `${userId}/${operationId}/media/${shortId()}${extOf(filename)}`;
}

/** Ruta de una factura de gasto: ownerId/operationId/expenses/expenseId/<fileId><ext>. */
export function invoicePath(userId: string, operationId: string, expenseId: string, filename: string): string {
  return `${userId}/${operationId}/expenses/${expenseId}/${shortId()}${extOf(filename)}`;
}

/** Sube un archivo a un bucket privado. Lanza si falla (bucket inexistente, permisos, etc.). */
export async function uploadFile(bucket: string, path: string, file: File): Promise<UploadedFile> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return { bucket, path, mime: file.type || "", size: file.size, name: file.name };
}

/** URL firmada temporal para VER un archivo privado. Devuelve null si no hay permiso/archivo. */
export async function signedUrl(bucket: string, path: string, expiresInSeconds = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Borra (desvincula) un archivo del bucket. Lanza si falla. */
export async function removeFile(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

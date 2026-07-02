"use client";

// Panel MEDIA (fotos / vídeos). Subida REAL a Supabase Storage (bucket privado
// investment-media) + alta por enlace externo. Los archivos privados se ven con
// signed URL temporal. Errores propagados (sin fallback silencioso). Persiste
// `media` en la operación (metadata: storagePath/bucket) — el archivo va a Storage.

import { useEffect, useMemo, useRef, useState } from "react";
import type { REOperation } from "@/src/lib/realEstate";
import { newTrackingId, type REMediaItem, type REMediaType } from "@/src/lib/realEstateTracking";
import { BUCKET_MEDIA, currentUserId, mediaPath, removeFile, signedUrl, uploadFile } from "@/src/lib/storage";

const isHttp = (s: string) => /^https?:\/\//i.test(s.trim());

function MediaThumb({ item }: { item: REMediaItem }) {
  const [url, setUrl] = useState<string | null>(item.storagePath ? null : item.uri || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (item.storagePath && item.bucket) {
      signedUrl(item.bucket, item.storagePath).then((u) => {
        if (!active) return;
        if (u) setUrl(u);
        else setFailed(true);
      });
    }
    return () => { active = false; };
  }, [item.storagePath, item.bucket]);

  if (failed) return <span className="text-[11px] text-ink-subtle">No disponible</span>;
  if (!url) return <span className="text-[11px] text-ink-subtle">Cargando…</span>;
  if (item.type === "FOTO") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={item.caption ?? "Foto"} className="h-full w-full object-cover" />;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 text-brand">
      <span className="text-2xl">▶</span>
      <span className="text-xs font-semibold">Ver vídeo</span>
    </a>
  );
}

export function MediaPanel({
  op,
  onChange,
}: {
  op: REOperation;
  onChange: (media: REMediaItem[]) => void;
}) {
  const media = useMemo(() => (Array.isArray(op.media) ? op.media : []), [op.media]);

  const [type, setType] = useState<REMediaType>("FOTO");
  const [uri, setUri] = useState("");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addByLink = () => {
    const url = uri.trim();
    if (!isHttp(url)) {
      setError("Introduce un enlace válido (https://…) o sube un archivo.");
      return;
    }
    const item: REMediaItem = {
      id: newTrackingId("media"),
      type,
      uri: url,
      caption: caption.trim() || undefined,
      date: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };
    onChange([...media, item]);
    setUri("");
    setCaption("");
    setError(null);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const uid = await currentUserId();
      const path = mediaPath(uid, op.id, file.name);
      const up = await uploadFile(BUCKET_MEDIA, path, file);
      const item: REMediaItem = {
        id: newTrackingId("media"),
        type: file.type.startsWith("video") ? "VIDEO" : "FOTO",
        uri: "",
        storagePath: up.path,
        bucket: up.bucket,
        mime: up.mime,
        size: up.size,
        caption: caption.trim() || undefined,
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
      };
      onChange([...media, item]);
      setCaption("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir el archivo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (m: REMediaItem) => {
    // Si es archivo subido, intenta borrarlo del bucket (best-effort); luego desvincula.
    if (m.storagePath && m.bucket) {
      try { await removeFile(m.bucket, m.storagePath); } catch (err) {
        setError(err instanceof Error ? `No se pudo borrar del almacenamiento: ${err.message}` : "No se pudo borrar del almacenamiento.");
        return;
      }
    }
    onChange(media.filter((x) => x.id !== m.id));
  };

  return (
    <div className="space-y-5">
      {/* Subir archivo (real) */}
      <div className="re-card p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Subir archivo</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Descripción (opcional)"
            className="flex-1 min-w-[10rem] rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          <input ref={fileRef} type="file" accept="image/*,video/*" onChange={onFile} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60"
            style={{ background: "var(--brand)" }}
          >
            {uploading ? "Subiendo…" : "Subir foto/vídeo"}
          </button>
        </div>
        <p className="text-[11px] text-ink-subtle">
          Archivo privado en Supabase Storage; solo tú y los inversores autorizados podrán verlo.
        </p>
      </div>

      {/* Alta por enlace externo */}
      <div className="re-card p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Añadir por enlace</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as REMediaType)}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink cursor-pointer sm:w-32"
          >
            <option value="FOTO">Foto</option>
            <option value="VIDEO">Vídeo</option>
          </select>
          <input
            type="url"
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="https://…"
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          <button
            type="button"
            onClick={addByLink}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors"
            style={{ background: "var(--brand)" }}
          >
            Añadir enlace
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-[var(--negative)]">{error}</p> : null}

      {/* Galería */}
      {media.length === 0 ? (
        <p className="text-sm text-ink-subtle">Sin fotos ni vídeos todavía.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {media.map((m) => (
            <figure key={m.id} className="re-card overflow-hidden">
              <div className="relative aspect-video bg-[var(--surface-alt)] flex items-center justify-center">
                <MediaThumb item={m} />
                <button
                  type="button"
                  onClick={() => remove(m)}
                  title="Quitar"
                  className="absolute top-1.5 right-1.5 rounded-md bg-white/90 p-1 text-slate-500 hover:text-red-500 shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <figcaption className="px-2.5 py-2">
                <p className="text-xs text-ink truncate">{m.caption ?? (m.type === "FOTO" ? "Foto" : "Vídeo")}</p>
                <p className="text-[11px] text-ink-subtle">{m.storagePath ? "Archivo" : "Enlace"}{m.date ? ` · ${m.date}` : ""}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

export default MediaPanel;

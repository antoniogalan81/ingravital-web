"use client";

// Panel MEDIA (fotos / vídeos del estado y evolución). AÑADIR POR ENLACE (URL):
// no se implementa subida real de ficheros porque el proyecto NO tiene aún un
// bucket de Supabase Storage configurado. La subida real queda documentada como
// pendiente (requiere Supabase Storage). Persiste `media` en la operación.

import { useMemo, useState } from "react";
import type { REOperation } from "@/src/lib/realEstate";
import { newTrackingId, type REMediaItem, type REMediaType } from "@/src/lib/realEstateTracking";

const isHttp = (s: string) => /^https?:\/\//i.test(s.trim());

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

  const add = () => {
    const url = uri.trim();
    if (!isHttp(url)) {
      setError("Introduce un enlace válido (https://…). La subida de archivos requiere Supabase Storage (pendiente).");
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

  const remove = (id: string) => onChange(media.filter((m) => m.id !== id));

  return (
    <div className="space-y-5">
      {/* Aviso de storage */}
      <div className="rounded-xl border border-line bg-[var(--surface-alt)] p-3">
        <p className="text-sm text-ink-muted">
          Añade fotos y vídeos por <b>enlace (URL)</b>. La <b>subida de archivos desde el dispositivo</b> requiere
          configurar <b>Supabase Storage</b> (bucket + políticas) y queda pendiente — no se realiza ninguna subida real.
        </p>
      </div>

      {/* Alta por enlace */}
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
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Descripción (opcional)"
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          <button
            type="button"
            onClick={add}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] transition-colors"
            style={{ background: "var(--brand)" }}
          >
            Añadir
          </button>
        </div>
        {error ? <p className="text-xs text-[var(--negative)]">{error}</p> : null}
      </div>

      {/* Galería */}
      {media.length === 0 ? (
        <p className="text-sm text-ink-subtle">Sin fotos ni vídeos todavía.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {media.map((m) => (
            <figure key={m.id} className="re-card overflow-hidden">
              <div className="relative aspect-video bg-[var(--surface-alt)] flex items-center justify-center">
                {m.type === "FOTO" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.uri} alt={m.caption ?? "Foto"} className="h-full w-full object-cover" />
                ) : (
                  <a href={m.uri} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 text-brand">
                    <span className="text-2xl">▶</span>
                    <span className="text-xs font-semibold">Ver vídeo</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => remove(m.id)}
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
                {m.date ? <p className="text-[11px] text-ink-subtle">{m.date}</p> : null}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

export default MediaPanel;

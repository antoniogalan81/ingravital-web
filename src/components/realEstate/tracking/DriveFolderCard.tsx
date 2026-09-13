"use client";

// "Carpeta de facturas en Google Drive" de una operación. El usuario pega el enlace;
// no hay OAuth ni lectura de Drive: Invergravital solo guarda y abre ese enlace, y
// NUNCA cambia los permisos de la carpeta ni de sus archivos.

import { useState } from "react";
import type { REDriveFolder } from "@/src/lib/realEstateTracking";
import { driveFolderUrl, parseDriveLink } from "@/src/lib/realFinances";

const FIELD_CLS =
  "w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400";

function PermissionsNotice() {
  return (
    <div className="flex gap-2 rounded-lg border px-3 py-2.5 text-xs leading-relaxed" style={{ background: "var(--warning-soft)", borderColor: "#ecd9ad", color: "#6b4a12" }} role="note">
      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p>
        <b>Permisos de Drive:</b> si quieres que tus inversores puedan consultar las facturas, comparte esta carpeta o los
        archivos correspondientes con ellos desde Google Drive. Invergravital no modifica los permisos de tus archivos.
      </p>
    </div>
  );
}

export function DriveFolderCard({
  folder,
  onSave,
  onUnlink,
}: {
  folder?: REDriveFolder;
  onSave: (folder: REDriveFolder) => void;
  onUnlink: () => void;
}) {
  const linkedUrl = folder ? driveFolderUrl(folder.url) : null;
  const [editing, setEditing] = useState(!linkedUrl);
  const [url, setUrl] = useState(folder?.url ?? "");
  const [label, setLabel] = useState(folder?.label ?? "");
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const save = () => {
    const normalized = driveFolderUrl(url);
    if (!normalized) {
      setError(
        parseDriveLink(url)?.kind === "file"
          ? "Ese enlace es de un archivo. Pega el enlace de la carpeta."
          : "No parece un enlace de carpeta de Google Drive (drive.google.com/drive/folders/…).",
      );
      return;
    }
    onSave({ url: normalized, ...(label.trim() ? { label: label.trim() } : {}), linkedAt: new Date().toISOString() });
    setUrl(normalized);
    setEditing(false);
    setJustSaved(true);
  };

  const startEdit = () => {
    setUrl(folder?.url ?? "");
    setLabel(folder?.label ?? "");
    setError(null);
    setJustSaved(false);
    setEditing(true);
  };

  const unlink = () => {
    if (!window.confirm("¿Desvincular la carpeta de facturas? Los gastos y sus enlaces a documentos se conservan. No se borra nada en Google Drive.")) return;
    onUnlink();
    setUrl("");
    setLabel("");
    setJustSaved(false);
    setEditing(true);
  };

  return (
    <section className="re-card p-4 space-y-3" aria-labelledby="drive-folder-title">
      <div className="flex flex-wrap sm:flex-nowrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--brand-soft)", color: "var(--brand)" }} aria-hidden="true">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h4 id="drive-folder-title" className="text-sm font-extrabold text-ink">Carpeta de facturas en Google Drive</h4>
          {!editing && linkedUrl ? (
            <>
              <p className="text-sm font-semibold text-ink truncate mt-0.5">{folder?.label || "Carpeta de Google Drive"}</p>
              <p className="text-[11px] text-ink-subtle truncate" title={linkedUrl}>{linkedUrl}</p>
            </>
          ) : (
            <p className="text-[11px] text-ink-subtle mt-0.5">
              Pega el enlace de la carpeta donde guardas las facturas de esta operación.
            </p>
          )}
        </div>
        {!editing && linkedUrl ? (
          <div className="flex w-full sm:w-auto flex-wrap items-center sm:justify-end gap-1.5 shrink-0 pl-12 sm:pl-0">
            <a
              href={linkedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors"
              style={{ background: "var(--brand)" }}
            >
              Abrir carpeta ↗
            </a>
            <button type="button" onClick={startEdit} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-[var(--surface-alt)] transition-colors">
              Cambiar enlace
            </button>
            <button type="button" onClick={unlink} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-subtle hover:text-[var(--negative)] transition-colors">
              Desvincular
            </button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <form
          className="space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid gap-2.5 sm:grid-cols-[1fr_14rem]">
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-semibold text-ink-subtle">Enlace de la carpeta</span>
              <input
                className={FIELD_CLS}
                inputMode="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                placeholder="https://drive.google.com/drive/folders/…"
                aria-invalid={!!error}
              />
            </label>
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-semibold text-ink-subtle">Nombre para reconocerla <span className="font-normal">(opcional)</span></span>
              <input className={FIELD_CLS} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Facturas Calle Mayor 12" />
            </label>
          </div>
          {error ? <p className="text-[11px] text-[var(--negative)]">{error}</p> : null}
          <PermissionsNotice />
          <div className="flex items-center justify-end gap-2">
            {linkedUrl ? (
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-ink hover:bg-[var(--surface-alt)] transition-colors">
                Cancelar
              </button>
            ) : null}
            <button type="submit" className="rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition-colors" style={{ background: "var(--brand)" }}>
              Guardar carpeta
            </button>
          </div>
        </form>
      ) : linkedUrl ? (
        justSaved ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--positive)]">Carpeta asociada a esta operación.</p>
            <PermissionsNotice />
          </div>
        ) : (
          <p className="text-[11px] text-ink-subtle">
            Invergravital no modifica los permisos de Drive: para que tus inversores vean las facturas, compártelas desde Google Drive.
          </p>
        )
      ) : null}
    </section>
  );
}

export default DriveFolderCard;

"use client";

// Vista de un SNAPSHOT de inversor (solo lectura, datos ya filtrados por el
// propietario). No recibe el JSON de la operación: solo lo publicado. Los archivos
// (fotos/vídeos/facturas) se resuelven con signed URL bajo la Storage policy de
// share activo. Nada se recalcula aquí (los KPIs vienen ya computados).

import { useEffect, useState } from "react";
import { fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";
import { ProgressBar } from "@/src/components/ui/ProgressBar";
import { StatTile } from "@/src/components/ui/StatTile";
import { signedUrl } from "@/src/lib/storage";
import type { InvestorSnapshot, SnapshotFile } from "@/src/lib/shares";

function useFileUrl(file: SnapshotFile): string | null {
  const [url, setUrl] = useState<string | null>("url" in file ? file.url : null);
  useEffect(() => {
    let active = true;
    if ("bucket" in file) {
      signedUrl(file.bucket, file.path).then((u) => { if (active) setUrl(u); });
    }
    return () => { active = false; };
  }, [file]);
  return url;
}

function MediaItem({ type, caption, file }: { type: string; caption?: string; file: SnapshotFile }) {
  const url = useFileUrl(file);
  return (
    <figure className="re-card overflow-hidden">
      <div className="relative aspect-video bg-[var(--surface-alt)] flex items-center justify-center">
        {!url ? (
          <span className="text-[11px] text-ink-subtle">Cargando…</span>
        ) : type === "FOTO" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={caption ?? "Foto"} className="h-full w-full object-cover" />
        ) : (
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 text-brand">
            <span className="text-2xl">▶</span><span className="text-xs font-semibold">Ver vídeo</span>
          </a>
        )}
      </div>
      {caption ? <figcaption className="px-2.5 py-2 text-xs text-ink truncate">{caption}</figcaption> : null}
    </figure>
  );
}

function InvoiceLink({ file }: { file: SnapshotFile }) {
  const url = useFileUrl(file);
  if (!url) return <span className="text-[11px] text-ink-subtle">…</span>;
  return <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand hover:underline">Factura</a>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-subtle">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--line)] last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-sm font-bold tabular-nums text-ink">{value}</span>
    </div>
  );
}

const pctOrDash = (v: number | null | undefined) => (v == null ? "—" : fmtPct(v));
const eurOrDash = (v: number | null | undefined) => (v == null ? "—" : fmtEUR(v));

export function InvestorSnapshotView({ snapshot }: { snapshot: InvestorSnapshot }) {
  const s = snapshot;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{s.name}</h1>
        {s.address ? <p className="text-sm text-ink-subtle">{s.address}</p> : null}
      </div>

      {s.finance ? (
        <Section title="Resumen financiero">
          <div className="grid grid-cols-2 gap-2.5">
            {s.finance.costesTotales != null ? <StatTile label="Costes totales" value={fmtEUR(s.finance.costesTotales)} /> : null}
            {s.finance.ingresos != null ? <StatTile label="Ingresos cobrados" value={fmtEUR(s.finance.ingresos)} tone="positive" /> : null}
            {s.finance.pendientePago != null ? <StatTile label="Pendiente pago" value={fmtEUR(s.finance.pendientePago)} tone="accent" /> : null}
            {s.finance.pendienteCobro != null ? <StatTile label="Pendiente cobro" value={fmtEUR(s.finance.pendienteCobro)} tone="accent" /> : null}
          </div>
        </Section>
      ) : null}

      {s.progreso ? (
        <Section title="Avance">
          <div className="space-y-2.5">
            <ProgressBar label="Obra ejecutada" value={s.progreso.obraPct} tone="brand" />
            <ProgressBar label="Licencias" value={s.progreso.licenciasPct} tone="brand" />
            <ProgressBar label="Ventas cerradas" value={s.progreso.ventasCerradasPct} tone="positive" />
            <ProgressBar label="Tiempo transcurrido" value={s.progreso.tiempoTranscurridoPct} tone="warning" sublabel={s.progreso.daysRemaining != null ? `${s.progreso.daysRemaining} días restantes (est.)` : undefined} />
          </div>
        </Section>
      ) : null}

      {s.rentabilidad ? (
        <Section title="Rentabilidad">
          <div className="re-card p-3">
            {s.rentabilidad.estimada !== undefined ? <Row label="Estimada" value={pctOrDash(s.rentabilidad.estimada)} /> : null}
            {s.rentabilidad.real !== undefined ? <Row label="Real" value={pctOrDash(s.rentabilidad.real)} /> : null}
            {s.rentabilidad.promotorBenef !== undefined ? <Row label="Beneficio promotor (est.)" value={eurOrDash(s.rentabilidad.promotorBenef)} /> : null}
            {s.rentabilidad.inversorBenef !== undefined ? <Row label="Beneficio inversor (est.)" value={eurOrDash(s.rentabilidad.inversorBenef)} /> : null}
          </div>
        </Section>
      ) : null}

      {s.ventas && s.ventas.length > 0 ? (
        <Section title="Estado de ventas">
          <div className="re-card p-3 divide-y divide-[var(--line)]">
            {s.ventas.map((v, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{v.title}</p>
                  {v.price != null ? <p className="text-xs text-ink-subtle">{fmtEUR(v.price)}</p> : null}
                </div>
                <span className={`pill ${v.status === "VENDIDO" ? "pill-positive" : v.status === "DISPONIBLE" ? "pill-neutral" : "pill-info"}`}>{v.statusLabel}</span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {s.gastos && s.gastos.length > 0 ? (
        <Section title="Gastos">
          <div className="re-card p-3 divide-y divide-[var(--line)]">
            {s.gastos.map((g, i) => (
              <div key={i} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{g.concept}</p>
                  <p className="text-xs text-ink-subtle">{g.category}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {g.invoice ? <InvoiceLink file={g.invoice} /> : null}
                  {g.amount != null ? <span className="text-sm font-bold tabular-nums text-ink">{fmtEUR(g.amount)}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {s.hitos && s.hitos.length > 0 ? (
        <Section title="Hitos">
          <div className="re-card p-3 divide-y divide-[var(--line)]">
            {s.hitos.map((m, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <span className="text-sm text-ink">{m.title}</span>
                <span className={`pill ${m.status === "COMPLETADO" ? "pill-positive" : m.status === "DESVIADO" ? "pill-negative" : "pill-info"}`}>{m.status}</span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {s.media && s.media.length > 0 ? (
        <Section title="Fotos y vídeos">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {s.media.map((m, i) => <MediaItem key={i} type={m.type} caption={m.caption} file={m.file} />)}
          </div>
        </Section>
      ) : null}

      <p className="text-[11px] text-ink-subtle text-center pt-2">Informe generado desde Invergravital · datos según permisos del promotor.</p>
    </div>
  );
}

export default InvestorSnapshotView;

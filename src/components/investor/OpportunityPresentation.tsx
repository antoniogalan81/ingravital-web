"use client";

// Presentación de una oportunidad para el INVERSOR.
//
// No es una pantalla administrativa: es la ficha con la que se decide invertir.
// Se genera automáticamente a partir de lo que el promotor ha autorizado — cada
// bloque aparece solo si viene en el snapshot, y el snapshot ya viene filtrado por
// el servidor. Aquí NO se filtra nada: si un dato llega, es porque está autorizado.
//
// Diseñada primero para móvil: la mayoría de inversores la abre desde WhatsApp.

import { useEffect, useState } from "react";
import { fmtEUR, fmtPct } from "@/src/lib/realEstateCalc";
import { signedUrl } from "@/src/lib/storage";
import { ProjectExpenses } from "@/src/components/realEstate/economics/ProjectExpenses";
import { ProjectSales } from "@/src/components/realEstate/economics/ProjectSales";
import {
  INVESTMENT_MODEL_LABEL,
  type InvestorSnapshot,
  type MediaRef,
} from "@/src/lib/investorPlatform/types";

/** Resuelve un MediaRef a URL mostrable (firmada y temporal si está en Storage). */
function useMediaUrl(file: MediaRef): string | null {
  const [url, setUrl] = useState<string | null>(file.kind === "url" ? file.url : null);
  useEffect(() => {
    let active = true;
    if (file.kind === "storage") {
      void signedUrl(file.bucket, file.path).then((u) => {
        if (active) setUrl(u);
      });
    }
    return () => {
      active = false;
    };
  }, [file]);
  return url;
}

function MediaTile({ item }: { item: NonNullable<InvestorSnapshot["media"]>[number] }) {
  const url = useMediaUrl(item.file);
  return (
    <figure className="relative overflow-hidden rounded-xl bg-[var(--surface-alt)] aspect-[4/3]">
      {!url ? (
        <div className="absolute inset-0 grid place-items-center text-[11px] text-ink-subtle">Cargando…</div>
      ) : item.type === "VIDEO" ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 grid place-items-center gap-1 text-brand"
        >
          <span className="text-3xl">▶</span>
          <span className="text-xs font-semibold">Ver vídeo</span>
        </a>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={item.caption ?? "Imagen del proyecto"} className="absolute inset-0 h-full w-full object-cover" />
      )}
      {item.caption ? (
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-[11px] font-medium text-white">
          {item.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function KeyFigure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle">{label}</p>
      <p className="mt-1 text-xl font-extrabold tabular-nums text-ink tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-ink-subtle">{title}</h2>
      {children}
    </section>
  );
}

function Bar({ pct, label }: { pct: number | null; label: string }) {
  if (pct == null) return null;
  const v = Math.round(Math.max(0, Math.min(1, pct)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-ink">{label}</span>
        <span className="tabular-nums text-ink-muted">{v}%</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-[var(--surface-alt)] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${v}%`, background: "var(--brand)" }} />
      </div>
    </div>
  );
}

const money = (v: number | null | undefined) => (v == null ? "—" : fmtEUR(v));
const pct = (v: number | null | undefined) => (v == null ? "—" : fmtPct(v));

export function OpportunityPresentation({ snapshot }: { snapshot: InvestorSnapshot }) {
  const s = snapshot;
  const cover = s.media?.[0];
  const rest = s.media?.slice(1) ?? [];

  const captacionPct =
    s.captacion && s.targetCapital && s.targetCapital > 0
      ? Math.min(1, (s.captacion.comprometido + s.captacion.invertido) / s.targetCapital)
      : null;

  return (
    <article className="space-y-8">
      {/* ── Portada ── */}
      <header className="overflow-hidden rounded-2xl border border-line bg-white">
        {cover ? (
          <div className="relative aspect-[16/9] sm:aspect-[21/9]">
            <MediaTile item={cover} />
          </div>
        ) : null}
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill pill-info">{INVESTMENT_MODEL_LABEL[s.investmentModel]}</span>
            {s.location ? <span className="pill pill-neutral">{s.location}</span> : null}
          </div>
          <h1 className="mt-3 text-2xl sm:text-4xl font-extrabold tracking-tight text-ink leading-tight">
            {s.title}
          </h1>
          {s.summary ? (
            <p className="mt-3 text-[15px] leading-relaxed text-ink-muted max-w-2xl">{s.summary}</p>
          ) : null}
        </div>
      </header>

      {/* ── Cifras clave de la oferta ── */}
      <Block title="La oferta">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <KeyFigure label="Rentabilidad ofrecida" value={s.offeredYieldPct == null ? "—" : `${s.offeredYieldPct}%`} />
          <KeyFigure label="Plazo" value={s.termMonths == null ? "—" : `${s.termMonths} meses`} />
          <KeyFigure label="Ticket mínimo" value={money(s.minTicket)} />
          <KeyFigure
            label="Capital buscado"
            value={money(s.targetCapital)}
            hint={s.targetTicket ? `Ticket objetivo ${fmtEUR(s.targetTicket)}` : undefined}
          />
        </div>
      </Block>

      {/* ── Estado de captación (solo si está autorizado; cifras REALES) ── */}
      {s.captacion ? (
        <Block title="Estado de captación">
          <div className="re-card p-5 space-y-3">
            <Bar pct={captacionPct} label="Financiado" />
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <KeyFigure label="Invertido" value={money(s.captacion.invertido)} />
              <KeyFigure label="Comprometido" value={money(s.captacion.comprometido)} />
              <KeyFigure label="Inversores" value={String(s.captacion.inversores)} />
            </div>
          </div>
        </Block>
      ) : null}

      {/* ── Estrategia y riesgos ── */}
      {s.strategy || s.risks ? (
        <Block title="Estrategia y riesgos">
          <div className="grid md:grid-cols-2 gap-3">
            {s.strategy ? (
              <div className="re-card p-5">
                <p className="text-sm font-bold text-ink mb-1.5">Estrategia</p>
                <p className="text-sm leading-relaxed text-ink-muted whitespace-pre-line">{s.strategy}</p>
              </div>
            ) : null}
            {s.risks ? (
              <div className="re-card p-5 border-l-4" style={{ borderLeftColor: "var(--warning)" }}>
                <p className="text-sm font-bold text-ink mb-1.5">Principales riesgos</p>
                <p className="text-sm leading-relaxed text-ink-muted whitespace-pre-line">{s.risks}</p>
              </div>
            ) : null}
          </div>
        </Block>
      ) : null}

      {/* ── Condiciones económicas ── */}
      <Block title="Condiciones">
        <dl className="re-card divide-y divide-[var(--line)]">
          {[
            ["Modelo de inversión", INVESTMENT_MODEL_LABEL[s.investmentModel]],
            ["Inicio previsto", s.startDate ?? "—"],
            ["Devolución prevista", s.returnDate ?? "—"],
            ["Garantía", s.guarantee ?? "—"],
            ["Rango de la garantía", s.guaranteeRank ?? "—"],
            ["Cancelación anticipada", s.earlyCancellation ?? "—"],
            ["Otras condiciones", s.conditions ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3">
              <dt className="text-sm font-semibold text-ink">{k}</dt>
              <dd className="text-sm text-ink-muted text-right max-w-[60%] whitespace-pre-line">{v}</dd>
            </div>
          ))}
        </dl>
      </Block>

      {/* ── Avance del proyecto ── */}
      {s.progreso ? (
        <Block title="Avance del proyecto">
          <div className="re-card p-5 space-y-3">
            <Bar pct={s.progreso.obraPct} label="Obra" />
            <Bar pct={s.progreso.licenciasPct} label="Licencias" />
            <Bar pct={s.progreso.ventasCerradasPct} label="Ventas cerradas" />
            <Bar pct={s.progreso.tiempoTranscurridoPct} label="Tiempo transcurrido" />
            {s.progreso.daysRemaining != null ? (
              <p className="text-xs text-ink-subtle pt-1">
                Quedan <b className="tabular-nums">{s.progreso.daysRemaining}</b> días sobre el plazo previsto.
              </p>
            ) : null}
          </div>
        </Block>
      ) : null}

      {/* ── Datos financieros autorizados ── */}
      {s.costesTotales != null ||
      s.ingresos != null ||
      s.rentabilidadEstimada != null ||
      s.rentabilidadReal != null ||
      s.rentabilidadInversor != null ? (
        <Block title="Datos financieros">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
            {s.costesTotales != null ? <KeyFigure label="Costes totales" value={money(s.costesTotales)} /> : null}
            {s.ingresos != null ? <KeyFigure label="Ingresos obtenidos" value={money(s.ingresos)} /> : null}
            {s.pendientePago != null ? <KeyFigure label="Pendiente de pago" value={money(s.pendientePago)} /> : null}
            {s.pendienteCobro != null ? <KeyFigure label="Pendiente de cobro" value={money(s.pendienteCobro)} /> : null}
            {s.rentabilidadEstimada != null ? (
              <KeyFigure label="Rentabilidad estimada" value={pct(s.rentabilidadEstimada)} hint="del proyecto" />
            ) : null}
            {s.rentabilidadReal != null ? (
              <KeyFigure label="Rentabilidad real" value={pct(s.rentabilidadReal)} hint="a día de hoy" />
            ) : null}
            {s.rentabilidadInversor != null ? (
              <KeyFigure label="Rentabilidad del inversor" value={pct(s.rentabilidadInversor)} />
            ) : null}
          </div>
          <p className="text-[11px] text-ink-subtle">
            La rentabilidad <b>del proyecto</b> no es la rentabilidad <b>ofrecida al inversor</b>: esta última
            es la del bloque «La oferta».
          </p>
        </Block>
      ) : null}

      {/* ── Cronograma ── */}
      {s.hitos?.length ? (
        <Block title="Cronograma">
          <ol className="re-card p-5 space-y-0">
            {s.hitos.map((h, i) => (
              <li key={`${h.title}-${i}`} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span
                    className="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0"
                    style={{
                      background:
                        h.status === "COMPLETADO"
                          ? "var(--positive)"
                          : h.status === "EN_CURSO"
                            ? "var(--warning)"
                            : h.status === "DESVIADO"
                              ? "var(--negative)"
                              : "var(--line-strong)",
                    }}
                  />
                  {i < (s.hitos?.length ?? 0) - 1 ? (
                    <span className="w-px flex-1 my-1" style={{ background: "var(--line)" }} />
                  ) : null}
                </div>
                <div className="flex-1 pb-4">
                  <p className="text-sm font-bold text-ink">{h.title}</p>
                  <p className="text-xs text-ink-subtle mt-0.5">{h.status}</p>
                </div>
              </li>
            ))}
          </ol>
        </Block>
      ) : null}

      {/* ── Ventas (mismo resumen que Gestión del proyecto) ── */}
      {s.ventas && "groups" in s.ventas && s.ventas.groups.length ? (
        <Block title="Ventas">
          <div className="re-card p-4 sm:p-5">
            <ProjectSales summary={s.ventas} />
          </div>
        </Block>
      ) : null}

      {/* ── Gastos (mismo resumen que Gestión del proyecto) ── */}
      {s.gastos && "categories" in s.gastos && s.gastos.categories.length ? (
        <Block title="Gastos">
          <div className="re-card p-4 sm:p-5">
            <ProjectExpenses summary={s.gastos} />
          </div>
        </Block>
      ) : null}

      {/* ── Galería ── */}
      {rest.length ? (
        <Block title="El proyecto en imágenes">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {rest.map((m, i) => (
              <MediaTile key={i} item={m} />
            ))}
          </div>
        </Block>
      ) : null}

      <p className="text-[11px] text-ink-subtle leading-relaxed border-t border-line pt-4">
        Información facilitada por el promotor y limitada a lo que ha autorizado compartir contigo.
        No constituye asesoramiento financiero ni una oferta vinculante. Generada el{" "}
        {new Date(s.generatedAt).toLocaleString("es-ES")}.
      </p>
    </article>
  );
}

export default OpportunityPresentation;

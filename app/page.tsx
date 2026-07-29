"use client";

import Link from "next/link";
import PublicShell from "@/components/PublicShell";
import AndroidDownload from "@/components/AndroidDownload";
import { ANDROID_DOWNLOAD_PATH } from "@/src/lib/androidRelease";

/* ───────────────────────────────────────────────────────────────────────────
   Landing pública premium de Invergravital. Chrome (header/footer/fondo) en
   PublicShell. Tema oscuro investment-tech. Mensaje claro: qué es, para qué
   sirve, que es GRATIS y dónde entrar — entendible en 5 segundos.
   Datos del panel = MOCK VISUAL de marketing (sin conexión al motor real).
   ─────────────────────────────────────────────────────────────────────────── */

const ENTRAR_URL = "/finanzas"; // pide login si no hay sesión
const OPORTUNIDADES_URL = "/oportunidades";
const COLABORAR_URL = "/servicios";

const DASH_KPIS = [
  { label: "Inversión total", value: "312.500 €", tone: "neutral" },
  { label: "Beneficio est.", value: "+74.300 €", tone: "positive" },
  { label: "Rentabilidad", value: "23,8 %", tone: "brand" },
  { label: "Financiación", value: "68 %", tone: "gold" },
];

const CHART_PATH = "M0,118 C26,108 40,103 56,99 C82,93 92,90 110,85 C134,78 148,66 168,60 C192,53 204,49 224,44 C250,38 262,26 282,22 C306,17 314,14 326,11";
const CHART_AREA = `${CHART_PATH} L326,128 L0,128 Z`;

// Beneficios clave — 3 pasos cortos (qué sirve, en 5 segundos).
const BENEFITS = [
  {
    title: "Analiza",
    desc: "Costes, reforma, financiación y rentabilidad real de cada operación.",
    icon: "M9 7h6M9 11h6m-6 4h3M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z",
  },
  {
    title: "Compara",
    desc: "Enfrenta escenarios lado a lado y elige el que protege tu capital.",
    icon: "M9 17V9m4 8V5m4 12v-6M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z",
  },
  {
    title: "Decide",
    desc: "Toma la decisión con datos antes de comprometer un euro.",
    icon: "M9 12l2 2 4-4m5.6 1A9 9 0 1112 3a9 9 0 019.6 8z",
  },
];

const PILARES = [
  {
    tag: "Núcleo",
    title: "Inversiones inmobiliarias",
    desc: "El motor de cálculo: costes, reforma, financiación, impuestos y rentabilidad real.",
    icon: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01",
  },
  {
    tag: "Decisión",
    title: "Comparador de escenarios",
    desc: "Pon varias operaciones frente a frente y detecta cuál rinde mejor.",
    icon: "M9 17V9m4 8V5m4 12v-6M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z",
  },
  {
    tag: "Pipeline",
    title: "Oportunidades",
    desc: "Tu cartera de operaciones potenciales, lista para compartir o profundizar.",
    icon: "M3 7h18M3 12h18M3 17h10",
  },
];

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d={d} />
    </svg>
  );
}

export default function Home() {
  return (
    <PublicShell active="home" contained={false}>
      {/* Glows decorativos del hero */}
      <div
        className="lp-glow lp-drift"
        aria-hidden
        style={{ top: "-120px", right: "-80px", width: "440px", height: "440px", background: "rgba(63,116,214,0.35)" }}
      />
      <div
        className="lp-glow lp-drift"
        aria-hidden
        style={{ top: "420px", left: "-140px", width: "380px", height: "380px", background: "rgba(45,212,166,0.16)", animationDelay: "-6s" }}
      />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-[1180px] items-center gap-14 px-5 pb-10 pt-12 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pt-20">
        <div>
          <span className="lp-rise lp-free" style={{ animationDelay: "0ms" }}>
            <span className="lp-pulse h-1.5 w-1.5 rounded-full bg-[var(--lp-positive)]" />
            Gratuita · 100% funcional · Sin tarjeta
          </span>

          <h1 className="lp-rise mt-6 text-4xl font-extrabold leading-[1.04] tracking-tight sm:text-5xl lg:text-[3.5rem]" style={{ animationDelay: "90ms" }}>
            Analiza operaciones
            <br />
            inmobiliarias con
            <br />
            <span className="lp-grad-text">precisión profesional</span>
          </h1>

          <p className="lp-rise mt-6 max-w-xl text-lg leading-relaxed text-[var(--lp-muted)]" style={{ animationDelay: "180ms" }}>
            Calcula rentabilidad, compara escenarios y decide con datos antes de
            comprometer capital. Una herramienta gratuita y profesional, sin
            funciones bloqueadas.
          </p>

          <div className="lp-rise mt-8 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: "270ms" }}>
            <Link href={ENTRAR_URL} className="lp-btn lp-btn-primary">
              Analizar una operación
              <Icon d="M13 7l5 5-5 5M18 12H6" className="h-4 w-4" />
            </Link>
            <Link href={OPORTUNIDADES_URL} className="lp-btn lp-btn-ghost">
              Ver oportunidades
            </Link>
          </div>

          <div className="lp-rise mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-[var(--lp-subtle)]" style={{ animationDelay: "360ms" }}>
            <span className="inline-flex items-center gap-2">
              <Icon d="M9 12l2 2 4-4m5.6 1A9 9 0 1112 3a9 9 0 019.6 8z" className="h-4 w-4 text-[var(--lp-positive)]" />
              Creada por inversores
            </span>
            <a href={ANDROID_DOWNLOAD_PATH} className="inline-flex items-center gap-2 underline-offset-4 transition-colors hover:text-[var(--lp-text)] hover:underline">
              <Icon d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" className="h-4 w-4" />
              Descargar para Android
            </a>
          </div>
        </div>

        {/* Panel / dashboard mock */}
        <div className="lp-rise relative" style={{ animationDelay: "240ms" }}>
          <DashboardMock />
          <div className="lp-floatcard lp-float absolute top-1/2 -left-9 hidden w-40 -translate-y-1/2 p-3.5 lg:block">
            <div className="lp-eyebrow !text-[0.6rem]">Riesgo</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-base font-bold text-[var(--lp-gold-light)]">Medio</span>
              <div className="flex gap-1">
                <span className="h-3 w-1.5 rounded-full bg-[var(--lp-gold)]" />
                <span className="h-3 w-1.5 rounded-full bg-[var(--lp-gold)]" />
                <span className="h-3 w-1.5 rounded-full bg-white/15" />
              </div>
            </div>
          </div>
          <div className="lp-floatcard lp-float-slow absolute -right-7 top-[38%] hidden w-44 p-3.5 lg:block" style={{ animationDelay: "-3s" }}>
            <div className="lp-eyebrow !text-[0.6rem]">Cashflow neto</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-[var(--lp-positive)]">+1.180 €</span>
              <span className="text-xs text-[var(--lp-subtle)]">/mes</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Banda "gratis" premium ───────────────────────────────────────── */}
      <section className="mx-auto max-w-[1180px] px-5 pt-6 sm:px-8">
        <div className="lp-reveal lp-free-band flex flex-col items-center gap-5 px-6 py-7 sm:flex-row sm:justify-between sm:px-10">
          <div>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Gratuita y 100% funcional</h2>
            <p className="mt-1.5 text-sm text-[var(--lp-muted)]">
              Accede a todas las herramientas sin pagar ni introducir tarjeta. No es
              una demo ni una prueba temporal.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {["Sin tarjeta", "Sin funciones bloqueadas", "Sin letra pequeña"].map((t) => (
              <span key={t} className="lp-pill-static">
                <Icon d="M9 12l2 2 4-4m5.6 1A9 9 0 1112 3a9 9 0 019.6 8z" className="h-3.5 w-3.5 text-[var(--lp-positive)]" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Beneficios clave ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-24">
        <div className="grid gap-5 sm:grid-cols-3">
          {BENEFITS.map((b, i) => (
            <div key={b.title} className="lp-reveal lp-card p-7" data-delay={i * 90}>
              <span className="lp-card-icon h-11 w-11">
                <Icon d={b.icon} />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-[var(--lp-text)]">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lp-muted)]">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pilares de la plataforma ─────────────────────────────────────── */}
      <section id="plataforma" className="mx-auto max-w-[1180px] px-5 pb-20 sm:px-8 sm:pb-24">
        <div className="lp-reveal max-w-2xl">
          <p className="lp-eyebrow">Plataforma</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Todo lo que necesitas para decidir
          </h2>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PILARES.map((m, i) => (
            <div key={m.title} className="lp-reveal lp-card flex flex-col gap-5 p-7" data-delay={i * 80}>
              <span className="lp-card-icon h-12 w-12 shrink-0">
                <Icon d={m.icon} className="h-6 w-6" />
              </span>
              <div>
                <span className="lp-chip" style={{ background: "rgba(63,116,214,0.16)", color: "var(--lp-brand-light)" }}>
                  {m.tag}
                </span>
                <h3 className="mt-2.5 text-xl font-semibold text-[var(--lp-text)]">{m.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--lp-muted)]">{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA final ────────────────────────────────────────────────────── */}
      <AndroidDownload />

      <section className="mx-auto max-w-[1180px] px-5 pb-24 sm:px-8">
        <div className="lp-reveal lp-glass relative overflow-hidden px-6 py-16 text-center sm:px-10 sm:py-20">
          <div className="lp-glow" aria-hidden style={{ inset: "auto", bottom: "-120px", left: "50%", transform: "translateX(-50%)", width: "520px", height: "320px", background: "rgba(63,116,214,0.28)" }} />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-[2.6rem] sm:leading-tight">
              Analiza primero. <span className="lp-grad-text">Decide después.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-[var(--lp-muted)]">
              Crea tu primera operación sin coste ni tarjeta. Cuando los números
              encajen, compártela con quien quieras —o con nosotros.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={ENTRAR_URL} className="lp-btn lp-btn-primary">
                Analizar una operación
                <Icon d="M13 7l5 5-5 5M18 12H6" className="h-4 w-4" />
              </Link>
              <Link href={COLABORAR_URL} className="lp-btn lp-btn-ghost">
                Compartir un proyecto
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

/* ── Mockup del dashboard (presentación visual, sin datos reales) ─────────────── */
function DashboardMock() {
  const toneColor: Record<string, string> = {
    neutral: "var(--lp-text)",
    positive: "var(--lp-positive)",
    brand: "var(--lp-brand-light)",
    gold: "var(--lp-gold-light)",
  };
  return (
    <div className="lp-dash">
      <div className="flex items-center justify-between border-b border-[var(--lp-line)] px-5 py-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--lp-text)]">
            Rehabilitación integral · Calle Zafiro, 45
          </div>
          <div className="text-xs text-[var(--lp-subtle)]">Compra · Reforma · Venta</div>
        </div>
        <span className="lp-chip shrink-0" style={{ background: "rgba(45,212,166,0.14)", color: "var(--lp-positive)" }}>
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--lp-positive)]" />
          Operación viable
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 p-5 sm:grid-cols-4">
        {DASH_KPIS.map((k) => (
          <div key={k.label} className="lp-tile p-3">
            <div className="text-[0.62rem] font-semibold uppercase tracking-wide text-[var(--lp-subtle)]">
              {k.label}
            </div>
            <div className="mt-1 text-base font-bold tabular-nums" style={{ color: toneColor[k.tone] }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 pb-3">
        <div className="lp-tile p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--lp-muted)]">Cashflow acumulado</span>
            <span className="lp-chip" style={{ background: "rgba(45,212,166,0.12)", color: "var(--lp-positive)" }}>
              <Icon d="M3 17l6-6 4 4 8-8" className="h-3 w-3" />
              +28,4 %
            </span>
          </div>
          <svg viewBox="0 0 326 128" className="h-28 w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="lpArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(45,212,166,0.35)" />
                <stop offset="100%" stopColor="rgba(45,212,166,0)" />
              </linearGradient>
              <linearGradient id="lpStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3f74d6" />
                <stop offset="100%" stopColor="#2dd4a6" />
              </linearGradient>
            </defs>
            <path d={CHART_AREA} fill="url(#lpArea)" />
            <path d={CHART_PATH} fill="none" stroke="url(#lpStroke)" strokeWidth={2.5} strokeLinecap="round" className="lp-chart-line" />
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 px-5 pb-5">
        <div className="lp-tile flex items-center justify-between p-3">
          <div>
            <div className="text-[0.62rem] uppercase tracking-wide text-[var(--lp-subtle)]">Escenario A</div>
            <div className="text-sm font-bold text-[var(--lp-positive)]">TIR 23,8 %</div>
          </div>
          <span className="lp-chip" style={{ background: "rgba(45,212,166,0.14)", color: "var(--lp-positive)" }}>Óptimo</span>
        </div>
        <div className="lp-tile flex items-center justify-between p-3">
          <div>
            <div className="text-[0.62rem] uppercase tracking-wide text-[var(--lp-subtle)]">Escenario B</div>
            <div className="text-sm font-bold text-[var(--lp-muted)]">TIR 17,1 %</div>
          </div>
          <span className="lp-chip" style={{ background: "rgba(255,255,255,0.06)", color: "var(--lp-muted)" }}>Alt.</span>
        </div>
      </div>

      <div className="border-t border-[var(--lp-line)] bg-white/[0.015] px-5 py-2.5 text-[0.68rem] text-[var(--lp-subtle)]">
        Datos de ejemplo — analiza tu operación para ver tus números reales.
      </div>
    </div>
  );
}

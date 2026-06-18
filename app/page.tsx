import Link from "next/link";
import SiteShell from "@/components/SiteShell";

const ANDROID_URL = "https://github.com/antoniogalan81/ingravital-web/releases/download/v1.0/ingravital.apk";

// Ruta real del módulo de análisis. /finanzas redirige a /login si no hay sesión.
const ANALIZAR_URL = "/finanzas";
const SERVICIOS_URL = "/servicios";

// "De oportunidad a decisión" — tres pasos cortos.
const FLOW_CARDS = [
  {
    title: "Calcula",
    desc: "Costes, financiación y rentabilidad.",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 7h6M9 11h6m-6 4h3M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" />,
  },
  {
    title: "Visualiza",
    desc: "Gráficos y métricas claras.",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17V9m4 8V5m4 12v-6M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />,
  },
  {
    title: "Comparte",
    desc: "Ficha lista para socios o inversores.",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8.7 10.7l6.6-3.4M8.7 13.3l6.6 3.4M18 8a3 3 0 10-6 0 3 3 0 006 0zm0 8a3 3 0 10-6 0 3 3 0 006 0zM9 12a3 3 0 11-6 0 3 3 0 016 0z" />,
  },
];

// Bloques de valor — qué aporta la app vs. qué aportamos nosotros.
const APP_BENEFITS = [
  "Analiza compras, reformas, financiación y rentabilidad.",
  "Compara distintos escenarios antes de invertir.",
  "Ordena tus números en un solo sitio.",
  "Reduce errores antes de tomar decisiones.",
];
const WE_OFFER = [
  "Experiencia real en compra, reforma y venta de inmuebles.",
  "Revisión profesional de operaciones inmobiliarias.",
  "Posibles colaboraciones si la operación encaja.",
  "Estudio de oportunidades con sentido inversor.",
];

const ANALYZE_CHIPS = [
  "Viviendas para alquiler",
  "Compra, reforma y venta",
  "Locales convertibles",
  "Suelos y terrenos",
  "Edificios completos",
  "Alquiler por habitaciones",
  "Promociones pequeñas",
  "Operaciones con financiación",
];

// Costes principales de la ficha (mock visual estático).
const COST_BARS = [
  { label: "Compra", pct: 72, eur: "225.000 €", color: "bg-slate-800" },
  { label: "Obra", pct: 18, eur: "56.000 €", color: "bg-emerald-500" },
  { label: "Gastos", pct: 10, eur: "31.000 €", color: "bg-blue-500" },
];

// Gráfico simple simulado — cashflow acumulado (alturas en %).
const CHART_BARS = [34, 48, 56, 67, 79, 100];

export default function Home() {
  return (
    <SiteShell active="home">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="grid gap-10 lg:grid-cols-2 lg:gap-16 lg:items-center">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Análisis inmobiliario gratuito
          </span>

          <h1 className="mt-5 text-4xl sm:text-5xl lg:text-[3.3rem] font-bold leading-[1.08] tracking-tight text-slate-900">
            Invierte con
            <br />
            mejores números
          </h1>

          <p className="mt-5 text-lg text-slate-600">
            Una app gratuita para analizar operaciones inmobiliarias, comparar
            escenarios y tomar decisiones con más claridad.
          </p>

          <p className="mt-5 inline-flex rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
            Gratis · Sin compromiso · Creada por inversores
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href={ANALIZAR_URL}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-7 py-3.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Empezar gratis
            </Link>
            <Link
              href={SERVICIOS_URL}
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-7 py-3.5 text-sm font-semibold text-slate-800 hover:border-slate-400 hover:bg-slate-50 transition-colors"
            >
              Compartir oportunidad
            </Link>
          </div>

          <p className="mt-6 text-sm text-slate-400">
            ¿Móvil?{" "}
            <a href={ANDROID_URL} download="ingravital.apk" className="text-slate-500 underline hover:text-slate-700">
              Descargar para Android
            </a>
          </p>
        </div>

        {/* Panel de análisis de ejemplo (mock estático) */}
        <div className="lg:justify-self-end w-full max-w-md">
          <div className="rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">Edificio Centro · 4 viviendas</div>
                <div className="text-xs text-slate-400">Compra, reforma y venta</div>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                Ejemplo
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 p-5">
              <div className="rounded-xl bg-emerald-50 p-3">
                <div className="text-[9px] font-medium uppercase tracking-wide text-emerald-600">Rent.</div>
                <div className="text-base font-bold tabular-nums text-emerald-700">8,4 %</div>
              </div>
              <div className="rounded-xl bg-blue-50 p-3">
                <div className="text-[9px] font-medium uppercase tracking-wide text-blue-600">Margen</div>
                <div className="text-base font-bold tabular-nums text-blue-700">23,8 %</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Inv.</div>
                <div className="text-base font-bold tabular-nums text-slate-900">312k</div>
              </div>
            </div>

            {/* Gráfico simple simulado */}
            <div className="flex items-end justify-between gap-1.5 px-5 pb-5 h-24">
              {CHART_BARS.map((h, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-t-md ${i === CHART_BARS.length - 1 ? "bg-emerald-500" : "bg-slate-200"}`}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>

            <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] text-slate-400">
              Datos de ejemplo — analiza tu operación para ver tus números.
            </div>
          </div>
        </div>
      </section>

      {/* ── De oportunidad a decisión ────────────────────────────────────── */}
      <section className="mt-20 sm:mt-28">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          De oportunidad a decisión
        </h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {FLOW_CARDS.map((c) => (
            <div
              key={c.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">{c.icon}</svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{c.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Ficha lista para compartir ───────────────────────────────────── */}
      <section className="mt-20 sm:mt-28">
        <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-6 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-12 lg:items-center">
            {/* Texto corto */}
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                Compartible con inversores
              </span>
              <h2 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Ficha lista para compartir
              </h2>
              <p className="mt-3 text-slate-600">
                Convierte una oportunidad en una ficha clara con números, gráficos y resumen visual.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Compártela con socios, inversores o con nuestro equipo.
              </p>
            </div>

            {/* Ficha visual mock */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Resumen de inversión</div>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">PDF · Link</span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  ["Inversión", "312.000 €", "text-slate-900"],
                  ["Rentabilidad", "8,4 %", "text-emerald-700"],
                  ["Margen", "23,8 %", "text-blue-700"],
                ].map(([k, v, cls]) => (
                  <div key={k} className="rounded-lg bg-slate-50 p-2.5">
                    <div className="text-[9px] font-medium uppercase tracking-wide text-slate-400">{k}</div>
                    <div className={`text-sm font-bold tabular-nums ${cls}`}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Costes principales — barras */}
              <div className="mt-4 space-y-2">
                <div className="text-[11px] font-medium text-slate-400">Costes principales</div>
                {COST_BARS.map((b) => (
                  <div key={b.label} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-xs text-slate-500">{b.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${b.color}`} style={{ width: `${b.pct}%` }} />
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-600">{b.eur}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Qué puedes analizar ──────────────────────────────────────────── */}
      <section className="mt-20 sm:mt-28">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Qué puedes analizar
        </h2>
        <div className="mt-6 flex flex-wrap gap-2.5">
          {ANALYZE_CHIPS.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
            >
              {chip}
            </span>
          ))}
        </div>
      </section>

      {/* ── Qué aporta cada parte — dos bloques ──────────────────────────── */}
      <section className="mt-20 sm:mt-28">
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Bloque 1 — la app */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
              App gratuita
            </span>
            <h2 className="mt-4 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Qué te aporta la app
            </h2>
            <ul className="mt-5 space-y-3">
              {APP_BENEFITS.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-slate-600">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.6 1A9 9 0 1112 3a9 9 0 019.6 8z" />
                  </svg>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Bloque 2 — nosotros */}
          <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-6 shadow-sm sm:p-8">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
              Colaboración win-win
            </span>
            <h2 className="mt-4 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Qué podemos aportarte nosotros
            </h2>
            <ul className="mt-5 space-y-3">
              {WE_OFFER.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-slate-600">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.6 1A9 9 0 1112 3a9 9 0 019.6 8z" />
                  </svg>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── CTA final ────────────────────────────────────────────────────── */}
      <section className="mt-20 sm:mt-28">
        <div className="rounded-3xl bg-slate-900 px-6 py-14 text-center sm:px-10">
          <h2 className="mx-auto max-w-2xl text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Cada operación compite por tu capital
          </h2>
          <p className="mx-auto mt-3 max-w-md text-slate-300">
            Calcula antes de entrar. Comparte si encaja.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={ANALIZAR_URL}
              className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition-colors"
            >
              Analizar operación
            </Link>
            <Link
              href={SERVICIOS_URL}
              className="inline-flex items-center justify-center rounded-full border border-slate-600 px-8 py-3.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Tengo una oportunidad
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

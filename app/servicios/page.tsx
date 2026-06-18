import Link from "next/link";
import SiteShell from "@/components/SiteShell";

const ANALIZAR_URL = "/finanzas";
const WHATSAPP_URL = "https://wa.me/34656195880";

// "Qué podemos aportar" — tarjetas muy cortas.
const APORTES = [
  { title: "Análisis", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17V9m4 8V5m4 12v-6M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" /> },
  { title: "Capital", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.66 0-3 .9-3 2s1.34 2 3 2 3 .9 3 2-1.34 2-3 2m0-8c1.1 0 2.08.4 2.6 1M12 8V6m0 10v2m0-2c-1.1 0-2.08-.4-2.6-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
  { title: "Inversores", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-1a4 4 0 00-3-3.87M9 20H4v-1a4 4 0 013-3.87m6-6a3 3 0 11-6 0 3 3 0 016 0zm6 1a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" /> },
  { title: "Experiencia", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 14l9-5-9-5-9 5 9 5zm0 0v7m-5-9.5V17l5 2.5 5-2.5v-5.5" /> },
  { title: "Riesgos", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.6 1A9 9 0 1112 3a9 9 0 019.6 8z" /> },
  { title: "Estructura", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /> },
];

// "Cómo funciona" — pasos cortos.
const STEPS = [
  { title: "Calculas", desc: "Los números en la app." },
  { title: "Visualizas", desc: "Gráficos y resumen claro." },
  { title: "Compartes", desc: "Envías la ficha a cualquier inversor." },
  { title: "Analizamos", desc: "Revisamos la operación." },
  { title: "Nos reunimos", desc: "Si encaja, cita." },
  { title: "Valoramos", desc: "Colaboración o capital." },
];

// "Operaciones que nos interesan" — chips.
const INTEREST_CHIPS = [
  "Margen real",
  "Descuento sobre mercado",
  "Cambio de uso de local",
  "Reforma y venta",
  "Potencial de alquiler",
  "Suelos o edificios con recorrido",
  "Riesgo compensado",
];

export default function Servicios() {
  return (
    <SiteShell active="servicios">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="py-6 sm:py-10">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Colaboración con criterio de inversión
          </span>
          <h1 className="mt-5 text-4xl sm:text-5xl font-bold leading-[1.08] tracking-tight text-slate-900">
            Comparte buenas operaciones.
            <br />
            Nosotros las analizamos.
          </h1>
          <p className="mt-5 text-lg text-slate-600">
            Envíanos una oportunidad con números claros y vemos si tiene sentido colaborar.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={ANALIZAR_URL}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-7 py-3.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Analizar operación
            </Link>
            <a
              href={WHATSAPP_URL}
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-7 py-3.5 text-sm font-semibold text-slate-800 hover:border-slate-400 hover:bg-slate-50 transition-colors"
            >
              Contactar
            </a>
          </div>
        </div>
      </section>

      {/* ── Qué podemos aportar ──────────────────────────────────────────── */}
      <section className="mt-16 sm:mt-24">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Qué podemos aportar
        </h2>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {APORTES.map((a) => (
            <div
              key={a.title}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">{a.icon}</svg>
              </div>
              <span className="text-sm font-semibold text-slate-900">{a.title}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Cómo funciona ────────────────────────────────────────────────── */}
      <section className="mt-20 sm:mt-28">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Cómo funciona
        </h2>
        <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[480px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="w-16 px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Paso
                </th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Acción
                </th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  En qué consiste
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {STEPS.map((step, i) => (
                <tr key={step.title} className="transition-colors hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white tabular-nums">
                      {i + 1}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-900">
                    {step.title}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">{step.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Comparte una operación bien preparada ────────────────────────── */}
      <section className="mt-20 sm:mt-28">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12 lg:items-center">
          {/* Texto + criterios */}
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Comparte una operación bien preparada
            </h2>
            <p className="mt-3 max-w-xl text-slate-600">
              Si la operación encaja sobre el papel, compártela con una ficha clara:
              costes, margen, escenarios y riesgos principales.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {INTEREST_CHIPS.map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {chip}
                </span>
              ))}
            </div>
          </div>

          {/* Mini ficha de operación — mock visual */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">Local · Cambio de uso</div>
                <div className="text-xs text-slate-400">Reforma y alquiler</div>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                Lista para revisar
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["Inversión", "148.000 €", "text-slate-900"],
                ["Rentabilidad", "9,1 %", "text-emerald-700"],
                ["Margen", "27,5 %", "text-blue-700"],
              ].map(([k, v, cls]) => (
                <div key={k} className="rounded-lg bg-slate-50 p-2.5">
                  <div className="text-[9px] font-medium uppercase tracking-wide text-slate-400">{k}</div>
                  <div className={`text-sm font-bold tabular-nums ${cls}`}>{v}</div>
                </div>
              ))}
            </div>

            {/* Gráfico simple simulado — escenarios */}
            <div className="mt-4">
              <div className="text-[11px] font-medium text-slate-400">Escenarios de salida</div>
              <div className="mt-2 flex items-end justify-between gap-1.5 h-16">
                {[42, 58, 71, 64, 88, 100].map((h, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t-md ${i === 5 ? "bg-emerald-500" : "bg-slate-200"}`}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {["Costes", "Margen", "Riesgos", "Plazos"].map((t) => (
                <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA final ────────────────────────────────────────────────────── */}
      <section className="mt-20 sm:mt-28 mb-4">
        <div className="rounded-3xl bg-slate-900 px-6 py-14 text-center sm:px-10">
          <h2 className="mx-auto max-w-2xl text-2xl sm:text-3xl font-bold tracking-tight text-white">
            ¿Tienes una operación que merece ser analizada?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-slate-300">
            Calcula los números. Si encaja, compártela.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={ANALIZAR_URL}
              className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition-colors"
            >
              Analizar operación
            </Link>
            <a
              href={WHATSAPP_URL}
              className="inline-flex items-center justify-center rounded-full border border-slate-600 px-8 py-3.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Contactar
            </a>
          </div>
          <p className="mx-auto mt-6 max-w-lg text-xs text-slate-400">
            Cada operación se estudia de forma individual. No financiamos cualquier
            propuesta: revisamos números, riesgos, plazos y viabilidad.
          </p>
        </div>
      </section>
    </SiteShell>
  );
}

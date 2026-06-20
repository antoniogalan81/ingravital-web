import Link from "next/link";
import PublicShell from "@/components/PublicShell";

const SUBIR_URL = "/finanzas"; // crear/analizar la operación (pide login)
const INFORMES_URL = "/informes";
const WHATSAPP_URL = "https://wa.me/34656195880";

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d={d} />
    </svg>
  );
}

// Flujo principal — sube, analiza, comparte, revisa.
const FLUJO = [
  {
    title: "Sube tu proyecto",
    desc: "Compra, obra, licencias, financiación, venta, alquiler y todos tus escenarios en un mismo sitio.",
    icon: "M12 16V4m0 0L8 8m4-4l4 4M4 20h16",
  },
  {
    title: "Analízalo con datos",
    desc: "Rentabilidad, inversión total, capital necesario, costes, ingresos y sensibilidad de cada escenario.",
    icon: "M9 17V9m4 8V5m4 12v-6M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z",
  },
  {
    title: "Compártelo",
    desc: "Enséñaselo a socios, inversores, técnicos o colaboradores. Genera un informe para presentarlo con claridad.",
    icon: "M8.6 13.5l6.8 3.9M15.4 6.6L8.6 10.5M18 5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM6 12a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm12 7a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z",
    soon: "Enlace y PDF compartibles: próximamente",
  },
  {
    title: "Revísalo con nosotros",
    desc: "Si quieres nuestra ayuda, compártenos el proyecto y estudiamos la operación contigo de forma profesional.",
    icon: "M9 12l2 2 4-4m5.6 1A9 9 0 1112 3a9 9 0 019.6 8z",
  },
];

// Qué hacemos cuando nos compartes una operación.
const APORTES = [
  { title: "Análisis riguroso", desc: "Revisamos costes, márgenes y rentabilidad real de la operación.", icon: "M9 17V9m4 8V5m4 12v-6M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" },
  { title: "Estructuración", desc: "Ayudamos a ordenar la operación: financiación, plazos y salida.", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m10 0V5a2 2 0 00-2-2H9a2 2 0 00-2 2v2" },
  { title: "Comparativa", desc: "Enfrentamos escenarios para encontrar la mejor decisión posible.", icon: "M3 6h18M3 12h18M3 18h12" },
  { title: "Capital con criterio", desc: "Si la operación encaja, valoramos colaborar y aportar capital.", icon: "M12 8c-1.66 0-3 .9-3 2s1.34 2 3 2 3 .9 3 2-1.34 2-3 2m0-8V6m0 10v2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
];

export default function Servicios() {
  return (
    <PublicShell active="servicios">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="lp-reveal max-w-3xl">
        <p className="lp-eyebrow">Colaborar</p>
        <h1 className="mt-4 text-4xl font-extrabold leading-[1.06] tracking-tight sm:text-5xl">
          Comparte tu proyecto inmobiliario
          <br />
          <span className="lp-grad-text">con quien necesites</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--lp-muted)]">
          Sube una operación, analízala con datos y compártela con socios, inversores,
          técnicos o con nuestro equipo para recibir una revisión profesional.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href={SUBIR_URL} className="lp-btn lp-btn-primary">
            Subir proyecto
            <Icon d="M13 7l5 5-5 5M18 12H6" className="h-4 w-4" />
          </Link>
          <a href={WHATSAPP_URL} className="lp-btn lp-btn-ghost">Solicitar revisión</a>
        </div>
        <p className="mt-5 text-sm text-[var(--lp-subtle)]">
          Analizar y crear tu operación es gratis. Compartirla con nosotros no te
          compromete a nada.
        </p>
      </section>

      {/* ── Flujo: sube · analiza · comparte · revisa ─────────────────────── */}
      <section className="mt-20 sm:mt-28">
        <div className="lp-reveal max-w-2xl">
          <p className="lp-eyebrow">Cómo funciona</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            De tu proyecto a una decisión compartida
          </h2>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FLUJO.map((f, i) => (
            <div key={f.title} className="lp-reveal lp-card flex flex-col p-6" data-delay={i * 80}>
              <div className="flex items-center gap-3">
                <span className="lp-card-icon h-11 w-11 shrink-0"><Icon d={f.icon} /></span>
                <span className="text-xs font-bold tabular-nums text-[var(--lp-subtle)]">
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-5 text-base font-semibold text-[var(--lp-text)]">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lp-muted)]">{f.desc}</p>
              {f.soon && (
                <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--lp-line-strong)] bg-white/[0.04] px-2.5 py-1 text-[0.68rem] font-medium text-[var(--lp-subtle)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--lp-gold)]" />
                  {f.soon}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Revísalo con nosotros ─────────────────────────────────────────── */}
      <section className="mt-20 sm:mt-28">
        <div className="lp-reveal max-w-2xl">
          <p className="lp-eyebrow">Si quieres nuestra ayuda</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Estudiamos la operación contigo</h2>
          <p className="mt-4 text-[var(--lp-muted)]">
            Cuando nos compartes un proyecto lo revisamos en detalle y, si encaja,
            seguimos adelante juntos.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {APORTES.map((a, i) => (
            <div key={a.title} className="lp-reveal lp-card p-6" data-delay={i * 80}>
              <span className="lp-card-icon h-11 w-11"><Icon d={a.icon} /></span>
              <h3 className="mt-5 text-base font-semibold text-[var(--lp-text)]">{a.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lp-muted)]">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA final ─────────────────────────────────────────────────────── */}
      <section className="mt-20 sm:mt-28">
        <div className="lp-reveal lp-glass relative overflow-hidden px-6 py-14 text-center sm:px-10 sm:py-16">
          <div className="lp-glow" aria-hidden style={{ inset: "auto", bottom: "-120px", left: "50%", transform: "translateX(-50%)", width: "480px", height: "300px", background: "rgba(207,162,86,0.20)" }} />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
              ¿Tienes un proyecto que analizar o compartir?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[var(--lp-muted)]">
              Súbelo, analiza los números gratis y compártelo con quien quieras —o con
              nosotros.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={SUBIR_URL} className="lp-btn lp-btn-primary">Subir proyecto</Link>
              <Link href={INFORMES_URL} className="lp-btn lp-btn-ghost">Crear informe</Link>
              <a href={WHATSAPP_URL} className="lp-btn lp-btn-ghost">Solicitar revisión</a>
            </div>
            <p className="mx-auto mt-6 max-w-lg text-xs text-[var(--lp-subtle)]">
              Cada operación se estudia de forma individual: revisamos números, riesgos,
              plazos y viabilidad. No prometemos rentabilidades ni financiación, y no
              estudiamos cualquier propuesta.
            </p>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

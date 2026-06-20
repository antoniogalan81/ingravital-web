import Link from "next/link";
import PublicShell from "@/components/PublicShell";

const ANALIZAR_URL = "/finanzas";
const WHATSAPP_URL = "https://wa.me/34656195880";

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d={d} />
    </svg>
  );
}

// Qué aportamos — enfoque análisis, estructuración, comparativa, decisión.
const APORTES = [
  { title: "Análisis riguroso", desc: "Revisamos costes, márgenes y rentabilidad real de la operación.", icon: "M9 17V9m4 8V5m4 12v-6M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" },
  { title: "Estructuración", desc: "Ayudamos a ordenar la operación: financiación, plazos y salida.", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m10 0V5a2 2 0 00-2-2H9a2 2 0 00-2 2v2" },
  { title: "Comparativa", desc: "Enfrentamos escenarios para encontrar la mejor decisión posible.", icon: "M3 6h18M3 12h18M3 18h12" },
  { title: "Capital con criterio", desc: "Si la operación encaja, valoramos colaborar y aportar capital.", icon: "M12 8c-1.66 0-3 .9-3 2s1.34 2 3 2 3 .9 3 2-1.34 2-3 2m0-8V6m0 10v2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
];

// Cómo funciona — 4 pasos cortos.
const STEPS = [
  { n: 1, title: "Calculas", desc: "Analizas la operación gratis en la plataforma." },
  { n: 2, title: "Compartes", desc: "Nos envías la ficha con los números claros." },
  { n: 3, title: "Analizamos", desc: "Revisamos viabilidad, riesgos y plazos." },
  { n: 4, title: "Valoramos", desc: "Si encaja, estudiamos colaboración o capital." },
];

export default function Servicios() {
  return (
    <PublicShell active="servicios">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="lp-reveal max-w-3xl">
        <p className="lp-eyebrow">Colaboración con criterio de inversión</p>
        <h1 className="mt-4 text-4xl font-extrabold leading-[1.06] tracking-tight sm:text-5xl">
          Comparte buenas operaciones.
          <br />
          <span className="lp-grad-text">Nosotros las analizamos.</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--lp-muted)]">
          Analiza tu operación gratis y, si los números encajan, la estudiamos contigo
          para valorar una colaboración.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href={ANALIZAR_URL} className="lp-btn lp-btn-primary">
            Analizar operación gratis
            <Icon d="M13 7l5 5-5 5M18 12H6" className="h-4 w-4" />
          </Link>
          <a href={WHATSAPP_URL} className="lp-btn lp-btn-ghost">Contactar</a>
        </div>
      </section>

      {/* ── Qué aportamos ─────────────────────────────────────────────────── */}
      <section className="mt-20 sm:mt-28">
        <div className="lp-reveal max-w-2xl">
          <p className="lp-eyebrow">Qué aportamos</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">De los números a la decisión</h2>
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

      {/* ── Cómo funciona ─────────────────────────────────────────────────── */}
      <section className="mt-20 sm:mt-28">
        <div className="lp-reveal max-w-2xl">
          <p className="lp-eyebrow">Cómo funciona</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Cuatro pasos, sin compromiso</h2>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.n} className="lp-reveal lp-card p-6" data-delay={i * 80}>
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--lp-line-strong)] bg-white/[0.04] text-base font-bold tabular-nums text-[var(--lp-brand-light)]">
                {s.n}
              </span>
              <h3 className="mt-4 text-base font-semibold text-[var(--lp-text)]">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--lp-muted)]">{s.desc}</p>
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
              ¿Tienes una operación que merece análisis?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[var(--lp-muted)]">
              Calcula los números gratis. Si encaja, compártela.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={ANALIZAR_URL} className="lp-btn lp-btn-primary">Analizar operación</Link>
              <a href={WHATSAPP_URL} className="lp-btn lp-btn-ghost">Contactar</a>
            </div>
            <p className="mx-auto mt-6 max-w-lg text-xs text-[var(--lp-subtle)]">
              Cada operación se estudia de forma individual: revisamos números, riesgos,
              plazos y viabilidad. No financiamos cualquier propuesta.
            </p>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

import SiteShell from "@/components/SiteShell";

const DOCS = [
  {
    title: "Aviso Legal",
    description:
      "Información sobre el titular del sitio, propiedad intelectual y condiciones generales del sitio web.",
    href: "/legal/aviso-legal",
  },
  {
    title: "Política de Privacidad",
    description:
      "Explica cómo recopilamos, utilizamos y protegemos tus datos personales.",
    href: "/legal/privacidad",
  },
  {
    title: "Términos y Condiciones",
    description:
      "Describe las reglas de uso de la aplicación y las responsabilidades del usuario.",
    href: "/legal/terminos",
  },
  {
    title: "Política de Cookies",
    description:
      "Explica qué cookies utilizamos, para qué sirven y cómo puedes gestionarlas o desactivarlas.",
    href: "/legal/cookies",
  },
];

const SECTIONS = [
  {
    title: "Uso responsable de la app",
    paragraphs: [
      "Ingravital es una herramienta de organización personal, productividad y bienestar.",
      "La información mostrada dentro de la aplicación, incluidas recomendaciones generadas por sistemas de inteligencia artificial, tiene carácter orientativo y no sustituye asesoramiento profesional.",
    ],
  },
  {
    title: "Uso de inteligencia artificial",
    paragraphs: [
      "La aplicación puede utilizar sistemas de inteligencia artificial para analizar datos, generar recomendaciones o mostrar resúmenes basados en la información introducida por el usuario.",
      "Estos sistemas pueden generar resultados incompletos o inexactos y deben interpretarse como apoyo informativo.",
    ],
  },
  {
    title: "Limitación de responsabilidad",
    paragraphs: [
      "Ventana al Futuro SL no garantiza resultados específicos derivados del uso de la aplicación y no se responsabiliza de decisiones tomadas por el usuario basadas en la información mostrada por el servicio.",
    ],
  },
];

export default function Legal() {
  return (
    <SiteShell active="legal">

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-20 md:py-32 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[480px] w-[480px] rounded-full bg-slate-100 blur-3xl opacity-60"
        />
        <div className="relative mx-auto max-w-xl">
          <span className="inline-block rounded-full border border-slate-200 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 mb-8">
            Legal
          </span>
          <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 md:text-6xl leading-[1.05]">
            Información legal
          </h1>
          <p className="mt-6 text-base text-slate-500 leading-relaxed max-w-md mx-auto">
            Aquí encontrarás la información legal relacionada con el uso de Ingravital,
            incluyendo privacidad, condiciones de uso y responsabilidades del servicio.
          </p>
        </div>
      </section>

      {/* ── DOCUMENTOS LEGALES ───────────────────────────────────── */}
      <section className="py-4 md:py-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-6">
            Documentos legales
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {DOCS.map((doc) => (
              <div
                key={doc.href}
                className="rounded-2xl border border-slate-200 bg-white px-6 py-7 flex flex-col gap-4 shadow-sm"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{doc.title}</p>
                  <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                    {doc.description}
                  </p>
                </div>
                <a
                  href={doc.href}
                  className="mt-auto inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors group"
                >
                  Leer documento
                  <svg
                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECCIONES INFORMATIVAS ───────────────────────────────── */}
      <section className="py-10 md:py-16">
        <div className="mx-auto max-w-3xl space-y-10">
          {SECTIONS.map((section) => (
            <div key={section.title} className="border-t border-slate-100 pt-8">
              <h2 className="text-base font-semibold text-slate-900 mb-3">
                {section.title}
              </h2>
              <div className="space-y-3">
                {section.paragraphs.map((p, i) => (
                  <p key={i} className="text-sm text-slate-500 leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            </div>
          ))}

        </div>
      </section>

    </SiteShell>
  );
}

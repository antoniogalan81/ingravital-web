import Link from "next/link";
import PublicShell from "@/components/PublicShell";

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
      "Invergravital es una herramienta de organización personal, productividad y bienestar.",
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
    <PublicShell active="legal">
      {/* ── Cabecera ──────────────────────────────────────────────── */}
      <section className="lp-reveal max-w-2xl">
        <p className="lp-eyebrow">Legal</p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">Información legal</h1>
        <p className="mt-5 max-w-xl leading-relaxed text-[var(--lp-muted)]">
          Información legal relacionada con el uso de Invergravital: privacidad,
          condiciones de uso y responsabilidades del servicio.
        </p>
      </section>

      {/* ── Documentos legales ───────────────────────────────────── */}
      <section className="mt-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DOCS.map((doc, i) => (
            <Link
              key={doc.href}
              href={doc.href}
              className="lp-reveal lp-card group flex flex-col gap-4 p-6"
              data-delay={i * 70}
            >
              <div>
                <p className="text-sm font-semibold text-[var(--lp-text)]">{doc.title}</p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--lp-muted)]">{doc.description}</p>
              </div>
              <span className="mt-auto inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--lp-brand-light)]">
                Leer documento
                <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Secciones informativas (superficie clara legible) ────── */}
      <section className="mt-12">
        <div className="lp-reveal lp-paper space-y-9 p-7 sm:p-10">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 className="mb-3 text-base font-semibold">{section.title}</h2>
              <div className="space-y-3">
                {section.paragraphs.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-[#4b5563]">{p}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}

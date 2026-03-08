import SiteShell from "@/components/SiteShell";

export interface LegalSection {
  id: string;
  title: string;
  content: (string | { list: string[] })[];
}

interface Props {
  title: string;
  updated: string;
  intro?: string;
  sections: LegalSection[];
}

export default function LegalDocLayout({ title, updated, intro, sections }: Props) {
  return (
    <SiteShell active="legal">

      {/* ── BACK ──────────────────────────────────────────────────── */}
      <div className="pt-8 pb-0">
        <a
          href="/legal"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors group"
        >
          <svg
            className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l-4-4m0 0l4-4m-4 4h18" />
          </svg>
          Información legal
        </a>
      </div>

      {/* ── HERO ──────────────────────────────────────────────────── */}
      <section className="py-14 md:py-20 border-b border-slate-100">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-4">
            Última actualización: {updated}
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl leading-[1.08]">
            {title}
          </h1>
          {intro && (
            <p className="mt-5 text-base text-slate-500 leading-relaxed max-w-xl">
              {intro}
            </p>
          )}
        </div>
      </section>

      {/* ── CONTENIDO ─────────────────────────────────────────────── */}
      <section className="py-12 md:py-16">
        <div className="max-w-2xl space-y-10">
          {sections.map((section) => (
            <div key={section.id} id={section.id}>
              <h2 className="text-sm font-semibold text-slate-900 mb-3 uppercase tracking-wide">
                {section.title}
              </h2>
              <div className="space-y-3">
                {section.content.map((block, i) =>
                  typeof block === "string" ? (
                    <p key={i} className="text-sm text-slate-600 leading-relaxed">
                      {block}
                    </p>
                  ) : (
                    <ul key={i} className="space-y-1.5 pl-1">
                      {block.list.map((item, j) => (
                        <li key={j} className="flex gap-2 text-sm text-slate-600 leading-relaxed">
                          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-300" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────── */}
      <div className="border-t border-slate-100 pt-8 pb-16">
        <p className="text-xs text-slate-400">
          ¿Preguntas?{" "}
          <a href="mailto:info@palmaycoco.com" className="underline hover:text-slate-600 transition-colors">
            info@palmaycoco.com
          </a>
        </p>
      </div>

    </SiteShell>
  );
}

import Link from "next/link";
import PublicShell from "@/components/PublicShell";

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
    <PublicShell active="legal">
      {/* ── Volver ────────────────────────────────────────────────── */}
      <Link
        href="/legal"
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-text)]"
      >
        <svg className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l-4-4m0 0l4-4m-4 4h18" />
        </svg>
        Información legal
      </Link>

      {/* ── Cabecera ──────────────────────────────────────────────── */}
      <div className="mt-6 max-w-2xl">
        <p className="lp-eyebrow">Última actualización: {updated}</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
        {intro && <p className="mt-5 max-w-xl leading-relaxed text-[var(--lp-muted)]">{intro}</p>}
      </div>

      {/* ── Contenido (superficie clara legible) ──────────────────── */}
      <div className="lp-paper mt-10 max-w-3xl space-y-9 p-7 sm:p-10">
        {sections.map((section) => (
          <div key={section.id} id={section.id}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">{section.title}</h2>
            <div className="space-y-3">
              {section.content.map((block, i) =>
                typeof block === "string" ? (
                  <p key={i} className="text-sm leading-relaxed text-[#4b5563]">{block}</p>
                ) : (
                  <ul key={i} className="space-y-1.5 pl-1">
                    {block.list.map((item, j) => (
                      <li key={j} className="flex gap-2 text-sm leading-relaxed text-[#4b5563]">
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#cbd3df]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          </div>
        ))}

        <div className="border-t border-[#e3e8ef] pt-6">
          <p className="text-xs text-[#697586]">
            ¿Preguntas?{" "}
            <a href="mailto:info@palmaycoco.com" className="lp-paper-link">info@palmaycoco.com</a>
          </p>
        </div>
      </div>
    </PublicShell>
  );
}

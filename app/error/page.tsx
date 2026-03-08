import SiteShell from "@/components/SiteShell";

const PAYPAL_DONATION_URL =
  "https://www.paypal.com/donate/?hosted_button_id=JWZFW7P5X2E58";

export default function Error() {
  return (
    <SiteShell active="home">

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-20 md:py-36 text-center">

        {/* Glow decorativo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[520px] w-[520px] rounded-full bg-slate-100 blur-3xl opacity-70"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[12%] top-[18%] h-64 w-64 rounded-full bg-slate-200 blur-3xl opacity-40"
        />

        <div className="relative mx-auto max-w-lg">
          <span className="inline-block rounded-full border border-slate-200 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 mb-8">
            Aportación no completada
          </span>

          <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 md:text-6xl leading-[1.05]">
            No se ha completado la aportación
          </h1>

          <p className="mt-6 text-base text-slate-500 leading-relaxed max-w-sm mx-auto">
            No pasa nada. Si quieres, puedes volver a intentarlo en cualquier momento.
          </p>

          <p className="mt-3 text-base text-slate-400 leading-relaxed max-w-sm mx-auto">
            Cada apoyo ayuda a acelerar esta nueva etapa de Ingravital.
          </p>
        </div>
      </section>

      {/* ── CTA — card clara ─────────────────────────────────────── */}
      <section className="py-4 md:py-8">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-slate-50 px-8 py-12 text-center shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <a
              href={PAYPAL_DONATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-8 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 hover:shadow-md hover:scale-[1.02] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              Volver a intentarlo
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>
            <a
              href="/"
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              Volver al inicio
            </a>
            <span className="mt-2 text-xs text-slate-400">
              Gracias por haber querido apoyar el proyecto.
            </span>
          </div>
        </div>
      </section>

    </SiteShell>
  );
}

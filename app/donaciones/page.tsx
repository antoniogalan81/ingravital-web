import SiteShell from "@/components/SiteShell";

const PAYPAL_DONATION_URL =
  "https://www.paypal.com/donate/?hosted_button_id=JWZFW7P5X2E58";

export default function Donaciones() {
  return (
    <SiteShell active="servicios">

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-20 md:py-36 text-center">

        {/* Glow decorativo — no interactivo */}
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
            Próxima etapa
          </span>

          <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 md:text-6xl leading-[1.05]">
            La evolución de la productividad personal
          </h1>

          <p className="mt-4 text-base font-medium text-slate-700 max-w-sm mx-auto">
            De las metas a la ejecución diaria.
          </p>

          <p className="mt-3 text-base text-slate-400 leading-relaxed max-w-sm mx-auto">
            Durante meses hemos estado trabajando en algo que cambiará por completo
            lo que esta plataforma puede llegar a ser.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3">
            <a
              href={PAYPAL_DONATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-xl bg-slate-900 px-8 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 hover:shadow-md hover:scale-[1.02] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              Apoyar el proyecto
            </a>
            <span className="text-xs text-slate-400">
              Puedes elegir la cantidad directamente en PayPal.
            </span>
          </div>
        </div>
      </section>

      {/* ── VISIÓN — card oscura ──────────────────────────────────── */}
      <section className="py-4 md:py-6">
        <div className="mx-auto max-w-2xl rounded-3xl bg-slate-950 px-8 py-14 md:px-16 md:py-20 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            Esto es solo el principio
          </h2>
          <p className="mt-5 text-base text-slate-400 leading-relaxed max-w-md mx-auto">
            La próxima etapa de Ingravital no es solo una actualización.
            Es una evolución completa del proyecto para ayudarte a avanzar
            con más claridad, más enfoque y más capacidad de ejecución en tu día a día.
          </p>
        </div>
      </section>

      {/* ── CTA FINAL — card clara ───────────────────────────────── */}
      <section className="py-10 md:py-14">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-slate-50 px-8 py-12 text-center shadow-sm">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Lo mejor de Ingravital<br className="hidden sm:block" /> todavía está por llegar
          </h2>
          <p className="mt-4 text-base text-slate-500 leading-relaxed">
            Si crees en el proyecto y quieres ayudar a que esta nueva etapa
            llegue antes, puedes apoyarlo aquí.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <a
              href={PAYPAL_DONATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-8 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 hover:shadow-md hover:scale-[1.02] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              Apoyar el desarrollo
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
            <span className="text-xs text-slate-400">
              Algunas personas ya están ayudando a construir esta nueva etapa desde el principio.
            </span>
          </div>
        </div>
      </section>

    </SiteShell>
  );
}

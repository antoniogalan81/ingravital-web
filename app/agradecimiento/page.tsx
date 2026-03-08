import SiteShell from "@/components/SiteShell";

const PAYPAL_DONATION_URL =
  "https://www.paypal.com/donate/?hosted_button_id=JWZFW7P5X2E58";

export default function Agradecimiento() {
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
          className="pointer-events-none absolute left-[12%] top-[20%] h-64 w-64 rounded-full bg-slate-200 blur-3xl opacity-40"
        />

        <div className="relative mx-auto max-w-lg">
          <span className="inline-block rounded-full border border-slate-200 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 mb-8">
            Aportación recibida
          </span>

          <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 md:text-6xl leading-[1.05]">
            Gracias por apoyar Ingravital
          </h1>

          <p className="mt-6 text-base text-slate-500 leading-relaxed max-w-sm mx-auto">
            Tu aportación ayuda a acelerar una nueva etapa del proyecto.
          </p>

          <p className="mt-3 text-base text-slate-400 leading-relaxed max-w-sm mx-auto">
            Algunas personas están ayudando a construir esto desde el principio.
            Ahora tú también formas parte de ello.
          </p>

          <div className="mt-10">
            <a
              href="/"
              className="inline-block rounded-xl bg-slate-900 px-8 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 hover:shadow-md hover:scale-[1.02] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              Volver al inicio
            </a>
          </div>
        </div>
      </section>

      {/* ── CIERRE — card oscura ─────────────────────────────────── */}
      <section className="py-4 md:py-6">
        <div className="mx-auto max-w-2xl rounded-3xl bg-slate-950 px-8 py-14 md:px-16 md:py-20 text-center">
          <p className="text-xl font-semibold tracking-tight text-white md:text-2xl">
            Lo mejor de Ingravital todavía está por llegar.
          </p>
        </div>
      </section>

    </SiteShell>
  );
}

import SiteShell from "@/components/SiteShell";

const ANDROID_URL = "#"; // luego pondremos Google Play
const IOS_URL = "#"; // luego pondremos App Store

export default function Home() {
  return (
    <SiteShell active="home">
      <section className="grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            App para organizar tu vida y ayudarte a conseguir tus metas
          </h1>

          <p className="mt-4 text-lg text-slate-600">
            Principalmente para empresarios, emprendedores y autonomos. Te facilita y organiza el camino para
            conseguir tus objetivos y metas.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a
              href={ANDROID_URL}
              className="rounded-xl bg-slate-900 px-6 py-3 text-center text-sm font-semibold text-white hover:opacity-90"
            >
              Descargar en Google Play
            </a>
            <a
              href={IOS_URL}
              className="rounded-xl border border-slate-200 px-6 py-3 text-center text-sm font-semibold hover:bg-slate-50"
            >
              Descargar en App Store
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-8">
          <div className="text-sm font-semibold text-slate-700">Que incluye</div>
          <ul className="mt-4 space-y-3 text-slate-600">
            <li>• Metas y objetivos claros</li>
            <li>• Agenda diaria y rutina</li>
            <li>• Seguimiento del progreso</li>
            <li>• (Proximo) Sincronizacion multiplataforma</li>
          </ul>

          <div className="mt-8 rounded-xl bg-slate-50 p-5">
            <div className="text-sm font-semibold">Quieres contratar servicios?</div>
            <p className="mt-1 text-sm text-slate-600">
              Si quieres que lo montemos contigo y lo adaptemos a tu negocio, entra en Servicios.
            </p>
            <a
              href="/servicios"
              className="mt-4 inline-block rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Ver servicios
            </a>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

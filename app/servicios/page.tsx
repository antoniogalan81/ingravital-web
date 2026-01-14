import SiteShell from "@/components/SiteShell";

const WHATSAPP_URL = "https://wa.me/34656195880";

export default function Servicios() {
  return (
    <SiteShell active="servicios">
      <section>
        <h1 className="text-4xl font-bold md:text-5xl">Servicios</h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Implementacion personalizada para organizarte y avanzar: metas, rutina, foco y seguimiento.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Setup inicial",
              price: "Desde ___€",
              items: ["Diagnostico 60-90 min", "Estructura de metas", "Rutina semanal", "Checklist diario"],
            },
            {
              title: "Acompanamiento",
              price: "Desde ___€/mes",
              items: ["Revision semanal", "Ajustes del sistema", "Objetivos trimestrales", "Soporte por WhatsApp"],
            },
            {
              title: "Empresa / Equipo",
              price: "A medida",
              items: ["Estandarizacion", "KPIs", "Procesos", "Onboarding equipo"],
            },
          ].map((p) => (
            <div key={p.title} className="rounded-2xl border border-slate-200 p-6">
              <div className="text-base font-semibold">{p.title}</div>
              <div className="mt-2 text-2xl font-bold">{p.price}</div>
              <ul className="mt-4 space-y-2 text-slate-600">
                {p.items.map((it) => (
                  <li key={it}>• {it}</li>
                ))}
              </ul>
              <a
                href={WHATSAPP_URL}
                className="mt-6 inline-block w-full rounded-xl bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white hover:opacity-90"
              >
                Contactar
              </a>
            </div>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}

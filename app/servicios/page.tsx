import SiteShell from "@/components/SiteShell";

const WHATSAPP_URL = "https://wa.me/34656195880";

const PLANS = [
  {
    id: "free",
    name: "Gratis",
    price: "0 €",
    oldPrice: null as string | null,
    discountLabel: null as string | null,
    period: "para siempre",
    subtitle: "Todo lo esencial para organizarte",
    featured: false,
    topBadge: null as string | null,
    savings: null as string | null,
    cta: "Empezar gratis",
    items: [
      "Metas ilimitadas",
      "Tareas (todos los tipos)",
      "Subtareas",
      "Agenda diaria",
      "Notificaciones básicas",
      "Sincronización móvil + PC",
    ],
  },
  {
    id: "monthly",
    name: "Premium Mensual",
    price: "6,99 €",
    oldPrice: "9,99 €" as string | null,
    discountLabel: "−30%" as string | null,
    period: "/mes",
    subtitle: "Avanza más rápido con IA",
    featured: false,
    topBadge: null as string | null,
    savings: null as string | null,
    cta: "Hacerme Premium",
    items: [
      "Todo lo de Gratis",
      "IA por texto",
      "IA por voz — audio → tareas",
      "IA Coach de metas",
      "Nutrición automática",
      "Entrenamiento automático",
      "Meditaciones guiadas",
      "Micro-coaches: foco, decisiones, bloqueos…",
    ],
  },
  {
    id: "annual",
    name: "Premium Anual",
    price: "65 €",
    oldPrice: "99 €" as string | null,
    discountLabel: "−34%" as string | null,
    period: "/año",
    subtitle: "La mejor forma de avanzar",
    featured: true,
    topBadge: "Más popular" as string | null,
    savings: "Equivale a 5,41 €/mes · Ahorras 18,88 €" as string | null,
    cta: "Pasar a Premium",
    items: [
      "Todo lo de Gratis",
      "IA por texto",
      "IA por voz — audio → tareas",
      "IA Coach de metas",
      "Nutrición automática",
      "Entrenamiento automático",
      "Meditaciones guiadas",
      "Micro-coaches: foco, decisiones, bloqueos…",
    ],
  },
];

export default function Servicios() {
  return (
    <SiteShell active="servicios">
      <section className="py-12 md:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
            Elige tu plan
          </h1>
          <p className="mt-4 text-lg text-slate-500 md:text-xl">
            Organizarte es gratis. Avanzar más rápido es{" "}
            <span className="font-semibold text-slate-800">Premium</span>.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-3 md:items-start">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-6 transition-shadow duration-200 ${
                plan.featured
                  ? "border-blue-500 bg-white shadow-xl shadow-blue-500/15 ring-1 ring-blue-500"
                  : "border-slate-200 bg-white hover:shadow-md"
              }`}
            >
              {/* Badge superior (Más popular) */}
              {plan.topBadge && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1 text-xs font-semibold tracking-wide text-white shadow-sm">
                  {plan.topBadge}
                </span>
              )}

              <div className="mb-5">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  {plan.name}
                </h2>

                {/* Bloque de precio */}
                <div className="mt-3">
                  <div className="flex items-start gap-2">
                    <span className={`text-4xl font-extrabold leading-none tracking-tight ${plan.featured ? "text-blue-700" : "text-slate-900"}`}>
                      {plan.price}
                    </span>
                    <div className="flex flex-col justify-start pt-1 gap-0.5">
                      <span className="text-sm text-slate-400 leading-none">{plan.period}</span>
                      {plan.oldPrice && (
                        <span className="text-xs text-slate-400 line-through leading-none">
                          {plan.oldPrice}
                        </span>
                      )}
                    </div>
                    {plan.discountLabel && (
                      <span className={`ml-auto self-start rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                        plan.featured
                          ? "bg-blue-100 text-blue-700"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {plan.discountLabel}
                      </span>
                    )}
                  </div>

                  {/* Savings pill (solo plan anual) */}
                  {plan.savings && (
                    <p className="mt-2.5 text-xs text-emerald-700 font-medium bg-emerald-50 rounded-lg px-2.5 py-1.5 leading-snug">
                      {plan.savings}
                    </p>
                  )}
                </div>

                <p className="mt-3 text-sm text-slate-500">{plan.subtitle}</p>
              </div>

              <ul className="mb-6 flex-1 space-y-2.5" role="list">
                {plan.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm text-slate-600"
                  >
                    <svg
                      className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                        plan.featured ? "text-blue-500" : "text-slate-400"
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <a
                href={WHATSAPP_URL}
                className={`block w-full rounded-xl px-5 py-3 text-center text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                  plan.featured
                    ? "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500"
                    : "bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-500"
                }`}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}

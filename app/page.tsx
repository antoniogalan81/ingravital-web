import Image from "next/image";
import SiteShell from "@/components/SiteShell";

const ANDROID_URL = "/ingravital.apk";

export default function Home() {
  return (
    <SiteShell active="home">
      {/* Hero Section */}
      <section className="grid gap-10 lg:grid-cols-2 lg:gap-16 lg:items-center">
        {/* Text Column */}
        <div className="max-w-xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight text-slate-900">
            Deja de pensar.
            <br />
            Empieza a ejecutar.
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600">
            Un sistema para convertir tus metas en acciones diarias.
          </p>

          <div className="mt-8">
            <a
              href={ANDROID_URL}
              download="ingravital.apk"
              className="inline-block rounded-full bg-slate-900 px-8 py-3.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Descargar app para Android
            </a>
          </div>

          <p className="mt-5 text-sm text-slate-400">
            Una meta sin fecha es solo un sueño. Ponle fecha y empieza hoy.
          </p>
        </div>

        {/* iPhone Image Column */}
        <div className="flex justify-center lg:justify-end">
          <div className="relative w-[320px] sm:w-[420px]">
            <Image
              src="/images/home/hero-iphone.png"
              alt="Ingravital app en iPhone"
              width={320}
              height={650}
              className="w-full h-auto"
              priority
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="mt-20 sm:mt-28 py-16 -mx-6 px-6 bg-slate-50/70 rounded-3xl">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Feature 1 - Metas claras */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="h-[320px] bg-white flex items-center justify-center py-4 px-0">
              <div className="relative w-full h-full">
                <Image
                  src="/images/home/feature-metas.jpg"
                  alt="Metas claras"
                  fill
                  className="object-contain"
                />
              </div>
            </div>
            <div className="p-5">
              <h3 className="text-lg font-semibold text-slate-900">Metas claras</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Define un objetivo principal y conviértelo en un plan real.
              </p>
            </div>
          </div>

          {/* Feature 2 - Acción diaria */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="h-[320px] bg-white flex items-center justify-center py-4 px-0">
              <div className="relative w-full h-full">
                <Image
                  src="/images/home/feature-agenda.png"
                  alt="Acción diaria"
                  fill
                  className="object-contain"
                />
              </div>
            </div>
            <div className="p-5">
              <h3 className="text-lg font-semibold text-slate-900">Acción diaria</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Cada día sabes exactamente qué toca hacer.
              </p>
            </div>
          </div>

          {/* Feature 3 - Control real */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow sm:col-span-2 lg:col-span-1">
            <div className="h-[320px] bg-white flex items-center justify-center py-4 px-0">
              <div className="relative w-full h-full">
                <Image
                  src="/images/home/feature-finanzas.png"
                  alt="Control real"
                  fill
                  className="object-contain"
                />
              </div>
            </div>
            <div className="p-5">
              <h3 className="text-lg font-semibold text-slate-900">Control real</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Tus acciones conectadas con tus finanzas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="mt-20 sm:mt-28 text-center py-16">
        <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
          Menos excusas. Más acción.
        </h2>
        <p className="mt-4 text-lg text-slate-600">
          Empieza hoy. Si esperas, pierdes.
        </p>
        <div className="mt-8">
          <a
            href={ANDROID_URL}
            className="inline-block rounded-full bg-slate-900 px-8 py-3.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            Descargar app para Android
          </a>
        </div>
      </section>
    </SiteShell>
  );
}

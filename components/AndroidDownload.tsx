import {
  ANDROID_DOWNLOAD_PATH,
  ANDROID_RELEASE,
  APK_FILENAME,
  androidDateLabel,
  androidSizeLabel,
} from "@/src/lib/androidRelease";

/** Canales de contacto ya existentes en el sitio (ver PublicShell). */
const WHATSAPP_URL = "https://wa.me/34656195880";
const EMAIL = "info@palmaycoco.com";

/**
 * Sección de descarga de la aplicación Android.
 *
 * Los datos de la ficha (versión, fecha, tamaño, Android mínimo) salen del
 * artefacto realmente publicado, no de la configuración del proyecto: viven en
 * `src/lib/androidRelease.ts` y se actualizan al publicar cada release.
 *
 * El canal para proponer mejoras es el que ya existe en el sitio (WhatsApp y
 * correo del pie). No se inventa ningún formulario.
 */
export default function AndroidDownload() {
  const ficha: [string, string][] = [
    ["Aplicación", ANDROID_RELEASE.appName],
    ["Versión publicada", ANDROID_RELEASE.versionName],
    ["Actualizada el", androidDateLabel()],
    ["Tamaño aproximado", androidSizeLabel()],
    ["Compatibilidad", `Android ${ANDROID_RELEASE.minAndroid} o superior`],
  ];

  return (
    <section
      id="android"
      aria-labelledby="android-titulo"
      className="mx-auto max-w-[1180px] px-5 pb-24 sm:px-8"
    >
      <div className="lp-reveal lp-glass relative overflow-hidden px-6 py-14 sm:px-10 sm:py-16">
        <div className="relative grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <div>
            <div className="lp-eyebrow">Android</div>
            <h2
              id="android-titulo"
              className="mt-3 text-3xl font-bold tracking-tight sm:text-[2.4rem] sm:leading-tight"
            >
              Descarga la aplicación para Android
            </h2>

            <p className="mt-6 text-[var(--lp-muted)]">
              La aplicación es completamente funcional y la estamos actualizando
              varias veces al día para corregir errores, pulir su funcionamiento
              e incorporar nuevas mejoras.
            </p>

            <p className="mt-4 text-[var(--lp-muted)]">
              También puedes contribuir a mejorarla. Cuéntanos qué funciones o
              utilidades te gustaría que incorporase. Si la propuesta es viable y
              puede resultar útil para más usuarios de la comunidad, estudiaremos
              su implementación.
            </p>

            <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <a
                href={ANDROID_DOWNLOAD_PATH}
                download={APK_FILENAME}
                className="lp-btn lp-btn-primary"
              >
                Descargar APK para Android
              </a>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="lp-btn lp-btn-ghost"
              >
                Proponer una mejora
              </a>
            </div>

            <p className="mt-6 text-sm text-[var(--lp-subtle)]">
              También puedes escribirnos a{" "}
              <a
                href={`mailto:${EMAIL}`}
                className="underline-offset-4 transition-colors hover:text-[var(--lp-text)] hover:underline"
              >
                {EMAIL}
              </a>
              . Al instalar, Android pedirá permiso para instalar aplicaciones de
              orígenes desconocidos: es lo normal fuera de Google Play.
            </p>
          </div>

          <dl className="grid content-start gap-2.5">
            {ficha.map(([k, v]) => (
              <div
                key={k}
                className="lp-tile flex items-baseline justify-between gap-6 p-4"
              >
                <dt className="text-sm text-[var(--lp-subtle)]">{k}</dt>
                <dd className="text-right text-sm font-bold text-[var(--lp-text)]">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

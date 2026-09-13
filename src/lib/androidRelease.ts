/**
 * Publicación Android vigente de Invergravital.
 *
 * Única fuente de verdad de la descarga: de aquí salen el destino de la ruta
 * estable `/download/android` y los datos que muestra la web. Al publicar una
 * versión nueva solo se toca este fichero.
 *
 * El binario NO se sirve desde `public/` (121 MB en cada despliegue): vive como
 * asset de release en GitHub, y el sitio expone una URL de marca que redirige
 * ahí. Así el enlace publicado no cambia cuando cambia la versión.
 *
 * Antes se enlazaba directamente el artefacto de EAS
 * (`expo.dev/artifacts/eas/…`), que caduca a las pocas semanas: ese enlace se
 * convertía en una descarga rota.
 *
 * Todos los valores están tomados del propio artefacto compilado por EAS
 * (build 8, 2026-09-13), no de la configuración del proyecto.
 */

/** Ruta estable y pública. Es la que se enlaza desde fuera (agalan.es incluido). */
export const ANDROID_DOWNLOAD_PATH = "/download/android";

/** Asset real del release de GitHub al que redirige la ruta estable. */
export const ANDROID_RELEASE_URL =
  "https://github.com/antoniogalan81/ingravital-web/releases/download/v1.0.2-build8/invergravital.apk";

/** Nombre del archivo tal y como llega al dispositivo. */
export const APK_FILENAME = "invergravital.apk";

export const ANDROID_RELEASE = {
  appName: "Invergravital",
  versionName: "1.0.2",
  versionCode: 8,
  applicationId: "com.agalansevilla.Invergravitalapp",
  /** Fecha de publicación del release. */
  publishedAt: "2026-09-13",
  /** Tamaño real del archivo, en bytes. */
  sizeBytes: 127_784_762,
  /** minSdkVersion 24. */
  minAndroid: "7.0",
  sha256: "45c17bdf2d1de07496c561b394357c768322be0997a6af9a4a367c1cb1436327",
} as const;

/** Tamaño legible, redondeado a una decimal (p. ej. «121,8 MB»). */
export function androidSizeLabel(): string {
  const mb = ANDROID_RELEASE.sizeBytes / 1_048_576;
  return `${mb.toFixed(1).replace(".", ",")} MB`;
}

/** Fecha en formato español, sin depender de la zona horaria del servidor. */
export function androidDateLabel(): string {
  const [y, m, d] = ANDROID_RELEASE.publishedAt.split("-");
  return `${Number(d)}/${m}/${y}`;
}

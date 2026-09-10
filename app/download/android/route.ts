import { NextResponse } from "next/server";
import { ANDROID_RELEASE_URL } from "@/src/lib/androidRelease";

/**
 * Ruta estable de descarga del APK.
 *
 * Devuelve una redirección al asset real del release, nunca HTML: quien pide
 * esta URL —desde el navegador, desde agalan.es o desde `curl -L`— recibe el
 * archivo. La URL no cambia al publicar una versión nueva; lo que cambia es
 * `ANDROID_RELEASE_URL`.
 *
 * 302 y no 301: el destino cambia con cada versión y una redirección permanente
 * se quedaría cacheada en el navegador apuntando a la versión antigua.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.redirect(ANDROID_RELEASE_URL, 302);
}

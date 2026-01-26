// app/api/app-update/route.ts
// Endpoint de control para actualizaciones de la app Android
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface UpdateConfig {
  enabled: boolean;
  type: "ota" | "apk";
  message: string;
  apkUrl: string | null;
}

export async function GET() {
  // Configuración de actualización - editar aquí para controlar la app
  const config: UpdateConfig = {
    enabled: true,
    type: "ota",
    message: "Nueva versión disponible",
    apkUrl: null,
  };

  return NextResponse.json(config, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}


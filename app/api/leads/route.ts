import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
    const url = process.env.SUPABASE_URL;
    // Clave secreta del formato nuevo (sb_secret_…), no la service_role
    // heredada en formato JWT: esa quedo expuesta en texto plano y se
    // deshabilita con el resto de claves legacy del proyecto.
    const secretKey = process.env.SUPABASE_SECRET_KEY;

    if (!url || !secretKey) {
      return NextResponse.json(
        { ok: false, error: "Server misconfigured: missing Supabase env vars." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    const rawEmail = body?.email;

    if (typeof rawEmail !== "string") {
      return NextResponse.json({ ok: false, error: "Email requerido." }, { status: 400 });
    }

    const email = normalizeEmail(rawEmail);
    if (!email) return NextResponse.json({ ok: false, error: "Email requerido." }, { status: 400 });
    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Email no valido." }, { status: 400 });
    }

    // Clave secreta: salta RLS. Solo en servidor, nunca en el bundle cliente.
    const supabaseAdmin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabaseAdmin
      .from("leads")
      .insert({ email })
      .select("id")
      .single();

    if (error) {
      // Unique violation -> OK (ya existe)
      const code = (error as any).code as string | undefined;
      if (code === "23505") {
        return NextResponse.json({ ok: true, duplicated: true }, { status: 200 });
      }
      return NextResponse.json({ ok: false, error: error.message, code }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: data?.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

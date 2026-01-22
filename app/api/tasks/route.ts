import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeTaskForDb } from "@/src/sync/normalizeTask";

export async function POST(req: Request) {
  try {
    const url = process.env.SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anon) {
      return NextResponse.json({ ok: false, error: "Server misconfigured." }, { status: 500 });
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing bearer token." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : "";

    if (!title) {
      return NextResponse.json({ ok: false, error: "Title requerido." }, { status: 400 });
    }

    const supabase = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ ok: false, error: "Invalid session." }, { status: 401 });
    }

    const user_id = userRes.user.id;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    
    // Normalizar task antes de guardar (mismas reglas que APP)
    const normalizedData = normalizeTaskForDb({
      id,
      title,
      kind: "NORMAL",
      type: "ACTIVIDAD",
      order: 0,
      createdAt: now,
    });
    
    const payload = {
      id,
      user_id,
      data: normalizedData,
      client_updated_at: now,
      deleted_at: null,
    };
    
    const { data, error } = await supabase
      .from("tasks")
      .insert(payload)
      .select("id,user_id,data,client_updated_at,server_updated_at,deleted_at")
      .single();
    
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

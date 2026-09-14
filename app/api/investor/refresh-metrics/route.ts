// POST /api/investor/refresh-metrics — Recalcula las métricas de una oportunidad antes de que
// el inversor la vea. La autorización es la de la BD: se llama a `get_investor_snapshot` con
// la sesión del propio inversor; si no tiene acceso, no se recalcula nada.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { refreshOpportunityMetrics } from "@/src/lib/investorPlatform/refreshMetrics";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !secretKey || !anonKey) return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 500 });

  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { invitationId?: unknown } | null;
  const invitationId = typeof body?.invitationId === "string" ? body.invitationId : "";
  if (!UUID.test(invitationId)) return NextResponse.json({ ok: false, error: "invalid_invitation" }, { status: 400 });

  const asInvestor = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { error: accessError } = await asInvestor.rpc("get_investor_snapshot", { p_invitation: invitationId });
  if (accessError) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  try {
    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await refreshOpportunityMetrics(admin, invitationId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[refresh-metrics]", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "refresh_failed" }, { status: 500 });
  }
}

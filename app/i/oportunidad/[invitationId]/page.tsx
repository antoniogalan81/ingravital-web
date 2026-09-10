"use client";

// /i/oportunidad/[invitationId] — la oportunidad tal y como la ve el inversor.
//
// El contenido lo devuelve `get_investor_snapshot()`, que aplica la visibilidad
// EN EL SERVIDOR y en el momento de leer. Si el promotor retira un dato, desaparece
// en la siguiente carga sin que nadie tenga que republicar nada.
//
// Aquí también se registra la vista (trazabilidad para el promotor) y se recoge el
// interés — que NO es un compromiso económico.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { OpportunityPresentation } from "@/src/components/investor/OpportunityPresentation";
import {
  getInvestorSnapshot,
  registerInvitationView,
  setInvitationInterest,
} from "@/src/lib/investorPlatform/service";
import type { InterestValue, InvestorSnapshot } from "@/src/lib/investorPlatform/types";

const OPTIONS: { value: InterestValue; label: string; hint: string; tone: string }[] = [
  {
    value: "interesado",
    label: "Me interesa",
    hint: "El promotor te contactará para concretar.",
    tone: "var(--positive)",
  },
  {
    value: "mas_info",
    label: "Quiero más información",
    hint: "Le llegará tu petición.",
    tone: "var(--brand)",
  },
  {
    value: "descartada",
    label: "No me interesa",
    hint: "Dejarás de recibir avisos de esta operación.",
    tone: "var(--ink-subtle)",
  },
];

export default function OportunidadInversorPage() {
  const params = useParams<{ invitationId: string }>();
  const invitationId = typeof params?.invitationId === "string" ? params.invitationId : "";
  const router = useRouter();

  const [snapshot, setSnapshot] = useState<InvestorSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interest, setInterest] = useState<InterestValue | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!invitationId) return;
    let active = true;

    getInvestorSnapshot(invitationId)
      .then((s) => {
        if (!active) return;
        setSnapshot(s);
        // La vista se registra después de tener acceso confirmado. Si falla, no se
        // le cuenta al inversor como un error: no afecta a lo que puede ver.
        void registerInvitationView(invitationId).catch(() => {});
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "No se pudo abrir la oportunidad.");
      });

    return () => {
      active = false;
    };
  }, [invitationId]);

  const choose = useCallback(
    async (value: InterestValue) => {
      setBusy(true);
      try {
        await setInvitationInterest(invitationId, value);
        setInterest(value);
        toast.success(
          value === "descartada" ? "Has descartado la operación" : "El promotor recibirá tu respuesta",
        );
        if (value === "descartada") router.push("/i");
      } catch (e) {
        toast.error("No se pudo registrar tu respuesta", {
          description: e instanceof Error ? e.message : undefined,
        });
      } finally {
        setBusy(false);
      }
    },
    [invitationId, router],
  );

  if (error) {
    return (
      <div className="re-card p-6 text-center max-w-lg mx-auto space-y-3">
        <p className="text-lg font-extrabold text-ink tracking-tight">No se puede mostrar</p>
        <p className="text-sm text-ink-muted">{error}</p>
        <Link href="/i" className="btn-primary inline-flex">
          Volver a mis oportunidades
        </Link>
      </div>
    );
  }
  if (!snapshot) return <p className="text-sm text-ink-subtle">Cargando…</p>;

  return (
    <div className="space-y-6">
      <Link href="/i" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
        <span aria-hidden>←</span> Oportunidades
      </Link>

      <OpportunityPresentation snapshot={snapshot} />

      {/* Decisión del inversor. Expresar interés NO es invertir. */}
      <section className="re-card p-5 sm:p-6">
        <h2 className="text-lg font-extrabold text-ink tracking-tight">¿Qué quieres hacer?</h2>
        <p className="text-sm text-ink-muted mt-1 leading-relaxed">
          Responder aquí no te compromete a nada. Si decides participar, el promotor registrará la
          inversión y la verás en <b>Mis inversiones</b>.
        </p>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {OPTIONS.map((o) => {
            const active = interest === o.value;
            return (
              <button
                key={o.value}
                type="button"
                disabled={busy}
                onClick={() => void choose(o.value)}
                className={`rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                  active ? "text-white" : "border-line bg-white hover:bg-[var(--surface-alt)]"
                }`}
                style={active ? { background: o.tone, borderColor: o.tone } : undefined}
              >
                <span className="block text-sm font-bold">{o.label}</span>
                <span className={`block text-xs mt-0.5 ${active ? "text-white/85" : "text-ink-subtle"}`}>
                  {o.hint}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

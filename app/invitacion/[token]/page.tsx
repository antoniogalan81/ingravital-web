"use client";

// /invitacion/[token] — punto de entrada del inversor desde WhatsApp, email o enlace.
//
// El token identifica la OPORTUNIDAD, no a la persona: conocer la URL no da acceso.
// Secuencia:
//   1. Sin sesión  → identificación por magic link (email) u OTP (teléfono).
//   2. Con sesión  → `claim_invitation(token)` comprueba en el servidor que la
//      identidad verificada coincide con la del destinatario y vincula contacto↔usuario.
//   3. Éxito       → al Área Inversor, a la oportunidad concreta.
//
// Todos los errores vienen del servidor y se muestran tal cual: identidad que no
// coincide, invitación revocada o caducada. Aquí no se decide nada de seguridad.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/src/contexts/AuthContext";
import { useRoles } from "@/src/contexts/RoleContext";
import { claimInvitation } from "@/src/lib/investorPlatform/service";
import { IdentifyForm } from "@/src/components/auth/IdentifyForm";

type State = { phase: "idle" } | { phase: "error"; message: string };

export default function InvitacionPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();
  const { refresh: refreshRoles } = useRoles();
  const [state, setState] = useState<State>({ phase: "idle" });

  const claim = useCallback(async () => {
    try {
      const invitationId = await claimInvitation(token);
      // `claim_invitation` concede el rol inversor en la misma transacción.
      await refreshRoles();
      router.replace(`/i/oportunidad/${invitationId}`);
    } catch (e) {
      setState({
        phase: "error",
        message: e instanceof Error ? e.message : "No se pudo abrir la invitación.",
      });
    }
  }, [token, router, refreshRoles]);

  // El efecto solo dispara el trabajo ASÍNCRONO (reclamar la invitación). Lo que se
  // puede saber en el render —enlace sin token, o sesión ausente— se deriva aquí y
  // no se escribe en el estado: hacerlo dentro del efecto provoca renders en cascada.
  useEffect(() => {
    if (authLoading || !token || !user) return;
    // El linter marca `claim()` porque la función contiene un setState. Aquí NO es
    // síncrono: ocurre en el `catch`, después de la llamada de red, así que no
    // provoca renders en cascada. Reclamar la invitación al cargar es exactamente
    // el caso para el que existe un efecto (arrancar trabajo contra un sistema
    // externo), y no hay ningún evento de usuario del que colgarlo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void claim();
  }, [authLoading, user, token, claim]);

  const phase: "invalid" | "loading" | "identify" | "claiming" | "error" = !token
    ? "invalid"
    : authLoading
      ? "loading"
      : !user
        ? "identify"
        : state.phase === "error"
          ? "error"
          : "claiming";

  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/invitacion/${token}` : "";

  return (
    <main className="min-h-screen app-bg flex flex-col">
      <header className="app-chrome">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center">
          <Link href="/" className="flex items-center shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-horizontal-dark.svg" alt="Invergravital" className="h-6 w-auto" />
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {phase === "loading" || phase === "claiming" ? (
            <div className="re-card p-8 text-center">
              <p className="text-sm text-ink-subtle">
                {phase === "claiming" ? "Comprobando tu acceso…" : "Cargando…"}
              </p>
            </div>
          ) : null}

          {phase === "identify" ? (
            <>
              <div className="text-center mb-5">
                <h1 className="text-2xl font-extrabold text-ink tracking-tight">
                  Te han compartido una oportunidad
                </h1>
                <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                  Para verla, confirma que eres la persona invitada.
                </p>
              </div>
              <IdentifyForm redirectTo={redirectTo} />
            </>
          ) : null}

          {phase === "error" || phase === "invalid" ? (
            <div className="re-card p-6 text-center space-y-3">
              <span className="empty-state-icon !m-0 !w-12 !h-12 mx-auto">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
              </span>
              <p className="text-lg font-extrabold text-ink tracking-tight">No se pudo abrir</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                {phase === "invalid" ? "El enlace no es válido." : state.phase === "error" ? state.message : ""}
              </p>
              <p className="text-xs text-ink-subtle leading-relaxed">
                Si crees que es un error, pide al promotor que vuelva a enviarte la invitación al
                email o teléfono donde la recibiste.
              </p>
              {user ? (
                <Link href="/i" className="btn-primary inline-flex mt-1">
                  Ir a mi área
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

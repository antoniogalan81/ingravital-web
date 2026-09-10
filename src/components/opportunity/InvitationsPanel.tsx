"use client";

// Destinatarios de una oportunidad: a quién se le comparte, por qué canal, y qué
// ha hecho con ella (recibida / abierta / interesado).
//
// El envío NO usa ninguna API de terceros: WhatsApp abre `wa.me` con el mensaje ya
// escrito y el email abre el cliente del promotor con `mailto:`. En los dos casos el
// promotor solo tiene que pulsar enviar, y el mensaje lleva únicamente el enlace
// seguro — ninguna cifra financiera viaja por el canal.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createInvitation,
  deleteInvitation,
  listInvitations,
  markInvitationSent,
  restoreInvitation,
  revokeInvitation,
  setInvitationExpiry,
  setInvitationVisibility,
} from "@/src/lib/investorPlatform/service";
import {
  availableChannels,
  invitationUrl,
  mailtoLink,
  whatsappLink,
} from "@/src/lib/investorPlatform/share";
import {
  INVITATION_STATUS_LABEL,
  type Invitation,
  type InvitationChannel,
  type InvestorContact,
  type Opportunity,
  type VisibilityMap,
} from "@/src/lib/investorPlatform/types";
import { VisibilityPanel } from "./VisibilityPanel";

const STATUS_PILL: Record<string, string> = {
  pendiente: "pill-neutral",
  enviada: "pill-info",
  vista: "pill-accent",
  interesado: "pill-positive",
  descartada: "pill-neutral",
  revocada: "pill-negative",
  caducada: "pill-warning",
};

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("es-ES") : "—";
}

/** Estado mostrado: la caducidad manda sobre lo que diga la columna `status`. */
function effectiveStatus(inv: Invitation): string {
  if (inv.revokedAt) return "revocada";
  if (inv.expiresAt && new Date(inv.expiresAt) <= new Date()) return "caducada";
  return inv.status;
}

export function InvitationsPanel({
  opportunity,
  contacts,
  onOpenCrm,
}: {
  opportunity: Opportunity;
  contacts: InvestorContact[];
  onOpenCrm: () => void;
}) {
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingVisibility, setEditingVisibility] = useState<string | null>(null);

  const load = useCallback(() => {
    listInvitations(opportunity.id)
      .then((rows) => {
        setInvitations(rows);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar los destinatarios."));
  }, [opportunity.id]);

  useEffect(() => load(), [load]);

  const invitedContactIds = useMemo(
    () => new Set((invitations ?? []).map((i) => i.contactId).filter(Boolean) as string[]),
    [invitations],
  );

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts
      .filter((c) => !invitedContactIds.has(c.id))
      .filter((c) =>
        !q
          ? true
          : [c.firstName, c.lastName, c.email, c.phone].filter(Boolean).join(" ").toLowerCase().includes(q),
      );
  }, [contacts, invitedContactIds, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const share = async (channel: InvitationChannel) => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const chosen = contacts.filter((c) => selected.has(c.id));
      const created: { contact: InvestorContact; invitation: Invitation }[] = [];

      for (const contact of chosen) {
        const invitation = await createInvitation({
          opportunityId: opportunity.id,
          contact,
          channel,
          visibility: opportunity.visibility,
        });
        created.push({ contact, invitation });
      }

      // Un enlace por destinatario: la trazabilidad exige que no se comparta uno común.
      if (channel === "link") {
        const urls = created.map((c) => `${c.contact.firstName}: ${invitationUrl(c.invitation.token)}`);
        await navigator.clipboard.writeText(urls.join("\n"));
        toast.success(`${created.length} enlace(s) copiados`, {
          description: "Cada inversor tiene el suyo.",
        });
        for (const c of created) await markInvitationSent(c.invitation.id);
      } else {
        // Se abre un canal por destinatario. El navegador puede bloquear varias
        // ventanas: se avisa en lugar de fingir que se enviaron todas.
        let opened = 0;
        for (const c of created) {
          const href =
            channel === "whatsapp"
              ? whatsappLink(opportunity, c.contact, c.invitation)
              : mailtoLink(opportunity, c.contact, c.invitation);
          if (!href) continue;
          const w = window.open(href, "_blank", "noopener");
          if (w) opened += 1;
          await markInvitationSent(c.invitation.id);
        }
        if (opened < created.length) {
          toast.warning("El navegador bloqueó alguna ventana", {
            description: "Las invitaciones están creadas: usa «Reenviar» en cada fila.",
          });
        } else {
          toast.success(`Preparado el envío a ${opened} inversor(es)`);
        }
      }

      setSelected(new Set());
      load();
    } catch (e) {
      toast.error("No se pudo compartir", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const resend = (inv: Invitation) => {
    const contact = contacts.find((c) => c.id === inv.contactId);
    if (!contact) {
      void navigator.clipboard.writeText(invitationUrl(inv.token));
      toast.success("Enlace copiado");
      return;
    }
    const href =
      inv.channel === "whatsapp"
        ? whatsappLink(opportunity, contact, inv)
        : inv.channel === "email"
          ? mailtoLink(opportunity, contact, inv)
          : null;
    if (href) window.open(href, "_blank", "noopener");
    else {
      void navigator.clipboard.writeText(invitationUrl(inv.token));
      toast.success("Enlace copiado");
    }
  };

  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      load();
    } catch (e) {
      toast.error("No se pudo completar", { description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Elegir destinatarios ── */}
      <section className="re-card p-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Elegir destinatarios</p>
          <button type="button" onClick={onOpenCrm} className="text-xs font-semibold text-brand hover:underline">
            Gestionar inversores
          </button>
        </div>

        {contacts.length === 0 ? (
          <p className="text-sm text-ink-subtle">
            Todavía no tienes inversores en tu CRM.{" "}
            <button type="button" onClick={onOpenCrm} className="font-semibold text-brand hover:underline">
              Añade el primero
            </button>
            .
          </p>
        ) : (
          <>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar inversor…"
              aria-label="Buscar inversor"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />

            <div className="max-h-56 overflow-y-auto divide-y divide-[var(--line)] rounded-lg border border-line">
              {candidates.length === 0 ? (
                <p className="px-3 py-4 text-sm text-ink-subtle">
                  {search ? "Ningún inversor coincide." : "Ya has invitado a todos tus contactos."}
                </p>
              ) : (
                candidates.map((c) => {
                  const ch = availableChannels(c);
                  return (
                    <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--surface-alt)]">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="h-4 w-4 shrink-0 accent-[var(--brand)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink truncate">
                          {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                        </span>
                        <span className="block text-[11px] text-ink-subtle truncate">
                          {[c.email, c.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                        </span>
                      </span>
                      <span className="flex gap-1 shrink-0">
                        {ch.whatsapp ? <span className="pill pill-positive !text-[10px]">WhatsApp</span> : null}
                        {ch.email ? <span className="pill pill-info !text-[10px]">Email</span> : null}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["whatsapp", "Compartir por WhatsApp"],
                  ["email", "Compartir por email"],
                  ["link", "Copiar enlaces"],
                ] as [InvitationChannel, string][]
              ).map(([channel, label]) => (
                <button
                  key={channel}
                  type="button"
                  disabled={busy || selected.size === 0}
                  onClick={() => void share(channel)}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: channel === "whatsapp" ? "var(--positive)" : "var(--brand)" }}
                >
                  {label}
                  {selected.size > 0 ? ` (${selected.size})` : ""}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── Seguimiento ── */}
      <section className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">
          Compartida con {invitations?.length ?? 0}
        </p>

        {error ? (
          <p className="text-sm text-[var(--negative)]">{error}</p>
        ) : invitations === null ? (
          <p className="text-sm text-ink-subtle">Cargando…</p>
        ) : invitations.length === 0 ? (
          <p className="text-sm text-ink-subtle">Aún no has compartido esta oportunidad con nadie.</p>
        ) : (
          <div className="space-y-2">
            {invitations.map((inv) => {
              const st = effectiveStatus(inv);
              const contact = contacts.find((c) => c.id === inv.contactId);
              return (
                <div key={inv.id} className="re-card p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink truncate">
                        {contact
                          ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
                          : (inv.invitedEmail ?? inv.invitedPhone ?? "Destinatario")}
                      </p>
                      <p className="text-[11px] text-ink-subtle">
                        {inv.channel} · creada {fmtDate(inv.createdAt)}
                        {inv.firstViewedAt ? ` · abierta ${fmtDate(inv.firstViewedAt)}` : ""}
                        {inv.viewCount > 0 ? ` · ${inv.viewCount} visita(s)` : ""}
                      </p>
                    </div>
                    <span className={`pill ${STATUS_PILL[st] ?? "pill-neutral"} shrink-0`}>
                      {INVITATION_STATUS_LABEL[st as keyof typeof INVITATION_STATUS_LABEL] ?? st}
                    </span>
                  </div>

                  {inv.interestNote ? (
                    <p className="text-xs text-ink-muted bg-[var(--surface-alt)] rounded-lg px-3 py-2">
                      «{inv.interestNote}»
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                    <button type="button" onClick={() => resend(inv)} className="font-semibold text-brand hover:underline">
                      Reenviar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(invitationUrl(inv.token));
                        toast.success("Enlace copiado");
                      }}
                      className="font-semibold text-ink-muted hover:text-ink"
                    >
                      Copiar enlace
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingVisibility(editingVisibility === inv.id ? null : inv.id)}
                      className="font-semibold text-ink-muted hover:text-ink"
                    >
                      Visibilidad
                    </button>
                    <label className="flex items-center gap-1.5 text-ink-muted">
                      Caduca:
                      <input
                        type="date"
                        value={inv.expiresAt ? inv.expiresAt.slice(0, 10) : ""}
                        onChange={(e) =>
                          void act(
                            () =>
                              setInvitationExpiry(
                                inv.id,
                                e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null,
                              ),
                            e.target.value ? "Caducidad actualizada" : "Caducidad retirada",
                          )
                        }
                        className="rounded border border-line px-1.5 py-0.5 text-xs"
                      />
                    </label>
                    {inv.revokedAt ? (
                      <button
                        type="button"
                        onClick={() => void act(() => restoreInvitation(inv.id), "Acceso reactivado")}
                        className="font-semibold text-[var(--positive)] hover:underline"
                      >
                        Reactivar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void act(() => revokeInvitation(inv.id), "Acceso revocado")}
                        className="font-semibold text-[var(--negative)] hover:underline"
                      >
                        Revocar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("¿Eliminar este acceso? El inversor dejará de verlo.")) {
                          void act(() => deleteInvitation(inv.id), "Acceso eliminado");
                        }
                      }}
                      className="font-semibold text-ink-subtle hover:text-[var(--negative)]"
                    >
                      Eliminar
                    </button>
                  </div>

                  {editingVisibility === inv.id ? (
                    <div className="border-t border-line pt-3">
                      <VisibilityPanel
                        title="Visibilidad solo para este inversor"
                        description="Sustituye a la de la oportunidad. Se aplica al instante."
                        visibility={inv.visibility}
                        onChange={(next: VisibilityMap) =>
                          void act(() => setInvitationVisibility(inv.id, next), "Visibilidad actualizada")
                        }
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default InvitationsPanel;

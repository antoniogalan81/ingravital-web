"use client";

// /i/perfil — datos del inversor y activación del rol promotor.
//
// El inversor ve la ficha de contacto que el promotor tiene de él (solo la suya:
// la policy `contacts: linked self read` lo garantiza). No la edita desde aquí —
// esos datos pertenecen al CRM del promotor— pero sí ve qué se está usando para
// contactarle, que es lo que le afecta.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/contexts/AuthContext";
import { useRoles } from "@/src/contexts/RoleContext";
import { supabase } from "@/src/lib/supabaseClient";

type LinkedContact = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

export default function PerfilInversorPage() {
  const { user } = useAuth();
  const { hasPromotor, addRole, setArea } = useRoles();
  const router = useRouter();
  const [contacts, setContacts] = useState<LinkedContact[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("investor_contacts")
      .select("id, first_name, last_name, email, phone")
      .then(({ data }) => {
        if (active) setContacts((data as LinkedContact[]) ?? []);
      });
    return () => {
      active = false;
    };
  }, []);

  const activatePromotor = async () => {
    setBusy(true);
    try {
      await addRole("promotor");
      setArea("promotor");
      toast.success("Área Promotor activada");
      router.push("/panel");
    } catch (e) {
      toast.error("No se pudo activar", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const me = contacts?.[0];

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold text-ink tracking-tight">Perfil</h1>
        <p className="text-sm text-ink-muted mt-1">Tus datos de acceso y de contacto.</p>
      </div>

      <section className="re-card p-5 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle">Cuenta</p>
        <dl className="divide-y divide-[var(--line)]">
          <div className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-sm font-semibold text-ink">Email</dt>
            <dd className="text-sm text-ink-muted">{user?.email ?? "—"}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-sm font-semibold text-ink">Teléfono</dt>
            <dd className="text-sm text-ink-muted">{user?.phone || "—"}</dd>
          </div>
        </dl>
        <p className="text-[11px] text-ink-subtle leading-relaxed">
          Accedes sin contraseña: cada entrada se confirma por enlace o código.
        </p>
      </section>

      {me ? (
        <section className="re-card p-5 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle">
            Cómo te contacta el promotor
          </p>
          <dl className="divide-y divide-[var(--line)]">
            <div className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-sm font-semibold text-ink">Nombre</dt>
              <dd className="text-sm text-ink-muted">
                {[me.first_name, me.last_name].filter(Boolean).join(" ")}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-sm font-semibold text-ink">Email</dt>
              <dd className="text-sm text-ink-muted">{me.email ?? "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-sm font-semibold text-ink">Teléfono</dt>
              <dd className="text-sm text-ink-muted">{me.phone ?? "—"}</dd>
            </div>
          </dl>
          <p className="text-[11px] text-ink-subtle leading-relaxed">
            Estos datos los mantiene el promotor que te invitó. Si algo no es correcto, díselo a él.
          </p>
        </section>
      ) : null}

      {!hasPromotor ? (
        <section className="re-card p-5">
          <p className="text-sm font-bold text-ink">¿También analizas tus propias operaciones?</p>
          <p className="text-sm text-ink-muted mt-1 leading-relaxed">
            Puedes activar el Área Promotor en esta misma cuenta y cambiar entre las dos cuando
            quieras. No necesitas registrarte otra vez.
          </p>
          <button
            type="button"
            onClick={() => void activatePromotor()}
            disabled={busy}
            className="btn-primary mt-4"
          >
            {busy ? "Activando…" : "Activar Área Promotor"}
          </button>
        </section>
      ) : null}
    </div>
  );
}

"use client";

// INVERSORES (WEB) — CRM REAL de contactos del promotor.
// Lee y escribe únicamente a través de `src/lib/investorPlatform/service.ts`
// (RLS de Supabase). Sin datos de ejemplo: si no hay contactos, estado vacío.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import AppGate from "@/components/AppGate";
import { ContactFormModal } from "@/src/components/investors/ContactFormModal";
import { ContactRow } from "@/src/components/investors/ContactRow";
import { CONTACT_STATUSES, STATUS_PILL, errorMessage } from "@/src/components/investors/shared";
import {
  deleteContact,
  listContacts,
  updateContact,
} from "@/src/lib/investorPlatform/service";
import {
  CONTACT_STATUS_LABEL,
  type ContactStatus,
  type InvestorContact,
} from "@/src/lib/investorPlatform/types";

type StatusFilter = ContactStatus | "todos";

/** Texto buscable de un contacto: nombre, email y teléfonos sin separadores. */
function haystack(c: InvestorContact): string {
  const digits = (v: string | null) => (v ?? "").replace(/[^0-9]/g, "");
  return [
    c.firstName,
    c.lastName ?? "",
    c.email ?? "",
    c.phone ?? "",
    c.whatsapp ?? "",
    digits(c.phone),
    digits(c.whatsapp),
  ]
    .join(" ")
    .toLowerCase();
}

function ContactsCrm() {
  const [contacts, setContacts] = useState<InvestorContact[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InvestorContact | null>(null);

  // No es `async`: el estado solo se toca dentro de los callbacks de la promesa,
  // nunca de forma síncrona dentro del efecto (regla react-hooks/set-state-in-effect).
  const load = useCallback(() => {
    listContacts()
      .then((rows) => {
        setContacts(rows);
        setLoadError(null);
      })
      .catch((e: unknown) => {
        const msg = errorMessage(e, "No se pudieron cargar los contactos.");
        setContacts([]);
        setLoadError(msg);
        toast.error("No se pudieron cargar los contactos", { description: msg });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const map = new Map<ContactStatus, number>();
    for (const c of contacts ?? []) map.set(c.status, (map.get(c.status) ?? 0) + 1);
    return map;
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/[^0-9]/g, "");
    return (contacts ?? []).filter((c) => {
      if (statusFilter !== "todos" && c.status !== statusFilter) return false;
      if (!q) return true;
      const text = haystack(c);
      return text.includes(q) || (qDigits.length >= 3 && text.includes(qDigits));
    });
  }, [contacts, query, statusFilter]);

  const changeStatus = async (id: string, status: ContactStatus) => {
    try {
      await updateContact(id, { status });
      setContacts((prev) => (prev ?? []).map((c) => (c.id === id ? { ...c, status } : c)));
      toast.success(`Estado actualizado a ${CONTACT_STATUS_LABEL[status]}`);
    } catch (e) {
      const msg = errorMessage(e, "No se pudo cambiar el estado.");
      toast.error("No se pudo cambiar el estado", { description: msg });
      load();
    }
  };

  const removeContact = async (id: string) => {
    try {
      await deleteContact(id);
      setContacts((prev) => (prev ?? []).filter((c) => c.id !== id));
      toast.success("Contacto eliminado");
    } catch (e) {
      toast.error("No se pudo eliminar el contacto", {
        description: errorMessage(e, "No se pudo eliminar el contacto."),
      });
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (contact: InvestorContact) => {
    setEditing(contact);
    setFormOpen(true);
  };

  if (contacts === null) {
    return <p className="text-sm text-ink-subtle">Cargando contactos…</p>;
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {loadError && (
        <div className="re-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="flex-1 text-sm font-semibold" style={{ color: "var(--negative)" }}>
            {loadError}
          </p>
          <button type="button" onClick={load} className="btn-secondary shrink-0">
            Reintentar
          </button>
        </div>
      )}

      {/* Buscador + alta */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <label className="sr-only" htmlFor="contact-search">
            Buscar por nombre, email o teléfono
          </label>
          <input
            id="contact-search"
            type="search"
            className="form-input"
            placeholder="Buscar por nombre, email o teléfono…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="button" onClick={openCreate} className="btn-primary shrink-0">
          Nuevo contacto
        </button>
      </div>

      {/* Filtro por estado */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
        <button
          type="button"
          onClick={() => setStatusFilter("todos")}
          aria-pressed={statusFilter === "todos"}
          className={`pill ${statusFilter === "todos" ? "pill-info" : "pill-neutral"}`}
          style={statusFilter === "todos" ? { boxShadow: "inset 0 0 0 1px currentColor" } : undefined}
        >
          Todos · {contacts.length}
        </button>
        {CONTACT_STATUSES.map((s) => {
          const isActive = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              aria-pressed={isActive}
              className={`pill ${isActive ? STATUS_PILL[s] : "pill-neutral"}`}
              style={isActive ? { boxShadow: "inset 0 0 0 1px currentColor" } : undefined}
            >
              {CONTACT_STATUS_LABEL[s]} · {counts.get(s) ?? 0}
            </button>
          );
        })}
      </div>

      {contacts.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 20h5v-1a4 4 0 00-3-3.87M9 20H4v-1a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-2a3 3 0 10-2.5-4.5"
              />
            </svg>
          </span>
          <h2 className="text-xl font-extrabold text-ink tracking-tight">Aún no tienes contactos</h2>
          <p className="text-sm text-ink-muted mt-2 max-w-md mx-auto leading-relaxed">
            Añade a las personas con las que hablas de tus operaciones. Con un email o un teléfono es
            suficiente para poder invitarlas después a una oportunidad.
          </p>
          <button type="button" onClick={openCreate} className="btn-primary mt-6">
            Añadir el primer contacto
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="re-card p-6 text-center">
          <p className="text-sm text-ink-muted">Ningún contacto coincide con la búsqueda o el filtro.</p>
        </div>
      ) : (
        <div>
          <div className="section-header">
            <p className="section-label">Contactos</p>
            <span className="text-xs text-ink-subtle font-semibold">
              {filtered.length} de {contacts.length}
            </span>
          </div>
          <ul className="re-card overflow-hidden list-none">
            {filtered.map((c) => (
              <ContactRow
                key={c.id}
                contact={c}
                onStatusChange={changeStatus}
                onEdit={openEdit}
                onDelete={removeContact}
              />
            ))}
          </ul>
        </div>
      )}

      {formOpen && (
        <ContactFormModal
          contact={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

export default function InversoresPage() {
  return (
    <AppGate
      active="inversores"
      label="Relación con inversores"
      title="Inversores"
      subtitle="Tu agenda de contactos e inversores: quién es cada uno, en qué punto está y por qué canal puedes escribirle."
    >
      <ContactsCrm />
    </AppGate>
  );
}

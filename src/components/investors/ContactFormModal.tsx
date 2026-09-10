"use client";

// Alta y edición de un contacto del CRM. Escribe SIEMPRE a través de
// `createContact` / `updateContact`: aquí no hay consultas a Supabase.
// Regla de negocio reflejada en la UI: hace falta email O teléfono, no ambos.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ModalPortal } from "@/src/components/ui/ModalPortal";
import { createContact, updateContact } from "@/src/lib/investorPlatform/service";
import {
  CONTACT_STATUS_LABEL,
  type ContactStatus,
  type InvestorContact,
} from "@/src/lib/investorPlatform/types";
import { CONTACT_STATUSES, errorMessage } from "./shared";

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  whatsapp: string;
  notes: string;
  source: string;
  status: ContactStatus;
};

function initialState(contact: InvestorContact | null): FormState {
  return {
    firstName: contact?.firstName ?? "",
    lastName: contact?.lastName ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    whatsapp: contact?.whatsapp ?? "",
    notes: contact?.notes ?? "",
    source: "",
    status: contact?.status ?? "nuevo",
  };
}

export function ContactFormModal({
  contact,
  onClose,
  onSaved,
}: {
  /** `null` = alta; un contacto = edición. */
  contact: InvestorContact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialState(contact));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const isEdit = contact !== null;

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    if (!form.firstName.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!form.email.trim() && !form.phone.trim()) {
      setError("Hace falta al menos un email o un teléfono para poder contactar.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (contact) {
        await updateContact(contact.id, {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          whatsapp: form.whatsapp,
          notes: form.notes,
          status: form.status,
        });
        toast.success("Contacto actualizado");
      } else {
        await createContact({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          whatsapp: form.whatsapp,
          notes: form.notes,
          status: form.status,
          source: form.source.trim() || undefined,
        });
        toast.success("Contacto creado");
      }
      onSaved();
    } catch (err) {
      const msg = errorMessage(err, "No se pudo guardar el contacto.");
      setError(msg);
      toast.error(isEdit ? "No se pudo actualizar el contacto" : "No se pudo crear el contacto", {
        description: msg,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
        <button
          type="button"
          aria-label="Cerrar formulario"
          onClick={onClose}
          className="absolute inset-0 bg-[rgba(9,17,32,0.55)]"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-form-title"
          className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl"
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-white px-5 py-4">
            <div className="min-w-0">
              <p className="section-label">{isEdit ? "Editar contacto" : "Nuevo contacto"}</p>
              <h2 id="contact-form-title" className="text-lg font-extrabold text-ink tracking-tight mt-0.5">
                {isEdit ? contact.firstName : "Añadir a la agenda de inversores"}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0 rounded-lg p-2 text-ink-subtle hover:bg-[var(--surface-alt)] hover:text-ink transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <form onSubmit={submit} className="px-5 py-5 space-y-4" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label" htmlFor="contact-firstName">Nombre *</label>
                <input
                  id="contact-firstName"
                  ref={firstFieldRef}
                  className="form-input"
                  value={form.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="contact-lastName">Apellidos</label>
                <input
                  id="contact-lastName"
                  className="form-input"
                  value={form.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="rounded-xl border border-line bg-[var(--surface-alt)] px-4 py-3">
              <p className="text-xs font-semibold text-ink-muted">
                Indica <span className="text-ink font-bold">email o teléfono</span>. Con uno de los dos basta:
                es la vía por la que le harás llegar las oportunidades.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="form-label" htmlFor="contact-email">Email</label>
                  <input
                    id="contact-email"
                    type="email"
                    className="form-input"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="contact-phone">Teléfono</label>
                  <input
                    id="contact-phone"
                    type="tel"
                    className="form-input"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    autoComplete="tel"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label" htmlFor="contact-whatsapp">WhatsApp</label>
                <input
                  id="contact-whatsapp"
                  type="tel"
                  className="form-input"
                  value={form.whatsapp}
                  onChange={(e) => set("whatsapp", e.target.value)}
                  placeholder="Si es distinto del teléfono"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="contact-status">Estado</label>
                <select
                  id="contact-status"
                  className="form-select"
                  value={form.status}
                  onChange={(e) => set("status", e.target.value as ContactStatus)}
                >
                  {CONTACT_STATUSES.map((s) => (
                    <option key={s} value={s}>{CONTACT_STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </div>
            </div>

            {isEdit ? (
              <p className="text-xs text-ink-subtle">
                Origen: <span className="font-semibold text-ink-muted">{contact.source ?? "sin especificar"}</span>
                {" · se fija al crear el contacto y no se modifica aquí."}
              </p>
            ) : (
              <div>
                <label className="form-label" htmlFor="contact-source">Origen</label>
                <input
                  id="contact-source"
                  className="form-input"
                  value={form.source}
                  onChange={(e) => set("source", e.target.value)}
                  placeholder="Referido, evento, LinkedIn… (por defecto: manual)"
                />
              </div>
            )}

            <div>
              <label className="form-label" htmlFor="contact-notes">Notas</label>
              <textarea
                id="contact-notes"
                className="form-input min-h-24 resize-y"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>

            <p aria-live="polite" className="min-h-5 text-sm font-semibold" style={{ color: "var(--negative)" }}>
              {error}
            </p>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear contacto"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}

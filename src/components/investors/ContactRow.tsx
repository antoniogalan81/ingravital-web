"use client";

// Una ficha de contacto del CRM: datos reales, canales realmente disponibles
// (`availableChannels`), cambio de estado en la propia fila y borrado con
// confirmación en dos pasos. No accede a datos: recibe callbacks del contenedor.

import { useState } from "react";
import {
  CONTACT_STATUS_LABEL,
  type ContactStatus,
  type InvestorContact,
} from "@/src/lib/investorPlatform/types";
import { availableChannels, waNumber } from "@/src/lib/investorPlatform/share";
import { CONTACT_STATUSES, STATUS_PILL } from "./shared";

function fullName(c: InvestorContact): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.firstName;
}

export function ContactRow({
  contact,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  contact: InvestorContact;
  onStatusChange: (id: string, status: ContactStatus) => Promise<void>;
  onEdit: (contact: InvestorContact) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const channels = availableChannels(contact);
  const wa = waNumber(contact.whatsapp ?? contact.phone);
  const name = fullName(contact);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="px-4 sm:px-5 py-4 border-b border-line last:border-b-0 transition-colors hover:bg-[var(--surface-alt)]">
      <div className="flex items-start gap-3 sm:gap-4">
        <span
          aria-hidden="true"
          className="w-10 h-10 shrink-0 rounded-full grid place-items-center font-extrabold"
          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
        >
          {name.charAt(0).toUpperCase()}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-bold text-ink break-words">{name}</p>
            <span className={`pill ${STATUS_PILL[contact.status]}`}>
              {CONTACT_STATUS_LABEL[contact.status]}
            </span>
          </div>

          <div className="mt-1 space-y-0.5">
            {contact.email && (
              <p className="text-xs text-ink-muted font-medium break-all">
                <a className="hover:underline" href={`mailto:${contact.email}`}>{contact.email}</a>
              </p>
            )}
            {contact.phone && (
              <p className="text-xs text-ink-muted font-medium">
                <a className="hover:underline" href={`tel:${contact.phone}`}>{contact.phone}</a>
              </p>
            )}
            {contact.source && (
              <p className="text-xs text-ink-subtle font-medium">Origen: {contact.source}</p>
            )}
          </div>

          {contact.notes && (
            <p className="text-xs text-ink-muted mt-2 leading-relaxed whitespace-pre-line">{contact.notes}</p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            <span className={`pill ${channels.whatsapp ? "pill-positive" : "pill-neutral"}`}>
              {channels.whatsapp ? "WhatsApp disponible" : "Sin WhatsApp"}
            </span>
            <span className={`pill ${channels.email ? "pill-positive" : "pill-neutral"}`}>
              {channels.email ? "Email disponible" : "Sin email"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <label className="sr-only" htmlFor={`status-${contact.id}`}>
              Estado de {name}
            </label>
            <select
              id={`status-${contact.id}`}
              className="form-select !w-auto !py-1.5 !text-sm"
              value={contact.status}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value as ContactStatus;
                void run(() => onStatusChange(contact.id, next));
              }}
            >
              {CONTACT_STATUSES.map((s) => (
                <option key={s} value={s}>{CONTACT_STATUS_LABEL[s]}</option>
              ))}
            </select>

            {wa && (
              <a
                href={`https://wa.me/${wa}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary !py-1.5 !px-3"
              >
                Abrir WhatsApp
              </a>
            )}

            <button type="button" onClick={() => onEdit(contact)} className="btn-secondary !py-1.5 !px-3">
              Editar
            </button>

            {confirming ? (
              <span className="inline-flex items-center gap-2">
                <span className="text-xs font-semibold text-ink-muted">¿Eliminar {name}?</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => onDelete(contact.id))}
                  className="rounded-xl px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ background: "var(--negative)" }}
                >
                  Sí, eliminar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="btn-secondary !py-1.5 !px-3"
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label={`Eliminar contacto ${name}`}
                className="btn-secondary !py-1.5 !px-3"
                style={{ color: "var(--negative)" }}
              >
                Eliminar
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

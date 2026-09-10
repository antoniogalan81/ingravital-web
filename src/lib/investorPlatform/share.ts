// src/lib/investorPlatform/share.ts
// Generación de los canales de envío de una invitación.
//
// DECISIÓN: no se contrata ninguna API de WhatsApp ni servicio de email en esta fase.
//  · WhatsApp → enlace `wa.me` con mensaje preescrito: el promotor solo pulsa enviar.
//  · Email    → `mailto:` con asunto y cuerpo preparados, usando su propio cliente.
//  · Enlace   → se copia al portapapeles.
// Ninguno de los tres transporta datos financieros sensibles: solo el enlace seguro.
// Al abrirlo hay que identificarse (magic link u OTP), así que conocer la URL no basta.

import type { Invitation, InvestorContact, Opportunity } from "./types";

/** URL pública de la invitación. El token identifica la oportunidad, no autentica. */
export function invitationUrl(token: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "https://www.invergravital.com");
  return `${base}/invitacion/${token}`;
}

/** Teléfono a formato wa.me (solo dígitos, con prefijo internacional). */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, "");
  return digits.length >= 9 ? digits : null;
}

function firstName(contact: InvestorContact): string {
  return contact.firstName.trim().split(/\s+/)[0] || "";
}

/**
 * Mensaje breve y honesto: qué es, quién lo envía y qué se espera.
 * Deliberadamente SIN cifras de rentabilidad: esas se ven tras identificarse.
 */
export function invitationMessage(
  opportunity: Opportunity,
  contact: InvestorContact,
  url: string,
): string {
  const name = firstName(contact);
  const saludo = name ? `Hola ${name}` : "Hola";
  const donde = opportunity.location ? ` en ${opportunity.location}` : "";
  return [
    `${saludo},`,
    ``,
    `Te comparto una oportunidad de inversión inmobiliaria${donde}: ${opportunity.title}.`,
    ``,
    `Puedes ver el detalle aquí:`,
    url,
    ``,
    `El acceso es personal: te pedirá confirmar tu identidad antes de mostrarte la información.`,
  ].join("\n");
}

export function whatsappLink(
  opportunity: Opportunity,
  contact: InvestorContact,
  invitation: Invitation,
  origin?: string,
): string | null {
  const number = waNumber(contact.whatsapp ?? contact.phone);
  if (!number) return null;
  const text = invitationMessage(opportunity, contact, invitationUrl(invitation.token, origin));
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function mailtoLink(
  opportunity: Opportunity,
  contact: InvestorContact,
  invitation: Invitation,
  origin?: string,
): string | null {
  if (!contact.email) return null;
  const subject = `Oportunidad de inversión: ${opportunity.title}`;
  const body = invitationMessage(opportunity, contact, invitationUrl(invitation.token, origin));
  return `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

/** Canales realmente disponibles para un contacto, según los datos que tenemos. */
export function availableChannels(contact: InvestorContact): {
  whatsapp: boolean;
  email: boolean;
  link: true;
} {
  return {
    whatsapp: waNumber(contact.whatsapp ?? contact.phone) !== null,
    email: Boolean(contact.email),
    link: true,
  };
}

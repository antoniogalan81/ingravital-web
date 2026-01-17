export type LeadInsertResult =
  | { ok: true; id?: string; duplicated?: boolean }
  | { ok: false; error: string; code?: string };

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function submitLead(rawEmail: string): Promise<LeadInsertResult> {
  const email = normalizeEmail(rawEmail);

  if (!email) return { ok: false, error: "Email requerido." };
  if (!isValidEmail(email)) return { ok: false, error: "Email no valido." };

  const res = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.ok) {
    return { ok: false, error: json?.error ?? "Error desconocido." , code: json?.code };
  }

  return { ok: true, id: json?.id, duplicated: json?.duplicated };
}

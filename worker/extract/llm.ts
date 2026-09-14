// worker/extract/llm.ts — Ayuda del modelo LOCAL (Ollama) cuando las reglas no bastan.
//
// · Solo rellena huecos (tipo dudoso, total, fecha, proveedor); nunca pisa lo leído por reglas.
// · Todo valor que devuelve se comprueba contra el texto: un importe o fecha que no aparece
//   en el documento se descarta. Lo aportado por el modelo nunca supera CONFIDENCE.llmCap,
//   así que siempre pasa por revisión humana.
// · El texto no sale del PC. Para añadir un proveedor externo autorizado basta con otra
//   función con esta misma firma en `assistants` (pipeline.ts); nada más cambia.

import { LIMITS } from "../policy.ts";
import { scoreConfidence, suggestCategory, type DocType, type Extraction } from "./fields.ts";
import { amountsIn, datesIn, isValidSpanishTaxId, sameAmount } from "./parse.ts";

export type Assistant = (text: string, fileName: string, current: Extraction) => Promise<Extraction>;

const SCHEMA = {
  type: "object",
  properties: {
    document_type: { type: "string", enum: ["invoice", "receipt", "sale", "loan", "budget", "certification", "other"] },
    supplier_name: { type: ["string", "null"] },
    supplier_tax_id: { type: ["string", "null"] },
    invoice_number: { type: ["string", "null"] },
    date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    subtotal: { type: ["number", "null"] },
    vat: { type: ["number", "null"] },
    total: { type: ["number", "null"] },
    description: { type: ["string", "null"] },
  },
  required: ["document_type", "total", "date"],
} as const;

type LlmFields = {
  document_type?: DocType;
  supplier_name?: string | null;
  supplier_tax_id?: string | null;
  invoice_number?: string | null;
  date?: string | null;
  subtotal?: number | null;
  vat?: number | null;
  total?: number | null;
  description?: string | null;
};

export function needsAssist(ex: Extraction): boolean {
  if (ex.documentType === "other") return true;
  if (["invoice", "receipt", "certification"].includes(ex.documentType)) {
    return ex.total === undefined || !ex.date || (!ex.supplier?.name && !ex.supplier?.taxId);
  }
  return false;
}

/** Aplica lo verificable de la respuesta del modelo. Exportado para probarlo sin Ollama. */
export function mergeVerified(text: string, current: Extraction, llm: LlmFields): Extraction {
  const ex: Extraction = structuredClone(current);
  const amounts = amountsIn(text);
  const inText = (v: number | null | undefined) => typeof v === "number" && Number.isFinite(v) && amounts.some((a) => sameAmount(a, v));
  let used = false;

  if (ex.documentType === "other" && llm.document_type && llm.document_type !== "other") {
    ex.documentType = llm.document_type;
    ex.checks.typeMargin = 0;
    used = true;
  }
  if (ex.total === undefined && inText(llm.total)) {
    ex.total = llm.total as number;
    ex.sources.total = "llm";
    used = true;
  }
  if (ex.subtotal === undefined && inText(llm.subtotal)) ex.subtotal = llm.subtotal as number;
  if (ex.vat === undefined && inText(llm.vat)) ex.vat = llm.vat as number;
  if (!ex.date && llm.date && datesIn(text).includes(llm.date)) {
    ex.date = llm.date;
    ex.sources.date = "llm";
    used = true;
  }
  const taxId = llm.supplier_tax_id?.toUpperCase().replace(/[\s.-]/g, "");
  if (!ex.supplier?.taxId && taxId && isValidSpanishTaxId(taxId) && text.toUpperCase().replace(/[\s.-]/g, "").includes(taxId)) {
    ex.supplier = { ...ex.supplier, taxId };
    ex.checks.taxIdValid = true;
    used = true;
  }
  const name = llm.supplier_name?.trim();
  if (!ex.supplier?.name && name && name.length <= 80 && text.toLowerCase().includes(name.toLowerCase())) {
    ex.supplier = { ...ex.supplier, name };
    ex.sources.supplier = "llm";
    used = true;
  }
  if (!ex.invoiceNumber && llm.invoice_number && text.includes(llm.invoice_number)) ex.invoiceNumber = llm.invoice_number;
  if (!ex.description && llm.description) ex.description = llm.description.slice(0, 140);
  if (!ex.suggestedCategory) ex.suggestedCategory = suggestCategory(ex.description, ex.supplier?.name);
  if (ex.subtotal !== undefined && ex.total !== undefined) {
    ex.checks.totalsConsistent = sameAmount(Math.round((ex.subtotal + (ex.vat ?? 0) - (ex.withholding ?? 0)) * 100) / 100, ex.total, 0.02);
  }
  ex.checks.llm = current.checks.llm || used;
  ex.confidence = ex.documentType === "other" ? 0 : scoreConfidence(ex);
  return ex;
}

export function ollamaAssistant(baseUrl: string, model: string): Assistant {
  return async (text, fileName, current) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIMITS.llmTimeoutMs);
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format: SCHEMA,
          options: { temperature: 0, num_ctx: 8192 },
          messages: [
            {
              role: "system",
              content:
                "Extraes datos de documentos administrativos españoles de una promoción inmobiliaria. Responde solo JSON según el esquema. Copia los valores tal como aparecen en el texto; si un dato no aparece, usa null. No inventes.",
            },
            { role: "user", content: `Nombre del archivo: ${fileName}\n\nTexto del documento:\n${text.slice(0, LIMITS.llmTextChars)}` },
          ],
        }),
      });
      if (!res.ok) return current;
      const body = (await res.json()) as { message?: { content?: string } };
      const fields = JSON.parse(body.message?.content ?? "{}") as LlmFields;
      return mergeVerified(text, current, fields);
    } catch {
      return current; // sin Ollama, o respuesta inválida: seguimos solo con reglas
    } finally {
      clearTimeout(timer);
    }
  };
}

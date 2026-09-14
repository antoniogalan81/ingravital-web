// worker/extract/fields.ts — Clasificación y extracción estructurada por reglas.
//
// Devuelve una `Extraction` con el origen de cada dato y las comprobaciones hechas. La
// confianza se CALCULA a partir de esas comprobaciones (no la "opina" ningún modelo).

import type { REExpenseCategory, RELoanRateType, RESaleStatus } from "../../src/lib/realEstateTracking.ts";
import { CONFIDENCE } from "../policy.ts";
import {
  amountAfter,
  amountsIn,
  dateAfter,
  datesIn,
  fileNameHints,
  foldForMatch,
  normalizeText,
  round2,
  sameAmount,
  taxIdsIn,
  type FileNameHints,
} from "./parse.ts";

export type DocType = "invoice" | "receipt" | "sale" | "loan" | "budget" | "certification" | "other";

export type FieldSource = "text" | "filename" | "llm" | "computed";

export type Extraction = {
  documentType: DocType;
  currency: "EUR";
  supplier?: { name?: string; taxId?: string };
  invoiceNumber?: string;
  date?: string;
  description?: string;
  subtotal?: number;
  vat?: number;
  vatRate?: number;
  withholding?: number;
  total?: number;
  paymentMethod?: string;
  suggestedCategory?: REExpenseCategory;
  relatedUnits?: string[];
  sale?: { status: RESaleStatus; buyer?: string; price?: number; deposit?: number; collected?: number; taxes?: string };
  loan?: {
    lender?: string;
    borrower?: string;
    principal?: number;
    interestRate?: number;
    rateType?: RELoanRateType;
    termMonths?: number;
    installment?: number;
    startDate?: string;
    maturityDate?: string;
    fees?: number;
  };
  phase?: string;
  sources: Record<string, FieldSource>;
  checks: { typeMargin: number; totalsConsistent?: boolean; taxIdValid?: boolean; fileNameAgrees?: boolean; ocr: boolean; llm: boolean };
  confidence: number;
};

export type ExtractInput = { text: string; fileName: string; ocr: boolean };

// ── Clasificación ─────────────────────────────────────────────────────────────

const SIGNALS: Record<Exclude<DocType, "other">, RegExp[]> = {
  invoice: [/\bfactura\b/i, /base\s+imponible/i, /\bi\.?\s?v\.?\s?a\.?\b/i, /\bminuta\b/i, /total\s+factura/i, /n[ºo°.]?\s*(de\s+)?factura/i],
  receipt: [/autoliquidaci[oó]n/i, /\badeudo\b/i, /justificante\s+de\s+pago/i, /carta\s+de\s+pago/i, /\brecibo\b/i, /importe\s+(a\s+)?ingresa/i, /\btasa\b/i],
  sale: [/escritura\s+de\s+compraventa/i, /contrato\s+(privado\s+)?de\s+(compraventa|arras)/i, /parte\s+compradora/i, /\bcomprador(a)?\b/i, /vende\s+y\s+transmite/i, /precio\s+de\s+(la\s+)?(compra)?venta/i],
  loan: [/pr[ée]stamo/i, /hipoteca(rio)?/i, /prestatari[oa]/i, /\bprestamista\b/i, /tipo\s+de\s+inter[eé]s/i, /\bt\.?\s?i\.?\s?n\.?\b/i, /cuadro\s+de\s+amortizaci[oó]n/i],
  budget: [/\bpresupuesto\b/i, /validez\s+(de\s+la\s+)?oferta/i],
  certification: [/certificaci[oó]n\s+(de\s+obra|n[ºo°])/i, /\bcertificaci[oó]n\b/i, /a\s+origen/i],
};

export function classify(text: string, fileName: string): { type: DocType; margin: number } {
  const scores = Object.entries(SIGNALS).map(([type, res]) => {
    let score = 0;
    for (const re of res) {
      if (re.test(text)) score += 1;
      if (re.test(fileName)) score += 0.5;
    }
    return { type: type as DocType, score };
  });
  // Una factura de notaría menciona la compraventa: la señal de factura pesa más si hay IVA/base.
  const invoice = scores.find((s) => s.type === "invoice")!;
  if (/base\s+imponible/i.test(text) && /total/i.test(text)) invoice.score += 1.5;
  scores.sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (!best || best.score < 1) return { type: "other", margin: 0 };
  return { type: best.type, margin: best.score - (second?.score ?? 0) };
}

// ── Utilidades de campo ───────────────────────────────────────────────────────

const CATEGORY_RULES: [RegExp, REExpenseCategory][] = [
  [/notar/i, "NOTARIA"],
  [/registro\s+de\s+la\s+propiedad|registrador/i, "REGISTRO"],
  [/arquitect/i, "ARQUITECTO"],
  [/aparejador|arquitecto\s+t[eé]cnico|direcci[oó]n\s+de\s+ejecuci/i, "APAREJADOR"],
  [/ingenier|prueba\s+de\s+carga|ensayo|geot[eé]cnic|topogr/i, "INGENIERIA"],
  [/licencia|gerencia\s+de\s+urbanismo|tasa\s+urban|fianza\s+de\s+residuos/i, "LICENCIAS"],
  [/\bicio\b|impuesto|agencia\s+tributaria|\bitp\b|\bajd\b|\bibi\b/i, "IMPUESTOS"],
  [/endesa|iberdrola|naturgy|electricidad|\bluz\b|emasesa|\bagua\b|\bgas\b|suministro/i, "SUMINISTROS"],
  [/fontaner|electricista|climatizaci|instalaci[oó]n/i, "INSTALACIONES"],
  [/mobiliario|muebles|cocinas?\b|electrodom/i, "MOBILIARIO"],
  [/materiales|almac[eé]n\s+de\s+construcci|leroy|bricomart/i, "MATERIALES"],
  [/mano\s+de\s+obra/i, "MANO_OBRA"],
  [/\bobra\b|construcci|reforma|alba[ñn]il|certificaci[oó]n/i, "OBRA"],
  [/inmobiliaria|comercializ|idealista|fotocasa|publicidad/i, "COMERCIALIZACION"],
  [/intereses/i, "INTERESES"],
  [/comisi[oó]n/i, "COMISIONES"],
];

export function suggestCategory(...texts: (string | undefined)[]): REExpenseCategory | undefined {
  const joined = texts.filter(Boolean).join(" \n ");
  for (const [re, cat] of CATEGORY_RULES) if (re.test(joined)) return cat;
  return undefined;
}


function supplierNameNear(text: string, index: number): string | undefined {
  const before = text.slice(0, index);
  const lines = before.split("\n");
  const current = lines[lines.length - 1].replace(/\b(C\.?I\.?F|N\.?I\.?F|NIF\/CIF)\b[.:\s]*$/i, "").trim();
  const candidates = [current, lines[lines.length - 2]?.trim(), lines[lines.length - 3]?.trim()];
  for (const c of candidates) {
    if (!c || c.length < 3 || c.length > 80) continue;
    if (/factura|fecha|cliente|(^|\s)n[ºo°®*.]\s|tel[eé]fono|www\.|@|c\/|calle|avda/i.test(c)) continue;
    if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}/.test(c)) continue;
    return c.replace(/[:;,\s]+$/, "");
  }
  return undefined;
}

function pickSupplierTaxId(text: string) {
  const ids = taxIdsIn(text);
  if (!ids.length) return undefined;
  // El del cliente suele ir junto a "cliente/destinatario/facturar a"; el emisor, arriba.
  const customerZone = /cliente|destinatari|facturar\s+a|datos\s+del\s+comprador|receptor/gi;
  const customerIdx = [...text.matchAll(customerZone)].map((m) => m.index ?? 0);
  const isCustomer = (i: number) => customerIdx.some((c) => i > c && i - c < 250);
  const ordered = [...ids].sort((a, b) => Number(isCustomer(a.index)) - Number(isCustomer(b.index)) || Number(b.valid) - Number(a.valid) || a.index - b.index);
  return ordered[0];
}

// Tolera lecturas OCR de "nº" (n®, N*, n°) y exige al menos un dígito en el número.
const INVOICE_NUMBER = /(?:n[ºo°®*.]?\s*(?:de\s+)?factura|factura\s*(?:n[ºo°®*.]?|n[uú]m(?:ero)?\.?|#)|minuta\s*(?:n[ºo°®*.]?)?|n[uú]mero\s+de\s+factura)\s*[:\-]?\s*((?=[A-Z0-9\-/.]*\d)[A-Z0-9][A-Z0-9\-/.]{0,24}[A-Z0-9])/i;

const VAT_RATES = [21, 10, 4, 0];

function totalsCheck(subtotal?: number, vat?: number, total?: number, withholding?: number) {
  if (subtotal === undefined || total === undefined) return undefined;
  const expected = round2(subtotal + (vat ?? 0) - (withholding ?? 0));
  return sameAmount(expected, total, 0.02);
}

// ── Extracción por tipo ───────────────────────────────────────────────────────

function extractExpenseLike(text: string, hints: FileNameHints, ex: Extraction) {
  const src = ex.sources;
  const taxHit = pickSupplierTaxId(text);
  const supplierName = (taxHit && supplierNameNear(text, taxHit.index)) || hints.supplier;
  if (taxHit || supplierName) {
    ex.supplier = { ...(supplierName ? { name: supplierName } : {}), ...(taxHit ? { taxId: taxHit.id } : {}) };
    if (supplierName) src.supplier = taxHit && supplierNameNear(text, taxHit.index) ? "text" : "filename";
    if (taxHit) ex.checks.taxIdValid = taxHit.valid;
  }

  const number = text.match(INVOICE_NUMBER)?.[1];
  if (number && !/^\d{1,2}$/.test(number)) {
    ex.invoiceNumber = number;
    src.invoiceNumber = "text";
  }

  const date = dateAfter(text, "fecha\\s+(?:de\\s+)?(?:la\\s+)?(?:factura|emisi[oó]n|expedici[oó]n|operaci[oó]n|devengo|cargo|pago)") ?? dateAfter(text, "fecha") ?? datesIn(text)[0];
  if (date) {
    ex.date = date;
    src.date = "text";
  } else if (hints.date) {
    ex.date = hints.date;
    src.date = "filename";
  }

  ex.subtotal = amountAfter(text, "base\\s+imponible|base\\s+i\\.?|subtotal|importe\\s+neto|total\\s+base");
  ex.vat = amountAfter(text, "cuota\\s+(?:de\\s+)?i\\.?v\\.?a|total\\s+i\\.?v\\.?a|i\\.?v\\.?a\\.?\\s*(?:\\(?\\d{1,2}\\s*%\\)?)");
  ex.withholding = amountAfter(text, "retenci[oóeé]n(?:\\s+i\\.?r\\.?p\\.?f)?|i\\.?r\\.?p\\.?f\\.?\\s*(?:\\(?-?\\d{1,2}\\s*%\\)?)");
  const rate = text.match(/i\.?v\.?a\.?[^\d\n]{0,15}(\d{1,2})\s*%/i)?.[1];
  if (rate && VAT_RATES.includes(Number(rate))) ex.vatRate = Number(rate);
  if (ex.withholding !== undefined) ex.withholding = Math.abs(ex.withholding);

  let total = amountAfter(text, "total\\s+(?:a\\s+pagar|factura|importe|recibo|€|eur)|importe\\s+total|total\\s+a\\s+ingresar|importe\\s+a\\s+(?:pagar|ingresar)|l[ií]quido\\s+a\\s+percibir|total\\s+minuta");
  if (total === undefined) total = amountAfter(text, "\\btotal\\b|\\bimporte\\b");
  if (total === undefined && ex.subtotal !== undefined) {
    total = round2(ex.subtotal + (ex.vat ?? 0) - (ex.withholding ?? 0));
    src.total = "computed";
  } else if (total !== undefined) src.total = "text";
  if (total === undefined && hints.amount !== undefined) {
    total = hints.amount;
    src.total = "filename";
  }
  ex.total = total;
  if (ex.vat === undefined && ex.vatRate !== undefined && ex.subtotal !== undefined) {
    ex.vat = round2((ex.subtotal * ex.vatRate) / 100);
    src.vat = "computed";
  }
  ex.checks.totalsConsistent = totalsCheck(ex.subtotal, ex.vat, ex.total, ex.withholding);

  // Pagos a cuenta / adeudos: si el nombre del archivo trae el importe y aparece en el texto, manda.
  if (hints.amount !== undefined) {
    const inText = amountsIn(text).some((v) => sameAmount(v, hints.amount));
    if (!sameAmount(hints.amount, ex.total) && inText && !ex.checks.totalsConsistent) {
      ex.total = hints.amount;
      src.total = "filename";
    }
    ex.checks.fileNameAgrees = sameAmount(hints.amount, ex.total) && inText;
  }

  const concept = text.match(/(?:concepto|descripci[oó]n)\s*[:\-]?\s*([^\n]{4,90})/i)?.[1]?.trim();
  ex.description = hints.concept ?? concept;
  if (ex.description) src.description = hints.concept ? "filename" : "text";
  ex.paymentMethod = text.match(/\b(transferencia|domiciliaci[oó]n|adeudo\s+en\s+cuenta|tarjeta|efectivo|bizum|pagar[eé])\b/i)?.[1]?.toLowerCase();
  ex.suggestedCategory = suggestCategory(ex.description, ex.supplier?.name, text.slice(0, 3000));
}

const BANKS = /(caixabank|la\s+caixa|bbva|banco\s+santander|santander|banco\s+sabadell|sabadell|bankinter|unicaja|kutxabank|abanca|ibercaja|\bing\b|cajamar|caja\s+rural|deutsche\s+bank|openbank|evo\s+banco|laboral\s+kutxa|cajasur)/i;

function extractLoan(text: string, hints: FileNameHints, ex: Extraction) {
  const lender = text.match(BANKS)?.[1] ?? text.match(/prestamista[:\s,]+([^\n,]{3,60})/i)?.[1];
  const borrower = text.match(/prestatari[oa]s?[:\s,]+(?:don|doña|d\.|dña\.)?\s*([^\n,]{3,60})/i)?.[1]?.trim();
  const principal = amountAfter(text, "importe\\s+del\\s+pr[ée]stamo|capital\\s+(?:prestado|inicial|del\\s+pr[ée]stamo)|principal\\s+del\\s+pr[ée]stamo|importe\\s+(?:del\\s+cr[ée]dito|financiado)", "first") ?? hints.amount;
  const rateMatch = text.match(/(?:tipo\s+de\s+inter[eé]s(?:\s+nominal)?(?:\s+anual)?|t\.?\s?i\.?\s?n\.?)[^%\d]{0,40}(\d{1,2}(?:[.,]\d{1,4})?)\s*%/i);
  const termMatch = text.match(/plazo[^\d\n]{0,40}(\d{1,3})\s*(meses|años|anos)/i);
  const installment = amountAfter(text, "cuota(?:\\s+mensual|\\s+inicial)?", "first");
  ex.loan = {
    ...(lender ? { lender: lender.trim() } : {}),
    ...(borrower ? { borrower } : {}),
    ...(principal !== undefined ? { principal } : {}),
    ...(rateMatch ? { interestRate: Number(rateMatch[1].replace(",", ".")) } : {}),
    ...(termMatch ? { termMonths: Number(termMatch[1]) * (/mes/i.test(termMatch[2]) ? 1 : 12) } : {}),
    ...(installment !== undefined ? { installment } : {}),
    rateType: /tipo\s+(de\s+inter[eé]s\s+)?mixto/i.test(text) ? "MIXTO" : /variable|eur[ií]bor/i.test(text) ? "VARIABLE" : "FIJO",
    ...(dateAfter(text, "fecha\\s+de\\s+(?:firma|formalizaci[oó]n|otorgamiento)|en\\s+[A-ZÁÉÍÓÚa-záéíóú]+,?\\s+a") ? { startDate: dateAfter(text, "fecha\\s+de\\s+(?:firma|formalizaci[oó]n|otorgamiento)|en\\s+[A-ZÁÉÍÓÚa-záéíóú]+,?\\s+a") } : {}),
    ...(dateAfter(text, "vencimiento\\s+final|fecha\\s+de\\s+vencimiento|vencimiento") ? { maturityDate: dateAfter(text, "vencimiento\\s+final|fecha\\s+de\\s+vencimiento|vencimiento") } : {}),
    ...(amountAfter(text, "comisi[oó]n\\s+de\\s+apertura", "first") !== undefined ? { fees: amountAfter(text, "comisi[oó]n\\s+de\\s+apertura", "first") } : {}),
  };
  if (!ex.loan.startDate && hints.date) ex.loan.startDate = hints.date;
  ex.date = ex.loan.startDate;
  ex.description = hints.concept;
}

function extractSale(text: string, hints: FileNameHints, ex: Extraction, unitTitles: string[]) {
  const status: RESaleStatus = /escritura\s+de\s+compraventa|vende\s+y\s+transmite/i.test(text)
    ? "VENDIDO"
    : /arras/i.test(text)
      ? "SENALADO"
      : /reserva/i.test(text)
        ? "RESERVADO"
        : "APALABRADO";
  const price = amountAfter(text, "precio\\s+(?:total\\s+)?(?:de\\s+(?:la\\s+)?(?:compra)?venta|pactado|convenido|de\\s+la\\s+transmisi[oó]n)|por\\s+el\\s+precio\\s+de", "first") ?? hints.amount;
  const deposit = status === "SENALADO" ? amountAfter(text, "(?:en\\s+concepto\\s+de\\s+)?arras|se[ñn]al", "first") : undefined;
  const collected = amountAfter(text, "(?:recibe|recibido|ha\\s+recibido|cobrado)\\s+(?:en\\s+este\\s+acto|con\\s+anterioridad)?(?:\\s+la\\s+cantidad\\s+de)?", "first");
  const buyer = text.match(/(?:parte\s+compradora|comprador(?:a)?)[:\s,]+(?:de\s+otra\s+parte,?\s+)?(?:(?:don|doña|d\.|dña\.)\s+)?([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ.\s-]{3,60}?)(?=,|\n|\s+mayor|\s+con\s+(?:dni|nif))/i)?.[1]?.trim();
  const folded = foldForMatch(text);
  ex.relatedUnits = unitTitles.filter((t) => {
    const f = foldForMatch(t);
    return f.length >= 3 && new RegExp(`(^|\\s)${f.replace(/\s+/g, "\\s+")}(\\s|$)`).test(folded);
  });
  ex.sale = {
    status,
    ...(buyer ? { buyer } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(deposit !== undefined ? { deposit } : {}),
    ...(collected !== undefined ? { collected } : {}),
    ...(/\bi\.?v\.?a\b/i.test(text) ? { taxes: "IVA" } : /transmisiones\s+patrimoniales|\bitp\b/i.test(text) ? { taxes: "ITP" } : {}),
  };
  ex.date = dateAfter(text, "en\\s+[A-ZÁÉÍÓÚa-záéíóú]+,?\\s+a|fecha") ?? datesIn(text)[0] ?? hints.date;
}

// ── Confianza ─────────────────────────────────────────────────────────────────

export function scoreConfidence(ex: Extraction): number {
  let s = Math.min(0.2, 0.1 + ex.checks.typeMargin * 0.1);
  const t = ex.documentType;
  if (t === "invoice" || t === "receipt" || t === "certification" || t === "budget") {
    if (ex.total !== undefined && ex.total > 0) s += 0.25;
    if (ex.checks.totalsConsistent) s += 0.2;
    if (ex.checks.fileNameAgrees) s += 0.15;
    else if (ex.checks.fileNameAgrees === false) s -= 0.15; // el nombre dice otro importe
    if (ex.date) s += ex.sources.date === "text" ? 0.1 : 0.05;
    if (ex.supplier?.name || ex.supplier?.taxId) s += 0.1;
    if (ex.checks.taxIdValid) s += 0.05;
    if (ex.invoiceNumber) s += 0.05;
    if (t === "receipt" && ex.checks.totalsConsistent === undefined && ex.sources.total === "text" && ex.date) s += 0.1;
  } else if (t === "loan") {
    const l = ex.loan ?? {};
    if (l.principal) s += 0.3;
    if (l.lender) s += 0.2;
    if (l.interestRate !== undefined) s += 0.1;
    if (l.termMonths) s += 0.1;
    if (l.startDate) s += 0.1;
    if (l.installment) s += 0.05;
  } else if (t === "sale") {
    const v = ex.sale;
    if (v?.price) s += 0.25;
    if (ex.relatedUnits?.length === 1) s += 0.3;
    if (ex.date) s += 0.1;
    if (v?.buyer) s += 0.1;
    if (v?.status === "VENDIDO") s += 0.05;
  }
  if (ex.checks.ocr) s *= CONFIDENCE.ocrFactor;
  if (ex.checks.llm) s = Math.min(s, CONFIDENCE.llmCap);
  return Math.max(0, Math.min(1, Math.round(s * 1000) / 1000));
}

export function extractFields(input: ExtractInput, unitTitles: string[] = []): Extraction {
  const text = normalizeText(input.text);
  const hints = fileNameHints(input.fileName);
  const { type, margin } = classify(text, input.fileName);
  const ex: Extraction = { documentType: type, currency: "EUR", sources: {}, checks: { typeMargin: margin, ocr: input.ocr, llm: false }, confidence: 0 };
  if (type === "loan") extractLoan(text, hints, ex);
  else if (type === "sale") extractSale(text, hints, ex, unitTitles);
  else if (type !== "other") {
    extractExpenseLike(text, hints, ex);
    if (type === "certification") ex.phase = text.match(/certificaci[oó]n\s+(?:de\s+obra\s+)?n?[ºo°]?\s*(\d{1,3})/i)?.[1];
  }
  ex.confidence = type === "other" ? 0 : scoreConfidence(ex);
  return ex;
}

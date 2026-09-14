import test from "node:test";
import assert from "node:assert/strict";
import { amountsIn, datesIn, fileNameHints, isValidSpanishTaxId, taxIdsIn } from "./parse.ts";
import { classify, extractFields } from "./fields.ts";
import { mergeVerified } from "./llm.ts";
import { CONFIDENCE } from "../policy.ts";

test("importes españoles y con punto decimal; no confunde fechas con importes", () => {
  assert.deepEqual(amountsIn("Base 8.200,00 € IVA 1.722,00 total 9922,00 y 12.09.2026 y 1234.56"), [8200, 1722, 9922, 1234.56]);
  assert.deepEqual(amountsIn("Fecha 12/09/2026 ref 2026"), []);
});

test("fechas en formatos habituales, descartando imposibles", () => {
  assert.deepEqual(datesIn("12/09/2026, 2026-01-05, 3 de marzo de 2025, 31/02/2026"), ["2026-09-12", "2026-01-05", "2025-03-03"]);
});

test("NIF/CIF/NIE con dígito de control y reparación de la letra leída por OCR", () => {
  assert.equal(isValidSpanishTaxId("12345678Z"), true);
  assert.equal(isValidSpanishTaxId("12345678A"), false);
  assert.equal(isValidSpanishTaxId("B91234567"), true);
  assert.equal(isValidSpanishTaxId("B91234568"), false);
  assert.equal(isValidSpanishTaxId("X1234567L"), true);
  assert.deepEqual(taxIdsIn("NIF: 123456787").map((t) => [t.id, t.valid]), [["12345678Z", true]]);
  assert.deepEqual(taxIdsIn("tel 954123456"), []);
});

test("convención de nombre de archivo del promotor", () => {
  assert.deepEqual(fileNameHints("2026-06-12 · Minuta 1 honorarios arquitecto (factura 14-2026) · Ignacio Ortiz Chopitea · 2.491,00 €.pdf"), {
    date: "2026-06-12",
    concept: "Minuta 1 honorarios arquitecto",
    reference: "factura 14-2026",
    supplier: "Ignacio Ortiz Chopitea",
    amount: 2491,
  });
  assert.deepEqual(fileNameHints("scan_0001.pdf"), {});
});

test("una minuta de notaría que menciona la compraventa sigue siendo factura", () => {
  const text = "NOTARÍA EJEMPLO\nMinuta nº A 4599\nEscritura de compraventa\nBase imponible 2.186,78\nIVA 21% 459,22\nTotal 2.646,00";
  assert.equal(classify(text, "minuta.pdf").type, "invoice");
});

const INVOICE = `FONTANERIA HERMANOS RUIZ S.L.
CIF: B91234567
FACTURA
Nº factura: F-2026-141
Fecha de factura: 12/09/2026
Cliente: Promociones Ejemplo S.L.
CIF: B41765439
Concepto: Instalación de fontanería
Descripción Cantidad Precio Importe
Tubería 120 25,00 3.000,00
Grifería 12 300,00 3.600,00
Mano de obra 1 1.600,00 1.600,00
Base imponible 8.200,00 €
IVA 21% 1.722,00 €
Total factura 9.922,00 €`;

test("factura con varios conceptos: proveedor (no cliente), número, base, IVA y total coherentes", () => {
  const ex = extractFields({ text: INVOICE, fileName: "factura.pdf", ocr: false });
  assert.equal(ex.documentType, "invoice");
  assert.deepEqual(ex.supplier, { name: "FONTANERIA HERMANOS RUIZ S.L.", taxId: "B91234567" });
  assert.equal(ex.invoiceNumber, "F-2026-141");
  assert.equal(ex.date, "2026-09-12");
  assert.equal(ex.subtotal, 8200);
  assert.equal(ex.vat, 1722);
  assert.equal(ex.total, 9922);
  assert.equal(ex.checks.totalsConsistent, true);
  assert.equal(ex.suggestedCategory, "INSTALACIONES");
  assert.ok(ex.confidence >= CONFIDENCE.autoApply);
});

test("IVA incoherente con la base baja la confianza por debajo de la auto-aplicación", () => {
  const ex = extractFields({ text: INVOICE.replace("Total factura 9.922,00", "Total factura 9.000,00"), fileName: "factura.pdf", ocr: false });
  assert.equal(ex.checks.totalsConsistent, false);
  assert.ok(ex.confidence < CONFIDENCE.autoApply);
});

test("adeudo de impuestos: importe confirmado por el nombre del archivo", () => {
  const text = "AGENCIA TRIBUTARIA DE ANDALUCÍA\nCARGO EN CUENTA / ADEUDO\nFecha de cargo: 05/01/2026\nImporte: 344,72 EUR\nAplazamiento 1 de 4";
  const ex = extractFields({ text, fileName: "2026-01-05 · Impuestos compra (adeudo 1 de 4) · Agencia Tributaria de Andalucía · 344,72 €.pdf", ocr: false });
  assert.equal(ex.documentType, "receipt");
  assert.equal(ex.total, 344.72);
  assert.equal(ex.checks.fileNameAgrees, true);
  assert.equal(ex.suggestedCategory, "IMPUESTOS");
  assert.ok(ex.confidence >= CONFIDENCE.autoApply, `confianza ${ex.confidence}`);
});

test("documento sin señales: tipo other, confianza 0", () => {
  const ex = extractFields({ text: "Lista de la compra: pan, leche, huevos y fruta variada para la semana", fileName: "nota.pdf", ocr: false });
  assert.equal(ex.documentType, "other");
  assert.equal(ex.confidence, 0);
});

test("modelo local: se descarta lo que no aparece en el texto y lo aportado nunca se auto-aplica", () => {
  const text = "RECIBO\nReparación persiana\nImporte cobrado 145,20\nSevilla 02/09/2026\nTalleres Ejemplo";
  const base = extractFields({ text, fileName: "recibo.pdf", ocr: false });
  const invented = mergeVerified(text, { ...base, total: undefined, date: undefined }, { document_type: "receipt", total: 999.99, date: "2026-01-01", supplier_name: "Empresa Fantasma SL" });
  assert.equal(invented.total, undefined, "importe inventado descartado");
  assert.equal(invented.date, undefined, "fecha inventada descartada");
  assert.equal(invented.supplier?.name, undefined, "proveedor inventado descartado");

  const verified = mergeVerified(text, { ...base, total: undefined, supplier: undefined }, { document_type: "receipt", total: 145.2, date: "2026-09-02", supplier_name: "Talleres Ejemplo" });
  assert.equal(verified.total, 145.2);
  assert.equal(verified.supplier?.name, "Talleres Ejemplo");
  assert.equal(verified.checks.llm, true);
  assert.ok(verified.confidence <= CONFIDENCE.llmCap && verified.confidence < CONFIDENCE.autoApply);
});

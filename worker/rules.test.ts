import test from "node:test";
import assert from "node:assert/strict";
import type { REOperation } from "../src/lib/realEstate.ts";
import type { Extraction } from "./extract/fields.ts";
import { CONFIDENCE } from "./policy.ts";
import { decideChanges, type Proposal } from "./rules.ts";

const FILE = "1FileInvoiceXXXXXXXXXX";
const doc = { driveFileId: FILE, name: "factura.pdf", version: "md5" };

const op = (id: string, extra: Partial<REOperation> = {}): REOperation =>
  ({ id, name: id, purchasePrice: 0, units: [], costs: {}, financing: {}, createdAt: "", updatedAt: "", ...extra }) as unknown as REOperation;

const invoice = (over: Partial<Extraction> = {}): Extraction => ({
  documentType: "invoice",
  currency: "EUR",
  supplier: { name: "Fontanería Ruiz S.L.", taxId: "B91234567" },
  invoiceNumber: "F-2026-141",
  date: "2026-09-12",
  description: "Instalación de fontanería",
  subtotal: 8200,
  vat: 1722,
  total: 9922,
  suggestedCategory: "INSTALACIONES",
  sources: {},
  checks: { typeMargin: 3, totalsConsistent: true, ocr: false, llm: false },
  confidence: 0.95,
  ...over,
});

const proposals = (outcome: ReturnType<typeof decideChanges>): Proposal[] => {
  assert.equal(outcome.kind, "proposals");
  return outcome.kind === "proposals" ? outcome.proposals : [];
};

test("factura fiable: un gasto real por variante, auto, con enlace a Drive y clave de factura", () => {
  const ps = proposals(decideChanges(invoice(), doc, [op("v1"), op("v2")]));
  assert.equal(ps.length, 2);
  for (const p of ps) {
    assert.equal(p.kind, "real_expense");
    assert.equal(p.auto, true);
    assert.equal(p.targetId, `rexp_doc_${FILE}`);
    assert.equal(p.dedupeKey, "invoice:B91234567:F2026141");
    assert.equal(p.item.amount, 9922);
    assert.equal(p.item.category, "INSTALACIONES");
    assert.equal(p.item.documentUrl, `https://drive.google.com/file/d/${FILE}/view`);
    assert.match(String(p.item.notes), /base 8\.?200,00 €/);
  }
});

test("confianza intermedia → revisión; baja → no se toca nada", () => {
  const mid = proposals(decideChanges(invoice({ confidence: 0.75 }), doc, [op("v1")]));
  assert.equal(mid[0].auto, false);
  assert.deepEqual(decideChanges(invoice({ confidence: CONFIDENCE.review - 0.01 }), doc, [op("v1")]), { kind: "no_change", why: "low_confidence" });
});

test("documento ya enlazado a mano en la operación: no se duplica", () => {
  const manual = op("v1", { realExpenses: [{ id: "rexp_manual", concept: "Fontanería", amount: 9922, date: "2026-09-12", documentUrl: `https://drive.google.com/file/d/${FILE}/view`, createdAt: "", updatedAt: "" }] });
  assert.deepEqual(decideChanges(invoice(), doc, [manual]), { kind: "no_change", why: "already_registered" });
  // …pero el gasto creado desde el propio documento no bloquea una versión nueva.
  const fromDoc = op("v1", { realExpenses: [{ id: `rexp_doc_${FILE}`, concept: "x", amount: 9000, date: "2026-09-12", documentUrl: `https://drive.google.com/file/d/${FILE}/view`, createdAt: "", updatedAt: "" }] });
  assert.equal(proposals(decideChanges(invoice(), doc, [fromDoc])).length, 1);
  // Uno borrado por el usuario tampoco cuenta como registrado.
  const deleted = op("v1", { realExpenses: [{ id: "rexp_manual", concept: "x", amount: 9922, date: "2026-09-12", documentUrl: `https://drive.google.com/file/d/${FILE}/view`, deletedAt: "2026-09-13", createdAt: "", updatedAt: "" }] });
  assert.equal(proposals(decideChanges(invoice(), doc, [deleted])).length, 1);
});

test("mismo importe y fecha cercana sin documento: posible duplicado → revisión", () => {
  const withManual = op("v1", { realExpenses: [{ id: "rexp_1", concept: "Pago fontanero", amount: 9922, date: "2026-09-10", createdAt: "", updatedAt: "" }] });
  const [p] = proposals(decideChanges(invoice(), doc, [withManual]));
  assert.equal(p.auto, false);
  assert.match(p.reason ?? "", /Posible duplicado de «Pago fontanero»/);
});

test("certificación de obra nunca se aplica sola; presupuesto no modifica gastos", () => {
  const [p] = proposals(decideChanges(invoice({ documentType: "certification" }), doc, [op("v1")]));
  assert.equal(p.auto, false);
  assert.deepEqual(decideChanges(invoice({ documentType: "budget" }), doc, [op("v1")]).kind, "no_change");
});

test("sin fecha o sin total no hay propuesta", () => {
  assert.equal(decideChanges(invoice({ total: undefined }), doc, [op("v1")]).kind, "no_change");
  assert.equal(decideChanges(invoice({ date: undefined }), doc, [op("v1")]).kind, "no_change");
});

const saleEx = (over: Partial<Extraction> = {}): Extraction => ({
  documentType: "sale",
  currency: "EUR",
  date: "2026-09-01",
  relatedUnits: ["Vivienda 1"],
  sale: { status: "VENDIDO", price: 185000, buyer: "Laura Pérez Gómez" },
  sources: {},
  checks: { typeMargin: 3, ocr: false, llm: false },
  confidence: 0.95,
  ...over,
});

test("escritura con unidad inequívoca: parche auto de la fila de venta existente", () => {
  const o = op("v1", { sales: [{ id: "s1", title: "Vivienda 1", status: "DISPONIBLE", createdAt: "", updatedAt: "" }, { id: "s2", title: "Vivienda 2", status: "DISPONIBLE", createdAt: "", updatedAt: "" }] });
  const [p] = proposals(decideChanges(saleEx(), doc, [o]));
  assert.equal(p.mode, "patch");
  assert.equal(p.targetId, "s1");
  assert.equal(p.auto, true);
  assert.deepEqual(p.item, { status: "VENDIDO", realPrice: 185000, date: "2026-09-01", buyer: "Laura Pérez Gómez" });
});

test("venta ambigua, sin fila o con cobro: revisión, nunca auto", () => {
  const two = op("v1", { sales: [{ id: "s1", title: "Vivienda 1", status: "DISPONIBLE", createdAt: "", updatedAt: "" }, { id: "s1b", title: "vivienda 1", status: "DISPONIBLE", createdAt: "", updatedAt: "" }] });
  const [ambiguous] = proposals(decideChanges(saleEx(), doc, [two]));
  assert.equal(ambiguous.auto, false);
  assert.equal(ambiguous.mode, "insert");
  assert.match(ambiguous.reason ?? "", /Varias unidades/);

  const [none] = proposals(decideChanges(saleEx(), doc, [op("v1")]));
  assert.equal(none.auto, false);
  assert.equal(none.targetId, `sale_doc_${FILE}`);

  const one = op("v1", { sales: [{ id: "s1", title: "Vivienda 1", status: "DISPONIBLE", createdAt: "", updatedAt: "" }] });
  const [collected] = proposals(decideChanges(saleEx({ sale: { status: "VENDIDO", price: 185000, collected: 185000 } }), doc, [one]));
  assert.equal(collected.auto, false);
  // El cobro del documento entra como cobro con fecha (nuevo modelo), no como total suelto.
  assert.deepEqual(collected.item.payments, [{ id: `pay_doc_${FILE}`, date: "2026-09-01", amount: 185000 }]);
  assert.equal(collected.item.collected, 185000);
  const withPrevious = op("v1", { sales: [{ id: "s1", title: "Vivienda 1", status: "SENALADO", payments: [{ id: "p0", date: "2026-05-01", amount: 20000 }], createdAt: "", updatedAt: "" }] });
  const [second] = proposals(decideChanges(saleEx({ sale: { status: "VENDIDO", price: 185000, collected: 165000 } }), doc, [withPrevious]));
  assert.deepEqual((second.item.payments as { amount: number }[]).map((p) => p.amount), [20000, 165000]);
  assert.equal(second.item.collected, 185000, "se suman los cobros previos de la unidad");
});

test("venta ya reflejada: sin propuesta", () => {
  const done = op("v1", { sales: [{ id: "s1", title: "Vivienda 1", status: "VENDIDO", realPrice: 185000, date: "2026-09-01", buyer: "Laura Pérez Gómez", createdAt: "", updatedAt: "" }] });
  assert.deepEqual(decideChanges(saleEx(), doc, [done]), { kind: "no_change", why: "already_registered" });
});

test("préstamo: financiación real con prestamista y capital; no duplica uno igual", () => {
  const loanEx: Extraction = {
    documentType: "loan",
    currency: "EUR",
    loan: { lender: "CaixaBank", principal: 250000, interestRate: 3.25, termMonths: 300, installment: 1218.31, rateType: "FIJO", startDate: "2026-03-15", maturityDate: "2051-03-15", fees: 1250 },
    sources: {},
    checks: { typeMargin: 3, ocr: false, llm: false },
    confidence: 0.97,
  };
  const [p] = proposals(decideChanges(loanEx, doc, [op("v1")]));
  assert.equal(p.kind, "real_loan");
  assert.equal(p.auto, true);
  assert.deepEqual({ ...p.item, notes: undefined }, { name: "Préstamo CaixaBank", principal: 250000, interestRate: 3.25, rateType: "FIJO", startDate: "2026-03-15", termMonths: 300, installment: 1218.31, periodicity: "MENSUAL", status: "ACTIVO", notes: undefined });
  const existing = op("v1", { realLoans: [{ id: "l1", name: "Hipoteca Caixabank", principal: 250000, status: "ACTIVO", createdAt: "", updatedAt: "" }] });
  assert.equal(decideChanges(loanEx, doc, [existing]).kind, "no_change");
});

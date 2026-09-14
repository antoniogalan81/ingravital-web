import test from "node:test";
import assert from "node:assert/strict";
import { currentItem, describeItem, documentsCsv, isJobActive, proposedItem, summaryText, type DocumentProposal } from "./documentSyncView.ts";

test("resumen de la actualización en lenguaje llano", () => {
  assert.equal(summaryText({ reviewed: 17, new: 4, autoApplied: 3, needsReview: 1 }), "17 documentos revisados · 4 nuevos · 3 actualizados automáticamente · 1 necesita revisión");
  assert.equal(summaryText({ reviewed: 1, unreadable: 1 }), "1 documento revisado · 1 no legible");
  assert.equal(isJobActive({ status: "processing" }), true);
  assert.equal(isJobActive({ status: "needs_review" }), false);
});

const op = {
  realExpenses: [{ id: "rexp_doc_1", concept: "Fontanería", amount: 9922, date: "2026-09-12", category: "INSTALACIONES" as const, createdAt: "", updatedAt: "" }],
  realLoans: [],
  sales: [{ id: "s1", title: "Vivienda 1", status: "DISPONIBLE" as const, createdAt: "", updatedAt: "" }],
};

test("valor actual y propuesto: gasto nuevo, gasto existente y parche de venta", () => {
  const insert: DocumentProposal = { id: "p", kind: "real_expense", mode: "insert", target_id: "rexp_doc_2", item: { concept: "Luz", amount: 18.48, date: "2026-02-06", category: "SUMINISTROS" }, confidence: 0.8, reason: null, document: null };
  assert.equal(currentItem(op, insert), null);
  assert.equal(describeItem("real_expense", proposedItem(op, insert)), "Luz · 18,48 € · 2026-02-06 · Suministros");

  const sale: DocumentProposal = { id: "q", kind: "sale", mode: "patch", target_id: "s1", item: { status: "VENDIDO", realPrice: 185000, buyer: "Laura" }, confidence: 0.8, reason: null, document: null };
  assert.equal(describeItem("sale", currentItem(op, sale)), "Vivienda 1 · Disponible");
  assert.equal(describeItem("sale", proposedItem(op, sale)), "Vivienda 1 · Vendido · 185.000,00 € · comprador: Laura");
});

test("CSV para Excel: separador ;, BOM, decimales con coma y sin inyección de fórmulas", () => {
  const csv = documentsCsv(
    "León XIII",
    [
      {
        id: "d1",
        name: "=HYPERLINK(\"http://x\";\"clic\").pdf",
        drive_file_id: "1abcdefghijk",
        doc_type: "invoice",
        status: "processed",
        confidence: 0.953,
        processed_at: "2026-09-14T01:50:00Z",
        error: null,
        extraction: { supplier: { name: "Fontanería; Ruiz", taxId: "B91234567" }, invoiceNumber: "F-1", date: "2026-09-12", subtotal: 8200.5, vat: 1722, total: 9922.5, suggestedCategory: "INSTALACIONES" },
      },
    ],
    [{ document_id: "d1", operation_id: "op1", kind: "real_expense", status: "auto_applied" }],
    "op1",
  );
  assert.ok(csv.startsWith("﻿Fecha procesamiento;Operación;Archivo"));
  const line = csv.split("\r\n")[1];
  assert.match(line, /;"'=HYPERLINK\(""http:\/\/x"";""clic""\)\.pdf";/);
  assert.match(line, /;"Fontanería; Ruiz";B91234567;F-1;2026-09-12;;8200,5;1722;9922,5;Instalaciones;;Gasto real actualizado automáticamente;95 %;Procesado;/);
});

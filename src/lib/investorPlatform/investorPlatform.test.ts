// Tests puros de la plataforma de inversores (sin red, sin Supabase, sin navegador).
// Ejecutar con:  node --test src/lib/investorPlatform/investorPlatform.test.ts
//
// Las garantías de PRIVACIDAD se verifican contra Postgres real en
// `supabase/tests/investorPlatform.test.mjs` — ahí es donde vive el riesgo. Aquí se
// cubre la lógica de cliente: normalización de media, cálculo de captación,
// construcción de enlaces de envío y el filtro de previsualización.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultVisibility,
  fundingState,
  isHttpUrl,
  toMediaRef,
  VISIBILITY_DEFS,
  type Investment,
  type Opportunity,
} from "./types.ts";
import { previewSnapshot } from "./preview.ts";
import { buildOpportunityMetrics } from "./metrics.ts";
import { calcResults } from "../realEstateCalc.ts";
import type { REOperation } from "../realEstate.ts";
import { availableChannels, invitationUrl, mailtoLink, waNumber, whatsappLink } from "./share.ts";
import type { InvestorContact } from "./types.ts";

// ── Modelo canónico de media ─────────────────────────────────────────────────

test("toMediaRef prefiere Storage cuando hay bucket y path", () => {
  const ref = toMediaRef({ bucket: "investment-media", storagePath: "u/o/media/x.jpg", mime: "image/jpeg" });
  assert.deepEqual(ref, {
    kind: "storage",
    bucket: "investment-media",
    path: "u/o/media/x.jpg",
    mime: "image/jpeg",
    size: undefined,
  });
});

test("toMediaRef acepta enlaces http externos", () => {
  assert.deepEqual(toMediaRef({ uri: "https://cdn.example.com/a.jpg" }), {
    kind: "url",
    url: "https://cdn.example.com/a.jpg",
  });
});

test("toMediaRef descarta lo que no se puede resolver en otra plataforma", () => {
  // Este es el defecto real que rompía la paridad WEB/APP: una URI local del
  // dispositivo, o una cadena vacía dejada por un archivo subido a Storage.
  assert.equal(toMediaRef({ uri: "file:///data/user/0/foto.jpg" }), null);
  assert.equal(toMediaRef({ uri: "" }), null);
  assert.equal(toMediaRef({}), null);
  // Bucket sin path (o al revés) tampoco es resoluble.
  assert.equal(toMediaRef({ bucket: "investment-media" }), null);
  assert.equal(toMediaRef({ storagePath: "u/o/media/x.jpg" }), null);
});

test("isHttpUrl solo acepta http y https", () => {
  assert.equal(isHttpUrl("http://a.com"), true);
  assert.equal(isHttpUrl("https://a.com"), true);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
  assert.equal(isHttpUrl("file:///x"), false);
  assert.equal(isHttpUrl(undefined), false);
});

// ── Visibilidad ───────────────────────────────────────────────────────────────

test("la visibilidad por defecto oculta TODO lo sensible", () => {
  const v = defaultVisibility();
  for (const def of VISIBILITY_DEFS) {
    assert.equal(
      v[def.key],
      !def.sensitive,
      `${def.key} debería nacer ${def.sensitive ? "oculta" : "visible"}`,
    );
  }
  // Comprobación explícita de los que más duelen si se escapan.
  assert.equal(v.costesTotales, false);
  assert.equal(v.rentabilidadPromotor, false);
  assert.equal(v.facturas, false);
});

// ── Captación: configuración ≠ resultado ─────────────────────────────────────

const inv = (amount: number, status: Investment["status"]): Pick<Investment, "amount" | "status"> => ({
  amount,
  status,
});

test("fundingState separa comprometido de invertido e ignora canceladas", () => {
  const f = fundingState(400000, [
    inv(50000, "comprometida"),
    inv(100000, "activa"),
    inv(30000, "desembolsada"),
    inv(999999, "cancelada"),
  ]);
  assert.equal(f.comprometido, 50000);
  assert.equal(f.invertido, 130000);
  assert.equal(f.inversores, 3, "la cancelada no cuenta como inversor");
  assert.equal(f.pendiente, 220000);
  assert.equal(f.pctFinanciado, 180000 / 400000);
});

test("fundingState no inventa datos cuando no hay objetivo", () => {
  const f = fundingState(null, [inv(10000, "activa")]);
  assert.equal(f.objetivo, null);
  assert.equal(f.pendiente, null);
  assert.equal(f.pctFinanciado, null, "sin objetivo no hay porcentaje que calcular");
});

test("el ticket real medio se calcula sobre inversiones, no sobre la oferta", () => {
  const f = fundingState(300000, [inv(50000, "activa"), inv(100000, "activa")]);
  assert.equal(f.ticketMedioReal, 75000);
  assert.equal(fundingState(300000, []).ticketMedioReal, null, "sin inversiones no hay media");
});

test("fundingState nunca pasa del 100% aunque se sobrepase el objetivo", () => {
  const f = fundingState(100000, [inv(150000, "activa")]);
  assert.equal(f.pctFinanciado, 1);
  assert.equal(f.pendiente, 0);
});

// ── Previsualización: debe respetar la visibilidad ───────────────────────────

const OPPORTUNITY: Opportunity = {
  id: "opp-1",
  ownerId: "owner-1",
  operationId: "op-1",
  status: "publicada",
  title: "Edificio A",
  location: "Málaga",
  summary: "Resumen",
  strategy: "Comprar, reformar y vender",
  risks: "Retraso de licencias",
  internalNotes: "MARGEN INTERNO 32% — NO MOSTRAR",
  targetCapital: 400000,
  minTicket: 25000,
  targetTicket: 50000,
  maxTicket: null,
  offeredYieldPct: 12,
  termMonths: 18,
  startDate: null,
  returnDate: null,
  investmentModel: "prestamo",
  conditions: null,
  guarantee: "Hipoteca",
  guaranteeRank: "Primera carga",
  earlyCancellation: null,
  metrics: {
    costesTotales: 350000,
    rentabilidadEstimada: 0.18,
    rentabilidadPromotor: 99999,
    ...(() => {
      const op = {
        id: "op", name: "A", purchasePrice: 0, costs: { purchaseTaxPct: 0, arquitectoPct: 0, tasas: [] }, financing: { enabled: false, compra: { pct: 0, interest: 0 }, obra: { pct: 0 } }, createdAt: "", updatedAt: "",
        units: [{ id: "u", type: "VIVIENDA", title: "Viviendas", numUnits: 1, salePriceTotal: 210000 }],
        sales: [{ id: "s", title: "1ºA", unitId: "u", status: "VENDIDO", realPrice: 200000, buyer: "Comprador Privado", createdAt: "", updatedAt: "" }],
      } as unknown as REOperation;
      const m = buildOpportunityMetrics(op, calcResults(op), "2026-09-14T00:00:00.000Z");
      return { ventas: m.ventas, ventasSinPrecios: m.ventasSinPrecios };
    })(),
  },
  visibility: {},
  publishedAt: null,
  createdAt: "",
  updatedAt: "",
};

test("la previsualización NUNCA incluye las notas internas", () => {
  // Ni siquiera activando todas las claves de visibilidad que existen.
  const todo = Object.fromEntries(VISIBILITY_DEFS.map((d) => [d.key, true]));
  const snap = previewSnapshot(OPPORTUNITY, todo);
  assert.ok(
    !JSON.stringify(snap).includes("MARGEN INTERNO"),
    "internal_notes se ha colado en la previsualización",
  );
});

test("la previsualización oculta lo que el toggle apaga", () => {
  const snap = previewSnapshot(OPPORTUNITY, { estrategia: true, costesTotales: false });
  assert.equal(snap.strategy, "Comprar, reformar y vender");
  assert.equal(snap.costesTotales, undefined);
  assert.equal(snap.rentabilidadPromotor, undefined);
  assert.equal(snap.title, "Edificio A", "la ficha comercial siempre se muestra");
});

test("ventas sin `ventasPrecios` no llevan importes", () => {
  const conPrecio = previewSnapshot(OPPORTUNITY, { ventas: true, ventasPrecios: true });
  const sinPrecio = previewSnapshot(OPPORTUNITY, { ventas: true, ventasPrecios: false });
  assert.equal(conPrecio.ventas?.groups[0].rows[0].realPrice, 200000);
  assert.equal(conPrecio.ventas?.soldAmount, 200000);
  assert.equal(sinPrecio.ventas?.groups[0].rows[0].realPrice, null);
  assert.equal(sinPrecio.ventas?.soldAmount, null);
  assert.ok(!JSON.stringify(conPrecio).includes("Comprador Privado"), "el comprador nunca se publica");
});

// ── Canales de envío ─────────────────────────────────────────────────────────

const CONTACT: InvestorContact = {
  id: "c1",
  ownerId: "owner-1",
  firstName: "Ana",
  lastName: "García",
  email: "ana@test.com",
  phone: "+34600000001",
  whatsapp: "+34600000001",
  notes: null,
  status: "nuevo",
  source: null,
  linkedUserId: null,
  createdAt: "",
  updatedAt: "",
};

test("waNumber deja solo dígitos y rechaza números demasiado cortos", () => {
  assert.equal(waNumber("+34 600 000 001"), "34600000001");
  assert.equal(waNumber("600000001"), "600000001");
  assert.equal(waNumber("12345"), null);
  assert.equal(waNumber(null), null);
});

test("availableChannels refleja los datos que realmente tenemos", () => {
  assert.deepEqual(availableChannels(CONTACT), { whatsapp: true, email: true, link: true });
  assert.deepEqual(availableChannels({ ...CONTACT, email: null }), {
    whatsapp: true,
    email: false,
    link: true,
  });
  assert.deepEqual(availableChannels({ ...CONTACT, phone: null, whatsapp: null }), {
    whatsapp: false,
    email: true,
    link: true,
  });
});

test("los enlaces de envío llevan el enlace seguro y ninguna cifra financiera", () => {
  const invitation = { token: "tok-abc" } as Parameters<typeof whatsappLink>[2];
  const wa = whatsappLink(OPPORTUNITY, CONTACT, invitation, "https://www.invergravital.com");
  assert.ok(wa?.startsWith("https://wa.me/34600000001?text="));

  const decoded = decodeURIComponent(wa!.split("text=")[1]);
  assert.ok(decoded.includes("https://www.invergravital.com/invitacion/tok-abc"));
  assert.ok(decoded.includes("Ana"), "el mensaje debe personalizarse");
  for (const leak of ["400000", "25000", "12%", "350000", "MARGEN"]) {
    assert.ok(!decoded.includes(leak), `el mensaje no debe llevar ${leak}`);
  }
});

test("sin teléfono no hay enlace de WhatsApp, y sin email no hay mailto", () => {
  const invitation = { token: "t" } as Parameters<typeof whatsappLink>[2];
  assert.equal(whatsappLink(OPPORTUNITY, { ...CONTACT, phone: null, whatsapp: null }, invitation), null);
  assert.equal(mailtoLink(OPPORTUNITY, { ...CONTACT, email: null }, invitation), null);
});

test("cada invitación tiene su propia URL", () => {
  const a = invitationUrl("tok-a", "https://x.com");
  const b = invitationUrl("tok-b", "https://x.com");
  assert.notEqual(a, b, "no puede existir un enlace común para toda la operación");
  assert.equal(a, "https://x.com/invitacion/tok-a");
});

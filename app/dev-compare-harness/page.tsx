"use client";

// E2E FIXTURE for the comparison scroll test (e2e/compare-scroll.spec.ts). Reproduces the
// EXACT container chain of the real comparison — an `.in-reveal` transformed ancestor (as
// AppGate leaves) wrapping the modal, which portals CompareModal to <body> — but with rich
// mock operations and NO auth/Supabase, so the responsive vertical-scroll behaviour can be
// verified in a real browser without ever touching production data.
//
// DEV/TEST ONLY: 404s in production so it is never reachable in the deployed app.

import { notFound } from "next/navigation";
import { useState } from "react";
import { CompareModal } from "@/src/components/realEstate/RealEstateSection";
import type { REOperation, REUnit } from "@/src/lib/realEstate";
import { DEFAULT_TASAS } from "@/src/lib/realEstate";

let seq = 0;
const uid = () => `u${seq++}`;

function unit(partial: Partial<REUnit> & { type: REUnit["type"]; title: string }): REUnit {
  return { id: uid(), ...partial };
}

function mockOp(name: string, factor: number): REOperation {
  const now = new Date(2026, 0, 1).toISOString();
  return {
    id: uid(),
    name,
    address: "Calle de la Comparativa Extensa 123, 4ºB, Málaga Centro",
    purchasePrice: 180000 + factor * 60000,
    m2Plot: 320,
    m2Buildable: 260,
    units: [
      unit({ type: "VIVIENDA", title: "Vivienda tipo A (tradicional)", m2Unit: 92, rentType: "TRADICIONAL", rentMonthly: 1150 + factor * 100, salePriceTotal: 270000 + factor * 40000, numUnits: 2, numHabitaciones: 3 }),
      unit({ type: "VIVIENDA", title: "Vivienda tipo B (por habitaciones)", m2Unit: 78, rentType: "HABITACIONES", m2PerRoom: 12, pricePerRoom: 340, numHabitaciones: 4, salePriceTotal: 240000 }),
      unit({ type: "GARAJE", title: "Plazas de garaje en sótano", m2PerPlaza: 12.5, rentMonthly: 75, salePriceTotal: 16000, numUnits: 4 }),
      unit({ type: "TRASTERO", title: "Trasteros anexos", m2Total: 36, rentMonthly: 45, salePriceTotal: 8500, numUnits: 5 }),
    ],
    costs: {
      purchaseTaxPct: 8,
      arquitectoPct: 3,
      obraViviendaPriceM2: 820 + factor * 40,
      obraGarajePriceM2: 420,
      obraTrasterosPriceM2: 380,
      cimentacionPriceM2: 90,
      escalerasM2: 24,
      escalerasPriceM2: 300,
      accesosM2: 40,
      accesosPriceM2: 120,
      desviacionesPct: 5,
      furnitureCostPerUnit: 6000,
      tasas: DEFAULT_TASAS.map((t) => ({ ...t })),
    },
    financing: {
      enabled: true,
      compra: { pct: 80, interest: 5.1, years: 25 },
      obra: { pct: 60, interest: 5.1, years: 2 },
    },
    createdAt: now,
    updatedAt: now,
  };
}

const TWO = [mockOp("Operación Alpha — Edificio 6 viviendas en el centro histórico", 0), mockOp("Operación Beta — Rehabilitación integral con locales", 1)];
const THREE = [...TWO, mockOp("Operación Gamma — Obra nueva plurifamiliar", 2)];

export default function DevCompareHarness() {
  const [open, setOpen] = useState<REOperation[] | null>(null);
  if (process.env.NODE_ENV === "production") return notFound();
  return (
    // Recreate AppGate's transformed subtree so the portal/fixed behaviour is faithful.
    <div className="min-h-screen app-bg">
      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-6">
        <div className="in-reveal in-delay-1">
          <div className="flex flex-col gap-3">
            <button data-testid="open-2" className="btn-primary w-fit" onClick={() => setOpen(TWO)}>
              Comparar 2 operaciones
            </button>
            <button data-testid="open-3" className="btn-primary w-fit" onClick={() => setOpen(THREE)}>
              Comparar 3 operaciones
            </button>
          </div>
        </div>
      </main>
      {open && <CompareModal ops={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

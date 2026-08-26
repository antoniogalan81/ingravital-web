"use client";

// FIXTURE E2E del módulo Balance. Monta la sección REAL (`BalanceSection`) con
// datos simulados y SIN auth ni Supabase: sustituye el SyncContext por una
// implementación en memoria con el MISMO contrato, para poder verificar en un
// navegador real la regla titular ↔ cuenta, el saldo en el selector y el
// interruptor de privacidad, sin tocar jamás datos de producción.
//
// DEV/TEST ONLY: devuelve 404 en producción, igual que dev-compare-harness.

import { notFound } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { SyncContext, type SyncContextValue } from "@/src/sync/SyncContext";
import { BalanceSection } from "@/src/components/balance/BalanceSection";
import type { BalanceItem } from "@/src/lib/balance";

const NOW = "2026-08-26T09:00:00.000Z";

const H_VENTANA = "h-ventana";
const H_PARTICULAR = "h-particular";

const SEED: BalanceItem[] = [
  { id: H_VENTANA, kind: "HOLDER", name: "Ventana al Futuro, S.L.", type: "SOCIEDAD", order: 1, createdAt: NOW, updatedAt: NOW },
  { id: H_PARTICULAR, kind: "HOLDER", name: "Particular", type: "PARTICULAR", order: 2, createdAt: NOW, updatedAt: NOW },

  { id: "acc-caixa", kind: "ACCOUNT", bank: "CaixaBank", alias: "Operativa Ventana", holderId: H_VENTANA, balance: 83450, balanceDate: "2026-08-26", order: 1, createdAt: NOW, updatedAt: NOW },
  { id: "acc-santander", kind: "ACCOUNT", bank: "Santander", alias: "Impuestos", holderId: H_VENTANA, balance: 25300, balanceDate: "2026-08-26", order: 2, createdAt: NOW, updatedAt: NOW },
  { id: "acc-ing", kind: "ACCOUNT", bank: "ING", alias: "Cuenta personal", holderId: H_PARTICULAR, balance: 9000, balanceDate: "2026-08-26", order: 3, createdAt: NOW, updatedAt: NOW },

  { id: "loan-nave", kind: "LOAN", alias: "Hipoteca nave", holderId: H_VENTANA, accountId: "acc-caixa", outstanding: 120000, installment: 640, chargeDay: 12, order: 1, createdAt: NOW, updatedAt: NOW },
  // Préstamo ANTIGUO: conserva `lender`, que ya no se pide ni se muestra.
  { id: "loan-legacy", kind: "LOAN", alias: "Préstamo antiguo", lender: "Banco Santander", holderId: H_PARTICULAR, accountId: "acc-ing", outstanding: 15000, installment: 210, chargeDay: 3, order: 2, createdAt: NOW, updatedAt: NOW },
];

export default function DevBalanceHarness() {
  if (process.env.NODE_ENV === "production") return notFound();
  return <Harness />;
}

function Harness() {
  const [items, setItems] = useState<BalanceItem[]>(SEED);

  const setBalanceItem = useCallback((item: BalanceItem) => {
    setItems((prev) => {
      const next = { ...item, updatedAt: new Date().toISOString() } as BalanceItem;
      return prev.some((x) => x.id === item.id)
        ? prev.map((x) => (x.id === item.id ? next : x))
        : [...prev, next];
    });
  }, []);

  const deleteBalanceItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const value = useMemo<SyncContextValue>(
    () => ({
      realEstateOperations: [],
      balanceItems: items,
      setRealEstateOperation: () => {},
      deleteRealEstateOperation: () => {},
      setBalanceItem,
      deleteBalanceItem,
      isSyncing: false,
      lastSyncAt: null,
      lastError: null,
      triggerSync: async () => {},
    }),
    [items, setBalanceItem, deleteBalanceItem]
  );

  return (
    <SyncContext.Provider value={value}>
      <div className="min-h-screen app-bg">
        <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-6">
          <h1 className="mb-4 text-lg font-extrabold text-ink">Balance — fixture de desarrollo</h1>
          {/* Estado serializado, para poder afirmar sobre los DATOS y no solo sobre el DOM. */}
          <pre id="harness-state" className="hidden">
            {JSON.stringify(items)}
          </pre>
          <BalanceSection />
        </main>
      </div>
    </SyncContext.Provider>
  );
}

"use client";

// BALANCE — posición financiera del usuario y sus sociedades.
// Comparte datos con la APP a través de la tabla `balance_items` (SyncContext).
// La auth y el shell de navegación se gestionan en AppGate.

import AppGate from "@/components/AppGate";
import { BalanceSection } from "@/src/components/balance/BalanceSection";

export default function BalancePage() {
  return (
    <AppGate
      active="balance"
      label="Posición financiera"
      title="Balance"
      subtitle="Cuentas, préstamos y próximos cargos por titular. Edita cualquier dato desde su propia celda."
    >
      <BalanceSection />
    </AppGate>
  );
}

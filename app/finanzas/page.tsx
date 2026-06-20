"use client";

// INVERSIONES — sección principal (núcleo del producto).
// Aloja el módulo de Inversión inmobiliaria (RealEstateSection). La auth y el
// shell de navegación se gestionan en AppGate. SyncContext / src/lib intactos.

import AppGate from "@/components/AppGate";
import { RealEstateSection } from "@/src/components/realEstate/RealEstateSection";

export default function FinanzasPage() {
  return (
    <AppGate
      active="inversiones"
      label="Análisis de operaciones"
      title="Inversiones"
      subtitle="Calcula rentabilidad, compara escenarios y prepara cada operación para inversores."
    >
      <RealEstateSection />
    </AppGate>
  );
}

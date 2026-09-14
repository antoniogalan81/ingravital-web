"use client";

// FIXTURE DE DESARROLLO para revisar "Documentación / Actualizar con IA" en un navegador real.
// Recibe en el hash la sesión de un usuario TEMPORAL creado por worker/test/uiSeed.ts, carga
// su operación de Supabase y monta la ficha real (RealEstateModal). "Sincronizar" vuelve a
// leer la operación, como haría el SyncProvider.
//
// SOLO DESARROLLO: 404 en producción.

import { notFound } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RealEstateModal } from "@/src/components/realEstate/RealEstateModal";
import type { REOperation } from "@/src/lib/realEstate";
import { supabase } from "@/src/lib/supabaseClient";
import { SyncContext, type SyncContextValue } from "@/src/sync/SyncContext";

export default function DocumentacionHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DocumentacionHarness />;
}

function DocumentacionHarness() {
  const [op, setOp] = useState<REOperation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const { data, error: e } = await supabase.from("operaciones_inmobiliarias").select("id, data").eq("id", params.get("op") ?? "").single();
    if (e) return setError(e.message);
    setOp({ ...(data.data as REOperation), id: data.id });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get("at");
    const refresh_token = params.get("rt");
    supabase.auth
      .setSession({ access_token: access_token ?? "", refresh_token: refresh_token ?? "" })
      .then(({ error: e }) => (e ? setError(`Sesión no válida en el hash: ${e.message}`) : load()));
  }, [load]);

  const ctx = useMemo<SyncContextValue>(
    () => ({
      realEstateOperations: op ? [op] : [],
      balanceItems: [],
      setRealEstateOperation: (item) => setOp(item),
      deleteRealEstateOperation: () => {},
      setBalanceItem: () => {},
      deleteBalanceItem: () => {},
      isSyncing: false,
      lastSyncAt: null,
      lastError: null,
      triggerSync: load,
    }),
    [op, load],
  );

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!op) return <p className="p-6">Cargando…</p>;
  return (
    <SyncContext.Provider value={ctx}>
      <RealEstateModal op={op} onSave={(next) => setOp(next)} onDelete={() => {}} onClose={() => {}} />
    </SyncContext.Provider>
  );
}

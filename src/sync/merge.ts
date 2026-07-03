// ==================== LÓGICA DE FUSIÓN (PURA) ====================
// Funciones puras de merge/normalización, sin dependencias de red ni de Supabase.
// Se separan de `syncEngine.ts` para poder testearlas de forma aislada
// (`merge.test.ts`) y para dejar clara la política de resolución de conflictos.

import type { SupabaseRow, SyncableEntity } from "./types";

/**
 * ¿El registro remoto es más nuevo que el local? (last-write-wins por timestamp).
 * - Sin local → el remoto "gana" (true).
 * - Sin marca de tiempo remota → false (no pisamos con algo sin fecha).
 * - Sin marca local → el remoto gana (true).
 */
export function isRemoteNewer(
  remoteRow: SupabaseRow,
  localItem: SyncableEntity | undefined
): boolean {
  if (!localItem) return true;

  const remoteUpdated = remoteRow.client_updated_at || remoteRow.server_updated_at;
  const localUpdated = localItem.updatedAt;

  if (!remoteUpdated) return false;
  if (!localUpdated) return true;

  return new Date(remoteUpdated) > new Date(localUpdated);
}

/** Convierte una fila de Supabase en una entidad local. */
export function rowToEntity(row: SupabaseRow): SyncableEntity {
  const data = row.data || {};

  return {
    id: row.id,
    ...data,
    updatedAt: row.client_updated_at || (data.updatedAt as string),
    deleted: row.deleted_at !== null,
  } as SyncableEntity;
}

// ==================== MERGE POR COLECCIÓN (union por id + LWW por item) ====================
// El problema: cada operación viaja como UN blob JSON (una fila). Con LWW a nivel de
// fila, si dos dispositivos editan la MISMA operación, el último push pisaba arrays
// enteros (`expenses`, `sales`, `milestones`, `media`, `share.recipients`) y se perdían
// los elementos añadidos en el otro dispositivo. La solución es fusionar esas
// colecciones por `id` en vez de reemplazarlas a ciegas.
//
// LIMITACIÓN CONOCIDA Y DELIBERADA (documentada, sin éxito falso): el modelo compartido
// con la APP NO tiene tombstone por-item (borrar un gasto = quitarlo del array, sin
// marca). Sin esa señal es imposible distinguir "lo borró A" de "lo añadió B". Como la
// PRIORIDAD es no perder datos, la fusión es UNION-biased: conserva los elementos de
// ambos lados. Consecuencia asumida: el borrado de un SUB-elemento puede revertirse si
// otro dispositivo aún conserva su copia (el elemento reaparece; es recuperable — nunca
// se pierde una alta). `mergeById` ya respeta un `deleted:true` por-item SI algún día se
// añade al modelo compartido (fix real, requiere coordinar WEB+APP): entonces los
// borrados se propagarían sin resucitar. Hasta entonces, unión segura.

type Identified = { id?: string; updatedAt?: string; deleted?: boolean };

/** ¿`a` (ISO) es estrictamente más nuevo que `b`? Sin `a` → false; sin `b` (pero con `a`) → true. */
function isNewerTs(a?: string, b?: string): boolean {
  if (!a) return false;
  if (!b) return true;
  return new Date(a) > new Date(b);
}

/**
 * Fusiona dos colecciones por `id` (UNION), resolviendo colisiones de un mismo id por
 * last-write-wins (`updatedAt`); en empate o sin timestamps gana el lado preferente.
 * - Conserva los elementos añadidos en CUALQUIERA de los lados (nunca pisa el array).
 * - Respeta un tombstone por-item (`deleted:true`) SI existiera (hoy inerte; forward-compatible).
 * - `null`/`undefined` se tratan como `[]` (compatibilidad con datos antiguos/legacy).
 * - Elementos SIN id (datos legacy/externos) no son desduplicables por clave: se conservan
 *   los del lado preferente para no perder datos ni duplicar sin control.
 * Determinista: no muta las entradas; orden estable (primero el lado preferente).
 */
export function mergeById<T extends Identified>(
  local: T[] | undefined,
  remote: T[] | undefined,
  preferSide: "local" | "remote"
): T[] {
  const localArr = Array.isArray(local) ? local : [];
  const remoteArr = Array.isArray(remote) ? remote : [];

  const hasId = (x: T | undefined): x is T =>
    !!x && typeof x.id === "string" && x.id.length > 0;

  const localById = new Map<string, T>();
  for (const x of localArr) if (hasId(x)) localById.set(x.id as string, x);
  const remoteById = new Map<string, T>();
  for (const x of remoteArr) if (hasId(x)) remoteById.set(x.id as string, x);

  // Orden determinista: primero el lado preferente, luego los ids nuevos del otro lado.
  const primary = preferSide === "remote" ? remoteArr : localArr;
  const secondary = preferSide === "remote" ? localArr : remoteArr;
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const x of primary) if (hasId(x) && !seen.has(x.id as string)) { seen.add(x.id as string); orderedIds.push(x.id as string); }
  for (const x of secondary) if (hasId(x) && !seen.has(x.id as string)) { seen.add(x.id as string); orderedIds.push(x.id as string); }

  const result: T[] = [];
  for (const id of orderedIds) {
    const l = localById.get(id);
    const r = remoteById.get(id);
    let winner: T;
    if (l && r) {
      if (isNewerTs(l.updatedAt, r.updatedAt)) winner = l;
      else if (isNewerTs(r.updatedAt, l.updatedAt)) winner = r;
      else winner = preferSide === "remote" ? r : l; // empate → lado preferente
    } else {
      winner = (l ?? r) as T;
    }
    if (winner.deleted === true) continue; // tombstone por-item (forward-compatible)
    result.push(winner);
  }

  // Elementos sin id: conservar los del lado preferente (evita duplicar sin clave estable).
  const primaryNoId = (preferSide === "remote" ? remoteArr : localArr).filter((x) => !hasId(x));
  result.push(...primaryNoId);

  return result;
}

// Campos de REOperation que son colecciones anidadas con `id` propio y crecen por
// altas independientes en distintos dispositivos (entrada rápida de gasto/venta/hito,
// media). Se fusionan por id. NO se incluyen `units`/`costs.tasas`/config: esos se
// editan como un todo coherente en el editor y fusionarlos podría resucitar unidades
// borradas a propósito o mezclar configuraciones incompatibles → LWW de operación.
const RE_COLLECTION_FIELDS = ["expenses", "sales", "milestones", "media"] as const;

/**
 * Fusiona dos versiones de una MISMA operación (mismo id) conservando lo de ambos lados:
 * - Campos ESCALARES / config → last-write-wins a nivel de operación (gana el lado más
 *   reciente): no se pierden campos escalares del lado ganador.
 * - COLECCIONES de seguimiento (expenses/sales/milestones/media) → merge por id.
 * - `share.recipients` (inversores destinatarios) → merge por id, conservando el resto
 *   de `share` (visibility, enabled) del lado más reciente.
 * - `updatedAt` de la operación → el más reciente de ambos.
 * No muta las entradas.
 */
export function mergeOperationEntity<T extends SyncableEntity>(
  local: T,
  remote: T,
  remoteIsNewer: boolean
): T {
  const preferSide: "local" | "remote" = remoteIsNewer ? "remote" : "local";
  const l = local as unknown as Record<string, unknown>;
  const r = remote as unknown as Record<string, unknown>;
  const base = remoteIsNewer ? r : l; // escalares/config del lado más reciente
  const merged: Record<string, unknown> = { ...base };

  for (const field of RE_COLLECTION_FIELDS) {
    const lArr = l[field] as Identified[] | undefined;
    const rArr = r[field] as Identified[] | undefined;
    if (Array.isArray(lArr) || Array.isArray(rArr)) {
      merged[field] = mergeById(lArr, rArr, preferSide);
    }
  }

  const lShare = l.share as Record<string, unknown> | undefined;
  const rShare = r.share as Record<string, unknown> | undefined;
  if (lShare || rShare) {
    const baseShare = (remoteIsNewer ? rShare : lShare) ?? {};
    const lRec = lShare?.recipients as Identified[] | undefined;
    const rRec = rShare?.recipients as Identified[] | undefined;
    if (Array.isArray(lRec) || Array.isArray(rRec)) {
      merged.share = { ...baseShare, recipients: mergeById(lRec, rRec, preferSide) };
    }
  }

  const lU = l.updatedAt as string | undefined;
  const rU = r.updatedAt as string | undefined;
  merged.updatedAt = isNewerTs(lU, rU) ? lU : rU ?? lU;

  return merged as unknown as T;
}

/**
 * Firma ligera y determinista de las colecciones fusionables + `updatedAt` de una
 * operación. Sirve para detectar si una operación fusionada aporta datos que el remoto
 * aún no tiene (y por tanto debe re-subirse para converger). Independiente del orden.
 */
export function operationSignature(op: SyncableEntity): string {
  const o = op as unknown as Record<string, unknown>;
  const parts: string[] = [`u:${(o.updatedAt as string) ?? ""}`];
  const collections: { key: string; arr: Identified[] | undefined }[] = [
    ...RE_COLLECTION_FIELDS.map((f) => ({ key: f, arr: o[f] as Identified[] | undefined })),
    {
      key: "share.recipients",
      arr: (o.share as Record<string, unknown> | undefined)?.recipients as Identified[] | undefined,
    },
  ];
  for (const { key, arr } of collections) {
    const items = Array.isArray(arr) ? arr : [];
    const sig = items
      .map((x) => `${x?.id ?? "?"}:${x?.updatedAt ?? ""}:${x?.deleted ? "d" : ""}`)
      .sort()
      .join(",");
    parts.push(`${key}=[${sig}]`);
  }
  return parts.join("|");
}

/**
 * Aplica filas remotas sobre el array local y devuelve el nuevo array.
 *
 * Política de conflictos = last-write-wins por `client_updated_at`, APLICADA TAMBIÉN
 * A LOS BORRADOS (tombstones de FILA/operación completa): un borrado remoto solo elimina
 * el registro local si es MÁS NUEVO que la copia local. Así, si otro dispositivo borró
 * pero aquí se editó después, la edición local (más reciente) se conserva y se volverá a
 * subir; solo se pierde si el borrado es realmente posterior.
 *
 * Con `opts.combine` (usado para operaciones inmobiliarias), cuando existe copia local Y
 * remota de un mismo registro se FUSIONAN por colección (ver `mergeOperationEntity`) en
 * vez de reemplazar a ciegas — esto evita perder sub-elementos añadidos en dispositivos
 * distintos. Los ids cuya fusión aporta datos que el remoto no tiene se registran en
 * `opts.needsRepush` para que el llamante los vuelva a subir (convergencia).
 */
export function mergeRemoteRows<T extends SyncableEntity>(
  localItems: T[],
  remoteRows: SupabaseRow[],
  opts?: {
    combine?: (local: T, remote: T, remoteIsNewer: boolean) => T;
    needsRepush?: Set<string>;
  }
): T[] {
  const localMap = new Map(localItems.map((item) => [item.id, item]));
  const resultMap = new Map(localMap);

  for (const row of remoteRows) {
    const localItem = localMap.get(row.id);

    if (row.deleted_at !== null) {
      // Tombstone de fila → LWW: borra solo si el borrado remoto es más nuevo que lo local.
      if (isRemoteNewer(row, localItem)) {
        resultMap.delete(row.id);
      }
      continue;
    }

    const remoteEntity = rowToEntity(row) as T;

    if (!localItem) {
      resultMap.set(row.id, remoteEntity); // registro nuevo del remoto
      continue;
    }

    const remoteNewer = isRemoteNewer(row, localItem);

    if (opts?.combine) {
      const merged = opts.combine(localItem, remoteEntity, remoteNewer);
      resultMap.set(row.id, merged);
      // Si la fusión difiere del remoto, lo local aportó datos → re-subir para converger.
      if (opts.needsRepush && operationSignature(merged) !== operationSignature(remoteEntity)) {
        opts.needsRepush.add(row.id);
      }
    } else if (remoteNewer) {
      // Sin combinador: comportamiento clásico (remoto más nuevo reemplaza; si no, se
      // mantiene local, que seguirá dirty para volver a subirse).
      resultMap.set(row.id, remoteEntity);
    }
  }

  return Array.from(resultMap.values());
}

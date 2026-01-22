/**
 * Normalización de Metas para WEB - MISMAS REGLAS QUE APP
 * 
 * REGLAS:
 * - NO guardar campos null/undefined/"" 
 * - title siempre requerido (trim)
 * - metaType: validar enum, default "CORTO_PLAZO"
 * - horizon: validar enum, si inválido NO guardar
 * - isActive: solo guardar si es false; si true/undefined NO guardar
 * - order: solo guardar si es number válido
 * - targetDate: solo guardar si es YYYY-MM-DD válido
 * - description: solo guardar si es string no vacío (trim)
 */

import type { Meta, MetaType, Horizon } from "../lib/types";

// ==================== CONSTANTES ====================

const VALID_META_TYPES: MetaType[] = ["MOONSHOT", "LARGO_PLAZO", "CORTO_PLAZO"];
const VALID_HORIZONS: Horizon[] = ["1M", "3M", "6M", "9M", "1Y", "3Y", "5Y", "10Y"];

// ==================== HELPERS ====================

/**
 * Valida formato de fecha YYYY-MM-DD
 */
export function isValidDateYYYYMMDD(date: unknown): date is string {
  if (typeof date !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(date);
  return !isNaN(d.getTime());
}

/**
 * Valida que metaType sea un valor válido del enum
 */
export function isValidMetaType(value: unknown): value is MetaType {
  return typeof value === "string" && VALID_META_TYPES.includes(value as MetaType);
}

/**
 * Valida que horizon sea un valor válido del enum
 */
export function isValidHorizon(value: unknown): value is Horizon {
  return typeof value === "string" && VALID_HORIZONS.includes(value as Horizon);
}

/**
 * Limpia un objeto eliminando:
 * - Propiedades con valor null, undefined, ""
 * - Excepto las keys especificadas en preserveKeys
 */
export function cleanObjectPreserveKeys<T extends Record<string, unknown>>(
  obj: T,
  preserveKeys: string[] = []
): Partial<T> {
  const result: Partial<T> = {};
  const preserveSet = new Set(preserveKeys);
  
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    
    // Siempre preservar keys explícitas
    if (preserveSet.has(key)) {
      result[key as keyof T] = value as T[keyof T];
      continue;
    }
    
    // Omitir null, undefined, string vacío
    if (value === null || value === undefined || value === "") {
      continue;
    }
    
    // Omitir arrays vacíos
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    
    // Omitir objetos vacíos (pero no arrays)
    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0) {
      continue;
    }
    
    result[key as keyof T] = value as T[keyof T];
  }
  
  return result;
}

// ==================== NORMALIZE FOR DB ====================

/**
 * Normaliza una meta ANTES de guardar en Supabase.
 * Produce el mismo output que la APP.
 * 
 * @param meta - Meta con campos posiblemente sucios
 * @returns Record limpio sin nulls ni campos vacíos
 */
export function normalizeMetaForDb(meta: Partial<Meta> & { id: string; createdAt?: string; updatedAt?: string }): Record<string, unknown> {
  const now = new Date().toISOString();
  
  // Objeto resultado - solo campos con valores válidos
  const result: Record<string, unknown> = {};
  
  // id: siempre requerido
  result.id = meta.id;
  
  // title: siempre requerido, trim
  const trimmedTitle = typeof meta.title === "string" ? meta.title.trim() : "";
  result.title = trimmedTitle || "Sin título";
  
  // metaType: validar enum, default "CORTO_PLAZO"
  if (isValidMetaType(meta.metaType)) {
    result.metaType = meta.metaType;
  } else {
    result.metaType = "CORTO_PLAZO";
  }
  
  // horizon: solo guardar si es válido
  if (isValidHorizon(meta.horizon)) {
    result.horizon = meta.horizon;
  }
  
  // targetDate: solo guardar si es válido YYYY-MM-DD
  if (isValidDateYYYYMMDD(meta.targetDate)) {
    result.targetDate = meta.targetDate;
  }
  
  // description: solo guardar si es string no vacío (trim)
  if (typeof meta.description === "string") {
    const trimmedDesc = meta.description.trim();
    if (trimmedDesc) {
      result.description = trimmedDesc;
    }
  }
  
  // order: solo guardar si es number válido
  if (typeof meta.order === "number" && !isNaN(meta.order)) {
    result.order = meta.order;
  }
  
  // isActive: SOLO guardar si es false
  // Si es true o undefined, NO guardar (el default al hidratar será true)
  if (meta.isActive === false) {
    result.isActive = false;
  }
  
  // timestamps
  result.createdAt = meta.createdAt || now;
  result.updatedAt = now;
  
  return result;
}

// ==================== HYDRATE FROM DB ====================

/**
 * Hidrata una meta DESDE Supabase para uso en UI.
 * Añade defaults para campos que la UI espera.
 * 
 * @param dbMeta - Objeto leído de Supabase (puede ser sparse)
 * @returns Meta con todos los campos necesarios para la UI
 */
export function hydrateMetaFromDb(dbMeta: Record<string, unknown>): Meta {
  // title: usar title, o name (legacy), o id como fallback
  const title = (dbMeta.title as string) || (dbMeta.name as string) || (dbMeta.id as string) || "Sin título";
  
  // metaType: validar o usar default
  const rawMetaType = dbMeta.metaType;
  const metaType: MetaType = isValidMetaType(rawMetaType) ? rawMetaType : "CORTO_PLAZO";
  
  // horizon: validar o undefined
  const rawHorizon = dbMeta.horizon;
  const horizon: Horizon | undefined = isValidHorizon(rawHorizon) ? rawHorizon : undefined;
  
  // targetDate: validar o undefined
  const rawTargetDate = dbMeta.targetDate;
  const targetDate: string | undefined = isValidDateYYYYMMDD(rawTargetDate) ? rawTargetDate : undefined;
  
  // description: string o undefined
  const description = typeof dbMeta.description === "string" && dbMeta.description.trim() 
    ? dbMeta.description.trim() 
    : undefined;
  
  // order: number o undefined (UI maneja undefined como "sin orden")
  const order = typeof dbMeta.order === "number" ? dbMeta.order : undefined;
  
  // isActive: si NO existe o es true -> true; solo false si explícitamente false
  const isActive = dbMeta.isActive !== false;
  
  return {
    id: dbMeta.id as string,
    title,
    description,
    targetDate,
    metaType,
    horizon,
    order,
    isActive,
  };
}

// ==================== TYPE GUARD ====================

/**
 * Type guard para verificar si un item es una Meta (por estructura)
 */
export function isMeta(item: unknown): item is Meta {
  if (!item || typeof item !== "object") return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.title === "string" &&
    // Las metas tienen metaType, las tasks tienen type
    (obj.metaType !== undefined || obj.type === undefined)
  );
}


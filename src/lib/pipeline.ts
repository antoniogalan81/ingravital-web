// src/lib/pipeline.ts — Pipeline/embudo de operaciones inmobiliarias.
//
// La etapa se guarda en `REOperation.pipelineStage` (campo opcional, anidado en el
// JSON de la operación → sin migración, compatible con operaciones antiguas).
// Las operaciones SIN etapa se tratan como "Captación" por defecto (no se ocultan
// ni se pierden). Import type-only de REOperation para no crear ciclo en runtime.

import type { REOperation } from "./realEstate";

export type PipelineStage =
  | "comprado"
  | "oferta"
  | "interesante"
  | "base"
  | "estudio"
  | "captacion";

// "all" = filtro global (no es una etapa guardada). No hay "sin clasificar".
export type StageFilter = PipelineStage | "all";

export type StageDef = {
  key: PipelineStage;
  label: string; // etiqueta completa
  short: string; // etiqueta corta (chips/tabla)
  color: string; // color de acento (texto/punto)
  soft: string; // fondo suave del badge
};

// Orden = prioridad del embudo (de cierre a captación). Este mismo orden se usa en
// filtros (tras "Todas"), en el selector de etapa y en la ordenación de la lista.
export const PIPELINE_STAGES: StageDef[] = [
  { key: "comprado", label: "Comprado", short: "Comprado", color: "#15805a", soft: "#e3f2ec" },
  { key: "oferta", label: "Oferta", short: "Oferta", color: "#b45309", soft: "#fdf1e3" },
  { key: "interesante", label: "Interesante", short: "Interesante", color: "#4f46e5", soft: "#eef2ff" },
  { key: "base", label: "Base", short: "Base", color: "#0f766e", soft: "#e6f4f1" },
  { key: "estudio", label: "En estudio", short: "En estudio", color: "#1e4fa3", soft: "#e8eff9" },
  { key: "captacion", label: "Captación", short: "Captación", color: "#475569", soft: "#f1f5f9" },
];

const STAGE_MAP: Record<PipelineStage, StageDef> = PIPELINE_STAGES.reduce(
  (acc, s) => {
    acc[s.key] = s;
    return acc;
  },
  {} as Record<PipelineStage, StageDef>,
);

const STAGE_INDEX: Record<PipelineStage, number> = PIPELINE_STAGES.reduce(
  (acc, s, i) => {
    acc[s.key] = i;
    return acc;
  },
  {} as Record<PipelineStage, number>,
);

const VALID_KEYS = new Set<string>(PIPELINE_STAGES.map((s) => s.key));

// Normalización de valores antiguos → catálogo actual (no rompe datos guardados).
// "oferta_enviada" era el antiguo nombre de "Oferta"; "descartado"/"pausado" se
// retiraron del flujo y se pliegan en "Captación" (no se ocultan; al reguardar se
// normalizan al nuevo valor).
const LEGACY_STAGE: Record<string, PipelineStage> = {
  oferta_enviada: "oferta",
  descartado: "captacion",
  pausado: "captacion",
};

/** Etapa efectiva de la operación. Nunca null: sin etapa/valor desconocido → "captacion". */
export function stageOf(op: Pick<REOperation, "pipelineStage">): PipelineStage {
  const s = op.pipelineStage;
  if (s && VALID_KEYS.has(s)) return s as PipelineStage;
  if (s && LEGACY_STAGE[s]) return LEGACY_STAGE[s];
  return "captacion";
}

/** Prioridad de ordenación (0 = Comprado, el más alto). */
export function stagePriority(op: Pick<REOperation, "pipelineStage">): number {
  return STAGE_INDEX[stageOf(op)];
}

/** Definición (label/color) de una etapa. */
export function stageDef(stage: PipelineStage): StageDef {
  return STAGE_MAP[stage];
}

// src/lib/pipeline.ts — Pipeline/embudo de operaciones inmobiliarias.
//
// La etapa se guarda en `REOperation.pipelineStage` (campo opcional, anidado en el
// JSON de la operación → sin migración, compatible con operaciones antiguas). Las
// operaciones sin etapa se tratan como "Sin clasificar" (no se ocultan; se pueden
// reclasificar). Import type-only de REOperation para no crear ciclo en runtime.

import type { REOperation } from "./realEstate";

export type PipelineStage =
  | "captacion"
  | "estudio"
  | "interesante"
  | "oferta"
  | "comprado"
  | "descartado";

export type StageFilter = PipelineStage | "all" | "none";

export type StageDef = {
  key: PipelineStage;
  label: string; // etiqueta completa
  short: string; // etiqueta corta (chips/tabla)
  color: string; // color de acento (texto/punto)
  soft: string; // fondo suave del badge
};

// Orden = embudo real (de captación a cierre; descartado al final).
export const PIPELINE_STAGES: StageDef[] = [
  { key: "captacion", label: "Captación", short: "Captación", color: "#475569", soft: "#f1f5f9" },
  { key: "estudio", label: "En estudio", short: "En estudio", color: "#1e4fa3", soft: "#e8eff9" },
  { key: "interesante", label: "Interesante", short: "Interesante", color: "#4f46e5", soft: "#eef2ff" },
  { key: "oferta", label: "Oferta enviada", short: "Oferta", color: "#b45309", soft: "#fdf1e3" },
  { key: "comprado", label: "Comprado", short: "Comprado", color: "#15805a", soft: "#e3f2ec" },
  { key: "descartado", label: "Descartado / Pausado", short: "Descartado", color: "#64748b", soft: "#f1f5f9" },
];

// Definición para operaciones sin etapa (solo presentación; no es un valor guardado).
export const UNCLASSIFIED_DEF: Omit<StageDef, "key"> = {
  label: "Sin clasificar",
  short: "Sin clasificar",
  color: "#94a3b8",
  soft: "#f8fafc",
};

const STAGE_MAP: Record<PipelineStage, StageDef> = PIPELINE_STAGES.reduce(
  (acc, s) => {
    acc[s.key] = s;
    return acc;
  },
  {} as Record<PipelineStage, StageDef>,
);

const VALID_KEYS = new Set<string>(PIPELINE_STAGES.map((s) => s.key));

/** Etapa válida de la operación, o null si no está clasificada / valor desconocido. */
export function stageOf(op: Pick<REOperation, "pipelineStage">): PipelineStage | null {
  const s = op.pipelineStage;
  return s != null && VALID_KEYS.has(s) ? (s as PipelineStage) : null;
}

/** Definición (label/color) de una etapa o de "Sin clasificar" cuando es null. */
export function stageDef(stage: PipelineStage | null): StageDef | (Omit<StageDef, "key"> & { key: "none" }) {
  if (stage == null) return { key: "none", ...UNCLASSIFIED_DEF };
  return STAGE_MAP[stage];
}

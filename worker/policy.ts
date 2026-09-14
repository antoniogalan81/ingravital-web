// worker/policy.ts — ÚNICO sitio con umbrales y límites del procesamiento documental.
// Cambiar aquí; no repartir números mágicos por el pipeline.

/** Sube cuando cambien reglas o extracción de forma que convenga reprocesar (`--reprocess`). */
export const EXTRACTOR_VERSION = "2026.09.14-1";

export const CONFIDENCE = {
  /** ≥ autoApply: se actualiza la operación sin intervención (queda auditado). */
  autoApply: 0.9,
  /** ≥ review y < autoApply: propuesta pendiente de revisión. < review: no se toca nada. */
  review: 0.6,
  /** Techo para valores que solo aporta el modelo local: siempre pasan por revisión. */
  llmCap: 0.85,
  /** Penalización multiplicativa cuando el texto sale de OCR. */
  ocrFactor: 0.95,
} as const;

/** Qué cambios pueden aplicarse solos (si superan `autoApply`). */
export const AUTO_APPLY = {
  real_expense: true,
  real_loan: true,
  sale: true,
} as const;

export const LIMITS = {
  maxFileBytes: 20 * 1024 * 1024,
  maxPdfPages: 40,
  maxOcrPages: 6,
  maxFilesPerFolder: 2000,
  maxFolderDepth: 5,
  maxTextChars: 200_000,
  llmTextChars: 12_000,
  extractTimeoutMs: 180_000,
  llmTimeoutMs: 180_000,
  maxDocumentAttempts: 3,
  /** Un gasto ya registrado con mismo importe y fecha a ±N días se trata como posible duplicado. */
  duplicateDateWindowDays: 7,
} as const;

export const LEASE_SECONDS = 600;

/** MIME aceptados → cómo se leen. Todo lo demás se ignora (y se dice por qué). */
export const SUPPORTED_MIME: Record<string, "pdf" | "image" | "sheet" | "gdoc"> = {
  "application/pdf": "pdf",
  "image/jpeg": "image",
  "image/png": "image",
  "application/vnd.ms-excel": "sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "sheet",
  "application/vnd.google-apps.document": "gdoc",
};

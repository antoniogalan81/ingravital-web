// worker/extract/text.ts — Tipo real del archivo (firma de bytes) y texto vía extract_text.py.

import { execFile } from "node:child_process";
import { open } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LIMITS } from "../policy.ts";

export type FileKind = "pdf" | "image" | "sheet";

export type ExtractedText = { text: string; pages: number; ocr: boolean; truncated: boolean };

type DocumentErrorCode = "mime_mismatch" | "pdf_protected" | "too_many_pages" | "image_too_large" | "archive_too_large" | "unreadable" | "ocr_timeout" | "empty_text" | "extract_failed";

export class DocumentError extends Error {
  code: DocumentErrorCode;
  constructor(code: DocumentErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const MESSAGES: Record<DocumentError["code"], string> = {
  mime_mismatch: "El contenido del archivo no corresponde a su tipo declarado.",
  pdf_protected: "El PDF está protegido con contraseña.",
  too_many_pages: `El documento tiene más de ${LIMITS.maxPdfPages} páginas.`,
  image_too_large: "La imagen es demasiado grande para procesarla.",
  archive_too_large: "La hoja de cálculo se expande a un tamaño excesivo; no se procesa por seguridad.",
  unreadable: "El archivo está dañado o no se puede leer.",
  ocr_timeout: "El reconocimiento de texto tardó demasiado.",
  empty_text: "No se pudo leer texto en el documento (¿escaneo ilegible?).",
  extract_failed: "Falló la lectura local del documento.",
};

const docError = (code: DocumentError["code"]) => new DocumentError(code, MESSAGES[code]);

/** Tipo por los primeros bytes. Un MIME declarado que no coincide se rechaza. */
export async function sniffKind(path: string): Promise<FileKind | null> {
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(8);
    await fh.read(buf, 0, 8, 0);
    if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image";
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image";
    if (buf.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) return "sheet";
    if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return "sheet";
    return null;
  } finally {
    await fh.close();
  }
}

export type TextToolConfig = { python: string; tesseract: string; tessdata: string };

const SCRIPT = fileURLToPath(new URL("./extract_text.py", import.meta.url));

export async function extractText(path: string, expected: FileKind, tools: TextToolConfig): Promise<ExtractedText> {
  const actual = await sniffKind(path);
  if (actual !== expected) throw docError("mime_mismatch");
  const args = [SCRIPT, path, expected, "--tesseract", tools.tesseract, "--tessdata", tools.tessdata, "--max-pages", String(LIMITS.maxPdfPages), "--max-ocr-pages", String(LIMITS.maxOcrPages), "--max-chars", String(LIMITS.maxTextChars)];
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(tools.python, args, { timeout: LIMITS.extractTimeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true, encoding: "utf8" }, (err, out) => {
      if (err && !out) reject(docError(err.killed ? "ocr_timeout" : "extract_failed"));
      else resolve(out);
    });
  });
  let parsed: { text?: string; pages?: number; ocr?: boolean; truncated?: boolean; error?: DocumentError["code"] };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw docError("extract_failed");
  }
  if (parsed.error) throw docError(parsed.error in MESSAGES ? parsed.error : "unreadable");
  const text = parsed.text ?? "";
  if (text.replace(/\s/g, "").length < 20) throw docError("empty_text");
  return { text, pages: parsed.pages ?? 1, ocr: !!parsed.ocr, truncated: !!parsed.truncated };
}

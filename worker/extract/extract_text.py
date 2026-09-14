"""worker/extract/extract_text.py — Texto de un documento, en local.

  python extract_text.py <ruta> <pdf|image|sheet> --tesseract <exe> --tessdata <dir>
                          [--max-pages N] [--max-ocr-pages N] [--max-chars N]

Escribe JSON en stdout: {"text", "pages", "ocr", "ocrPages", "truncated"} o {"error"}.

Seguridad: PyMuPDF solo lee (no ejecuta JavaScript de PDF); xlrd/openpyxl leen valores de
celda (no ejecutan macros). Las imágenes se comprueban antes de OCR para evitar bombas de
descompresión. La ruta la genera el worker; aquí nunca se usa el nombre original.
"""

import argparse
import json
import os
import struct
import subprocess
import sys
import tempfile
import zipfile

MAX_IMAGE_PIXELS = 60_000_000
MAX_UNZIPPED_BYTES = 150 * 1024 * 1024
MAX_ZIP_RATIO = 200
MIN_PAGE_TEXT = 40
OCR_DPI = 300


def ocr_image(png_path, args):
    proc = subprocess.run(
        [args.tesseract, png_path, "stdout", "-l", "spa+eng", "--psm", "3", "--tessdata-dir", args.tessdata],
        capture_output=True,
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError("ocr_failed")
    return proc.stdout.decode("utf-8", errors="replace")


def from_pdf(path, args):
    import pymupdf

    doc = pymupdf.open(path)
    if doc.needs_pass or doc.is_encrypted:
        return {"error": "pdf_protected"}
    if doc.page_count > args.max_pages:
        return {"error": "too_many_pages", "pages": doc.page_count}
    parts, ocr_pages = [], 0
    for page in doc:
        text = page.get_text("text") or ""
        if len(text.strip()) < MIN_PAGE_TEXT and ocr_pages < args.max_ocr_pages:
            # Tamaño calculado ANTES de rasterizar: una página con dimensiones absurdas no se pinta.
            pixels = lambda d: (page.rect.width / 72 * d) * (page.rect.height / 72 * d)
            dpi = OCR_DPI
            while dpi > 72 and pixels(dpi) > MAX_IMAGE_PIXELS:
                dpi //= 2
            if pixels(dpi) > MAX_IMAGE_PIXELS:
                return {"error": "image_too_large"}
            pix = page.get_pixmap(dpi=dpi)
            fd, png = tempfile.mkstemp(suffix=".png")
            os.close(fd)
            try:
                pix.save(png)
                text = ocr_image(png, args)
                ocr_pages += 1
            finally:
                os.remove(png)
        parts.append(text)
    return {"text": "\n".join(parts), "pages": doc.page_count, "ocr": ocr_pages > 0, "ocrPages": ocr_pages}


def image_size(path):
    """Ancho y alto de la cabecera PNG/JPEG sin decodificar píxeles (None si no se reconoce)."""
    with open(path, "rb") as fh:
        head = fh.read(24)
        if head[:8] == b"\x89PNG\r\n\x1a\n" and head[12:16] == b"IHDR":
            return struct.unpack(">II", head[16:24])
        if head[:2] != b"\xff\xd8":
            return None
        fh.seek(2)
        for _ in range(500):
            marker = fh.read(2)
            if len(marker) < 2 or marker[0] != 0xFF:
                return None
            if marker[1] == 0x01 or 0xD0 <= marker[1] <= 0xD8:
                continue
            length = struct.unpack(">H", fh.read(2))[0]
            if 0xC0 <= marker[1] <= 0xCF and marker[1] not in (0xC4, 0xC8, 0xCC):
                height, width = struct.unpack(">xHH", fh.read(5))
                return width, height
            fh.seek(length - 2, 1)
    return None


def from_image(path, args):
    size = image_size(path)
    # Sin cabecera reconocible o con demasiados píxeles: nunca llega al decodificador.
    if size is None:
        return {"error": "unreadable"}
    if size[0] * size[1] > MAX_IMAGE_PIXELS:
        return {"error": "image_too_large"}
    return {"text": ocr_image(path, args), "pages": 1, "ocr": True, "ocrPages": 1}


def from_sheet(path, args):
    with open(path, "rb") as fh:
        magic = fh.read(4)
    rows = []
    if magic == b"PK\x03\x04":
        import openpyxl

        # Bomba zip: se comprueba el tamaño descomprimido declarado antes de parsear el XML.
        with zipfile.ZipFile(path) as z:
            infos = z.infolist()
            unzipped = sum(i.file_size for i in infos)
            zipped = max(1, sum(i.compress_size for i in infos))
            if unzipped > MAX_UNZIPPED_BYTES or unzipped / zipped > MAX_ZIP_RATIO:
                return {"error": "archive_too_large"}

        # Por descriptor: el temporal no tiene extensión y openpyxl la exige con rutas.
        with open(path, "rb") as fh:
            wb = openpyxl.load_workbook(fh, read_only=True, data_only=True, keep_links=False)
            for ws in wb.worksheets[:10]:
                for row in ws.iter_rows(max_row=2000, max_col=40, values_only=True):
                    cells = [format_cell(v) for v in row if v is not None]
                    if cells:
                        rows.append("\t".join(cells))
            wb.close()
    else:
        import xlrd

        book = xlrd.open_workbook(path, on_demand=True)
        for sheet in book.sheets()[:10]:
            for r in range(min(sheet.nrows, 2000)):
                cells = [format_cell(v) for v in sheet.row_values(r)[:40] if v not in ("", None)]
                if cells:
                    rows.append("\t".join(cells))
    return {"text": "\n".join(rows), "pages": 1, "ocr": False, "ocrPages": 0}


def format_cell(v):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        # Importes con coma decimal para que el parser español los lea igual que en un PDF.
        return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return str(v).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("kind", choices=["pdf", "image", "sheet"])
    ap.add_argument("--tesseract", required=True)
    ap.add_argument("--tessdata", required=True)
    ap.add_argument("--max-pages", type=int, default=40)
    ap.add_argument("--max-ocr-pages", type=int, default=6)
    ap.add_argument("--max-chars", type=int, default=200_000)
    args = ap.parse_args()
    try:
        result = {"pdf": from_pdf, "image": from_image, "sheet": from_sheet}[args.kind](args.path, args)
    except subprocess.TimeoutExpired:
        result = {"error": "ocr_timeout"}
    except Exception as exc:  # documento corrupto o ilegible: se informa, no se propaga el contenido
        result = {"error": "unreadable", "detail": type(exc).__name__}
    if "text" in result:
        result["truncated"] = len(result["text"]) > args.max_chars
        result["text"] = result["text"][: args.max_chars]
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdout.write(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()

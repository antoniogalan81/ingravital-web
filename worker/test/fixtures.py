"""worker/test/fixtures.py — Genera documentos de prueba SINTÉTICOS (sin datos reales).

  python fixtures.py <directorio>

PDF digital, PDF escaneado (solo imagen), PNG, PDF ilegible, escritura, préstamo, xlsx y un
"PDF" que en realidad es un ZIP (MIME falsificado).
"""

import random
import sys
import zipfile
from pathlib import Path

import openpyxl
import pymupdf


def cif(prefix, digits):
    even = sum(int(digits[i]) for i in (1, 3, 5))
    odd = 0
    for i in (0, 2, 4, 6):
        x = int(digits[i]) * 2
        odd += x // 10 + x % 10
    control = (10 - (even + odd) % 10) % 10
    return f"{prefix}{digits}{control}"


SUPPLIER_CIF = cif("B", "9123456")
CUSTOMER_CIF = cif("B", "4176543")
ARCH_NIF = "12345678Z"

INVOICE = f"""FONTANERIA HERMANOS RUIZ S.L.
CIF: {SUPPLIER_CIF}
Calle Feria 12, 41003 Sevilla

FACTURA
Nº factura: F-2026-141
Fecha de factura: 12/09/2026

Cliente: Promociones Ejemplo S.L.
CIF: {CUSTOMER_CIF}

Concepto: Instalación de fontanería viviendas 1 a 3
Descripción                  Cantidad   Precio     Importe
Tubería multicapa            120        25,00      3.000,00
Grifería cocina y baños      12         300,00     3.600,00
Mano de obra                 1          1.600,00   1.600,00

Base imponible              8.200,00 €
IVA 21%                     1.722,00 €
Total factura               9.922,00 €

Forma de pago: transferencia bancaria
"""

INVOICE_SCAN = f"""ELECTRICIDAD SUR S.L.
CIF: {SUPPLIER_CIF}

FACTURA
Nº factura: 2026-0077
Fecha de factura: 03/08/2026

Concepto: Cuadro electrico y cableado
Base imponible 2.500,00
IVA 21% 525,00
Total factura 3.025,00
"""

ARCHITECT = f"""IGNACIO EJEMPLO ARQUITECTO
NIF: {ARCH_NIF}

MINUTA DE HONORARIOS
Factura nº 14-2026
Fecha: 12 de junio de 2026

Concepto: Honorarios proyecto básico y de ejecución
Base imponible 2.500,00
IVA 21% 525,00
Retención IRPF 15% -375,00
Total a pagar 2.650,00
"""

SALE = """ESCRITURA DE COMPRAVENTA

En Sevilla, a 1 de septiembre de 2026.

De una parte, PROMOCIONES EJEMPLO S.L., que vende y transmite.
PARTE COMPRADORA: Doña Laura Pérez Gómez, mayor de edad, con DNI 00000000T.

Objeto: la finca descrita como Vivienda 1 del edificio.
El precio de la compraventa es de 185.000,00 euros, más el IVA correspondiente.
"""

LOAN = """PRÉSTAMO HIPOTECARIO

Entidad prestamista: CaixaBank, S.A.
Fecha de firma: 15/03/2026

Importe del préstamo: 250.000,00 €
Tipo de interés nominal anual (TIN): 3,25 %
Plazo: 300 meses
Cuota mensual: 1.218,31 €
Comisión de apertura: 1.250,00 €
Fecha de vencimiento: 15/03/2051
"""


def text_pdf(path, text):
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 60), text, fontsize=10, fontname="helv")
    doc.save(path)


def scanned_pdf(path, text, dpi=200):
    src = pymupdf.open()
    page = src.new_page()
    page.insert_text((50, 60), text, fontsize=12, fontname="helv")
    pix = page.get_pixmap(dpi=dpi)
    out = pymupdf.open()
    p = out.new_page(width=page.rect.width, height=page.rect.height)
    p.insert_image(p.rect, stream=pix.tobytes("png"))
    out.save(path)
    return pix


def main(target):
    d = Path(target)
    d.mkdir(parents=True, exist_ok=True)
    text_pdf(d / "invoice_digital.pdf", INVOICE)
    # Misma factura corregida por el proveedor (otro importe): "documento modificado".
    text_pdf(d / "invoice_digital_v2.pdf", INVOICE.replace("8.200,00", "8.500,00").replace("1.722,00", "1.785,00").replace("9.922,00", "10.285,00"))
    scanned_pdf(d / "invoice_scanned.pdf", INVOICE_SCAN)
    pix = scanned_pdf(d / "_tmp.pdf", ARCHITECT)
    pix.save(str(d / "invoice_image.png"))
    (d / "_tmp.pdf").unlink()

    noise = pymupdf.open()
    page = noise.new_page()
    rng = random.Random(7)
    for _ in range(400):
        x, y = rng.uniform(0, 595), rng.uniform(0, 842)
        page.draw_rect(pymupdf.Rect(x, y, x + rng.uniform(1, 6), y + rng.uniform(1, 6)), color=(0, 0, 0), fill=(0, 0, 0))
    pix = page.get_pixmap(dpi=100)
    out = pymupdf.open()
    p = out.new_page()
    p.insert_image(p.rect, stream=pix.tobytes("png"))
    out.save(d / "illegible.pdf")

    text_pdf(d / "sale_deed.pdf", SALE)
    text_pdf(d / "loan.pdf", LOAN)

    wb = openpyxl.Workbook()
    ws = wb.active
    for row in [["CONSTRUCCIONES EJEMPLO S.L.", ""], ["CIF", SUPPLIER_CIF], ["Factura nº", "F-88"], ["Fecha", "20/07/2026"], ["Concepto", "Obra a cuenta"], ["Base imponible", 10000.0], ["IVA 21%", 2100.0], ["Total factura", 12100.0]]:
        ws.append(row)
    wb.save(d / "invoice.xlsx")

    with zipfile.ZipFile(d / "fake.pdf", "w") as z:
        z.writestr("a.txt", "no soy un pdf")

    # Bombas de descompresión: la cabecera declara mucho más de lo que ocupa el archivo.
    import struct
    import zlib
    ihdr = struct.pack(">IIBBBBB", 20000, 20000, 8, 2, 0, 0, 0)
    chunk = lambda t, data: struct.pack(">I", len(data)) + t + data + struct.pack(">I", zlib.crc32(t + data))
    (d / "bomb.png").write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"\0" * 1024)) + chunk(b"IEND", b""))
    with zipfile.ZipFile(d / "bomb.xlsx", "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("xl/sharedStrings.xml", b"<" + b"a" * (20 * 1024 * 1024))
    huge = pymupdf.open()
    huge.new_page(width=14000, height=14000)
    huge.save(d / "huge_page.pdf")

    print(SUPPLIER_CIF, CUSTOMER_CIF)


if __name__ == "__main__":
    main(sys.argv[1])

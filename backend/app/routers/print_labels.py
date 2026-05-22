from typing import List, Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .settings import get_setting

router = APIRouter(prefix="/api/print", tags=["print"])

MM_PER_INCH = 25.4

LABEL_SIZES: List[Tuple[int, int]] = [
    (40, 25), (40, 30), (50, 30), (50, 40), (62, 29), (57, 32)
]


def _px(mm: float, dpi: int) -> int:
    return round(mm / MM_PER_INCH * dpi)


def _wrap_text(text: str, font, max_px: int, draw, max_lines: int = 3) -> List[str]:
    words = text.split()
    lines: List[str] = []
    current = ''
    for word in words:
        test = (current + ' ' + word).strip()
        w = draw.textlength(test, font=font)
        if w > max_px and current:
            lines.append(current)
            current = word
            if len(lines) >= max_lines:
                break
        else:
            current = test
    if current and len(lines) < max_lines:
        lines.append(current)
    return lines


def _load_font(size_mm: float, dpi: int, bold: bool = False):
    from PIL import ImageFont
    size_px = max(8, _px(size_mm, dpi))
    candidates = (
        [r'C:\Windows\Fonts\arialbd.ttf', r'C:\Windows\Fonts\Arial Bold.ttf']
        if bold else
        [r'C:\Windows\Fonts\arial.ttf', r'C:\Windows\Fonts\Arial.ttf']
    )
    for path in candidates:
        try:
            return ImageFont.truetype(path, size_px)
        except Exception:
            pass
    return ImageFont.load_default(size_px)


def _make_label_image(spool_id: int, name: str, material: str, vendor: str,
                      w_mm: int, h_mm: int, dpi: int):
    import qrcode as qrlib
    from PIL import Image, ImageDraw

    w_px = _px(w_mm, dpi)
    h_px = _px(h_mm, dpi)
    img = Image.new('RGB', (w_px, h_px), 'white')
    draw = ImageDraw.Draw(img)

    pad = _px(2.0, dpi)
    gap = _px(2.0, dpi)
    lh  = _px(0.4, dpi)

    qr_mm = min(h_mm - 4, (w_mm - 5) / 2)
    qr_px = _px(qr_mm, dpi)

    # QR code
    qr = qrlib.QRCode(version=None, error_correction=qrlib.constants.ERROR_CORRECT_M, box_size=1, border=0)
    qr.add_data(str(spool_id))
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color='black', back_color='white').convert('RGB')
    qr_img = qr_img.resize((qr_px, qr_px), Image.NEAREST)
    img.paste(qr_img, (pad, pad))

    tx = pad + qr_px + gap
    tw = w_px - tx - pad

    id_fnt   = _load_font(h_mm * 0.18, dpi, bold=True)
    name_fnt = _load_font(h_mm * 0.08, dpi, bold=True)
    sub_fnt  = _load_font(h_mm * 0.08, dpi, bold=False)

    # ID
    id_str = f'#{spool_id}'
    draw.text((tx, pad), id_str, fill=(0, 0, 0), font=id_fnt)
    _, _, _, id_b = draw.textbbox((tx, pad), id_str, font=id_fnt)
    y = id_b + lh

    # Name (word-wrapped)
    for line in _wrap_text(name, name_fnt, tw, draw, 3):
        draw.text((tx, y), line, fill=(0, 0, 0), font=name_fnt)
        _, _, _, b = draw.textbbox((tx, y), line, font=name_fnt)
        y = b + lh

    # Sub-line (material · vendor)
    sub = ' · '.join(filter(None, [material, vendor]))
    if sub:
        draw.text((tx, y + lh), sub, fill=(100, 100, 100), font=sub_fnt)

    return img


def _send_to_printer(img, printer_name: str) -> None:
    import win32ui
    import win32con
    from PIL import ImageWin

    hdc = win32ui.CreateDC()
    hdc.CreatePrinterDC(printer_name)
    pw = hdc.GetDeviceCaps(win32con.HORZRES)
    ph = hdc.GetDeviceCaps(win32con.VERTRES)
    hdc.StartDoc('Spool Label')
    hdc.StartPage()
    ImageWin.Dib(img.convert('RGB')).draw(hdc.GetHandleOutput(), (0, 0, pw, ph))
    hdc.EndPage()
    hdc.EndDoc()
    hdc.DeleteDC()


def _get_printer_dpi(printer_name: str) -> int:
    try:
        import win32ui
        import win32con
        hdc = win32ui.CreateDC()
        hdc.CreatePrinterDC(printer_name)
        dpi = hdc.GetDeviceCaps(win32con.LOGPIXELSX)
        hdc.DeleteDC()
        return dpi
    except Exception:
        return 203  # safe default for most label printers


@router.get("/printers")
def list_printers():
    try:
        import win32print
        flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        names = [p[2] for p in win32print.EnumPrinters(flags)]
        return {"printers": names}
    except ImportError:
        return {"printers": [], "error": "pywin32 not available"}
    except Exception as e:
        return {"printers": [], "error": str(e)}


@router.post("/spool/{spool_id}")
async def print_spool_label(spool_id: int, size: int = 0, qty: int = 1, db: Session = Depends(get_db)):
    printer_name = get_setting(db, "label_printer_name")
    if not printer_name:
        raise HTTPException(status_code=400, detail="No label printer configured")

    size = max(0, min(size, len(LABEL_SIZES) - 1))
    qty = max(1, min(qty, 2))
    w_mm, h_mm = LABEL_SIZES[size]

    spoolman_url = get_setting(db, "spoolman_url")
    if not spoolman_url:
        raise HTTPException(status_code=503, detail="Spoolman not configured")

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{spoolman_url.rstrip('/')}/api/v1/spool/{spool_id}")
            resp.raise_for_status()
            spool = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Spoolman error: {e}")

    filament = spool.get('filament', {})
    name     = filament.get('name') or f'Spool #{spool_id}'
    material = filament.get('material', '')
    vendor   = (filament.get('vendor') or {}).get('name', '')

    dpi = _get_printer_dpi(printer_name)
    img = _make_label_image(spool_id, name, material, vendor, w_mm, h_mm, dpi)

    try:
        for _ in range(qty):
            _send_to_printer(img, printer_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Print error: {e}")

    return {"ok": True}


@router.post("/test")
def print_test_label(printer: str, qty: int = 1):
    qty = max(1, min(qty, 2))
    dpi = _get_printer_dpi(printer)
    img = _make_label_image(0, 'Test Label', 'PLA', '3DMRP', 40, 25, dpi)
    try:
        for _ in range(qty):
            _send_to_printer(img, printer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}

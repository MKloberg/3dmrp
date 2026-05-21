from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import httpx

from ..database import get_db
from ..models import PrinterType, Printer
from ..schemas import PrinterTypeCreate, PrinterTypeOut, PrinterTypeUpdate, PrinterCapabilityProbeResult

router = APIRouter(prefix="/api/printer-types", tags=["printer_types"])


@router.get("", response_model=List[PrinterTypeOut])
def list_printer_types(db: Session = Depends(get_db)):
    return db.query(PrinterType).order_by(PrinterType.name).all()


@router.post("", response_model=PrinterTypeOut, status_code=201)
def create_printer_type(data: PrinterTypeCreate, db: Session = Depends(get_db)):
    pt = PrinterType(**data.model_dump())
    db.add(pt)
    db.commit()
    db.refresh(pt)
    return pt


@router.patch("/{pt_id}", response_model=PrinterTypeOut)
def update_printer_type(pt_id: int, data: PrinterTypeUpdate, db: Session = Depends(get_db)):
    pt = db.query(PrinterType).filter(PrinterType.id == pt_id).first()
    if not pt:
        raise HTTPException(status_code=404, detail="Printer type not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(pt, field, value)
    db.commit()
    db.refresh(pt)
    return pt


@router.delete("/{pt_id}", status_code=204)
def delete_printer_type(pt_id: int, db: Session = Depends(get_db)):
    pt = db.query(PrinterType).filter(PrinterType.id == pt_id).first()
    if not pt:
        raise HTTPException(status_code=404, detail="Printer type not found")
    db.delete(pt)
    db.commit()


@router.post("/{pt_id}/probe", response_model=PrinterCapabilityProbeResult)
async def probe_printer_type(
    pt_id: int,
    printer_id: Optional[int] = None,
    probe_url: Optional[str] = None,
    db: Session = Depends(get_db),
):
    pt = db.query(PrinterType).filter(PrinterType.id == pt_id).first()
    if not pt:
        raise HTTPException(status_code=404, detail="Printer type not found")

    if probe_url:
        raw = probe_url.strip()
        if not raw.startswith("http"):
            raw = f"http://{raw}"
        url = raw.rstrip("/")
    elif printer_id is not None:
        printer = db.query(Printer).filter(Printer.id == printer_id).first()
        if not printer:
            raise HTTPException(status_code=404, detail="Printer not found")
        if printer.printer_type_id != pt_id:
            raise HTTPException(status_code=400, detail="Printer does not belong to this printer type")
        url = printer.url.rstrip("/")
    else:
        raise HTTPException(status_code=400, detail="Provide either printer_id or probe_url")
    result = PrinterCapabilityProbeResult(
        has_afc=False,
        has_nfc_detect=False,
        has_mainsail_spoolman=False,
    )

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            # Fetch all registered printer objects once — used for both AFC and NFC checks
            all_objects: list[str] = []
            try:
                list_resp = await client.get(f"{url}/printer/objects/list")
                if list_resp.status_code == 200:
                    all_objects = list_resp.json().get("result", {}).get("objects", [])
            except Exception:
                pass

            # Check AFC — search case-insensitively (some firmware: "afc", Snapmaker: "AFC").
            # Query using the exact cased name; a lowercase query against "AFC" returns {}
            # (empty) and would be a false negative. Moonraker also returns null for unknown
            # objects, so the data must be a non-empty dict to count.
            try:
                afc_obj = next((o for o in all_objects if o.lower() == "afc"), None)
                if afc_obj:
                    afc_resp = await client.get(f"{url}/printer/objects/query?{afc_obj}")
                    if afc_resp.status_code == 200:
                        afc_status = afc_resp.json().get("result", {}).get("status", {})
                        afc_data = afc_status.get(afc_obj)
                        if isinstance(afc_data, dict) and afc_data:
                            result.has_afc = True
            except Exception:
                pass

            # Check NFC filament detect — two detection paths:
            # 1. Any object with "nfc" in the name (standard AFC NFC setups).
            # 2. `filament_detect` returns rich NFC spool data (Snapmaker-style: info list
            #    with MAIN_TYPE, VENDOR, etc.). A basic Klipper runout sensor returns {} or
            #    just enabled/filament_detected — no info list.
            try:
                if any("nfc" in o.lower() for o in all_objects):
                    result.has_nfc_detect = True
                elif "filament_detect" in all_objects:
                    fd_resp = await client.get(f"{url}/printer/objects/query?filament_detect")
                    if fd_resp.status_code == 200:
                        fd_status = fd_resp.json().get("result", {}).get("status", {})
                        fd_data = fd_status.get("filament_detect", {})
                        if isinstance(fd_data, dict) and isinstance(fd_data.get("info"), list) and fd_data["info"]:
                            first = fd_data["info"][0]
                            if isinstance(first, dict) and "MAIN_TYPE" in first:
                                result.has_nfc_detect = True
            except Exception:
                pass

            # Check Mainsail Spoolman
            try:
                info_resp = await client.get(f"{url}/server/info")
                if info_resp.status_code == 200:
                    components = info_resp.json().get("result", {}).get("components", [])
                    if "spoolman" in components:
                        result.has_mainsail_spoolman = True
            except Exception:
                pass

    except Exception:
        pass

    return result

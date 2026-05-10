import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response, FileResponse
from sqlalchemy.orm import Session
from typing import List
import httpx

from ..database import get_db
from ..models import Printer, PrinterSlot
from ..schemas import PrinterCreate, PrinterOut, PrinterHistoryResponse, MoonrakerJob, PrinterSlotOut, PrinterSlotSet, PrinterSlicerConfig

router = APIRouter(prefix="/api/printers", tags=["printers"])

_DATA_DIR = os.environ.get("DATA_DIR", "/app/data")
IMAGE_DIR = os.path.join(_DATA_DIR, "images", "printers")


def _best_thumbnail_path(filename: str, metadata: dict) -> str | None:
    thumbnails = metadata.get("thumbnails", [])
    if not thumbnails:
        return None
    best = max(thumbnails, key=lambda t: t.get("width", 0) * t.get("height", 0))
    relative_path = best.get("relative_path", "")
    if not relative_path:
        return None
    gcode_dir = os.path.dirname(filename)
    if gcode_dir:
        return f"gcodes/{gcode_dir}/{relative_path}"
    return f"gcodes/{relative_path}"


@router.get("", response_model=List[PrinterOut])
def list_printers(db: Session = Depends(get_db)):
    return db.query(Printer).order_by(Printer.name).all()


@router.post("", response_model=PrinterOut, status_code=201)
def create_printer(data: PrinterCreate, db: Session = Depends(get_db)):
    printer = Printer(**data.model_dump())
    db.add(printer)
    db.commit()
    db.refresh(printer)
    return printer


@router.delete("/{printer_id}", status_code=204)
def delete_printer(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    if printer.image_path and os.path.exists(printer.image_path):
        os.remove(printer.image_path)
    db.delete(printer)
    db.commit()


@router.post("/{printer_id}/image", status_code=204)
async def upload_printer_image(printer_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    os.makedirs(IMAGE_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    image_path = os.path.join(IMAGE_DIR, f"{printer_id}{ext}")

    if printer.image_path and printer.image_path != image_path and os.path.exists(printer.image_path):
        os.remove(printer.image_path)

    with open(image_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    printer.image_path = image_path
    db.commit()


@router.get("/{printer_id}/image")
def get_printer_image(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer or not printer.image_path or not os.path.exists(printer.image_path):
        raise HTTPException(status_code=404, detail="No image")
    return FileResponse(printer.image_path)


@router.put("/{printer_id}/slicer", response_model=PrinterOut)
def set_printer_slicer(printer_id: int, data: PrinterSlicerConfig, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    printer.slicer_name = data.slicer_name or None
    printer.slicer_executable = data.slicer_executable or None
    db.commit()
    db.refresh(printer)
    return printer


@router.get("/{printer_id}/slots", response_model=List[PrinterSlotOut])
def list_slots(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    return printer.slots


@router.put("/{printer_id}/slots/{slot_number}", response_model=PrinterSlotOut)
def set_slot(printer_id: int, slot_number: int, data: PrinterSlotSet, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    slot = db.query(PrinterSlot).filter(
        PrinterSlot.printer_id == printer_id,
        PrinterSlot.slot_number == slot_number,
    ).first()
    if slot:
        slot.filament_spec_id = data.filament_spec_id
    else:
        slot = PrinterSlot(printer_id=printer_id, slot_number=slot_number, filament_spec_id=data.filament_spec_id)
        db.add(slot)
    db.commit()
    db.refresh(slot)
    return slot


@router.delete("/{printer_id}/slots/{slot_number}", status_code=204)
def delete_slot(printer_id: int, slot_number: int, db: Session = Depends(get_db)):
    slot = db.query(PrinterSlot).filter(
        PrinterSlot.printer_id == printer_id,
        PrinterSlot.slot_number == slot_number,
    ).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    db.delete(slot)
    db.commit()


@router.get("/{printer_id}/history", response_model=PrinterHistoryResponse)
async def get_printer_history(printer_id: int, limit: int = 50, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    url = printer.url.rstrip("/")
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{url}/server/history/list", params={"limit": limit})
            resp.raise_for_status()
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Could not connect to printer: {exc}")
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=502, detail=f"Printer returned error: {exc.response.status_code}")

    result = resp.json().get("result", {})
    jobs = [
        MoonrakerJob(
            job_id=j["job_id"],
            filename=j.get("filename", ""),
            status=j.get("status", ""),
            start_time=j.get("start_time"),
            end_time=j.get("end_time"),
            print_duration=j.get("print_duration"),
            filament_used=j.get("filament_used"),
            thumbnail_path=_best_thumbnail_path(j.get("filename", ""), j.get("metadata", {})),
        )
        for j in result.get("jobs", [])
    ]

    return PrinterHistoryResponse(count=result.get("count", len(jobs)), jobs=jobs)


@router.get("/{printer_id}/thumbnail")
async def get_thumbnail(printer_id: int, path: str, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    url = printer.url.rstrip("/")
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{url}/server/files/{path}")
            resp.raise_for_status()
        except (httpx.RequestError, httpx.HTTPStatusError):
            raise HTTPException(status_code=404, detail="Thumbnail not found")

    content_type = resp.headers.get("content-type", "image/png")
    return Response(content=resp.content, media_type=content_type)

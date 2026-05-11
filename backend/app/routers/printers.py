import os
import math
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response, FileResponse
from sqlalchemy.orm import Session
from typing import List
import httpx

from ..database import get_db
from ..models import Printer, PrinterSlot, FilamentSpec
from ..schemas import PrinterCreate, PrinterUpdate, PrinterOut, PrinterHistoryResponse, MoonrakerJob, PrinterSlotOut, PrinterSlotSet, PrinterSlicerConfig, PrinterStatus, WebcamInfo, FilamentDetectSlot
from pydantic import BaseModel
from typing import Optional

class PrinterTypeAssign(BaseModel):
    printer_type_id: Optional[int] = None
    slot_count_override: Optional[int] = None


class SendGcodeRequest(BaseModel):
    file_path: str
    start_print: bool = False

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


@router.patch("/{printer_id}", response_model=PrinterOut)
def update_printer(printer_id: int, data: PrinterUpdate, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    if data.name is not None:
        printer.name = data.name
    if data.url is not None:
        printer.url = data.url
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


@router.patch("/{printer_id}/type", response_model=PrinterOut)
def set_printer_type(printer_id: int, data: PrinterTypeAssign, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    printer.printer_type_id = data.printer_type_id
    printer.slot_count_override = data.slot_count_override
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


@router.get("/{printer_id}/webcams", response_model=List[WebcamInfo])
async def get_webcams(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    base = printer.url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{base}/server/webcams/list")
            resp.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError):
        return []

    def resolve(url: str) -> str:
        return url if url.startswith("http") else f"{base}{url}"

    result = []
    for cam in resp.json().get("result", {}).get("webcams", []):
        if not cam.get("enabled", True):
            continue
        stream_url = resolve(cam.get("stream_url", ""))
        snapshot_url = resolve(cam.get("snapshot_url", ""))
        if not snapshot_url:
            continue
        result.append(WebcamInfo(
            name=cam.get("name", "Camera"),
            stream_url=stream_url,
            snapshot_url=snapshot_url,
            flip_horizontal=cam.get("flip_horizontal", False),
            flip_vertical=cam.get("flip_vertical", False),
            rotation=cam.get("rotation", 0),
        ))
    return result


@router.get("/{printer_id}/status", response_model=PrinterStatus)
async def get_printer_status(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    url = printer.url.rstrip("/")
    params = "print_stats=state,filename,print_duration&display_status=progress&extruder=temperature,target&heater_bed=temperature,target"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{url}/printer/objects/query?{params}")
            resp.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError):
        return PrinterStatus(state="offline")

    status = resp.json().get("result", {}).get("status", {})
    ps = status.get("print_stats", {})
    ds = status.get("display_status", {})
    ex = status.get("extruder", {})
    bed = status.get("heater_bed", {})

    state = ps.get("state", "standby")
    progress = ds.get("progress")
    duration = ps.get("print_duration")

    time_remaining = None
    if progress and progress > 0 and duration is not None:
        time_remaining = duration / progress - duration

    return PrinterStatus(
        state=state,
        filename=ps.get("filename") or None,
        progress=progress,
        print_duration=duration,
        time_remaining=time_remaining,
        extruder_temp=ex.get("temperature"),
        extruder_target=ex.get("target"),
        bed_temp=bed.get("temperature"),
        bed_target=bed.get("target"),
    )


def _rgb_int_to_hex(rgb: int) -> str:
    return f"#{rgb & 0xFFFFFF:06X}"


def _color_distance(hex1: str, hex2: str) -> float:
    try:
        r1, g1, b1 = int(hex1[1:3], 16), int(hex1[3:5], 16), int(hex1[5:7], 16)
        r2, g2, b2 = int(hex2[1:3], 16), int(hex2[3:5], 16), int(hex2[5:7], 16)
        return math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
    except Exception:
        return 999.0


@router.get("/{printer_id}/filament-detect", response_model=List[FilamentDetectSlot])
async def get_filament_detect(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    url = printer.url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{url}/printer/objects/query?filament_detect")
            resp.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError):
        raise HTTPException(status_code=502, detail="Could not reach printer")

    info_list = (
        resp.json()
        .get("result", {})
        .get("status", {})
        .get("filament_detect", {})
        .get("info", [])
    )

    all_specs = db.query(FilamentSpec).all()

    result = []
    for i, info in enumerate(info_list):
        material = info.get("MAIN_TYPE", "NONE")
        vendor = info.get("VENDOR", "NONE")
        sub_type = info.get("SUB_TYPE", "") or ""
        detected = material != "NONE" and vendor != "NONE"
        color_hex = _rgb_int_to_hex(info.get("RGB_1", 0xFFFFFF))

        suggested_id = None
        if detected and all_specs:
            candidates = [s for s in all_specs if s.material.upper() == material.upper()]
            if not candidates:
                candidates = all_specs
            best = min(candidates, key=lambda s: _color_distance(color_hex, s.color_hex or "#888888"))
            suggested_id = best.id

        result.append(FilamentDetectSlot(
            slot_index=i,
            detected=detected,
            vendor=vendor,
            material=material,
            sub_type=sub_type,
            color_hex=color_hex,
            suggested_filament_spec_id=suggested_id,
        ))

    return result


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


@router.post("/{printer_id}/send-gcode")
async def send_gcode(printer_id: int, data: SendGcodeRequest, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    if not os.path.exists(data.file_path):
        raise HTTPException(status_code=404, detail="G-Code file not found on host")

    filename = os.path.basename(data.file_path)
    url = printer.url.rstrip("/")

    with open(data.file_path, "rb") as f:
        file_content = f.read()

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(
                f"{url}/server/files/upload",
                files={"file": (filename, file_content, "application/octet-stream")},
                data={"root": "gcodes"},
            )
            resp.raise_for_status()
        except (httpx.RequestError, httpx.HTTPStatusError) as exc:
            raise HTTPException(status_code=502, detail=f"Could not upload to printer: {exc}")

    if data.start_print:
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                await client.post(f"{url}/printer/print/start", json={"filename": filename})
            except Exception:
                pass

    return {"ok": True, "filename": filename}


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

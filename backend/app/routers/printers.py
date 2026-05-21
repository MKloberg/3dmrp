import os
import math
import shutil
import asyncio
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response, FileResponse
from sqlalchemy.orm import Session
from typing import List
import httpx

from ..database import get_db
from ..models import Printer, PrinterSlot, FilamentSpec
from ..schemas import PrinterCreate, PrinterUpdate, PrinterOut, PrinterHistoryResponse, MoonrakerJob, PrinterSlotOut, PrinterSlotSet, PrinterSlicerConfig, PrinterStatus, WebcamInfo, FilamentDetectSlot, PrinterCapabilityMismatch
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


@router.get("/by-name/{name}", response_model=PrinterOut)
def get_printer_by_name(name: str, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.name == name).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    return printer


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
    params = "print_stats=state,filename,print_duration&display_status=progress&extruder=temperature,target&heater_bed=temperature,target&toolhead=extruder"
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
    th = status.get("toolhead", {})

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
        active_extruder=th.get("extruder") or None,
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
    slot_count = printer.slot_count_override or (
        printer.printer_type.slot_count if printer.printer_type else 4
    )

    sensor_qs = "&".join(
        f"filament_motion_sensor e{i}_filament" for i in range(slot_count)
    )
    query_url = f"{url}/printer/objects/query?filament_detect&{sensor_qs}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(query_url)
            resp.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError):
        raise HTTPException(status_code=502, detail="Could not reach printer")

    status = resp.json().get("result", {}).get("status", {})
    info_list = status.get("filament_detect", {}).get("info", [])

    all_specs = db.query(FilamentSpec).all()

    result = []
    for i, info in enumerate(info_list):
        material = info.get("MAIN_TYPE", "NONE")
        vendor = info.get("VENDOR", "NONE")
        sub_type = info.get("SUB_TYPE", "") or ""
        detected = material != "NONE" and vendor != "NONE"
        color_hex = _rgb_int_to_hex(info.get("RGB_1", 0xFFFFFF))

        sensor = status.get(f"filament_motion_sensor e{i}_filament")
        filament_present = sensor.get("filament_detected") if sensor else None

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
            filament_present=filament_present,
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


@router.get("/{printer_id}/mainsail-spoolman")
async def get_mainsail_spoolman(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    url = printer.url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            # Spoolman integration is enabled via [spoolman] in moonraker.conf —
            # it shows up as a component in /server/info when active.
            info_resp = await client.get(f"{url}/server/info")
            info_resp.raise_for_status()
            components = info_resp.json().get("result", {}).get("components", [])
            if "spoolman" not in components:
                return {"configured": False, "server_url": None}

            # Fetch the actual Spoolman server URL from the spoolman status
            try:
                sm_resp = await client.get(f"{url}/server/spoolman/status")
                sm_resp.raise_for_status()
                server_url = sm_resp.json().get("result", {}).get("spoolman_url")
            except Exception:
                server_url = None

            return {"configured": True, "server_url": server_url}
    except (httpx.RequestError, httpx.HTTPStatusError):
        return {"configured": None, "server_url": None}


@router.get("/{printer_id}/capabilities-check")
async def check_printer_capabilities(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    pt = printer.printer_type
    if not pt:
        return []

    url = printer.url.rstrip("/")
    actual = {"has_afc": False, "has_nfc_detect": False, "has_mainsail_spoolman": False}

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            # Fetch registered objects once — used for AFC and NFC detection
            all_objects: list = []
            try:
                list_resp = await client.get(f"{url}/printer/objects/list")
                if list_resp.status_code == 200:
                    all_objects = list_resp.json().get("result", {}).get("objects", [])
            except Exception:
                pass

            # AFC — case-insensitive name match, exact-cased query, non-empty dict response
            try:
                afc_obj = next((o for o in all_objects if o.lower() == "afc"), None)
                if afc_obj:
                    afc_resp = await client.get(f"{url}/printer/objects/query?{afc_obj}")
                    if afc_resp.status_code == 200:
                        afc_status = afc_resp.json().get("result", {}).get("status", {})
                        afc_data = afc_status.get(afc_obj)
                        if isinstance(afc_data, dict) and afc_data:
                            actual["has_afc"] = True
            except Exception:
                pass

            # NFC — "nfc" in any object name, OR filament_detect with rich spool data (info[].MAIN_TYPE)
            try:
                if any("nfc" in o.lower() for o in all_objects):
                    actual["has_nfc_detect"] = True
                elif "filament_detect" in all_objects:
                    fd_resp = await client.get(f"{url}/printer/objects/query?filament_detect")
                    if fd_resp.status_code == 200:
                        fd_status = fd_resp.json().get("result", {}).get("status", {})
                        fd_data = fd_status.get("filament_detect", {})
                        if isinstance(fd_data, dict) and isinstance(fd_data.get("info"), list) and fd_data["info"]:
                            first = fd_data["info"][0]
                            if isinstance(first, dict) and "MAIN_TYPE" in first:
                                actual["has_nfc_detect"] = True
            except Exception:
                pass

            # Mainsail Spoolman — spoolman component in Moonraker server/info
            try:
                info_resp = await client.get(f"{url}/server/info")
                if info_resp.status_code == 200:
                    components = info_resp.json().get("result", {}).get("components", [])
                    actual["has_mainsail_spoolman"] = "spoolman" in components
            except Exception:
                pass
    except Exception:
        pass

    messages = {
        "has_afc": (
            "AFC not detected — expected for this printer type. "
            "Verify the AFC Lite firmware mod is installed and Moonraker is reachable."
        ),
        "has_nfc_detect": (
            "NFC filament detection not available — expected for this printer type. "
            "Verify the NFC-capable firmware is installed and the filament detect module is active."
        ),
        "has_mainsail_spoolman": (
            "Spoolman not enabled in Mainsail — expected for this printer type. "
            "Enable the Spoolman integration in Moonraker settings on this printer."
        ),
    }

    mismatches = []
    for cap in ("has_afc", "has_nfc_detect", "has_mainsail_spoolman"):
        expected = getattr(pt, cap)
        if expected and not actual[cap]:
            mismatches.append(PrinterCapabilityMismatch(
                capability=cap,
                expected=True,
                actual=False,
                message=messages[cap],
            ))

    return mismatches


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


class AfcCommandRequest(BaseModel):
    gcode: str


class ScreencastTouchRequest(BaseModel):
    a: str
    x: int
    y: int


class SpoolmanSlotsSetRequest(BaseModel):
    slots: list[dict]


@router.get("/{printer_id}/screencast/available")
async def screencast_available(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    url = printer.url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            resp = await client.get(f"{url}/screen/snapshot")
            return {"available": resp.status_code == 200 and "image" in resp.headers.get("content-type", "")}
    except Exception:
        return {"available": False}


@router.get("/{printer_id}/screencast/snapshot")
async def screencast_snapshot(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    url = printer.url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{url}/screen/snapshot")
            resp.raise_for_status()
    except Exception:
        raise HTTPException(status_code=502, detail="Screencast unavailable")
    return Response(content=resp.content, media_type="image/png")


@router.post("/{printer_id}/screencast/touch")
async def screencast_touch(printer_id: int, data: ScreencastTouchRequest, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    url = printer.url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            await client.post(
                f"{url}/screen/touch",
                params={"a": data.a, "x": data.x, "y": data.y},
            )
    except Exception:
        pass  # fire-and-forget; touch latency matters more than error reporting
    return {"ok": True}


@router.post("/{printer_id}/afc-command")
async def send_afc_command(printer_id: int, data: AfcCommandRequest, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    url = printer.url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(f"{url}/printer/gcode/script", json={"script": data.gcode})
            resp.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        raise HTTPException(status_code=502, detail=f"Could not send command: {exc}")
    return {"ok": True}


@router.get("/{printer_id}/spoolman-slots")
async def get_spoolman_slots(printer_id: int, count: int = 1, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    url = printer.url.rstrip("/")
    results = []
    async with httpx.AsyncClient(timeout=5.0) as client:
        for i in range(count):
            try:
                resp = await client.get(f"{url}/server/spoolman/spool_id", params={"tool": i})
                resp.raise_for_status()
                spool_id = resp.json().get("result", {}).get("spool_id")
                results.append({"tool_index": i, "spool_id": spool_id})
            except Exception:
                results.append({"tool_index": i, "spool_id": None})

    # Moonraker returns the global active spool as a fallback when per-tool tracking
    # isn't set up. If tools 1..N all return the same spool_id as tool 0, they're
    # hitting the global fallback — not a real per-tool assignment.
    if len(results) > 1 and results[0]["spool_id"] is not None:
        base_id = results[0]["spool_id"]
        for r in results[1:]:
            if r["spool_id"] == base_id:
                r["spool_id"] = None

    return results


@router.get("/{printer_id}/afc-lanes")
async def get_afc_lanes(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    url = printer.url.rstrip("/")
    lanes = []
    try:
        query = "AFC_lane%20E0&AFC_lane%20E1&AFC_lane%20E2&AFC_lane%20E3"
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{url}/printer/objects/query?{query}")
            resp.raise_for_status()
            status = resp.json().get("result", {}).get("status", {})
            for i in range(4):
                key = f"AFC_lane E{i}"
                if key not in status:
                    continue
                lane = status[key]
                material = lane.get("material", "") or ""
                spool_id = int(lane.get("spool_id", 0))
                # Skip lanes with no spool data — AFC configured but nothing loaded
                if not material and spool_id == 0:
                    continue
                lanes.append({
                    "name": lane.get("name", f"E{i}"),
                    "map": lane.get("map", f"T{i}"),
                    "extruder": lane.get("extruder", ""),
                    "color": lane.get("color", "#888888"),
                    "material": material,
                    "weight": float(lane.get("weight", 0)),
                    "status": lane.get("status", "unknown"),
                    "tool_loaded": bool(lane.get("tool_loaded", False)),
                    "loaded_to_hub": bool(lane.get("loaded_to_hub", False)),
                    "spool_id": spool_id,
                })
    except Exception:
        pass

    return {"lanes": lanes}


@router.get("/{printer_id}/stats")
async def get_printer_stats(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    url = printer.url.rstrip("/")
    extruder_names = ["extruder", "extruder1", "extruder2", "extruder3"]

    async with httpx.AsyncClient(timeout=10.0) as client:
        totals_resp, history_resp, extruder_resp = await asyncio.gather(
            client.get(f"{url}/server/history/totals"),
            client.get(f"{url}/server/history/list", params={"limit": 2000}),
            client.get(f"{url}/printer/objects/query?{'&'.join(extruder_names)}"),
            return_exceptions=True,
        )

    # History totals
    history_totals = None
    if not isinstance(totals_resp, Exception) and totals_resp.status_code == 200:
        t = totals_resp.json().get("result", {}).get("job_totals", {})
        history_totals = {
            "total_jobs": int(t.get("total_jobs", 0)),
            "total_print_time": float(t.get("total_print_time", 0.0)),
            "total_filament_used": float(t.get("total_filament_used", 0.0)),
            "longest_print": float(t.get("longest_print", 0.0)),
        }

    # Job outcome counts from history list
    job_counts = None
    if not isinstance(history_resp, Exception) and history_resp.status_code == 200:
        jobs = history_resp.json().get("result", {}).get("jobs", [])
        counts: dict[str, int] = {"completed": 0, "cancelled": 0, "error": 0, "unexpected": 0}
        unexpected_statuses = {"klippy_shutdown", "klippy_disconnect", "server_exit"}
        for j in jobs:
            s = j.get("status", "")
            if s == "completed":
                counts["completed"] += 1
            elif s == "cancelled":
                counts["cancelled"] += 1
            elif s == "error":
                counts["error"] += 1
            elif s in unexpected_statuses:
                counts["unexpected"] += 1
        job_counts = counts

    # Per-extruder stats
    extruders = []
    if not isinstance(extruder_resp, Exception) and extruder_resp.status_code == 200:
        status = extruder_resp.json().get("result", {}).get("status", {})
        for i, name in enumerate(extruder_names):
            if name in status:
                e = status[name]
                extruders.append({
                    "name": name,
                    "index": i,
                    "switch_count": e.get("switch_count", 0),
                    "error_count": e.get("error_count", 0),
                    "retry_count": e.get("retry_count", 0),
                })

    return {"history": history_totals, "job_counts": job_counts, "extruders": extruders}


@router.post("/{printer_id}/spoolman-slots")
async def set_spoolman_slots(printer_id: int, body: SpoolmanSlotsSetRequest, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    url = printer.url.rstrip("/")
    errors = []
    async with httpx.AsyncClient(timeout=5.0) as client:
        for slot in body.slots:
            try:
                payload: dict = {"spool_id": slot.get("spool_id")}
                tool_idx = slot.get("tool_index")
                if tool_idx is not None:
                    payload["tool"] = tool_idx
                resp = await client.post(f"{url}/server/spoolman/spool_id", json=payload)
                resp.raise_for_status()
            except Exception as e:
                errors.append({"tool_index": slot.get("tool_index"), "error": str(e)})
    return {"ok": True, "errors": errors}

import os
import re
import base64
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Setting, PrinterType, Item

router = APIRouter(prefix="/api/gcode", tags=["gcode"])


def _repo_root(db: Session) -> str | None:
    row = db.query(Setting).filter(Setting.key == "gcode_repo_path").first()
    return row.value.strip() if row and row.value and row.value.strip() else None


@router.get("/status")
def repo_status(db: Session = Depends(get_db)):
    root = _repo_root(db)
    if not root:
        return {"configured": False, "exists": False, "root": None}
    return {"configured": True, "exists": os.path.isdir(root), "root": root}


@router.post("/scaffold")
def scaffold_repo(db: Session = Depends(get_db)):
    root = _repo_root(db)
    if not root or not os.path.isdir(root):
        return {"created": [], "skipped": [], "error": "Repository root not found"}

    # Only printer types that have a slicer binding
    printer_types = db.query(PrinterType).filter(PrinterType.slicer_id.isnot(None)).all()
    items = db.query(Item).all()

    created = []
    skipped = []

    for pt in printer_types:
        slicer_dir = os.path.join(root, pt.slicer.name)
        pt_dir = os.path.join(slicer_dir, pt.name)

        for path, label in [
            (slicer_dir, pt.slicer.name),
            (pt_dir, f"{pt.slicer.name}/{pt.name}"),
        ]:
            if not os.path.exists(path):
                os.makedirs(path)
                created.append(label)
            else:
                skipped.append(label)

        for item in items:
            item_dir = os.path.join(pt_dir, item.name)
            label = f"{pt.slicer.name}/{pt.name}/{item.name}"
            if not os.path.exists(item_dir):
                os.makedirs(item_dir)
                created.append(label)
            else:
                skipped.append(label)

    return {"created": created, "skipped": skipped, "error": None}


@router.get("/file-metadata")
def gcode_file_metadata(
    item_name: str = Query(...),
    slicer_name: str = Query(...),
    printer_type_name: str = Query(...),
    filename: str = Query(...),
    db: Session = Depends(get_db),
):
    root = _repo_root(db)
    if not root:
        return {"filament_weights": [], "filament_slots": [], "filament_weight_total": None, "estimated_time": None, "has_exclude_objects": False, "error": "Repository not configured"}

    file_path = os.path.join(root, slicer_name, printer_type_name, item_name, filename)
    if not os.path.isfile(file_path):
        return {"filament_weights": [], "filament_slots": [], "filament_weight_total": None, "estimated_time": None, "has_exclude_objects": False, "error": "File not found"}

    filament_weights: list[float] = []
    filament_weight_total: float | None = None
    estimated_time: int | None = None
    filament_colors: list[str] = []
    filament_types: list[str] = []
    filament_brands: list[str] = []
    filament_presets: list[str] = []

    def _split_semi(value: str) -> list[str]:
        return [v.strip() for v in value.split(";") if v.strip()]

    def _parse_lines(lines: list[str]):
        nonlocal filament_weights, filament_weight_total, estimated_time
        nonlocal filament_colors, filament_types, filament_brands, filament_presets
        for line in lines:
            line = line.strip()
            if not line.startswith(";"):
                continue

            if not filament_weights:
                m = re.match(r"^;\s*filament used \[g\]\s*=\s*(.+)$", line, re.IGNORECASE)
                if m:
                    try:
                        filament_weights = [float(v.strip()) for v in m.group(1).split(",")]
                    except ValueError:
                        pass

            if filament_weight_total is None:
                m = re.match(r"^;\s*total filament used \[g\]\s*=\s*([\d.]+)", line, re.IGNORECASE)
                if m:
                    try:
                        filament_weight_total = float(m.group(1))
                    except ValueError:
                        pass

            if filament_weight_total is None:
                m = re.match(r"^;\s*total filament weight \[g\]\s*:\s*([\d.]+)", line, re.IGNORECASE)
                if m:
                    try:
                        filament_weight_total = float(m.group(1))
                    except ValueError:
                        pass

            if estimated_time is None:
                m = re.match(r"^;\s*estimated printing time.*=\s*(.+)$", line, re.IGNORECASE)
                if m:
                    t = m.group(1).strip()
                    secs = 0
                    for pattern, mult in [(r"(\d+)d", 86400), (r"(\d+)h", 3600), (r"(\d+)m(?!s)", 60), (r"(\d+)s", 1)]:
                        tm = re.search(pattern, t)
                        if tm:
                            secs += int(tm.group(1)) * mult
                    if secs > 0:
                        estimated_time = secs

            if not filament_colors:
                m = re.match(r"^;\s*filament_colou?r\s*=\s*(.+)$", line, re.IGNORECASE)
                if m:
                    filament_colors = [
                        "#" + c.lstrip("#").upper() if c else ""
                        for c in _split_semi(m.group(1))
                    ]

            if not filament_types:
                m = re.match(r"^;\s*filament_type\s*=\s*(.+)$", line, re.IGNORECASE)
                if m:
                    filament_types = _split_semi(m.group(1))

            if not filament_brands:
                m = re.match(r"^;\s*filament_vendor\s*=\s*(.+)$", line, re.IGNORECASE)
                if m:
                    filament_brands = _split_semi(m.group(1))

            if not filament_presets:
                m = re.match(r"^;\s*filament_settings_id\s*=\s*(.+)$", line, re.IGNORECASE)
                if m:
                    # Each entry is a quoted string: "Name @printer" — strip quotes and @suffix
                    raw = _split_semi(m.group(1))
                    filament_presets = [
                        re.sub(r'\s*@\S+$', '', v.strip('"').strip("'")).strip()
                        for v in raw
                    ]

    has_exclude_objects = False

    try:
        file_size = os.path.getsize(file_path)
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            # Read first 200 lines (PrusaSlicer puts metadata in header)
            head = [f.readline() for _ in range(200)]
            _parse_lines(head)

            # Check head for exclude object markers (Klipper bare command OR PrusaSlicer/Moonraker comment)
            for line in head:
                s = line.strip().upper()
                if s.startswith("EXCLUDE_OBJECT_DEFINE") or s.startswith("; PRINTING OBJECT"):
                    has_exclude_objects = True
                    break

            # Not in first 200 lines — scan up to 1800 more (objects defined right after header comments)
            if not has_exclude_objects:
                for _ in range(1800):
                    line = f.readline()
                    if not line:
                        break
                    s = line.strip().upper()
                    if s.startswith("EXCLUDE_OBJECT_DEFINE") or s.startswith("; PRINTING OBJECT"):
                        has_exclude_objects = True
                        break

            # If not found yet, also scan last 512 KB (Snapmaker Orca puts metadata at end of large files)
            if not filament_weights or filament_weight_total is None or estimated_time is None:
                seek_pos = max(0, file_size - 524288)
                f.seek(seek_pos)
                if seek_pos > 0:
                    f.readline()  # skip partial line
                _parse_lines(f.readlines())
    except OSError:
        pass

    if filament_weight_total is None and filament_weights:
        filament_weight_total = round(sum(filament_weights), 3)

    slot_count = max(len(filament_weights), len(filament_colors), len(filament_types), len(filament_presets))
    filament_slots = [
        {
            "color_hex": filament_colors[i] if i < len(filament_colors) else None,
            "material": filament_types[i] if i < len(filament_types) else None,
            "brand": filament_brands[i] if i < len(filament_brands) else None,
            "preset_name": filament_presets[i] if i < len(filament_presets) else None,
        }
        for i in range(slot_count)
    ]

    return {
        "filament_weights": filament_weights,
        "filament_slots": filament_slots,
        "filament_weight_total": filament_weight_total,
        "estimated_time": estimated_time,
        "has_exclude_objects": has_exclude_objects,
        "error": None,
    }


@router.get("/thumbnail")
def gcode_thumbnail(
    item_name: str = Query(...),
    slicer_name: str = Query(...),
    printer_type_name: str = Query(...),
    filename: str = Query(...),
    db: Session = Depends(get_db),
):
    """Extract and return the slicer-embedded preview thumbnail from a G-code file.

    Supports PrusaSlicer / OrcaSlicer / SuperSlicer comment format:
        ; thumbnail begin WxH SIZE
        ; <base64_chunk>
        ; thumbnail end
    Also handles ; thumbnail_JPG begin ... for JPEG thumbnails.
    """
    root = _repo_root(db)
    if not root:
        return Response(status_code=404)

    file_path = os.path.join(root, slicer_name, printer_type_name, item_name, filename)
    if not os.path.isfile(file_path):
        return Response(status_code=404)

    thumbnails: list[tuple[int, int, bool, str]] = []  # (width, height, is_jpg, b64_data)
    in_thumb = False
    is_jpg = False
    thumb_size: tuple[int, int] = (0, 0)
    data_parts: list[str] = []
    bytes_read = 0
    max_bytes = 2 * 1024 * 1024  # thumbnails are always in the G-code header

    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                bytes_read += len(line)
                if bytes_read > max_bytes:
                    break
                stripped = line.strip()
                if not stripped:
                    continue
                if not stripped.startswith(";"):
                    if not in_thumb:
                        break  # Past header comments — no more thumbnails
                    continue

                m = re.match(r"^;\s*thumbnail(_JPG)?\s+begin\s+(\d+)x(\d+)", stripped, re.IGNORECASE)
                if m:
                    in_thumb = True
                    is_jpg = bool(m.group(1))
                    thumb_size = (int(m.group(2)), int(m.group(3)))
                    data_parts = []
                    continue

                if in_thumb:
                    if re.match(r"^;\s*thumbnail(?:_JPG)?\s+end", stripped, re.IGNORECASE):
                        in_thumb = False
                        if data_parts:
                            thumbnails.append((thumb_size[0], thumb_size[1], is_jpg, "".join(data_parts)))
                        data_parts = []
                    else:
                        data_parts.append(stripped[1:].strip())
    except OSError:
        pass

    if not thumbnails:
        return Response(status_code=404)

    # Pick the smallest thumbnail that is at least 100 px wide (avoids tiny icons
    # while keeping the payload small); fall back to the largest available.
    thumbnails.sort(key=lambda t: t[0] * t[1])
    chosen = next((t for t in thumbnails if t[0] >= 100), thumbnails[-1])

    try:
        img_data = base64.b64decode(chosen[3])
    except Exception:
        return Response(status_code=500)

    content_type = "image/jpeg" if chosen[2] else "image/png"
    return Response(
        content=img_data,
        media_type=content_type,
        headers={"Cache-Control": "max-age=3600"},
    )


@router.get("/files")
def list_gcode_files(
    item_name: str = Query(...),
    slicer_name: str = Query(...),
    printer_type_name: str = Query(...),
    db: Session = Depends(get_db),
):
    root = _repo_root(db)
    if not root:
        return {"files": [], "folder": None, "error": "G-Code repository not configured"}

    folder = os.path.join(root, slicer_name, printer_type_name, item_name)
    if not os.path.isdir(folder):
        return {"files": [], "folder": folder, "error": None}

    files = sorted(f for f in os.listdir(folder) if f.lower().endswith(".gcode"))
    return {"files": files, "folder": folder, "error": None}


@router.get("/item-folders")
def check_item_folders(item_name: str = Query(...), db: Session = Depends(get_db)):
    root = _repo_root(db)
    if not root or not os.path.isdir(root):
        return {"folders": []}

    found = []
    try:
        for slicer_entry in os.scandir(root):
            if not slicer_entry.is_dir():
                continue
            for pt_entry in os.scandir(slicer_entry.path):
                if pt_entry.is_dir() and os.path.isdir(os.path.join(pt_entry.path, item_name)):
                    found.append(f"{slicer_entry.name}/{pt_entry.name}")
    except OSError:
        pass

    return {"folders": found}


class RenameFoldersRequest(BaseModel):
    old_name: str
    new_name: str


@router.post("/rename-item-folders")
def rename_item_folders(body: RenameFoldersRequest, db: Session = Depends(get_db)):
    root = _repo_root(db)
    if not root or not os.path.isdir(root):
        return {"renamed": [], "error": "Repository root not found"}

    renamed = []
    try:
        for slicer_entry in os.scandir(root):
            if not slicer_entry.is_dir():
                continue
            for pt_entry in os.scandir(slicer_entry.path):
                if not pt_entry.is_dir():
                    continue
                old_path = os.path.join(pt_entry.path, body.old_name)
                new_path = os.path.join(pt_entry.path, body.new_name)
                if os.path.isdir(old_path) and not os.path.exists(new_path):
                    os.rename(old_path, new_path)
                    renamed.append(f"{slicer_entry.name}/{pt_entry.name}/{body.new_name}")
    except OSError as e:
        return {"renamed": renamed, "error": str(e)}

    return {"renamed": renamed, "error": None}

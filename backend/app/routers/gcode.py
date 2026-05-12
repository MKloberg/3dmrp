import os
import re
from fastapi import APIRouter, Depends, Query
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
        return {"filament_weights": [], "filament_weight_total": None, "estimated_time": None, "error": "Repository not configured"}

    file_path = os.path.join(root, slicer_name, printer_type_name, item_name, filename)
    if not os.path.isfile(file_path):
        return {"filament_weights": [], "filament_weight_total": None, "estimated_time": None, "error": "File not found"}

    filament_weights: list[float] = []
    filament_weight_total: float | None = None
    estimated_time: int | None = None

    def _parse_lines(lines: list[str]):
        nonlocal filament_weights, filament_weight_total, estimated_time
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
                    for pattern, mult in [(r"(\d+)h", 3600), (r"(\d+)m(?!s)", 60), (r"(\d+)s", 1)]:
                        tm = re.search(pattern, t)
                        if tm:
                            secs += int(tm.group(1)) * mult
                    if secs > 0:
                        estimated_time = secs

    try:
        file_size = os.path.getsize(file_path)
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            # Read first 200 lines (PrusaSlicer puts metadata in header)
            head = [f.readline() for _ in range(200)]
            _parse_lines(head)

            # If not found yet, also scan last 16 KB (OrcaSlicer puts metadata at end)
            if filament_weight_total is None and estimated_time is None:
                seek_pos = max(0, file_size - 65536)
                f.seek(seek_pos)
                if seek_pos > 0:
                    f.readline()  # skip partial line
                _parse_lines(f.readlines())
    except OSError:
        pass

    if filament_weight_total is None and filament_weights:
        filament_weight_total = round(sum(filament_weights), 3)

    return {
        "filament_weights": filament_weights,
        "filament_weight_total": filament_weight_total,
        "estimated_time": estimated_time,
        "error": None,
    }


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

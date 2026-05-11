import os
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

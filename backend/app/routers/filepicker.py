import os
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Setting, ModelSlicerFile, RoutingStepSlicerFile

router = APIRouter(prefix="/api/files", tags=["files"])

_LAST_DIR_KEY = "file_picker_last_dir"


class PickRequest(BaseModel):
    current_path: Optional[str] = None


@router.post("/pick")
def pick_file(body: PickRequest = PickRequest(), db: Session = Depends(get_db)):
    """Show a native Windows file picker dialog for 3MF/STL files.

    If current_path is supplied and the file exists, the dialog opens in that
    directory with that file pre-selected. Otherwise falls back to the last-used
    directory stored in the settings table.
    """
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError:
        return {"path": None, "error": "tkinter not available"}

    initial_dir: Optional[str] = None
    initial_file: Optional[str] = None

    if body.current_path:
        current = os.path.normpath(body.current_path)
        initial_dir = os.path.dirname(current)
        initial_file = os.path.basename(current)
        # Fall back to last-known dir if the file's directory no longer exists
        if not os.path.isdir(initial_dir):
            initial_dir = None
            initial_file = None

    row = db.query(Setting).filter(Setting.key == _LAST_DIR_KEY).first()

    if initial_dir is None:
        initial_dir = row.value if row and row.value and os.path.isdir(row.value) else None

    # Seed from any existing model file path when no last-dir is known
    if initial_dir is None:
        candidate = (
            db.query(ModelSlicerFile.file_path).filter(ModelSlicerFile.file_path != "").first()
            or db.query(RoutingStepSlicerFile.file_path).filter(RoutingStepSlicerFile.file_path != "").first()
        )
        if candidate:
            d = os.path.dirname(os.path.normpath(candidate[0]))
            if os.path.isdir(d):
                initial_dir = d

    root = tk.Tk()
    root.withdraw()
    root.wm_attributes("-topmost", True)
    path = filedialog.askopenfilename(
        title="Select Model File",
        initialdir=initial_dir,
        initialfile=initial_file,
        filetypes=[("3D Model files", "*.3mf *.stl"), ("All files", "*.*")],
    )
    root.destroy()

    if not path:
        return {"path": None}

    path = os.path.normpath(path)

    directory = os.path.dirname(path)
    if row:
        row.value = directory
    else:
        db.add(Setting(key=_LAST_DIR_KEY, value=directory))
    db.commit()

    return {"path": path}

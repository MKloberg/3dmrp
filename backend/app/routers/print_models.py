import os
import shutil
import subprocess
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import PrintModel, ModelFilament, FilamentSpec, ModelImage, ModelSlicerFile, Printer
from ..schemas import (
    PrintModelCreate, PrintModelOut,
    ModelFilamentCreate, ModelFilamentUpdate, ModelFilamentOut,
    FilamentReorderItem,
    ModelImageOut, ModelImageFromPrinter,
    SlicerFileOut, SlicerFileSet,
)

router = APIRouter(prefix="/api/models", tags=["models"])

_DATA_DIR = os.environ.get("DATA_DIR", "/app/data")
IMAGE_DIR = os.path.join(_DATA_DIR, "images", "models")


@router.get("", response_model=List[PrintModelOut])
def list_models(db: Session = Depends(get_db)):
    return db.query(PrintModel).order_by(PrintModel.name).all()


@router.post("", response_model=PrintModelOut, status_code=201)
def create_model(data: PrintModelCreate, db: Session = Depends(get_db)):
    model = PrintModel(**data.model_dump())
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


@router.get("/{model_id}", response_model=PrintModelOut)
def get_model(model_id: int, db: Session = Depends(get_db)):
    model = db.query(PrintModel).filter(PrintModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return model


@router.put("/{model_id}", response_model=PrintModelOut)
def update_model(model_id: int, data: PrintModelCreate, db: Session = Depends(get_db)):
    model = db.query(PrintModel).filter(PrintModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    for k, v in data.model_dump().items():
        setattr(model, k, v)
    db.commit()
    db.refresh(model)
    return model


@router.delete("/{model_id}", status_code=204)
def delete_model(model_id: int, db: Session = Depends(get_db)):
    model = db.query(PrintModel).filter(PrintModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    for img in model.images:
        if os.path.exists(img.image_path):
            os.remove(img.image_path)
    db.delete(model)
    db.commit()


# --- Filament requirements ---

@router.post("/{model_id}/filaments", response_model=ModelFilamentOut, status_code=201)
def add_filament_requirement(model_id: int, data: ModelFilamentCreate, db: Session = Depends(get_db)):
    model = db.query(PrintModel).filter(PrintModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    spec = db.query(FilamentSpec).filter(FilamentSpec.id == data.filament_spec_id).first()
    if not spec:
        raise HTTPException(status_code=404, detail="Filament spec not found")
    count = db.query(ModelFilament).filter(ModelFilament.print_model_id == model_id).count()
    req = ModelFilament(print_model_id=model_id, sort_order=count, **data.model_dump())
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.post("/{model_id}/filaments/reorder", status_code=204)
def reorder_filaments(model_id: int, data: List[FilamentReorderItem], db: Session = Depends(get_db)):
    for item in data:
        req = db.query(ModelFilament).filter(
            ModelFilament.id == item.id,
            ModelFilament.print_model_id == model_id,
        ).first()
        if req:
            req.sort_order = item.sort_order
    db.commit()


@router.patch("/{model_id}/filaments/{req_id}", response_model=ModelFilamentOut)
def update_filament_requirement(model_id: int, req_id: int, data: ModelFilamentUpdate, db: Session = Depends(get_db)):
    req = db.query(ModelFilament).filter(
        ModelFilament.id == req_id,
        ModelFilament.print_model_id == model_id,
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Filament requirement not found")
    req.grams = data.grams
    req.filament_spec_id = data.filament_spec_id
    db.commit()
    db.refresh(req)
    return req


@router.delete("/{model_id}/filaments/{req_id}", status_code=204)
def remove_filament_requirement(model_id: int, req_id: int, db: Session = Depends(get_db)):
    req = db.query(ModelFilament).filter(
        ModelFilament.id == req_id,
        ModelFilament.print_model_id == model_id,
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Filament requirement not found")
    db.delete(req)
    db.commit()


# --- Images ---

@router.post("/{model_id}/images", response_model=ModelImageOut, status_code=201)
async def upload_model_image(model_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    model = db.query(PrintModel).filter(PrintModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    os.makedirs(IMAGE_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    image_path = os.path.join(IMAGE_DIR, f"{model_id}_{uuid.uuid4().hex}{ext}")
    with open(image_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    img = ModelImage(print_model_id=model_id, image_path=image_path)
    db.add(img)
    db.commit()
    db.refresh(img)
    return img


@router.post("/{model_id}/images/from-printer", response_model=ModelImageOut, status_code=201)
async def copy_image_from_printer(model_id: int, data: ModelImageFromPrinter, db: Session = Depends(get_db)):
    model = db.query(PrintModel).filter(PrintModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    printer = db.query(Printer).filter(Printer.id == data.printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    url = printer.url.rstrip("/")
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{url}/server/files/{data.thumbnail_path}")
            resp.raise_for_status()
        except (httpx.RequestError, httpx.HTTPStatusError):
            raise HTTPException(status_code=502, detail="Could not fetch thumbnail from printer")
    os.makedirs(IMAGE_DIR, exist_ok=True)
    ext = os.path.splitext(data.thumbnail_path)[1] or ".png"
    image_path = os.path.join(IMAGE_DIR, f"{model_id}_{uuid.uuid4().hex}{ext}")
    with open(image_path, "wb") as f:
        f.write(resp.content)
    img = ModelImage(print_model_id=model_id, image_path=image_path)
    db.add(img)
    db.commit()
    db.refresh(img)
    return img


@router.get("/{model_id}/images/{image_id}")
def get_model_image(model_id: int, image_id: int, db: Session = Depends(get_db)):
    img = db.query(ModelImage).filter(
        ModelImage.id == image_id,
        ModelImage.print_model_id == model_id,
    ).first()
    if not img or not os.path.exists(img.image_path):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(img.image_path)


@router.delete("/{model_id}/images/{image_id}", status_code=204)
def delete_model_image(model_id: int, image_id: int, db: Session = Depends(get_db)):
    img = db.query(ModelImage).filter(
        ModelImage.id == image_id,
        ModelImage.print_model_id == model_id,
    ).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    if os.path.exists(img.image_path):
        os.remove(img.image_path)
    db.delete(img)
    db.commit()


# --- Slicer files ---

@router.put("/{model_id}/slicer-files/{printer_id}", response_model=SlicerFileOut)
def set_slicer_file(model_id: int, printer_id: int, data: SlicerFileSet, db: Session = Depends(get_db)):
    if not db.query(PrintModel).filter(PrintModel.id == model_id).first():
        raise HTTPException(status_code=404, detail="Model not found")
    if not db.query(Printer).filter(Printer.id == printer_id).first():
        raise HTTPException(status_code=404, detail="Printer not found")
    sf = db.query(ModelSlicerFile).filter(
        ModelSlicerFile.print_model_id == model_id,
        ModelSlicerFile.printer_id == printer_id,
    ).first()
    if sf:
        sf.file_path = data.file_path
    else:
        sf = ModelSlicerFile(print_model_id=model_id, printer_id=printer_id, file_path=data.file_path)
        db.add(sf)
    db.commit()
    db.refresh(sf)
    return sf


@router.delete("/{model_id}/slicer-files/{printer_id}", status_code=204)
def delete_slicer_file(model_id: int, printer_id: int, db: Session = Depends(get_db)):
    sf = db.query(ModelSlicerFile).filter(
        ModelSlicerFile.print_model_id == model_id,
        ModelSlicerFile.printer_id == printer_id,
    ).first()
    if not sf:
        raise HTTPException(status_code=404, detail="Slicer file not found")
    db.delete(sf)
    db.commit()


@router.post("/{model_id}/open-slicer/{printer_id}", status_code=204)
def open_in_slicer(model_id: int, printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    if not printer.slicer_executable:
        raise HTTPException(status_code=400, detail="No slicer executable configured for this printer")
    sf = db.query(ModelSlicerFile).filter(
        ModelSlicerFile.print_model_id == model_id,
        ModelSlicerFile.printer_id == printer_id,
    ).first()
    if not sf:
        raise HTTPException(status_code=400, detail="No slicer file set for this model and printer")
    try:
        subprocess.Popen([printer.slicer_executable, sf.file_path])
    except FileNotFoundError:
        raise HTTPException(status_code=400, detail=f"Slicer executable not found: {printer.slicer_executable}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

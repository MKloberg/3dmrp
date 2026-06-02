import os
import shutil
import subprocess
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
from PIL import Image as PILImage

from ..database import get_db
from ..models import Item, ModelFilament, FilamentSpec, ModelImage, ModelSlicerFile, Printer, PrinterType, Routing, RoutingStep, RoutingStepFilament, RoutingStepSlicerFile, PostProcessingCost, Order, OrderStepProgress
from ..schemas import (
    ItemCreate, ItemOut,
    ModelFilamentCreate, ModelFilamentUpdate, ModelFilamentOut,
    FilamentReorderItem,
    ModelImageOut, ModelImageFromPrinter, ImageCropBox,
    SlicerFileOut, SlicerFileSet,
    RoutingCreate, RoutingUpdate, RoutingOut,
    RoutingStepCreate, RoutingStepUpdate, RoutingStepOut, RoutingStepReorderItem,
    RoutingStepFilamentCreate, RoutingStepFilamentUpdate, RoutingStepFilamentOut,
    StepSlicerFileOut,
    PostProcessingCostCreate, PostProcessingCostUpdate, PostProcessingCostOut,
)

router = APIRouter(prefix="/api/items", tags=["items"])

_DATA_DIR = os.environ.get("DATA_DIR", "/app/data")
IMAGE_DIR = os.path.join(_DATA_DIR, "images", "models")


@router.get("", response_model=List[ItemOut])
def list_items(db: Session = Depends(get_db)):
    return db.query(Item).order_by(Item.name).all()


@router.post("", response_model=ItemOut, status_code=201)
def create_item(data: ItemCreate, db: Session = Depends(get_db)):
    item = Item(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/{item_id}", response_model=ItemOut)
def get_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.put("/{item_id}", response_model=ItemOut)
def update_item(item_id: int, data: ItemCreate, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for k, v in data.model_dump().items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    order_count = db.query(Order).filter(Order.item_id == item_id).count()
    if order_count > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                f'Cannot delete "{item.name}": it has {order_count} order(s) referencing it.\n\n'
                "Delete all orders for this item before deleting the item itself."
            ),
        )

    for img in item.images:
        if os.path.exists(img.image_path):
            os.remove(img.image_path)
    db.delete(item)
    db.commit()


# --- Filament requirements ---

@router.post("/{item_id}/filaments", response_model=ModelFilamentOut, status_code=201)
def add_filament_requirement(item_id: int, data: ModelFilamentCreate, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    spec = db.query(FilamentSpec).filter(FilamentSpec.id == data.filament_spec_id).first()
    if not spec:
        raise HTTPException(status_code=404, detail="Filament spec not found")
    count = db.query(ModelFilament).filter(ModelFilament.print_model_id == item_id).count()
    req = ModelFilament(print_model_id=item_id, sort_order=count, **data.model_dump())
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.post("/{item_id}/filaments/reorder", status_code=204)
def reorder_filaments(item_id: int, data: List[FilamentReorderItem], db: Session = Depends(get_db)):
    for entry in data:
        req = db.query(ModelFilament).filter(
            ModelFilament.id == entry.id,
            ModelFilament.print_model_id == item_id,
        ).first()
        if req:
            req.sort_order = entry.sort_order
    db.commit()


@router.patch("/{item_id}/filaments/{req_id}", response_model=ModelFilamentOut)
def update_filament_requirement(item_id: int, req_id: int, data: ModelFilamentUpdate, db: Session = Depends(get_db)):
    req = db.query(ModelFilament).filter(
        ModelFilament.id == req_id,
        ModelFilament.print_model_id == item_id,
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Filament requirement not found")
    req.grams = data.grams
    req.filament_spec_id = data.filament_spec_id
    db.commit()
    db.refresh(req)
    return req


@router.delete("/{item_id}/filaments/{req_id}", status_code=204)
def remove_filament_requirement(item_id: int, req_id: int, db: Session = Depends(get_db)):
    req = db.query(ModelFilament).filter(
        ModelFilament.id == req_id,
        ModelFilament.print_model_id == item_id,
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Filament requirement not found")
    db.delete(req)
    db.commit()


# --- Images ---

@router.post("/{item_id}/images", response_model=ModelImageOut, status_code=201)
async def upload_item_image(item_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    os.makedirs(IMAGE_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    image_path = os.path.join(IMAGE_DIR, f"{item_id}_{uuid.uuid4().hex}{ext}")
    with open(image_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    img = ModelImage(print_model_id=item_id, image_path=image_path)
    db.add(img)
    db.commit()
    db.refresh(img)
    return img


@router.post("/{item_id}/images/from-printer", response_model=ModelImageOut, status_code=201)
async def copy_image_from_printer(item_id: int, data: ModelImageFromPrinter, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
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
    image_path = os.path.join(IMAGE_DIR, f"{item_id}_{uuid.uuid4().hex}{ext}")
    with open(image_path, "wb") as f:
        f.write(resp.content)
    img = ModelImage(print_model_id=item_id, image_path=image_path)
    db.add(img)
    db.commit()
    db.refresh(img)
    return img


@router.get("/{item_id}/images/{image_id}")
def get_item_image(item_id: int, image_id: int, db: Session = Depends(get_db)):
    img = db.query(ModelImage).filter(
        ModelImage.id == image_id,
        ModelImage.print_model_id == item_id,
    ).first()
    if not img or not os.path.exists(img.image_path):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(img.image_path)


@router.post("/{item_id}/images/{image_id}/crop", response_model=ModelImageOut)
def crop_item_image(item_id: int, image_id: int, data: ImageCropBox, db: Session = Depends(get_db)):
    img_record = db.query(ModelImage).filter(
        ModelImage.id == image_id,
        ModelImage.print_model_id == item_id,
    ).first()
    if not img_record or not os.path.exists(img_record.image_path):
        raise HTTPException(status_code=404, detail="Image not found")
    with PILImage.open(img_record.image_path) as pil_img:
        pil_img = pil_img.convert("RGB")
        w, h = pil_img.size
        left   = max(0, int(round(data.x * w)))
        top    = max(0, int(round(data.y * h)))
        right  = min(w, int(round((data.x + data.width) * w)))
        bottom = min(h, int(round((data.y + data.height) * h)))
        cropped = pil_img.crop((left, top, right, bottom))
    new_path = os.path.join(IMAGE_DIR, f"{item_id}_{uuid.uuid4().hex}.jpg")
    cropped.save(new_path, "JPEG", quality=92)
    old_path = img_record.image_path
    db.delete(img_record)
    db.flush()
    new_img = ModelImage(print_model_id=item_id, image_path=new_path)
    db.add(new_img)
    db.commit()
    db.refresh(new_img)
    if os.path.exists(old_path):
        os.remove(old_path)
    return new_img


@router.delete("/{item_id}/images/{image_id}", status_code=204)
def delete_item_image(item_id: int, image_id: int, db: Session = Depends(get_db)):
    img = db.query(ModelImage).filter(
        ModelImage.id == image_id,
        ModelImage.print_model_id == item_id,
    ).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    if os.path.exists(img.image_path):
        os.remove(img.image_path)
    db.delete(img)
    db.commit()


# --- Slicer files ---

@router.put("/{item_id}/slicer-files/{printer_type_id}", response_model=SlicerFileOut)
def set_slicer_file(item_id: int, printer_type_id: int, data: SlicerFileSet, db: Session = Depends(get_db)):
    if not db.query(Item).filter(Item.id == item_id).first():
        raise HTTPException(status_code=404, detail="Item not found")
    if not db.query(PrinterType).filter(PrinterType.id == printer_type_id).first():
        raise HTTPException(status_code=404, detail="Printer type not found")
    sf = db.query(ModelSlicerFile).filter(
        ModelSlicerFile.print_model_id == item_id,
        ModelSlicerFile.printer_type_id == printer_type_id,
    ).first()
    if sf:
        sf.file_path = data.file_path
    else:
        sf = ModelSlicerFile(print_model_id=item_id, printer_type_id=printer_type_id, file_path=data.file_path)
        db.add(sf)
    db.commit()
    db.refresh(sf)
    return sf


@router.delete("/{item_id}/slicer-files/{printer_type_id}", status_code=204)
def delete_slicer_file(item_id: int, printer_type_id: int, db: Session = Depends(get_db)):
    sf = db.query(ModelSlicerFile).filter(
        ModelSlicerFile.print_model_id == item_id,
        ModelSlicerFile.printer_type_id == printer_type_id,
    ).first()
    if not sf:
        raise HTTPException(status_code=404, detail="Model file not found")
    db.delete(sf)
    db.commit()


@router.post("/{item_id}/open-slicer/{printer_type_id}", status_code=204)
def open_in_slicer(item_id: int, printer_type_id: int, db: Session = Depends(get_db)):
    printer_type = db.query(PrinterType).filter(PrinterType.id == printer_type_id).first()
    if not printer_type:
        raise HTTPException(status_code=404, detail="Printer type not found")
    if not printer_type.slicer or not printer_type.slicer.executable_path:
        raise HTTPException(status_code=400, detail="No slicer executable configured for this printer type")
    sf = db.query(ModelSlicerFile).filter(
        ModelSlicerFile.print_model_id == item_id,
        ModelSlicerFile.printer_type_id == printer_type_id,
    ).first()
    if not sf:
        raise HTTPException(status_code=400, detail="No model file set for this item and printer type")
    exe = printer_type.slicer.executable_path.strip().strip('"\'')
    try:
        subprocess.Popen([exe, sf.file_path])
    except FileNotFoundError:
        raise HTTPException(status_code=400, detail=f"Slicer executable not found: {exe}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# --- Routing ---

def _get_item_or_404(item_id: int, db: Session) -> Item:
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


def _get_routing_or_404(item_id: int, routing_id: int, db: Session) -> Routing:
    r = db.query(Routing).filter(Routing.id == routing_id, Routing.item_id == item_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Routing not found")
    return r


def _get_step_or_404(routing_id: int, step_id: int, db: Session) -> RoutingStep:
    s = db.query(RoutingStep).filter(RoutingStep.id == step_id, RoutingStep.routing_id == routing_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Routing step not found")
    return s


@router.post("/{item_id}/routings", response_model=RoutingOut, status_code=201)
def create_routing(item_id: int, data: RoutingCreate, db: Session = Depends(get_db)):
    _get_item_or_404(item_id, db)
    count = db.query(Routing).filter(Routing.item_id == item_id).count()
    routing = Routing(item_id=item_id, name=data.name, is_default=data.is_default, include_in_summary=data.include_in_summary, sort_order=count)
    db.add(routing)
    db.commit()
    db.refresh(routing)
    return routing


@router.patch("/{item_id}/routings/{routing_id}", response_model=RoutingOut)
def update_routing(item_id: int, routing_id: int, data: RoutingUpdate, db: Session = Depends(get_db)):
    routing = _get_routing_or_404(item_id, routing_id, db)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(routing, k, v)
    db.commit()
    db.refresh(routing)
    return routing


@router.delete("/{item_id}/routings/{routing_id}", status_code=204)
def delete_routing(item_id: int, routing_id: int, force: bool = Query(False), db: Session = Depends(get_db)):
    routing = _get_routing_or_404(item_id, routing_id, db)

    step_ids = [s.id for s in routing.steps]
    if step_ids:
        progress_count = (
            db.query(OrderStepProgress)
            .filter(OrderStepProgress.routing_step_id.in_(step_ids))
            .count()
        )
        if progress_count > 0:
            if not force:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f'WARNING: Deleting routing "{routing.name or "Unnamed"}" will permanently remove '
                        f"{progress_count} order progress record(s) linked to its steps.\n\n"
                        "This cannot be undone."
                    ),
                )
            db.query(OrderStepProgress).filter(
                OrderStepProgress.routing_step_id.in_(step_ids)
            ).delete(synchronize_session=False)

    db.delete(routing)
    db.commit()


@router.post("/{item_id}/routings/{routing_id}/steps", response_model=RoutingStepOut, status_code=201)
def create_routing_step(item_id: int, routing_id: int, data: RoutingStepCreate, db: Session = Depends(get_db)):
    _get_routing_or_404(item_id, routing_id, db)
    count = db.query(RoutingStep).filter(RoutingStep.routing_id == routing_id).count()
    step = RoutingStep(routing_id=routing_id, sort_order=count, **data.model_dump())
    db.add(step)
    db.commit()
    db.refresh(step)
    return step


@router.patch("/{item_id}/routings/{routing_id}/steps/{step_id}", response_model=RoutingStepOut)
def update_routing_step(item_id: int, routing_id: int, step_id: int, data: RoutingStepUpdate, db: Session = Depends(get_db)):
    _get_routing_or_404(item_id, routing_id, db)
    step = _get_step_or_404(routing_id, step_id, db)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(step, k, v)
    db.commit()
    db.refresh(step)
    return step


@router.delete("/{item_id}/routings/{routing_id}/steps/{step_id}", status_code=204)
def delete_routing_step(item_id: int, routing_id: int, step_id: int, force: bool = Query(False), db: Session = Depends(get_db)):
    _get_routing_or_404(item_id, routing_id, db)
    step = _get_step_or_404(routing_id, step_id, db)

    progress_count = (
        db.query(OrderStepProgress)
        .filter(OrderStepProgress.routing_step_id == step_id)
        .count()
    )
    if progress_count > 0:
        if not force:
            raise HTTPException(
                status_code=409,
                detail=(
                    f'WARNING: Deleting step "{step.description or f"Step {step.id}"}" will permanently remove '
                    f"{progress_count} order progress record(s) linked to it.\n\n"
                    "This cannot be undone."
                ),
            )
        db.query(OrderStepProgress).filter(
            OrderStepProgress.routing_step_id == step_id
        ).delete(synchronize_session=False)

    db.delete(step)
    db.commit()


@router.post("/{item_id}/routings/{routing_id}/steps/reorder", status_code=204)
def reorder_routing_steps(item_id: int, routing_id: int, data: List[RoutingStepReorderItem], db: Session = Depends(get_db)):
    _get_routing_or_404(item_id, routing_id, db)
    for entry in data:
        step = db.query(RoutingStep).filter(RoutingStep.id == entry.id, RoutingStep.routing_id == routing_id).first()
        if step:
            step.sort_order = entry.sort_order
    db.commit()


@router.post("/{item_id}/routings/{routing_id}/steps/{step_id}/filaments", response_model=RoutingStepFilamentOut, status_code=201)
def add_routing_step_filament(item_id: int, routing_id: int, step_id: int, data: RoutingStepFilamentCreate, db: Session = Depends(get_db)):
    _get_routing_or_404(item_id, routing_id, db)
    _get_step_or_404(routing_id, step_id, db)
    fil = RoutingStepFilament(routing_step_id=step_id, **data.model_dump())
    db.add(fil)
    db.commit()
    db.refresh(fil)
    return fil


@router.patch("/{item_id}/routings/{routing_id}/steps/{step_id}/filaments/{fil_id}", response_model=RoutingStepFilamentOut)
def update_routing_step_filament(item_id: int, routing_id: int, step_id: int, fil_id: int, data: RoutingStepFilamentUpdate, db: Session = Depends(get_db)):
    _get_routing_or_404(item_id, routing_id, db)
    _get_step_or_404(routing_id, step_id, db)
    fil = db.query(RoutingStepFilament).filter(RoutingStepFilament.id == fil_id, RoutingStepFilament.routing_step_id == step_id).first()
    if not fil:
        raise HTTPException(status_code=404, detail="Filament not found")
    fil.grams = data.grams
    fil.filament_spec_id = data.filament_spec_id
    db.commit()
    db.refresh(fil)
    return fil


@router.delete("/{item_id}/routings/{routing_id}/steps/{step_id}/filaments/{fil_id}", status_code=204)
def delete_routing_step_filament(item_id: int, routing_id: int, step_id: int, fil_id: int, db: Session = Depends(get_db)):
    _get_routing_or_404(item_id, routing_id, db)
    _get_step_or_404(routing_id, step_id, db)
    fil = db.query(RoutingStepFilament).filter(RoutingStepFilament.id == fil_id, RoutingStepFilament.routing_step_id == step_id).first()
    if not fil:
        raise HTTPException(status_code=404, detail="Filament not found")
    db.delete(fil)
    db.commit()


# --- Routing step slicer files ---

@router.put("/{item_id}/routings/{routing_id}/steps/{step_id}/slicer-file", response_model=StepSlicerFileOut)
def set_step_slicer_file(item_id: int, routing_id: int, step_id: int, data: SlicerFileSet, db: Session = Depends(get_db)):
    _get_routing_or_404(item_id, routing_id, db)
    step = _get_step_or_404(routing_id, step_id, db)
    sf = db.query(RoutingStepSlicerFile).filter(RoutingStepSlicerFile.routing_step_id == step_id).first()
    if sf:
        sf.file_path = data.file_path
    else:
        sf = RoutingStepSlicerFile(routing_step_id=step_id, file_path=data.file_path)
        db.add(sf)
    db.commit()
    db.refresh(sf)
    return sf


@router.delete("/{item_id}/routings/{routing_id}/steps/{step_id}/slicer-file", status_code=204)
def delete_step_slicer_file(item_id: int, routing_id: int, step_id: int, db: Session = Depends(get_db)):
    _get_routing_or_404(item_id, routing_id, db)
    _get_step_or_404(routing_id, step_id, db)
    sf = db.query(RoutingStepSlicerFile).filter(RoutingStepSlicerFile.routing_step_id == step_id).first()
    if not sf:
        raise HTTPException(status_code=404, detail="No model file set for this step")
    db.delete(sf)
    db.commit()


@router.post("/{item_id}/routings/{routing_id}/steps/{step_id}/open-slicer", status_code=204)
def open_step_in_slicer(item_id: int, routing_id: int, step_id: int, db: Session = Depends(get_db)):
    _get_routing_or_404(item_id, routing_id, db)
    step = _get_step_or_404(routing_id, step_id, db)
    sf = db.query(RoutingStepSlicerFile).filter(RoutingStepSlicerFile.routing_step_id == step_id).first()
    if not sf:
        raise HTTPException(status_code=400, detail="No model file set for this step")
    printer_type = step.printer_type
    if not printer_type or not printer_type.slicer or not printer_type.slicer.executable_path:
        raise HTTPException(status_code=400, detail="No slicer executable configured for this step's printer type")
    exe = printer_type.slicer.executable_path.strip().strip('"\'')
    try:
        subprocess.Popen([exe, sf.file_path])
    except FileNotFoundError:
        raise HTTPException(status_code=400, detail=f"Slicer executable not found: {exe}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# --- Post-processing costs ---

@router.get("/{item_id}/post-processing", response_model=List[PostProcessingCostOut])
def list_post_processing(item_id: int, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item.post_processing_costs


@router.post("/{item_id}/post-processing", response_model=PostProcessingCostOut, status_code=201)
def create_post_processing(item_id: int, data: PostProcessingCostCreate, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    count = db.query(PostProcessingCost).filter(PostProcessingCost.item_id == item_id).count()
    cost = PostProcessingCost(item_id=item_id, sort_order=count, **data.model_dump())
    db.add(cost)
    db.commit()
    db.refresh(cost)
    return cost


@router.patch("/{item_id}/post-processing/{cost_id}", response_model=PostProcessingCostOut)
def update_post_processing(item_id: int, cost_id: int, data: PostProcessingCostUpdate, db: Session = Depends(get_db)):
    cost = db.query(PostProcessingCost).filter(PostProcessingCost.id == cost_id, PostProcessingCost.item_id == item_id).first()
    if not cost:
        raise HTTPException(status_code=404, detail="Post-processing cost not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(cost, k, v)
    db.commit()
    db.refresh(cost)
    return cost


@router.delete("/{item_id}/post-processing/{cost_id}", status_code=204)
def delete_post_processing(item_id: int, cost_id: int, db: Session = Depends(get_db)):
    cost = db.query(PostProcessingCost).filter(PostProcessingCost.id == cost_id, PostProcessingCost.item_id == item_id).first()
    if not cost:
        raise HTTPException(status_code=404, detail="Post-processing cost not found")
    db.delete(cost)
    db.commit()

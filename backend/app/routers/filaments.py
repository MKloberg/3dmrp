import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Any, Dict, List, Optional

from ..database import get_db
from ..models import FilamentSpec, ModelFilament, RoutingStepFilament, RoutingStep, Routing, Item
from ..schemas import FilamentSpecCreate, FilamentSpecOut
from .settings import get_setting

router = APIRouter(prefix="/api/filaments", tags=["filaments"])


@router.get("", response_model=List[FilamentSpecOut])
def list_filaments(db: Session = Depends(get_db)):
    return db.query(FilamentSpec).order_by(FilamentSpec.material, FilamentSpec.color_name).all()


@router.post("", response_model=FilamentSpecOut, status_code=201)
def create_filament(data: FilamentSpecCreate, db: Session = Depends(get_db)):
    spec = FilamentSpec(**data.model_dump())
    db.add(spec)
    db.commit()
    db.refresh(spec)
    return spec


@router.get("/{spec_id}", response_model=FilamentSpecOut)
def get_filament(spec_id: int, db: Session = Depends(get_db)):
    spec = db.query(FilamentSpec).filter(FilamentSpec.id == spec_id).first()
    if not spec:
        raise HTTPException(status_code=404, detail="Filament spec not found")
    return spec


@router.put("/{spec_id}", response_model=FilamentSpecOut)
async def update_filament(spec_id: int, data: FilamentSpecCreate, db: Session = Depends(get_db)):
    spec = db.query(FilamentSpec).filter(FilamentSpec.id == spec_id).first()
    if not spec:
        raise HTTPException(status_code=404, detail="Filament spec not found")
    for k, v in data.model_dump().items():
        setattr(spec, k, v)
    db.commit()
    db.refresh(spec)

    if spec.spoolman_id:
        await _push_to_spoolman(spec, db)

    return spec


async def _push_to_spoolman(spec: FilamentSpec, db: Session) -> None:
    url = get_setting(db, "spoolman_url")
    if not url:
        return
    payload: Dict[str, Any] = {"name": spec.color_name}
    hex_val = spec.color_hex or ""
    payload["color_hex"] = hex_val.lstrip("#") if hex_val else ""
    for field in ["price", "density", "diameter", "weight", "spool_weight",
                  "settings_extruder_temp", "settings_bed_temp"]:
        v = getattr(spec, field, None)
        if v is not None:
            payload[field] = v
    for field in ["article_number", "comment", "external_id"]:
        v = getattr(spec, field, None)
        if v is not None:
            payload[field] = v
    if spec.extra:
        payload["extra"] = {k: str(v) for k, v in spec.extra.items()}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.patch(
                f"{url.rstrip('/')}/api/v1/filament/{spec.spoolman_id}",
                json=payload,
            )
            resp.raise_for_status()
    except Exception:
        pass


@router.delete("/{spec_id}", status_code=204)
def delete_filament(spec_id: int, db: Session = Depends(get_db)):
    spec = db.query(FilamentSpec).filter(FilamentSpec.id == spec_id).first()
    if not spec:
        raise HTTPException(status_code=404, detail="Filament spec not found")

    label = f'"{spec.color_name} {spec.material}"'

    step_usages = (
        db.query(RoutingStepFilament, RoutingStep, Routing, Item)
        .join(RoutingStep, RoutingStep.id == RoutingStepFilament.routing_step_id)
        .join(Routing, Routing.id == RoutingStep.routing_id)
        .join(Item, Item.id == Routing.item_id)
        .filter(RoutingStepFilament.filament_spec_id == spec_id)
        .all()
    )
    if step_usages:
        lines = "\n".join(
            f"  - {item.name} / {step.description or f'Step {step.id}'}"
            for _, step, _, item in step_usages
        )
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete {label}: it is assigned to {len(step_usages)} routing step(s).\n"
                f"{lines}\n\n"
                "Remove this filament from those steps first."
            ),
        )

    item_usages = (
        db.query(ModelFilament, Item)
        .join(Item, Item.id == ModelFilament.print_model_id)
        .filter(ModelFilament.filament_spec_id == spec_id)
        .all()
    )
    if item_usages:
        lines = "\n".join(f"  - {item.name}" for _, item in item_usages)
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete {label}: it is a filament requirement for {len(item_usages)} item(s).\n"
                f"{lines}\n\n"
                "Remove this filament from those items' requirements first."
            ),
        )

    db.delete(spec)
    db.commit()

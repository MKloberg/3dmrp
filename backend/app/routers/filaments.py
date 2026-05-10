from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import FilamentSpec
from ..schemas import FilamentSpecCreate, FilamentSpecOut

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
def update_filament(spec_id: int, data: FilamentSpecCreate, db: Session = Depends(get_db)):
    spec = db.query(FilamentSpec).filter(FilamentSpec.id == spec_id).first()
    if not spec:
        raise HTTPException(status_code=404, detail="Filament spec not found")
    for k, v in data.model_dump().items():
        setattr(spec, k, v)
    db.commit()
    db.refresh(spec)
    return spec


@router.delete("/{spec_id}", status_code=204)
def delete_filament(spec_id: int, db: Session = Depends(get_db)):
    spec = db.query(FilamentSpec).filter(FilamentSpec.id == spec_id).first()
    if not spec:
        raise HTTPException(status_code=404, detail="Filament spec not found")
    db.delete(spec)
    db.commit()
